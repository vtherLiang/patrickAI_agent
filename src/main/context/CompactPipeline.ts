import { AppConfig, ChatMessage, TokenUsageStats } from '@shared/types'
import { OpenAICompatibleClient } from '../llm/OpenAIClient'

/**
 * Clean-room implementation of Claude Code's multi-layer context compaction pipeline:
 * Layer 1: MicroCompact - Silently trims bulky historical tool outputs older than N turns.
 * Layer 2: AutoCompact - Summarizes older conversation turns into a structured <context_summary> block when approaching token limits.
 */
export class CompactPipeline {
  private microCompactedCount = 0
  private autoCompactedCount = 0
  private totalSavedTokens = 0

  constructor(private llmClient: OpenAICompatibleClient) {}

  estimateTokens(text: string): number {
    if (!text) return 0
    // Calibrated CJK + ASCII BPE heuristic matching DeepSeek V3 / Claude / cl100k tokenizers
    const cjkMatches = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g)
    const cjkCount = cjkMatches ? cjkMatches.length : 0
    const otherCount = Math.max(0, text.length - cjkCount)
    return Math.ceil(cjkCount * 0.65 + otherCount * 0.25)
  }

  calculateStats(messages: ChatMessage[], maxTokens: number): TokenUsageStats {
    let currentTokens = 0
    for (const msg of messages) {
      currentTokens += this.estimateTokens(msg.content)
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.extractedText) {
            currentTokens += this.estimateTokens(att.extractedText)
          }
          if (att.kind === 'image') {
            currentTokens += 850 // Standard vision tile budget estimate
          }
        }
      }
      // Note: Historical `reasoningContent` is NOT re-sent in multi-turn API payloads,
      // and `tc.resultOutput` is already stored once in the corresponding `role: 'tool'` message.
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          currentTokens += this.estimateTokens(tc.argumentsJson)
        }
      }
    }
    return {
      currentTokens,
      maxTokens,
      usageRatio: Math.min(1, currentTokens / Math.max(1, maxTokens)),
      microCompactedCount: this.microCompactedCount,
      autoCompactedCount: this.autoCompactedCount,
      totalSavedTokens: this.totalSavedTokens
    }
  }

  /**
   * Layer 1: MicroCompact
   * Scans older tool messages (more than keepRecentCount from the end) and folds lengthy outputs.
   * Protects tool outputs generated in the current active user turn so critical facts remain intact!
   */
  runMicroCompact(messages: ChatMessage[], keepRecentCount = 8): ChatMessage[] {
    if (messages.length <= keepRecentCount) return messages

    // Find the latest user message index to strictly protect current turn's tool outputs
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }

    const cutoffIndex = messages.length - keepRecentCount
    return messages.map((msg, idx) => {
      // 1. Keep recent messages within keepRecentCount
      if (idx >= cutoffIndex) return msg
      // 2. Strict protection: never fold tool outputs produced in the active user inquiry turn!
      if (lastUserIdx !== -1 && idx >= lastUserIdx) return msg

      if (msg.role === 'tool' && msg.content.length > 700 && !msg.isCompactedSummary) {
        const beforeTokens = this.estimateTokens(msg.content)
        const lines = msg.content.split('\n')
        const preview = lines.slice(0, 5).join('\n')
        const compactedText = `[MicroCompact 已折叠历史工具输出 (${msg.toolName || 'tool'}, 原长度 ${lines.length} 行 / ~${beforeTokens} tokens)]\n摘要预览:\n${preview}\n...(若需再次查看请重新调用工具)`
        const afterTokens = this.estimateTokens(compactedText)

        this.microCompactedCount += 1
        this.totalSavedTokens += Math.max(0, beforeTokens - afterTokens)

        return {
          ...msg,
          content: compactedText,
          isCompactedSummary: true
        }
      }
      return msg
    })
  }

  /**
   * Layer 2: AutoCompact
   * Summarizes the conversation history into a clean architectural checkpoint using the fast model.
   */
  async runAutoCompact(
    messages: ChatMessage[],
    config: AppConfig
  ): Promise<{ messages: ChatMessage[]; summaryText: string }> {
    if (messages.length <= 4) {
      return { messages, summaryText: '当前对话轮次较少，无需执行全局 AutoCompact。' }
    }

    const beforeStats = this.calculateStats(messages, config.maxContextTokens)
    const keepTail = messages.slice(-2)
    const toSummarize = messages.slice(0, -2)

    const transcript = toSummarize
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 1200)}`)
      .join('\n\n')

    let summaryContent = ''

    if (config.apiKey) {
      try {
        const res = await this.llmClient.streamChatCompletion({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.fastModel || config.mainModel,
          messages: [
            {
              role: 'system',
              content:
                '你是 Claude Code 的 AutoCompact 上下文压缩引擎。请将以下早期历史对话浓缩为高密度的结构化摘要，包含：1. 用户核心目标；2. 已探明的文件与代码关键结论；3. 已完成的修改；4. 下一步待办事项。'
            },
            {
              role: 'user',
              content: transcript
            }
          ]
        })
        summaryContent = res.content
      } catch {
        // Fallback deterministic summary if API call fails
      }
    }

    if (!summaryContent) {
      summaryContent = [
        '### AutoCompact 历史检查点摘要',
        `- 已归档早期对话消息数：${toSummarize.length} 条`,
        `- 涉及工具调用：${toSummarize.filter((m) => m.role === 'tool').map((m) => m.toolName).join(', ') || '无'}`,
        `- 关键上下文要点：${toSummarize
          .filter((m) => m.role === 'user')
          .map((m) => m.content.slice(0, 120))
          .join(' -> ')}`
      ].join('\n')
    }

    const summaryMessage: ChatMessage = {
      id: `compact_${Date.now()}`,
      role: 'assistant',
      content: `<context_summary>\n${summaryContent}\n</context_summary>`,
      timestamp: Date.now(),
      isCompactedSummary: true
    }

    const newMessages = [summaryMessage, ...keepTail]
    const afterStats = this.calculateStats(newMessages, config.maxContextTokens)

    this.autoCompactedCount += 1
    this.totalSavedTokens += Math.max(0, beforeStats.currentTokens - afterStats.currentTokens)

    return {
      messages: newMessages,
      summaryText: summaryContent
    }
  }
}
