import {
  AgentPermissionMode,
  ChatAttachment,
  ChatMessage,
  RecalledMemoryItem,
  SendMessagePayload,
  StreamUpdatePayload,
  TokenUsageStats,
  ToolCallItem,
  ToolPermissionLevel
} from '@shared/types'
import { ConfigStore } from '../store/ConfigStore'
import {
  OpenAICompatibleClient,
  OpenAIMessageContentPart,
  OpenAIMessagePayload
} from '../llm/OpenAIClient'
import { ToolRegistry } from '../tools/ToolRegistry'
import { maskSensitiveSecrets } from '@shared/secretMasker'
import { CompactPipeline } from '../context/CompactPipeline'
import { SystemPromptBuilder } from './SystemPromptBuilder'
import { SkillManager } from '../skills/SkillManager'
import { McpManager } from '../mcp/McpManager'
import { HierarchicalMemoryEngine } from '../memory/HierarchicalMemoryEngine'

/**
 * Clean-room replica of Claude Code's core `QueryEngine.ts`, enhanced with:
 * - Per-query L1-L5 Hierarchical Memory Search & Recall Callback (`retrieveForQuery`)
 * - Non-blocking Automatic Post-Turn Memory Crystallization (`autoCrystallizeTurn`)
 * - Codex Skills & MCP dynamic context + tool execution hooks
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
    private onSwarmDelegation?: (goal: string) => Promise<string>,
    private skillManager?: SkillManager,
    private mcpManager?: McpManager,
    private memoryEngine?: HierarchicalMemoryEngine
  ) {}

  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  setMessages(nextMessages: ChatMessage[]): void {
    this.abort()
    this.messages = Array.isArray(nextMessages) ? [...nextMessages] : []
    this.emitFullState()
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

    let updated = false
    const now = Date.now()
    for (const msg of this.messages) {
      if (msg.isThinkingStreaming) {
        msg.isThinkingStreaming = false
        if (!msg.thinkingDurationMs) {
          msg.thinkingDurationMs = Math.max(200, now - msg.timestamp)
        }
        msg.interrupted = true
        updated = true
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.status === 'running' || tc.status === 'pending_approval') {
            tc.status = 'error'
            tc.resultOutput = '用户中断执行'
            tc.completedAt = now
            updated = true
          }
        }
      }
    }

    this.setBusy(false)
    if (updated) {
      this.emitFullState()
    }
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

  private requiresManualApproval(
    level: ToolPermissionLevel,
    mode: AgentPermissionMode,
    sessionAutoApprove: boolean
  ): boolean {
    if (level === 'readonly') return false
    if (mode === 'bypassPermissions' || sessionAutoApprove) return false
    if (mode === 'acceptEdits' && level === 'write') return false
    return true
  }

  async sendUserMessage(input: string | SendMessagePayload): Promise<void> {
    const rawText = typeof input === 'string' ? input : input?.text || ''
    const attachments: ChatAttachment[] =
      typeof input === 'object' && Array.isArray(input?.attachments) ? input.attachments : []

    const cleanText = rawText.trim()
    if ((!cleanText && attachments.length === 0) || this.isBusy) return

    // 0. Finalize any lingering messages to ensure streaming states are definitively frozen
    let lastInterruptedReasoning = ''
    for (const msg of this.messages) {
      if (msg.isThinkingStreaming) {
        msg.isThinkingStreaming = false
        if (!msg.thinkingDurationMs) {
          msg.thinkingDurationMs = Math.max(200, Date.now() - msg.timestamp)
        }
      }
      if (msg.role === 'assistant' && msg.interrupted && msg.reasoningContent) {
        lastInterruptedReasoning = msg.reasoningContent
      }
    }

    const isContinuation = /^(继续|接着|往下|continue|go on|proceed|继续输出|继续回答|接着写)/i.test(cleanText)
    const effectiveQuery =
      cleanText || `请阅读并深入分析我上传的附件 (${attachments.map((a) => a.name).join(', ')})`

    const promptQuery =
      isContinuation && lastInterruptedReasoning
        ? `用户指令「${cleanText}」：上一轮思考过程已由用户在此处中止。请直接依据此前思考成果，无需重新冗余思考，立即输出完整、结构清晰的最终回答与代码实现！`
        : effectiveQuery

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: cleanText,
      ...(attachments.length > 0 ? { attachments } : {}),
      timestamp: Date.now()
    }
    this.messages.push(userMsg)
    this.emitFullState()

    const cfg = this.configStore.getConfig()

    // 0. Automatic L1-L5 Hierarchical Memory Search & Recall Callback before every inquiry!
    const recalledMemories: RecalledMemoryItem[] = this.memoryEngine
      ? this.memoryEngine.retrieveForQuery(promptQuery, { topK: 5, recordAccess: true })
      : []

    // Demo fallback mode when user hasn't configured API key yet
    if (!cfg.apiKey && !cfg.baseUrl.includes('11434')) {
      await this.runBuiltInInteractiveDemo(promptQuery, recalledMemories)
      return
    }

    this.setBusy(true)
    this.abortController = new AbortController()

    const collectedToolCalls: ToolCallItem[] = []
    let lastAssistantMsg: ChatMessage | null = null
    let isFirstTurnStep = true

    try {
      const maxTurns = 20
      let turnsRemaining = maxTurns
      while (turnsRemaining-- > 0) {
        const currentCfg = this.configStore.getConfig()
        const permissionMode = currentCfg.permissionMode || 'default'

        // 1. Run Layer 1 MicroCompact automatically before every turn (protects active turn outputs!)
        this.messages = this.compactPipeline.runMicroCompact(this.messages, 8)

        // 2. Check Layer 2 AutoCompact threshold
        const stats = this.getTokenStats()
        this.emitUpdate({ type: 'token_stats', tokenStats: stats })

        if (stats.usageRatio >= currentCfg.autoCompactThreshold) {
          const compacted = await this.compactPipeline.runAutoCompact(this.messages, currentCfg)
          this.messages = compacted.messages
          this.emitFullState()
        }

        // 3. Prepare streaming assistant placeholder message (attach recalledMemories on first step!)
        const turnStart = Date.now()
        let firstThinkingAt: number | null = null
        const assistantMsgId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          reasoningContent: '',
          isThinkingStreaming: true,
          timestamp: turnStart,
          ...(isFirstTurnStep && recalledMemories.length > 0 ? { recalledMemories } : {})
        }
        isFirstTurnStep = false
        lastAssistantMsg = assistantMsg
        this.messages.push(assistantMsg)
        this.emitFullState()

        const allSchemas = this.toolRegistry.getOpenAIToolSchemas()
        const activeSchemas =
          permissionMode === 'plan'
            ? allSchemas.filter((s) => {
                const t = this.toolRegistry.getTool(s.function.name)
                return t?.permissionLevel === 'readonly'
              })
            : allSchemas

        // Convergence guard: inject warning when remaining turns are critically low
        const convergenceWarning =
          turnsRemaining <= 2 && collectedToolCalls.length > 0
            ? `[系统收敛警告]: 当前任务调用工具轮次即将达到系统上限（剩余 ${turnsRemaining} 轮）。请不要再调用任何新的工具，请立即依据已读取/获取的所有文件内容与事实细节，向用户交付完整、条理清晰的最终分析报告与核心结论！`
            : undefined

        const apiMessages = this.buildOpenAIMessages(
          currentCfg.workspaceDir,
          permissionMode,
          promptQuery,
          recalledMemories,
          currentCfg.mainModel,
          assistantMsgId,
          isContinuation ? lastInterruptedReasoning : undefined,
          convergenceWarning
        )

        const result = await this.llmClient.streamChatCompletion({
          baseUrl: currentCfg.baseUrl,
          apiKey: currentCfg.apiKey,
          model: currentCfg.mainModel,
          messages: apiMessages,
          tools: activeSchemas,
          signal: this.abortController.signal,
          proxyMode: currentCfg.proxyMode,
          proxyUrl: currentCfg.customProxyUrl,
          globalProxyUrl: currentCfg.globalProxyUrl,
          onDelta: (delta) => {
            if (this.abortController?.signal.aborted || assistantMsg.interrupted) {
              return
            }
            if (delta.reasoning) {
              if (!firstThinkingAt) firstThinkingAt = Date.now()
              assistantMsg.reasoningContent =
                (assistantMsg.reasoningContent || '') + delta.reasoning
              assistantMsg.isThinkingStreaming = !assistantMsg.content
            }
            if (delta.content) {
              if (assistantMsg.isThinkingStreaming) {
                assistantMsg.isThinkingStreaming = false
                if (firstThinkingAt) {
                  assistantMsg.thinkingDurationMs = Date.now() - firstThinkingAt
                }
              }
              assistantMsg.content += delta.content
            }
            if (delta.toolCalling && assistantMsg.isThinkingStreaming) {
              assistantMsg.isThinkingStreaming = false
              if (firstThinkingAt) {
                assistantMsg.thinkingDurationMs = Date.now() - firstThinkingAt
              }
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
        assistantMsg.isThinkingStreaming = false
        if (assistantMsg.reasoningContent && !assistantMsg.thinkingDurationMs) {
          assistantMsg.thinkingDurationMs = Date.now() - (firstThinkingAt || turnStart)
        }

        if (!result.toolCalls || result.toolCalls.length === 0) {
          this.emitFullState()
          break
        }

        // 4. Process tool calls with permission mode gate
        assistantMsg.toolCalls = result.toolCalls.map((tc) => {
          const reg = this.toolRegistry.getTool(tc.name)
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(tc.argumentsJson || '{}')
          } catch {
            parsedArgs = {}
          }
          const preview = reg?.preparePreview?.(parsedArgs, currentCfg.workspaceDir)
          return {
            id: tc.id,
            name: tc.name,
            argumentsJson: tc.argumentsJson,
            status: 'pending_approval',
            permissionLevel: reg?.permissionLevel || 'execute',
            description: parsedArgs.description ? String(parsedArgs.description) : undefined,
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
          const latestMode = latestCfg.permissionMode || 'default'

          if (latestMode === 'plan' && regTool.permissionLevel !== 'readonly') {
            toolCall.status = 'rejected'
            toolCall.resultOutput =
              '[Plan Mode 拦截] 当前处于只读规划模式，已阻止写入/命令操作。请仅输出规划方案。'
            toolCall.completedAt = Date.now()
            this.appendToolMessage(toolCall.id, toolCall.name, toolCall.resultOutput)
            this.emitFullState()
            continue
          }

          const needsManualApproval = this.requiresManualApproval(
            regTool.permissionLevel,
            latestMode,
            latestCfg.autoApproveWriteInSession
          )

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
                    terminalLine: { commandId, text: maskSensitiveSecrets(text), stream }
                  })
                },
                onDelegateSwarm: this.onSwarmDelegation,
                skillManager: this.skillManager,
                mcpManager: this.mcpManager
              },
              toolCall.id
            )
            toolCall.status = 'completed'
            toolCall.resultOutput = maskSensitiveSecrets(output)
            toolCall.completedAt = Date.now()
          } catch (err) {
            toolCall.status = 'error'
            toolCall.resultOutput = `工具执行异常: ${(err as Error).message}`
            toolCall.completedAt = Date.now()
          }

          collectedToolCalls.push(toolCall)
          this.appendToolMessage(toolCall.id, toolCall.name, toolCall.resultOutput)
          this.emitFullState()
        }
      }

      // 4.5. Guaranteed Final Synthesis Pass (绝对保障向用户交付深度分析报告与核心结论)
      // 若本轮执行过工具，但最后一条消息带工具调用（前端会被判定为 activity 折叠）或正文为空，
      // 必须无条件触发一次最终综合生成，禁止任何工具调用，强力要求输出结构化核心结论与关键要点！
      const currentCfgForSynth = this.configStore.getConfig()
      const needsSynthesis =
        collectedToolCalls.length > 0 &&
        (!lastAssistantMsg ||
          Boolean(lastAssistantMsg.toolCalls && lastAssistantMsg.toolCalls.length > 0) ||
          !lastAssistantMsg.content ||
          !lastAssistantMsg.content.trim())

      if (needsSynthesis && !this.abortController.signal.aborted) {
        try {
          const synthMsgId = `asst_${Date.now()}_synth`
          const synthAssistantMsg: ChatMessage = {
            id: synthMsgId,
            role: 'assistant',
            content: '',
            isThinkingStreaming: false,
            timestamp: Date.now()
          }
          this.messages.push(synthAssistantMsg)
          lastAssistantMsg = synthAssistantMsg
          this.emitFullState()

          const synthMessages = this.buildOpenAIMessages(
            currentCfgForSynth.workspaceDir,
            currentCfgForSynth.permissionMode || 'default',
            effectiveQuery,
            recalledMemories,
            currentCfgForSynth.mainModel,
            synthMsgId
          )
          synthMessages.push({
            role: 'user',
            content:
              '请根据前文通过工具读取并调研到的全部文档内容与事实细节，直接向用户交付完整的最终回答与深度分析报告（直接正面回应用户原始问题，提炼核心结论与关键要点，包含核心命题、架构创新、实验指标与工程评价，无需再调用工具）。'
          })

          const synthResult = await this.llmClient.streamChatCompletion({
            baseUrl: currentCfgForSynth.baseUrl,
            apiKey: currentCfgForSynth.apiKey,
            model: currentCfgForSynth.mainModel,
            messages: synthMessages,
            signal: this.abortController.signal,
            proxyMode: currentCfgForSynth.proxyMode,
            proxyUrl: currentCfgForSynth.customProxyUrl,
            globalProxyUrl: currentCfgForSynth.globalProxyUrl,
            onDelta: (delta) => {
              if (delta.content) {
                synthAssistantMsg.content += delta.content
                this.emitUpdate({
                  type: 'streaming_delta',
                  streamingMessageId: synthMsgId,
                  contentDelta: delta.content
                })
              }
            }
          })

          if (synthResult.content) {
            synthAssistantMsg.content = synthResult.content
          }
          this.emitFullState()
        } catch (synthErr) {
          console.error('Guaranteed synthesis error:', synthErr)
        }
      }

      // 5. Non-blocking Automatic Post-Turn Memory Crystallization (`AutoDream` + `A-MEM`)!
      if (this.memoryEngine && lastAssistantMsg) {
        const targetMsgId = lastAssistantMsg.id
        const finalReplyText = lastAssistantMsg.content || ''
        this.memoryEngine
          .autoCrystallizeTurn(effectiveQuery, finalReplyText, collectedToolCalls)
          .then((crystallized) => {
            if (crystallized.length > 0) {
              const target = this.messages.find((m) => m.id === targetMsgId)
              if (target) {
                target.crystallizedMemories = crystallized
                this.emitFullState()
              }
            }
          })
          .catch((e) => console.error('AutoDream turn crystallization error:', e))
      }
    } catch (err) {
      const isAbort =
        (err as Error).name === 'AbortError' ||
        (err as Error).message?.includes('aborted') ||
        (err as Error).message?.includes('abort')

      if (lastAssistantMsg) {
        if (lastAssistantMsg.isThinkingStreaming) {
          lastAssistantMsg.isThinkingStreaming = false
          if (!lastAssistantMsg.thinkingDurationMs) {
            lastAssistantMsg.thinkingDurationMs = Math.max(200, Date.now() - lastAssistantMsg.timestamp)
          }
        }
        if (isAbort) {
          lastAssistantMsg.interrupted = true
        }
      }

      if (!isAbort) {
        this.messages.push({
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 引擎请求异常: ${(err as Error).message}\n\n请点击右上角模型胶囊配置 OpenAI 兼容 API Key（如 DeepSeek、SiliconFlow、OpenRouter 或本地 Ollama）。`,
          timestamp: Date.now()
        })
      }
      this.emitFullState()
    } finally {
      this.setBusy(false)
    }
  }

  /**
   * Interactive local demonstration when API key is not yet filled in,
   * showcasing live L1-L5 memory recall, chat-driven Skill installation, and automatic post-turn crystallization!
   */
  private async runBuiltInInteractiveDemo(
    userText: string,
    recalledMemories: RecalledMemoryItem[]
  ): Promise<void> {
    this.setBusy(true)
    const cfg = this.configStore.getConfig()
    const mode = cfg.permissionMode || 'default'

    const asstId = `demo_${Date.now()}`
    const thinkStart = Date.now()
    const asstMsg: ChatMessage = {
      id: asstId,
      role: 'assistant',
      reasoningContent: '',
      isThinkingStreaming: true,
      content: '',
      timestamp: thinkStart,
      ...(recalledMemories.length > 0 ? { recalledMemories } : {})
    }
    this.messages.push(asstMsg)
    this.emitFullState()

    const urlMatch = userText.match(/https?:\/\/github\.com\/[^\s]+/)
    const isInstallSkillIntent = /(装载|安装|创建|添加).*skill/i.test(userText) || Boolean(urlMatch)
    const explicitSkills = this.skillManager?.findMentionedSkills(userText) || []

    const thoughtSteps = [
      `正在解析用户指令: "${userText}"\n`,
      ...(explicitSkills.length > 0
        ? [
            `🎯 检测到用户显式指定技能 [${explicitSkills.map((s) => `@${s.name}`).join(', ')}]：已强锁定为第一优先级执行准则，正在注入其领域完整规范与工具链编排...\n`
          ]
        : []),
      recalledMemories.length > 0
        ? `已从 L1-L5 分层记忆库召回 ${recalledMemories.length} 条相关记忆 (${recalledMemories.map((m) => m.layer).join(', ')}) 作为先验约束...\n`
        : `检查当前工作区上下文 (${cfg.workspaceDir}) 与激活模式 [${mode}]...\n`,
      isInstallSkillIntent
        ? `检测到 Skill 装载意图：准备调用 install_skill 工具写入 .claude-desktop/skills/ 并实时同步到左侧 Skills 页面。\n`
        : mode === 'plan'
          ? `当前处于 Plan Mode（只读规划模式）：仅调用 search_files 调研代码结构，不执行任何写入或副作用命令。\n`
          : `准备调用只读工具 search_files 扫描项目结构并汇报。`
    ]

    for (const chunk of thoughtSteps) {
      if (!this.isBusy || this.abortController === null) {
        asstMsg.isThinkingStreaming = false
        asstMsg.interrupted = true
        asstMsg.thinkingDurationMs = Math.max(200, Date.now() - thinkStart)
        this.emitFullState()
        return
      }
      await new Promise((r) => setTimeout(r, 420))
      if (!this.isBusy || this.abortController === null) {
        asstMsg.isThinkingStreaming = false
        asstMsg.interrupted = true
        asstMsg.thinkingDurationMs = Math.max(200, Date.now() - thinkStart)
        this.emitFullState()
        return
      }
      asstMsg.reasoningContent = (asstMsg.reasoningContent || '') + chunk
      this.emitUpdate({
        type: 'streaming_delta',
        streamingMessageId: asstId,
        reasoningDelta: chunk
      })
    }

    await new Promise((r) => setTimeout(r, 320))
    asstMsg.isThinkingStreaming = false
    asstMsg.thinkingDurationMs = Date.now() - thinkStart

    if (isInstallSkillIntent && this.skillManager) {
      const installCallId = `call_skill_${Date.now()}`
      const skillArgs = urlMatch
        ? {
            name: urlMatch[0].split('/').pop() || 'github-imported-skill',
            source_url: urlMatch[0],
            category: 'security'
          }
        : {
            name: userText.slice(0, 24),
            category: 'custom',
            summary: `根据对话指令「${userText.slice(0, 40)}」定制装载的智能体技能`
          }

      asstMsg.content = `正在为您装载 Skill 到本地技能库：`
      asstMsg.toolCalls = [
        {
          id: installCallId,
          name: 'install_skill',
          argumentsJson: JSON.stringify(skillArgs),
          status: 'running',
          permissionLevel: 'readonly',
          startedAt: Date.now()
        }
      ]
      this.emitFullState()

      const installTool = this.toolRegistry.getTool('install_skill')!
      const out = await installTool.execute(
        skillArgs,
        { workspaceDir: cfg.workspaceDir, skillManager: this.skillManager },
        installCallId
      )
      asstMsg.toolCalls[0].status = 'completed'
      asstMsg.toolCalls[0].resultOutput = out
      asstMsg.toolCalls[0].completedAt = Date.now()
      this.appendToolMessage(installCallId, 'install_skill', out)

      const summaryMsg: ChatMessage = {
        id: `demo_skill_done_${Date.now()}`,
        role: 'assistant',
        content: `已完成 Skill 装载！你现在可以点击左侧边栏的 **Skills** 菜单，查看该技能的详细原理解释、能力清单以及一键可运行的使用示例。`,
        timestamp: Date.now()
      }
      this.messages.push(summaryMsg)
      if (this.memoryEngine) {
        const cryst = await this.memoryEngine.autoCrystallizeTurn(
          userText,
          summaryMsg.content,
          asstMsg.toolCalls
        )
        if (cryst.length > 0) summaryMsg.crystallizedMemories = cryst
      }
      this.setBusy(false)
      this.emitFullState()
      return
    }

    const searchCallId = `call_search_${Date.now()}`
    asstMsg.content =
      mode === 'plan'
        ? `已根据 **Plan Mode（只读规划模式）** 完成工作区调研：`
        : `已完成记忆回调与工作区扫描（右上角填入 API Key 即可连接真实大模型）：`
    asstMsg.toolCalls = [
      {
        id: searchCallId,
        name: 'search_files',
        argumentsJson: JSON.stringify({ query: '' }),
        status: 'running',
        permissionLevel: 'readonly',
        startedAt: Date.now()
      }
    ]
    this.emitFullState()

    const searchTool = this.toolRegistry.getTool('search_files')!
    const searchOut = await searchTool.execute(
      {},
      { workspaceDir: cfg.workspaceDir },
      searchCallId
    )
    asstMsg.toolCalls[0].status = 'completed'
    asstMsg.toolCalls[0].resultOutput = searchOut
    asstMsg.toolCalls[0].completedAt = Date.now()
    this.appendToolMessage(searchCallId, 'search_files', searchOut)

    if (this.memoryEngine) {
      const cryst = await this.memoryEngine.autoCrystallizeTurn(
        userText,
        asstMsg.content,
        asstMsg.toolCalls
      )
      if (cryst.length > 0) asstMsg.crystallizedMemories = cryst
    }

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

  private supportsVisionImageUrl(modelName: string): boolean {
    const m = (modelName || '').toLowerCase()
    if (m.includes('deepseek-reasoner') || m.includes('deepseek-chat')) {
      return false
    }
    return /(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4\.5|gpt-5|claude-3|claude-4|claude-sonnet|claude-opus|gemini|vl|vision|pixtral|llava|minicpm-v|o1|o3|o4)/i.test(
      m
    )
  }

  private formatMessageWithAttachments(
    msg: ChatMessage,
    enableVisionParts: boolean
  ): string | OpenAIMessageContentPart[] {
    const atts = msg.attachments || []
    if (atts.length === 0) {
      return msg.content
    }

    const blocks: string[] = []
    if (msg.content && msg.content.trim()) {
      blocks.push(msg.content.trim())
    } else {
      blocks.push('请阅读并分析以下上传的附件内容：')
    }

    for (const att of atts) {
      if (att.kind === 'image') {
        const ocrBody = att.extractedText?.trim()
          ? `[图像文字识别 (OCR) 提取内容]:\n${att.extractedText.trim()}`
          : '[图像附件：未检出明显纯文本字符，请结合上下文或视觉信息分析]'
        blocks.push(
          `<attached_image name="${att.name}" format="${att.ext}" meta="${att.summaryMeta || att.mimeType}">\n${ocrBody}\n</attached_image>`
        )
      } else {
        blocks.push(
          `<attached_document name="${att.name}" format="${att.ext}" meta="${att.summaryMeta || att.mimeType}">\n${att.extractedText || '(空文档)'}\n</attached_document>`
        )
      }
    }

    const combinedText = blocks.join('\n\n')
    const imageAtts = atts.filter((a) => a.kind === 'image' && Boolean(a.previewDataUrl))

    if (enableVisionParts && imageAtts.length > 0) {
      const parts: OpenAIMessageContentPart[] = [{ type: 'text', text: combinedText }]
      for (const img of imageAtts) {
        parts.push({
          type: 'image_url',
          image_url: { url: img.previewDataUrl! }
        })
      }
      return parts
    }

    return combinedText
  }

  private buildOpenAIMessages(
    workspaceDir: string,
    permissionMode: AgentPermissionMode,
    userQuery: string,
    recalledMemories: RecalledMemoryItem[],
    modelName: string,
    currentAssistantMsgId?: string,
    interruptedReasoningHint?: string,
    convergenceHint?: string
  ): OpenAIMessagePayload[] {
    const enableVision = this.supportsVisionImageUrl(modelName)
    let systemPrompt = SystemPromptBuilder.build(workspaceDir, permissionMode, {
      recalledMemoriesBlock: this.memoryEngine
        ? this.memoryEngine.formatRecalledForPrompt(recalledMemories)
        : undefined,
      skillsBlock: this.skillManager
        ? this.skillManager.buildPromptInjection(userQuery)
        : undefined,
      mcpBlock: this.mcpManager ? this.mcpManager.buildPromptInjection() : undefined
    })

    if (interruptedReasoningHint) {
      systemPrompt += `\n\n[上下文先验·上一轮被中止思考概要]:\n${interruptedReasoningHint.slice(0, 1800)}\n(注意：用户此前已在思考阶段中止并显式指令「继续输出」。请直接承接上述思考脉络，无需进行漫长重新思考，立即输出结构化、详尽的最终回答与代码解决方案！)`
    }

    if (convergenceHint) {
      systemPrompt += `\n\n${convergenceHint}`
    }

    const payload: OpenAIMessagePayload[] = [
      {
        role: 'system',
        content: systemPrompt
      }
    ]

    for (const msg of this.messages) {
      // Exclude placeholder currently being generated in this turn
      if (currentAssistantMsgId && msg.id === currentAssistantMsgId) continue

      if (msg.role === 'user') {
        payload.push({
          role: 'user',
          content: this.formatMessageWithAttachments(msg, enableVision)
        })
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
          const effectiveContent =
            msg.content?.trim() ||
            (msg.interrupted
              ? '[思考过程已在中断处固化，等待用户继续推进输出]'
              : '')
          if (effectiveContent) {
            payload.push({ role: 'assistant', content: effectiveContent })
          }
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
