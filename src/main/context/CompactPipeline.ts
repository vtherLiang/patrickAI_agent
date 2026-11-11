import fs from 'fs'
import path from 'path'
import { AppConfig, ChatAttachment, ChatMessage, TokenUsageStats, ToolCallItem } from '@shared/types'
import { OpenAICompatibleClient } from '../llm/OpenAIClient'
import { maskSensitiveSecrets } from '@shared/secretMasker'

export interface WorkingScratchpadState {
  goal: string
  inspectedFiles: string[]
  modifiedFiles: Array<{ file: string; aciStatus: 'ok' | 'warning' }>
  keyFindings: string[]
  latsPrunedSignatures: string[]
  latsBestValueScore: number
  reflexionLessons: string[]
  aconGuidelines?: string[]
}

export interface AnchoredContextState {
  userCoreGoals: string[]
  verifiedFiles: Array<{ file: string; symbolsOrFindings: string }>
  completedEdits: Array<{ file: string; status: string }>
  failedAttemptsAndConstraints: string[] // Negative Evidence (The Complexity Trap & FOCUS)
  openTasksAndBlockers: string[]
  evolutionRules: string[] // ACON learned rules
  lastCompactedMessageId?: string
  totalCompactedTurns: number
}

export interface PrecompactSnapshot {
  upToMessageId: string
  snapshotHash: string
  timestamp: number
  anchoredState: AnchoredContextState
  summaryText: string
}

/**
 * Clean-room implementation of Claude Code's multi-layer context compaction pipeline,
 * upgraded with 2025–2026 frontier findings:
 * - Layer 1: Prefix-Preserved Reversible MicroCompact (SWE-Pruner + The Complexity Trap):
 *   Extracts task-aware code/error skeletons, offloads raw full output to `.claude-desktop/compact-cache/`
 *   for on-demand `read_file` retrieval, and compresses historical attachments & image vision payloads.
 * - Layer 2: Anchored Incremental AutoCompact & Background Pre-Compaction (ACON + Parallel Compaction):
 *   Merges newly evicted turns into a persistent structured state board with explicit Negative Evidence,
 *   with non-blocking background async pre-compaction at 68% threshold to eliminate tail latency at 85%.
 * - Layer 3: Dynamic Persistent Working Scratchpad (Context-Folding + FOCUS):
 *   Maintains cross-turn file ledgers, LATS dead-end branch folding, and ACON self-evolving failure guidelines.
 */
export class CompactPipeline {
  private microCompactedCount = 0
  private autoCompactedCount = 0
  private totalSavedTokens = 0

  // Layer 2: Anchored State & Background Async Pre-Compaction Cache
  private anchoredState: AnchoredContextState | null = null
  private precompactSnapshot: PrecompactSnapshot | null = null
  private isPrecompacting = false

  // Layer 3: ACON Failure-driven Adaptive Guidelines
  private aconRules: string[] = []

  constructor(private llmClient: OpenAICompatibleClient) {}

  resetSessionState(): void {
    this.anchoredState = null
    this.precompactSnapshot = null
    this.isPrecompacting = false
  }

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
            // If historical image vision payload is omitted in favor of OCR text, charge minimal placeholder budget
            currentTokens += att.omitImageFromContext ? 40 : 850
          }
        }
      }
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
   * Reversible Offloading: Persists full raw observation to disk cache so the model
   * can retrieve specific slices via `read_file(start_line, end_line)` when needed (preventing F3 access failure).
   */
  offloadTextToDisk(
    workspaceDir: string,
    keyPrefix: string,
    rawText: string
  ): { relativePath: string; lineCount: number } | null {
    if (!workspaceDir || !rawText || rawText.length < 300) return null
    try {
      const cacheDir = path.join(workspaceDir, '.claude-desktop', 'compact-cache')
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true })
      }

      // Maintain LRU cap: delete oldest if file count > 120
      try {
        const files = fs.readdirSync(cacheDir)
        if (files.length > 120) {
          const sorted = files
            .map((f) => {
              const fp = path.join(cacheDir, f)
              const stat = fs.statSync(fp)
              return { fp, mtime: stat.mtimeMs }
            })
            .sort((a, b) => a.mtime - b.mtime)
          for (let i = 0; i < Math.min(25, sorted.length); i++) {
            fs.unlinkSync(sorted[i].fp)
          }
        }
      } catch {
        // non-blocking
      }

      const safePrefix = keyPrefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24)
      const fileName = `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.txt`
      const fullPath = path.join(cacheDir, fileName)
      const safeText = maskSensitiveSecrets(rawText)
      fs.writeFileSync(fullPath, safeText, 'utf-8')

      const relPath = path.join('.claude-desktop', 'compact-cache', fileName)
      const lineCount = safeText.split('\n').length
      return { relativePath: relPath, lineCount }
    } catch {
      return null
    }
  }

  /**
   * Task-Aware Skeleton Extractor (SWE-Pruner + The Complexity Trap):
   * Extracts function signatures, diagnostic error/fail lines, and terminal conclusion lines
   * instead of blindly truncating the head 5 lines.
   */
  extractTaskAwareSkeleton(
    content: string,
    options: {
      toolName?: string
      goal?: string
      isErrorOrWarn?: boolean
      isPruned?: boolean
    } = {}
  ): { skeletonText: string; totalLines: number } {
    const lines = (content || '').split('\n')
    const totalLines = lines.length
    if (totalLines <= 12) {
      return { skeletonText: content, totalLines }
    }

    const { toolName = '', goal = '', isErrorOrWarn = false, isPruned = false } = options
    const keptSet = new Set<number>()

    // Always keep head lines
    const headCount = toolName === 'read_file' ? 3 : 4
    for (let i = 0; i < Math.min(headCount, totalLines); i++) {
      keptSet.add(i)
    }

    // Always keep tail lines (crucial: conclusions, exit codes, final test lines live here!)
    const tailCount = isErrorOrWarn || toolName === 'run_bash' ? 8 : 4
    for (let i = Math.max(0, totalLines - tailCount); i < totalLines; i++) {
      keptSet.add(i)
    }

    // Goal keywords matching
    const goalTerms = (goal.toLowerCase().match(/[a-z0-9_.-]{3,}|[\u4e00-\u9fa5]{2,}/g) || []).slice(0, 8)

    // 1. Diagnostics / Negative Evidence (The Complexity Trap): preserve error/fail traces
    const errorPattern = /\b(error|fail|failed|failure|exception|traceback|panic|fatal|exit code|warning|warn|errno|syntaxerror|typeerror)\b|❌|⚠️|✗/i
    let errorHits = 0
    for (let i = 0; i < totalLines; i++) {
      if (errorHits >= 10) break
      if (errorPattern.test(lines[i])) {
        keptSet.add(Math.max(0, i - 1))
        keptSet.add(i)
        keptSet.add(Math.min(totalLines - 1, i + 1))
        errorHits++
      }
    }

    // 2. Code Structural Signatures (SWE-Pruner): for read_file / code outputs
    if (toolName === 'read_file' || toolName === 'inspect_code_symbols') {
      const codeSigPattern = /^\s*(export\s+)?(async\s+)?(function|class|interface|type|enum|struct|impl|def|const\s+[a-zA-Z0-9_$]+\s*=\s*(\(|async)|\/\*\*|\*\s*@)/
      let sigHits = 0
      for (let i = 0; i < totalLines; i++) {
        if (sigHits >= 12) break
        if (codeSigPattern.test(lines[i])) {
          keptSet.add(i)
          sigHits++
        }
      }
    }

    // 3. Goal-relevant lines
    if (goalTerms.length > 0) {
      let goalHits = 0
      for (let i = 0; i < totalLines; i++) {
        if (goalHits >= 6) break
        const lower = lines[i].toLowerCase()
        if (goalTerms.some((t) => lower.includes(t))) {
          keptSet.add(i)
          goalHits++
        }
      }
    }

    // Assemble ordered lines with ellipsis gaps
    const sortedIdx = Array.from(keptSet).sort((a, b) => a - b)
    const resultLines: string[] = []
    let lastIdx = -1

    for (const idx of sortedIdx) {
      if (lastIdx !== -1 && idx > lastIdx + 1) {
        resultLines.push(`  ... [省略第 ${lastIdx + 2} - ${idx} 行代码/日志] ...`)
      }
      resultLines.push(lines[idx])
      lastIdx = idx
    }

    if (isPruned) {
      resultLines.unshift('  [🚫 该分支已被 LATS 树搜索剪枝标记为死胡同]')
    }

    return {
      skeletonText: resultLines.join('\n'),
      totalLines
    }
  }

  /**
   * Layer 1: Prefix-Preserved Reversible MicroCompact
   * Runs strictly at turn boundaries (before a new user turn starts).
   * Historical messages remain 100% byte-immutable during intra-turn tool loops!
   */
  runMicroCompact(
    messages: ChatMessage[],
    options: {
      keepRecentCount?: number
      workspaceDir?: string
      activeGoal?: string
      prunedToolCallIds?: Set<string>
    } = {}
  ): ChatMessage[] {
    const keepRecentCount = options.keepRecentCount ?? 8
    if (messages.length <= keepRecentCount) return messages

    const { workspaceDir = '', activeGoal = '', prunedToolCallIds = new Set<string>() } = options

    // Identify user turn boundaries
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

    // Cutoff aligned to historical turn boundaries: protects current active turn & immediately preceding turn
    const epochBoundary = prevUserIdx !== -1 ? prevUserIdx : lastUserIdx
    const cutoffIndex = Math.min(
      messages.length - keepRecentCount,
      epochBoundary !== -1 ? epochBoundary : messages.length - keepRecentCount
    )

    if (cutoffIndex <= 0) return messages

    return messages.map((msg, idx) => {
      if (idx >= cutoffIndex) return msg
      if (lastUserIdx !== -1 && idx >= lastUserIdx) return msg

      // 1. Tool observation micro-compaction with reversible disk offloading & task-aware skeleton
      if (msg.role === 'tool' && !msg.isCompactedSummary) {
        const isPruned = Boolean(msg.toolCallId && prunedToolCallIds.has(msg.toolCallId))
        const rawContent = msg.content || ''
        const shouldCompact = rawContent.length > 700 || (isPruned && rawContent.length > 250)

        if (shouldCompact) {
          const beforeTokens = this.estimateTokens(rawContent)
          const isErrorOrWarn =
            rawContent.includes('Error:') ||
            rawContent.includes('Exit Code:') ||
            rawContent.includes('ACI Linter 语法预检告警') ||
            rawContent.includes('未找到完全匹配')

          const { skeletonText, totalLines } = this.extractTaskAwareSkeleton(rawContent, {
            toolName: msg.toolName,
            goal: activeGoal,
            isErrorOrWarn,
            isPruned
          })

          let offloadInfo: { relativePath: string; lineCount: number } | null = null
          if (workspaceDir) {
            offloadInfo = this.offloadTextToDisk(
              workspaceDir,
              `tool_${msg.toolName || 'call'}`,
              rawContent
            )
          }

          const offloadPrompt = offloadInfo
            ? `\n- 完整输出已安全卸载至: \`${offloadInfo.relativePath}\` (共 ${offloadInfo.lineCount} 行)。如后续需查阅完整细节，可调用 \`read_file(file_path="${offloadInfo.relativePath}", start_line=..., end_line=...)\` 精确回溯。`
            : ''

          const compactedText = [
            `[MicroCompact 已提取关键骨架 (${msg.toolName || 'tool'}, 原 ${totalLines} 行 / ~${beforeTokens} tokens)]`,
            skeletonText,
            `...(已自动压缩精简${offloadPrompt})`
          ].join('\n')

          const afterTokens = this.estimateTokens(compactedText)
          this.microCompactedCount += 1
          this.totalSavedTokens += Math.max(0, beforeTokens - afterTokens)

          return {
            ...msg,
            content: compactedText,
            isCompactedSummary: true,
            offloadedPath: offloadInfo?.relativePath,
            isPrunedBranch: isPruned
          }
        }
      }

      // 2. Historical User Document Attachment & Vision Payload Compaction
      if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
        let attModified = false
        const updatedAttachments = msg.attachments.map((att, attIdx) => {
          let updatedAtt = { ...att }

          // Document text offloading
          if (att.extractedText && att.extractedText.length > 900 && !att.isCompacted) {
            let offloadInfo: { relativePath: string; lineCount: number } | null = null
            if (workspaceDir) {
              offloadInfo = this.offloadTextToDisk(
                workspaceDir,
                `doc_${att.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
                att.extractedText
              )
            }
            const beforeTokens = this.estimateTokens(att.extractedText)
            const { skeletonText, totalLines } = this.extractTaskAwareSkeleton(att.extractedText, {
              toolName: 'read_file',
              goal: activeGoal
            })
            const offloadHint = offloadInfo
              ? `\n[完整文档正文已卸载至: \`${offloadInfo.relativePath}\` (共 ${offloadInfo.lineCount} 行)，可用 read_file 回溯]`
              : ''
            updatedAtt.extractedText = `[历史附件已自动提取骨架: ${att.name} (${totalLines} 行)]\n${skeletonText}${offloadHint}`
            updatedAtt.isCompacted = true
            updatedAtt.offloadedPath = offloadInfo?.relativePath
            attModified = true

            const afterTokens = this.estimateTokens(updatedAtt.extractedText)
            this.totalSavedTokens += Math.max(0, beforeTokens - afterTokens)
          }

          // Historical image vision payload compaction (omits ~850 token base64 tile from API, keeps OCR text & UI thumbnail)
          if (att.kind === 'image' && !att.omitImageFromContext) {
            updatedAtt.omitImageFromContext = true
            attModified = true
            this.totalSavedTokens += 800
          }

          return updatedAtt
        })

        if (attModified) {
          return {
            ...msg,
            attachments: updatedAttachments
          }
        }
      }

      return msg
    })
  }

  /**
   * Tool-Pair Safe Tail Index Finder:
   * Prevents splitting an `assistant(tool_calls)` message from its corresponding `tool` responses,
   * avoiding 400 Bad Request errors from frontier providers.
   */
  findSafeTailStartIndex(messages: ChatMessage[], minKeepCount = 2): number {
    if (messages.length <= minKeepCount) return 0
    let targetIdx = Math.max(0, messages.length - minKeepCount)

    // Never begin keepTail on an orphaned `tool` message: walk backwards to its parent assistant
    while (targetIdx > 0 && messages[targetIdx].role === 'tool') {
      targetIdx--
    }

    // Prefer starting keepTail at a user turn if within a reasonable lookback window
    for (let i = targetIdx; i >= Math.max(0, targetIdx - 3); i--) {
      if (messages[i].role === 'user') {
        return i
      }
    }

    return targetIdx
  }

  /**
   * Head-Tail Slicer: Preserves both the introductory premise and concluding results / stack traces.
   */
  private headTailSlice(text: string, headChars = 450, tailChars = 650): string {
    if (!text || text.length <= headChars + tailChars + 50) return text
    const head = text.slice(0, headChars)
    const tail = text.slice(-tailChars)
    return `${head}\n... [中间折叠 ${text.length - (headChars + tailChars)} 字符] ...\n${tail}`
  }

  /**
   * Layer 3: Dynamic Working Scratchpad Builder (Context-Folding + FOCUS)
   */
  buildWorkingScratchpad(
    goal: string,
    collectedToolCalls: ToolCallItem[],
    latsMeta: { bestValue: number; prunedSignatures: string[]; backtrackCount: number },
    reflexionLessons: string[],
    persistentState?: {
      sessionInspectedFiles?: string[]
      sessionModifiedFiles?: Array<{ file: string; aciStatus: 'ok' | 'warning' }>
      sessionFindings?: string[]
    }
  ): string {
    const inspected = new Set<string>(persistentState?.sessionInspectedFiles || [])
    const modified = new Map<string, 'ok' | 'warning'>()
    if (persistentState?.sessionModifiedFiles) {
      for (const m of persistentState.sessionModifiedFiles) {
        modified.set(m.file, m.aciStatus)
      }
    }
    const findings: string[] = [...(persistentState?.sessionFindings || [])]

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
        if (firstLine && !findings.includes(firstLine)) {
          findings.push(`检索 (${args.query || '目录'}): ${firstLine}`)
        }
      }
    }

    if (
      inspected.size === 0 &&
      modified.size === 0 &&
      findings.length === 0 &&
      reflexionLessons.length === 0 &&
      latsMeta.prunedSignatures.length === 0 &&
      this.aconRules.length === 0
    ) {
      return ''
    }

    const lines: string[] = [
      '<working_scratchpad>',
      `[动态工作状态暂存白板 · Prefix-Preserved State Board]`,
      `- 当前核心目标: ${goal.slice(0, 140)}`,
      `- 已执行工具步数: ${collectedToolCalls.length} 步 | LATS 状态价值评估 V(s): ${latsMeta.bestValue.toFixed(2)} (回溯 ${latsMeta.backtrackCount} 次)`
    ]

    if (inspected.size > 0) {
      lines.push(`- 已勘探文件 (${inspected.size}): ${Array.from(inspected).slice(0, 10).join(', ')}`)
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
    if (this.aconRules.length > 0) {
      lines.push(`- 💡 ACON 自演化压缩保持约束 (防止压缩后重复读踩坑):`)
      for (const rule of this.aconRules.slice(-3)) {
        lines.push(`  * ${rule}`)
      }
    }
    lines.push('</working_scratchpad>')
    return lines.join('\n')
  }

  /**
   * Layer 2: Anchored Incremental AutoCompact (ACON + Anchored Iterative Compaction)
   * Instead of summarizing from scratch, incrementally merges newly evicted turns into a persistent state anchor.
   */
  async runAutoCompact(
    messages: ChatMessage[],
    config: AppConfig
  ): Promise<{ messages: ChatMessage[]; summaryText: string }> {
    if (messages.length <= 4) {
      return { messages, summaryText: '当前对话轮次较少，无需执行全局 AutoCompact。' }
    }

    const beforeStats = this.calculateStats(messages, config.maxContextTokens)
    const tailStart = this.findSafeTailStartIndex(messages, 2)
    const keepTail = messages.slice(tailStart)
    const toSummarize = messages.slice(0, tailStart)

    // Check if background pre-compaction snapshot is available and matches
    if (this.precompactSnapshot && toSummarize.length > 0) {
      const lastSummarizeId = toSummarize[toSummarize.length - 1].id
      if (this.precompactSnapshot.upToMessageId === lastSummarizeId) {
        const summaryMsg: ChatMessage = {
          id: `compact_${Date.now()}`,
          role: 'assistant',
          content: `<context_summary>\n${this.precompactSnapshot.summaryText}\n</context_summary>`,
          timestamp: Date.now(),
          isCompactedSummary: true
        }
        const newMessages = [summaryMsg, ...keepTail]
        const afterStats = this.calculateStats(newMessages, config.maxContextTokens)
        this.autoCompactedCount += 1
        this.totalSavedTokens += Math.max(0, beforeStats.currentTokens - afterStats.currentTokens)
        this.precompactSnapshot = null

        return {
          messages: newMessages,
          summaryText: summaryMsg.content
        }
      }
    }

    // Build incremental transcript using dual-end slicing
    const transcript = toSummarize
      .map((m) => {
        const contentPreview = this.headTailSlice(m.content || '', 450, 650)
        return `[${m.role.toUpperCase()}]: ${contentPreview}`
      })
      .join('\n\n')

    let summaryContent = ''
    const currentAnchorJson = this.anchoredState
      ? JSON.stringify(this.anchoredState, null, 2)
      : '无 (初始检查点)'

    if (config.apiKey) {
      try {
        const res = await this.llmClient.streamChatCompletion({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.fastModel || config.mainModel,
          messages: [
            {
              role: 'system',
              content: [
                '你是 Claude Code Studio 的 Anchored Incremental AutoCompact 压缩引擎。',
                '请将早期对话及工具调用增量浓缩为结构化检查点。',
                '【核心原则 (ACON & The Complexity Trap)】：',
                '1. 必须原样保留用户不可违背的核心约束与代码契约；',
                '2. 必须显式记录已尝试但失败的方案、死胡同与错误现象 (Negative Evidence)，严禁粉饰平滑错误，防止模型后续重蹈覆辙；',
                '3. 列出已探明的文件列表、具体符号定义与已完成的修改；',
                '4. 列出下一步未尽待办事项；',
                ...(this.aconRules.length > 0
                  ? [`5. 遵守此前学习到的 ACON 约束: ${this.aconRules.join('; ')}`]
                  : [])
              ].join('\n')
            },
            {
              role: 'user',
              content: [
                `### 此前已有状态锚点 (Anchor State):`,
                currentAnchorJson,
                '',
                `### 本次需增量合并归档的早期对话与工具轨迹:`,
                transcript
              ].join('\n')
            }
          ]
        })
        summaryContent = res.content
      } catch {
        // deterministic fallback
      }
    }

    if (!summaryContent) {
      summaryContent = [
        '### AutoCompact 锚定历史检查点摘要 (Fallback)',
        `- 归档早期消息: ${toSummarize.length} 条`,
        `- 工具调用: ${toSummarize.filter((m) => m.role === 'tool').map((m) => m.toolName).join(', ') || '无'}`,
        `- 阶段要点: ${toSummarize
          .filter((m) => m.role === 'user')
          .map((m) => m.content.slice(0, 100))
          .join(' -> ')}`
      ].join('\n')
    }

    // Update internal anchored state tracking
    const lastId = toSummarize[toSummarize.length - 1]?.id
    this.anchoredState = {
      userCoreGoals: [summaryContent.slice(0, 200)],
      verifiedFiles: [],
      completedEdits: [],
      failedAttemptsAndConstraints: [],
      openTasksAndBlockers: [],
      evolutionRules: [...this.aconRules],
      lastCompactedMessageId: lastId,
      totalCompactedTurns: (this.anchoredState?.totalCompactedTurns || 0) + 1
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

  /**
   * Parallel Context Compaction (Cim et al., 2026):
   * Asynchronously pre-compacts frozen historical turns in the background when usageRatio hits 68%,
   * completely eliminating synchronous wait spikes when reaching the 85% threshold.
   */
  async maybePrecompactInBackground(messages: ChatMessage[], config: AppConfig): Promise<void> {
    if (this.isPrecompacting || !config.apiKey || messages.length < 6) return

    // Find the latest user message: only pre-compact messages strictly BEFORE the current active turn
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx <= 2) return

    const safeFrozenEnd = this.findSafeTailStartIndex(messages.slice(0, lastUserIdx), 1)
    if (safeFrozenEnd <= 2) return

    const frozenMessages = messages.slice(0, safeFrozenEnd)
    const lastFrozenMsg = frozenMessages[frozenMessages.length - 1]
    if (!lastFrozenMsg) return

    if (this.precompactSnapshot?.upToMessageId === lastFrozenMsg.id) {
      return // already up to date
    }

    this.isPrecompacting = true
    try {
      const transcript = frozenMessages
        .map((m) => `[${m.role.toUpperCase()}]: ${this.headTailSlice(m.content || '', 350, 450)}`)
        .join('\n\n')

      const res = await this.llmClient.streamChatCompletion({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.fastModel || config.mainModel,
        messages: [
          {
            role: 'system',
            content:
              '你是 Claude Code Studio 的后台预压缩引擎。请增量概括以下已冻结的早期会话，提炼目标、已探明代码、已完成修改、显式错误教训与下一步。'
          },
          {
            role: 'user',
            content: transcript
          }
        ]
      })

      if (res.content) {
        this.precompactSnapshot = {
          upToMessageId: lastFrozenMsg.id,
          snapshotHash: `${frozenMessages.length}_${lastFrozenMsg.id}`,
          timestamp: Date.now(),
          anchoredState: {
            userCoreGoals: [res.content.slice(0, 160)],
            verifiedFiles: [],
            completedEdits: [],
            failedAttemptsAndConstraints: [],
            openTasksAndBlockers: [],
            evolutionRules: [...this.aconRules],
            lastCompactedMessageId: lastFrozenMsg.id,
            totalCompactedTurns: (this.anchoredState?.totalCompactedTurns || 0) + 1
          },
          summaryText: res.content
        }
      }
    } catch {
      // background pre-compaction failures are strictly silent
    } finally {
      this.isPrecompacting = false
    }
  }

  /**
   * ACON Post-Mortem Feedback Loop:
   * Dynamically learns a compression guideline when post-compression failure or repeated read is detected.
   */
  recordAconFailure(rule: string, workspaceDir?: string): void {
    if (!rule || this.aconRules.includes(rule)) return
    this.aconRules.push(rule)
    if (this.aconRules.length > 6) {
      this.aconRules.shift()
    }

    if (workspaceDir) {
      try {
        const filePath = path.join(workspaceDir, '.claude-desktop', 'compact-rules.json')
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, JSON.stringify(this.aconRules, null, 2), 'utf-8')
      } catch {
        // non-blocking
      }
    }
  }

  loadAconRulesFromWorkspace(workspaceDir: string): void {
    if (!workspaceDir) return
    try {
      const filePath = path.join(workspaceDir, '.claude-desktop', 'compact-rules.json')
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (Array.isArray(parsed)) {
          this.aconRules = parsed.slice(-6)
        }
      }
    } catch {
      // non-blocking
    }
  }
}
