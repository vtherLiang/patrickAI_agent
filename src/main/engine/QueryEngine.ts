import {
  ChatMessage,
  StreamUpdatePayload,
  TokenUsageStats,
  ToolCallItem
} from '@shared/types'
import { ConfigStore } from '../store/ConfigStore'
import { OpenAICompatibleClient, OpenAIMessagePayload } from '../llm/OpenAIClient'
import { ToolRegistry } from '../tools/ToolRegistry'
import { CompactPipeline } from '../context/CompactPipeline'
import { SystemPromptBuilder } from './SystemPromptBuilder'

/**
 * Clean-room replica of Claude Code's core `QueryEngine.ts`.
 * Drives the multi-turn ReAct agent loop:
 * [User Input] -> [MicroCompact / AutoCompact check] -> [Streaming LLM Call]
 * -> [Tool Schema Validation & Permission Gate] -> [Tool Execution] -> [Next Turn]
 */
export class QueryEngine {
  private messages: ChatMessage[] = []
  private isBusy = false
  private abortController: AbortController | null = null
  private pendingApprovals = new Map<
    string,
    {
      resolve: (decision: 'approve_once' | 'approve_session' | 'reject') => void
      toolCall: ToolCallItem
    }
  >()

  constructor(
    private configStore: ConfigStore,
    private llmClient: OpenAICompatibleClient,
    private toolRegistry: ToolRegistry,
    private compactPipeline: CompactPipeline,
    private emitUpdate: (payload: StreamUpdatePayload) => void,
    private onSwarmDelegation?: (goal: string) => Promise<string>
  ) {}

  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  getTokenStats(): TokenUsageStats {
    const cfg = this.configStore.getConfig()
    return this.compactPipeline.calculateStats(this.messages, cfg.maxContextTokens)
  }

  clearSession(): void {
    this.abort()
    this.messages = []
    this.emitFullState()
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    for (const [, item] of this.pendingApprovals) {
      item.resolve('reject')
    }
    this.pendingApprovals.clear()
    this.setBusy(false)
  }

  resolveApproval(
    toolCallId: string,
    decision: 'approve_once' | 'approve_session' | 'reject'
  ): void {
    const pending = this.pendingApprovals.get(toolCallId)
    if (!pending) return
    this.pendingApprovals.delete(toolCallId)

    if (decision === 'approve_session') {
      this.configStore.updateConfig({ autoApproveWriteInSession: true })
    }
    pending.resolve(decision)
  }

  async triggerManualCompact(): Promise<string> {
    const cfg = this.configStore.getConfig()
    this.messages = this.compactPipeline.runMicroCompact(this.messages, 2)
    const { messages, summaryText } = await this.compactPipeline.runAutoCompact(this.messages, cfg)
    this.messages = messages
    this.emitFullState()
    return summaryText
  }

  async sendUserMessage(userText: string): Promise<void> {
    if (!userText.trim() || this.isBusy) return

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userText.trim(),
      timestamp: Date.now()
    }
    this.messages.push(userMsg)
    this.emitFullState()

    const cfg = this.configStore.getConfig()

    // Demo fallback mode when user hasn't configured API key yet
    if (!cfg.apiKey && !cfg.baseUrl.includes('11434')) {
      await this.runBuiltInInteractiveDemo(userText.trim())
      return
    }

    this.setBusy(true)
    this.abortController = new AbortController()

    try {
      let maxTurns = 10
      while (maxTurns-- > 0) {
        // 1. Run Layer 1 MicroCompact automatically before every turn
        this.messages = this.compactPipeline.runMicroCompact(this.messages, 6)

        // 2. Check Layer 2 AutoCompact threshold
        const stats = this.getTokenStats()
        this.emitUpdate({ type: 'token_stats', tokenStats: stats })

        if (stats.usageRatio >= cfg.autoCompactThreshold) {
          const compacted = await this.compactPipeline.runAutoCompact(this.messages, cfg)
          this.messages = compacted.messages
          this.emitFullState()
        }

        // 3. Prepare streaming assistant placeholder message
        const assistantMsgId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          reasoningContent: '',
          timestamp: Date.now()
        }
        this.messages.push(assistantMsg)
        this.emitFullState()

        const apiMessages = this.buildOpenAIMessages(cfg.workspaceDir)
        const result = await this.llmClient.streamChatCompletion({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.mainModel,
          messages: apiMessages,
          tools: this.toolRegistry.getOpenAIToolSchemas(),
          signal: this.abortController.signal,
          onDelta: (delta) => {
            if (delta.content) assistantMsg.content += delta.content
            if (delta.reasoning) {
              assistantMsg.reasoningContent =
                (assistantMsg.reasoningContent || '') + delta.reasoning
            }
            this.emitUpdate({
              type: 'streaming_delta',
              streamingMessageId: assistantMsgId,
              contentDelta: delta.content,
              reasoningDelta: delta.reasoning
            })
          }
        })

        assistantMsg.content = result.content
        assistantMsg.reasoningContent = result.reasoningContent || undefined

        if (!result.toolCalls || result.toolCalls.length === 0) {
          this.emitFullState()
          break
        }

        // 4. Process tool calls with permission gate
        assistantMsg.toolCalls = result.toolCalls.map((tc) => {
          const reg = this.toolRegistry.getTool(tc.name)
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(tc.argumentsJson || '{}')
          } catch {
            parsedArgs = {}
          }
          const preview = reg?.preparePreview?.(parsedArgs, cfg.workspaceDir)
          return {
            id: tc.id,
            name: tc.name,
            argumentsJson: tc.argumentsJson,
            status: 'pending_approval',
            permissionLevel: reg?.permissionLevel || 'execute',
            diffPreview: preview?.diffPreview,
            commandPreview: preview?.commandPreview,
            startedAt: Date.now()
          }
        })
        this.emitFullState()

        for (const toolCall of assistantMsg.toolCalls) {
          const regTool = this.toolRegistry.getTool(toolCall.name)
          if (!regTool) {
            toolCall.status = 'error'
            toolCall.resultOutput = `未知工具: ${toolCall.name}`
            this.appendToolMessage(toolCall.id, toolCall.name, toolCall.resultOutput)
            continue
          }

          const latestCfg = this.configStore.getConfig()
          const needsManualApproval =
            regTool.permissionLevel !== 'readonly' && !latestCfg.autoApproveWriteInSession

          if (needsManualApproval) {
            this.emitUpdate({
              type: 'tool_approval_required',
              pendingApproval: toolCall
            })

            const decision = await new Promise<'approve_once' | 'approve_session' | 'reject'>(
              (resolve) => {
                this.pendingApprovals.set(toolCall.id, { resolve, toolCall })
              }
            )

            if (decision === 'reject') {
              toolCall.status = 'rejected'
              toolCall.resultOutput = '用户拒绝了本次工具执行操作。'
              toolCall.completedAt = Date.now()
              this.appendToolMessage(toolCall.id, toolCall.name, toolCall.resultOutput)
              this.emitFullState()
              continue
            }
          }

          toolCall.status = 'running'
          this.emitFullState()

          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(toolCall.argumentsJson || '{}')
          } catch {
            parsedArgs = {}
          }

          try {
            const output = await regTool.execute(
              parsedArgs,
              {
                workspaceDir: latestCfg.workspaceDir,
                onTerminalOutput: (commandId, text, stream) => {
                  this.emitUpdate({
                    type: 'terminal_output',
                    terminalLine: { commandId, text, stream }
                  })
                },
                onDelegateSwarm: this.onSwarmDelegation
              },
              toolCall.id
            )
            toolCall.status = 'completed'
            toolCall.resultOutput = output
            toolCall.completedAt = Date.now()
          } catch (err) {
            toolCall.status = 'error'
            toolCall.resultOutput = `工具执行异常: ${(err as Error).message}`
            toolCall.completedAt = Date.now()
          }

          this.appendToolMessage(toolCall.id, toolCall.name, toolCall.resultOutput)
          this.emitFullState()
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.messages.push({
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **引擎请求异常**: ${(err as Error).message}\n\n你可以在右上角点击 **「API 与模型设置」** 配置你的 OpenAI 兼容接口（如 DeepSeek、SiliconFlow、OpenRouter 或本地 Ollama）。`,
          timestamp: Date.now()
        })
        this.emitFullState()
      }
    } finally {
      this.setBusy(false)
    }
  }

  /**
   * Interactive local demonstration when API key is not yet filled in,
   * showcasing real file reading, diff approval card, and terminal execution!
   */
  private async runBuiltInInteractiveDemo(userText: string): Promise<void> {
    this.setBusy(true)
    const cfg = this.configStore.getConfig()

    const asstId = `demo_${Date.now()}`
    const searchCallId = `call_search_${Date.now()}`
    const bashCallId = `call_bash_${Date.now()}`

    const asstMsg: ChatMessage = {
      id: asstId,
      role: 'assistant',
      reasoningContent: `正在分析用户指令: "${userText}"...\n1. 检测到当前处于离线演示模式（尚未填写 OpenAI 兼容 API Key）。\n2. 自动调用真实本地只读工具 search_files 扫描工作区结构，并演示权限闸门与实时流。`,
      content: `我已收到你的请求：**“${userText}”**。\n\n> 💡 **提示**：当前尚未填写 API Key，正在使用**内置本地引擎演示模式**为你执行真实工具调用（点击右上角 **「模型设置」** 填入 DeepSeek / SiliconFlow / OpenAI Key 即可开启全量推理）。\n\n下面我将先扫描当前工作区文件，并展示工具调用过程：`,
      toolCalls: [
        {
          id: searchCallId,
          name: 'search_files',
          argumentsJson: JSON.stringify({ query: '' }),
          status: 'running',
          permissionLevel: 'readonly',
          startedAt: Date.now()
        },
        {
          id: bashCallId,
          name: 'run_bash',
          argumentsJson: JSON.stringify({ command: 'ls -la && git status -s 2>/dev/null || true' }),
          status: 'pending_approval',
          permissionLevel: 'execute',
          commandPreview: 'ls -la && git status -s 2>/dev/null || true',
          startedAt: Date.now()
        }
      ],
      timestamp: Date.now()
    }

    this.messages.push(asstMsg)
    this.emitFullState()

    // Execute search_files immediately (readonly)
    const searchTool = this.toolRegistry.getTool('search_files')!
    const searchOut = await searchTool.execute({}, { workspaceDir: cfg.workspaceDir }, searchCallId)
    asstMsg.toolCalls![0].status = 'completed'
    asstMsg.toolCalls![0].resultOutput = searchOut
    asstMsg.toolCalls![0].completedAt = Date.now()
    this.appendToolMessage(searchCallId, 'search_files', searchOut)
    this.emitFullState()

    // Ask approval for run_bash unless session auto-approve is on
    const bashCall = asstMsg.toolCalls![1]
    if (!cfg.autoApproveWriteInSession) {
      this.emitUpdate({
        type: 'tool_approval_required',
        pendingApproval: bashCall
      })
      const decision = await new Promise<'approve_once' | 'approve_session' | 'reject'>(
        (resolve) => {
          this.pendingApprovals.set(bashCall.id, { resolve, toolCall: bashCall })
        }
      )
      if (decision === 'reject') {
        bashCall.status = 'rejected'
        bashCall.resultOutput = '用户拒绝了终端命令执行。'
        this.appendToolMessage(bashCallId, 'run_bash', bashCall.resultOutput)
        this.setBusy(false)
        this.emitFullState()
        return
      }
    }

    bashCall.status = 'running'
    this.emitFullState()

    const bashTool = this.toolRegistry.getTool('run_bash')!
    const bashOut = await bashTool.execute(
      { command: 'ls -la && git status -s 2>/dev/null || true' },
      {
        workspaceDir: cfg.workspaceDir,
        onTerminalOutput: (commandId, text, stream) => {
          this.emitUpdate({
            type: 'terminal_output',
            terminalLine: { commandId, text, stream }
          })
        }
      },
      bashCallId
    )
    bashCall.status = 'completed'
    bashCall.resultOutput = bashOut
    bashCall.completedAt = Date.now()
    this.appendToolMessage(bashCallId, 'run_bash', bashOut)

    this.messages.push({
      id: `demo_summary_${Date.now()}`,
      role: 'assistant',
      content: `✅ 工作区扫描与终端巡检已完成！\n- 你可以在右侧 **「实时终端 & 文件树」** 查看实时输出。\n- 也可以切换到左侧导航栏的 **「指挥官看板 (方向 B)」** 体验多智能体 DAG 并发拆解，或去 **「KAIROS 记忆中心 (方向 C)」** 触发一次 Dream 记忆提炼。`,
      timestamp: Date.now()
    })

    this.setBusy(false)
    this.emitFullState()
  }

  private appendToolMessage(toolCallId: string, toolName: string, content: string): void {
    this.messages.push({
      id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'tool',
      toolCallId,
      toolName,
      content,
      timestamp: Date.now()
    })
  }

  private buildOpenAIMessages(workspaceDir: string): OpenAIMessagePayload[] {
    const payload: OpenAIMessagePayload[] = [
      {
        role: 'system',
        content: SystemPromptBuilder.build(workspaceDir)
      }
    ]

    for (const msg of this.messages) {
      if (msg.role === 'user') {
        payload.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          payload.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.argumentsJson || '{}'
              }
            }))
          })
        } else {
          payload.push({ role: 'assistant', content: msg.content })
        }
      } else if (msg.role === 'tool' && msg.toolCallId) {
        payload.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          name: msg.toolName,
          content: msg.content
        })
      }
    }

    return payload
  }

  private setBusy(busy: boolean): void {
    this.isBusy = busy
    this.emitUpdate({ type: 'agent_status', isBusy: busy })
  }

  private emitFullState(): void {
    this.emitUpdate({
      type: 'messages_updated',
      messages: this.getMessages(),
      tokenStats: this.getTokenStats()
    })
  }
}
