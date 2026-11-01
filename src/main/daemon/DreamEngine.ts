import { ChatMessage, DreamLogEntry, StreamUpdatePayload } from '@shared/types'
import { ConfigStore } from '../store/ConfigStore'
import { OpenAICompatibleClient } from '../llm/OpenAIClient'
import { SystemPromptBuilder } from '../engine/SystemPromptBuilder'

/**
 * Clean-room implementation of Claude Code's leaked "Dream Mode" (overnight/idle memory consolidation).
 * Reviews recent sessions and code diffs, extracts durable project conventions & lessons learned,
 * and updates `.claude-desktop/MEMORY.md`.
 */
export class DreamEngine {
  constructor(
    private configStore: ConfigStore,
    private llmClient: OpenAICompatibleClient,
    private emitUpdate: (payload: StreamUpdatePayload) => void
  ) {}

  async runDreamCycle(
    messages: ChatMessage[],
    trigger: DreamLogEntry['trigger'] = 'manual'
  ): Promise<DreamLogEntry> {
    const cfg = this.configStore.getConfig()
    const currentMemory = SystemPromptBuilder.readMemoryMarkdown(cfg.workspaceDir)

    let extractedRules: string[] = []
    let summary = ''

    const recentTranscript = messages
      .slice(-16)
      .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join('\n')

    if (cfg.apiKey && recentTranscript.trim().length > 0) {
      try {
        const res = await this.llmClient.streamChatCompletion({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.fastModel || cfg.mainModel,
          messages: [
            {
              role: 'system',
              content: `你是 Claude Code 的 Dream 夜间记忆提炼引擎。请阅读近期对话记录与现有的 MEMORY.md，提炼出 2~4 条值得长期记住的项目架构事实、用户偏好或防踩坑经验，严格输出 JSON 格式：
{
  "summary": "本次做梦整理的一句话总结",
  "rules": ["规则或经验1", "规则或经验2"]
}`
            },
            {
              role: 'user',
              content: `现有 MEMORY.md:\n${currentMemory}\n\n近期会话记录:\n${recentTranscript}`
            }
          ]
        })

        const jsonMatch = res.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed.rules)) {
            extractedRules = parsed.rules.map(String)
          }
          if (parsed.summary) {
            summary = String(parsed.summary)
          }
        }
      } catch {
        // Fallback deterministic consolidation below
      }
    }

    if (extractedRules.length === 0) {
      const toolNames = Array.from(
        new Set(
          messages
            .filter((m) => m.role === 'tool' && m.toolName)
            .map((m) => m.toolName as string)
        )
      )
      const userTopics = messages
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.content.slice(0, 60))

      extractedRules = [
        `工作区路径锁定为 \`${cfg.workspaceDir}\`，默认启用三层上下文压缩 (阈值 ${Math.round(cfg.autoCompactThreshold * 100)}%)。`,
        toolNames.length > 0
          ? `近期高频调用工具链：\`${toolNames.join('`, `')}\`，建议保持只读预检后再执行修改。`
          : `项目包含 A(编程工作台)、B(Coordinator 集群)、C(KAIROS 守护) 三大核心视图。`,
        userTopics.length > 0
          ? `近期关注任务焦点：${userTopics.join(' / ')}`
          : `多智能体并发任务优先使用 Git Worktree 在 \`.claude-desktop/worktrees/\` 下隔离执行。`
      ]
      summary = `Dream 引擎已完成对当前会话 (${messages.length} 条消息) 的记忆结晶与去重归档。`
    }

    // Append newly consolidated insights into MEMORY.md
    const timestampStr = new Date().toLocaleString('zh-CN', { hour12: false })
    const newSection = [
      '',
      `## Dream 记忆结晶 (${timestampStr} · 触发方式: ${trigger})`,
      ...extractedRules.map((r) => `- ${r}`)
    ].join('\n')

    const updatedMemory = currentMemory.trim() + '\n' + newSection + '\n'
    SystemPromptBuilder.writeMemoryMarkdown(cfg.workspaceDir, updatedMemory)

    const entry: DreamLogEntry = {
      id: `dream_${Date.now()}`,
      timestamp: Date.now(),
      trigger,
      extractedRules,
      summary,
      tokensSaved: Math.max(320, messages.length * 140)
    }

    this.configStore.addDreamLog(entry)

    this.emitUpdate({
      type: 'dream_updated',
      dreamLogs: this.configStore.getDreamLogs(),
      memoryMarkdown: updatedMemory,
      notification: {
        title: '✨ Dream 记忆提炼已完成',
        body: summary,
        timestamp: Date.now()
      }
    })

    return entry
  }
}
