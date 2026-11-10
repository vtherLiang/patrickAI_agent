import { AppConfig, ChatMessage, TokenUsageStats, ToolCallItem } from '@shared/types'
import { OpenAICompatibleClient } from '../llm/OpenAIClient'

export interface WorkingScratchpadState {
  goal: string
  inspectedFiles: string[]
  modifiedFiles: Array<{ file: string; aciStatus: 'ok' | 'warning' }>
  keyFindings: string[]
  latsPrunedSignatures: string[]
  latsBestValueScore: number
  reflexionLessons: string[]
}

/**
 * Clean-room implementation of Claude Code's multi-layer context compaction pipeline,
 * upgraded with frontier Prefix-Preserved KV Cache Alignment & Dynamic Working Scratchpad:
 * - Layer 1: Prefix-Preserved MicroCompact - Compacts historical tool outputs strictly at Turn/Epoch boundaries
 *   so intra-turn multi-step loops maintain 100% immutable message prefixes (maximizing API Prompt Cache hits!).
 * - Layer 2: AutoCompact - Summarizes older conversation turns into a structured <context_summary> block when approaching token limits.
 * - Layer 3: Dynamic Working Scratchpad - Mitigates "Lost in the Middle" (Liu et al., TACL 2024) by maintaining
 *   a structured tail state board of inspected files, edits, LATS pruned branches, and Reflexion lessons.
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
   * Layer 1: Prefix-Preserved MicroCompact
   * Runs strictly at turn boundaries (before the new user turn starts) and aligns cutoff to historical user turns.
   * During intra-turn tool execution loops, historical messages remain 100% immutable to preserve LLM Prompt Cache!
   */
  runMicroCompact(messages: ChatMessage[], keepRecentCount = 8): ChatMessage[] {
    if (messages.length <= keepRecentCount) return messages

    // Find the latest user message index to strictly protect current turn's tool outputs
    let lastUserIdx = -1
    let prevUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        if (lastUserIdx === -1) {
          lastUserIdx = i
        } else {
          prevUserIdx = i
          break
        }
      }
    }

    // Epoch-aligned cutoff: never mutate messages from the current active turn or the immediately preceding user turn
    const epochBoundary = prevUserIdx !== -1 ? prevUserIdx : lastUserIdx
    const cutoffIndex = Math.min(
      messages.length - keepRecentCount,
      epochBoundary !== -1 ? epochBoundary : messages.length - keepRecentCount
    )

    if (cutoffIndex <= 0) return messages

    return messages.map((msg, idx) => {
      if (idx >= cutoffIndex) return msg
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
   * Layer 3: Dynamic Working Scratchpad Builder
   * Synthesizes a structured state board of the current multi-step turn without mutating message history prefixes.
   */
  buildWorkingScratchpad(
    goal: string,
    collectedToolCalls: ToolCallItem[],
    latsMeta: { bestValue: number; prunedSignatures: string[]; backtrackCount: number },
    reflexionLessons: string[]
  ): string {
    if (collectedToolCalls.length === 0 && reflexionLessons.length === 0) {
      return ''
    }

    const inspected = new Set<string>()
    const modified = new Map<string, 'ok' | 'warning'>()
    const findings: string[] = []

    for (const tc of collectedToolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.argumentsJson || '{}')
      } catch {
        args = {}
      }
      const fp = args.file_path ? String(args.file_path) : ''
      if (
        (tc.name === 'read_file' || tc.name === 'inspect_code_symbols') &&
        tc.status === 'completed' &&
        fp
      ) {
        inspected.add(fp)
      } else if (
        (tc.name === 'edit_file' || tc.name === 'write_file') &&
        tc.status === 'completed' &&
        fp
      ) {
        const hasWarn = tc.resultOutput?.includes('ACI Linter 语法预检告警')
        modified.set(fp, hasWarn ? 'warning' : 'ok')
      } else if (tc.name === 'search_files' && tc.status === 'completed') {
        const firstLine = (tc.resultOutput || '').split('\n')[0] || ''
        if (firstLine) findings.push(`检索 (${args.query || '目录'}): ${firstLine}`)
      }
    }

    const lines: string[] = [
      '<working_scratchpad>',
      `[动态工作状态暂存白板 · Prefix-Preserved State Board]`,
      `- 当前核心目标: ${goal.slice(0, 140)}`,
      `- 已执行工具步数: ${collectedToolCalls.length} 步 | LATS 状态价值评估 V(s): ${latsMeta.bestValue.toFixed(2)} (回溯 ${latsMeta.backtrackCount} 次)`
    ]

    if (inspected.size > 0) {
      lines.push(`- 已勘探文件 (${inspected.size}): ${Array.from(inspected).slice(0, 8).join(', ')}`)
    }
    if (modified.size > 0) {
      const modStr = Array.from(modified.entries())
        .map(([f, st]) => `${f} [${st === 'ok' ? 'ACI语法通过' : '⚠️存在语法告警待修复'}]`)
        .join(', ')
      lines.push(`- 已修改文件: ${modStr}`)
    }
    if (findings.length > 0) {
      lines.push(`- 关键检索摘要: ${findings.slice(-3).join(' | ')}`)
    }
    if (latsMeta.prunedSignatures.length > 0) {
      lines.push(
        `- 🚫 LATS 已剪枝死胡同路径 (严禁重复调用): ${latsMeta.prunedSignatures.slice(-4).join(' ; ')}`
      )
    }
    if (reflexionLessons.length > 0) {
      lines.push(`- 🔄 Reflexion 元反思自愈准则:`)
      for (const lesson of reflexionLessons.slice(-3)) {
        lines.push(`  * ${lesson}`)
      }
    }
    lines.push('</working_scratchpad>')
    return lines.join('\n')
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
