/**
 * WeChat Message Adaptive Typesetting & Table Layout Scheduling Engine
 * 微信消息自适应排版与表格防错乱布局调度模型
 *
 * Solves the 4 core causes of WeChat plain-text & table scrambling:
 * 1. Proportional UI font width mismatch (PingFang SC / SF Pro / MiSans / Microsoft YaHei)
 * 2. Narrow mobile chat bubble auto-wrapping (~15.5 - 16.0 em inner width on 375pt-393pt phones)
 * 3. Multi-column Markdown pipe tables shattering across wrapped lines
 * 4. Loss of visual hierarchy when HTML/Markdown syntax is unavailable in WeChat chat
 */

export type TableScheduleMode = 'grid' | 'kv-pair' | 'card-matrix'

export type WeChatTableStyle = 'card' | 'list' | 'rail' | 'grid'

export interface WeChatTableStyleMeta {
  id: WeChatTableStyle
  label: string
  desc: string
  iconLabel: string
}

export const WECHAT_TABLE_STYLES: WeChatTableStyleMeta[] = [
  {
    id: 'card',
    label: '卡片标头风',
    desc: '提取首列为卡片标题【...】，圆点罗列属性，手机端排版最优雅（推荐）',
    iconLabel: '【卡片】'
  },
  {
    id: 'list',
    label: '精致条目风',
    desc: '三角标签引领▸，次级字段整齐内敛缩进，层级分明清晰',
    iconLabel: '▸ 条目'
  },
  {
    id: 'rail',
    label: '结构导轨风',
    desc: '修正式分支框架┌├└，彻底去除断裂竖线与文字脱节空格',
    iconLabel: '┌ 导轨'
  },
  {
    id: 'grid',
    label: '紧凑网格风',
    desc: '横向文本分隔线，适合简短字段表格',
    iconLabel: '▦ 网格'
  }
]

export interface WeChatScheduleOptions {
  tableStyle?: WeChatTableStyle
}

export interface WeChatScheduleStats {
  tableCount: number
  tableModes: TableScheduleMode[]
  lineCount: number
  charCount: number
  maxStructuredLineEm: number
}

export interface WeChatScheduleResult {
  formattedText: string
  stats: WeChatScheduleStats
}

/**
 * Safe visual line budget (in CJK em units, where 1 Chinese character = 1.00 em)
 * Real iOS WeChat bubble inner text width:
 * - iPhone SE / mini (375pt): ~15.2 em
 * - iPhone 14 / 15 / 16 (390-393pt): ~16.0 em
 * - iPhone Pro Max (430pt): ~17.6 em
 * Scheduling structured elements (tables, cards, dividers, quotes, code) <= 15.0 em
 * guarantees ZERO unexpected line-wrapping across all mobile & desktop WeChat clients.
 */
const SAFE_STRUCTURED_LINE_EM = 15.0
const DIVIDER_HEAVY = '━━━━━━━━━━━━━━' // 14.0 em
const DIVIDER_LIGHT = '──────────────' // 14.0 em
const DIVIDER_DASH = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄' // 14.0 em

// Kinsoku Shori (避头点禁则): punctuation that should never appear at the start of a wrapped line
const NO_LINE_START_PUNCT = /^[，。、：；！？）》」】』”’.,:;!?)\]}%]/

/**
 * Proportional Visual Width Engine calibrated to WeChat's system UI font stack.
 * Uses offscreen Canvas 2D metrics in browser/Electron renderer, with an analytical
 * SF Pro + PingFang SC fallback table for non-DOM environments.
 */
class WeChatFontMetrics {
  private ctx: CanvasRenderingContext2D | null = null
  private baseEmPx = 15.5
  private cache = new Map<string, number>()
  private fullSpaceEm = 1.0
  private asciiSpaceEm = 0.3

  constructor() {
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (context) {
          context.font =
            '400 15.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif'
          const cjkWidth = context.measureText('汉').width
          if (cjkWidth > 5) {
            this.ctx = context
            this.baseEmPx = cjkWidth
            this.fullSpaceEm = context.measureText('\u3000').width / cjkWidth
            this.asciiSpaceEm = context.measureText(' ').width / cjkWidth
          }
        }
      } catch {
        this.ctx = null
      }
    }
  }

  /**
   * Measure exact proportional width of a string in CJK `em` units (1 CJK char = 1.00 em).
   */
  public measureEm(text: string): number {
    if (!text) return 0
    const cached = this.cache.get(text)
    if (cached !== undefined) return cached

    let result: number
    if (this.ctx) {
      result = this.ctx.measureText(text).width / this.baseEmPx
    } else {
      result = this.fallbackMeasureEm(text)
    }

    if (this.cache.size < 4000) {
      this.cache.set(text, result)
    }
    return result
  }

  public getSpaceMetrics(): { fullEm: number; asciiEm: number } {
    return {
      fullEm: this.fullSpaceEm || 1.0,
      asciiEm: this.asciiSpaceEm || 0.3
    }
  }

  private fallbackMeasureEm(text: string): number {
    let total = 0
    for (const ch of text) {
      const code = ch.codePointAt(0) || 0
      if (ch === '\u3000') {
        total += 1.0
      } else if (ch === ' ') {
        total += 0.3
      } else if (
        // CJK Unified Ideographs, Punctuation, Fullwidth Forms, Box Drawing, Blocks
        (code >= 0x2e80 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff01 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x20000 && code <= 0x2fa1f)
      ) {
        total += 1.0
      } else if (code >= 0x2500 && code <= 0x259f) {
        // Box drawing & block elements
        total += 1.0
      } else if (code >= 0x1f300 && code <= 0x1faff) {
        // Emoji
        total += 1.25
      } else if ('ilI1|!.,:;\'"`()[]{}'.includes(ch)) {
        total += 0.31
      } else if ('mwMW@%GDOQ'.includes(ch)) {
        total += 0.78
      } else if (ch >= 'A' && ch <= 'Z') {
        total += 0.64
      } else if (ch >= '0' && ch <= '9') {
        total += 0.58
      } else if ('+-*/=<>~^'.includes(ch)) {
        total += 0.56
      } else {
        // Standard lowercase Latin & common symbols in SF Pro / PingFang
        total += 0.53
      }
    }
    return total
  }
}

const fontMetrics = new WeChatFontMetrics()

/**
 * 2D Integer Optimal Space Padding Solver
 * Pads `text` to `targetEm` using ONLY universally supported `\u3000` (Ideographic Space, 1.0 em)
 * and `' '` (ASCII Space, ~0.30 em) so proportional columns align within < 0.14 em (~2px)
 * across iOS, Android, HarmonyOS, macOS, and Windows WeChat without missing-glyph tofu boxes.
 */
export function padToVisualEm(text: string, targetEm: number): string {
  const currentEm = fontMetrics.measureEm(text)
  const deficit = targetEm - currentEm
  if (deficit <= 0.12) return text

  const { fullEm, asciiEm } = fontMetrics.getSpaceMetrics()
  const maxFull = Math.min(20, Math.ceil(deficit / fullEm) + 1)
  // Cap ASCII spaces at 3 (since ~3.2 ASCII spaces ≈ 1 Ideographic Space \u3000),
  // minimizing cross-platform proportional space variance across iOS / Android / Windows.
  const maxAscii = 3

  let bestFull = 0
  let bestAscii = 0
  let bestError = Number.POSITIVE_INFINITY

  for (let nf = 0; nf <= maxFull; nf++) {
    for (let na = 0; na <= maxAscii; na++) {
      const padWidth = nf * fullEm + na * asciiEm
      // Slight penalty if exceeding budget so lines never overflow SAFE_STRUCTURED_LINE_EM
      const diff = padWidth - deficit
      const err = diff > 0.18 ? Math.abs(diff) * 1.45 : Math.abs(diff)
      if (err < bestError) {
        bestError = err
        bestFull = nf
        bestAscii = na
      }
    }
  }

  return text + '\u3000'.repeat(bestFull) + ' '.repeat(bestAscii)
}

/**
 * Tokenizes mixed CJK + English/Number text into atomic wrap units:
 * - Contiguous ASCII words/identifiers (e.g. `electron-builder`, `Worktree`, `v2.0`) stay together
 *   unless a single token itself exceeds `maxEm`.
 * - Each CJK character is an atomic breakable unit, respecting Kinsoku punctuation rules.
 */
function tokenizeForWrap(text: string): string[] {
  const rawTokens =
    text.match(/[A-Za-z0-9_./:@+-]+(?:\s+)?|[\u4e00-\u9fff]|[，。、：；！？）》」】』”’.,:;!?)\]}%]|\s+|./gu) || []
  const merged: string[] = []

  for (const tok of rawTokens) {
    if (merged.length > 0 && NO_LINE_START_PUNCT.test(tok)) {
      merged[merged.length - 1] += tok
    } else {
      merged.push(tok)
    }
  }
  return merged
}

/**
 * Wraps a single line of text so every resulting visual line is strictly <= `budgetEm`.
 */
export function wrapToVisualBudget(text: string, budgetEm: number): string[] {
  const cleaned = text.trim()
  if (!cleaned) return ['']
  if (fontMetrics.measureEm(cleaned) <= budgetEm) return [cleaned]

  const safeBudget = Math.max(4.0, budgetEm)
  const tokens = tokenizeForWrap(cleaned)
  const lines: string[] = []
  let current = ''

  const pushCurrent = (): void => {
    if (current.trim().length > 0) {
      lines.push(current.trimEnd())
    }
    current = ''
  }

  for (const token of tokens) {
    // Skip leading whitespace on a fresh wrapped line
    if (!current && /^\s+$/.test(token)) {
      continue
    }

    const candidate = current + token
    if (fontMetrics.measureEm(candidate) <= safeBudget) {
      current = candidate
      continue
    }

    // If current line already has content, flush it first
    if (current.trim().length > 0) {
      pushCurrent()
      const trimmedToken = token.replace(/^\s+/, '')
      if (!trimmedToken) continue

      if (fontMetrics.measureEm(trimmedToken) <= safeBudget) {
        current = trimmedToken
        continue
      }

      // Single oversized token (e.g. long URL or path): split character-by-character within budget
      let chunk = ''
      for (const ch of trimmedToken) {
        if (fontMetrics.measureEm(chunk + ch) > safeBudget && chunk) {
          lines.push(chunk)
          chunk = ch
        } else {
          chunk += ch
        }
      }
      current = chunk
    } else {
      // Token alone exceeds safeBudget on an empty line
      const trimmedToken = token.replace(/^\s+/, '')
      let chunk = ''
      for (const ch of trimmedToken) {
        if (fontMetrics.measureEm(chunk + ch) > safeBudget && chunk) {
          lines.push(chunk)
          chunk = ch
        } else {
          chunk += ch
        }
      }
      current = chunk
    }
  }

  if (current.trim().length > 0) {
    lines.push(current.trimEnd())
  }

  return lines.length > 0 ? lines : ['']
}

/**
 * Adds subtle CJK-Latin breathing space around inline code identifiers while stripping raw Markdown syntax.
 */
function formatInlineWeChat(text: string, insideTableCell = false): string {
  let out = text.trim()

  // Links: [label](url) -> label ( url ) so WeChat URL detector never swallows closing parenthesis
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const cleanLabel = label.trim()
    const cleanUrl = url.trim()
    if (!cleanUrl || cleanLabel === cleanUrl) return cleanUrl
    return insideTableCell ? `${cleanLabel} (${cleanUrl})` : `${cleanLabel} ( ${cleanUrl} )`
  })

  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => {
    const c = code.trim()
    return insideTableCell ? c : ` ${c} `
  })

  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => {
    const clean = inner.trim()
    if (insideTableCell) return clean
    // Avoid double bracketing if already bracketed
    if (/^[【「《（(\[]/.test(clean) && /[】」》）)\]]$/.test(clean)) {
      return clean
    }
    return `「${clean}」`
  })
  out = out.replace(/__([^_]+)__/g, (_m, inner: string) => {
    const clean = inner.trim()
    return insideTableCell ? clean : `「${clean}」`
  })

  // Italic & Strikethrough
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
  out = out.replace(/~~([^~]+)~~/g, '$1')

  // Collapse accidental double spaces introduced around inline code next to existing spaces/punctuation
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/([（【「《])\s+/g, '$1')
    .replace(/\s+([，。、：；！？）】」》])/g, '$1')
    .trim()

  return out
}

/**
 * Checks if a line is a GFM Markdown table alignment divider row, e.g.:
 * `| :--- | :---: | ---: |` or `:--- | :---`
 */
export function isMarkdownTableDivider(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('-') || !trimmed.includes('|')) return false
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const parts = stripped.split('|')
  if (parts.length < 1) return false
  return parts.every((cell) => /^\s*:?-{2,}:?\s*$/.test(cell))
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => formatInlineWeChat(c, true))
}

/**
 * Multi-Style Adaptive Table Layout Scheduler
 * Supports:
 * - 'card': Header Capsule style (extracts column 0 as 【Title】, clean bullets for other fields) - Recommended
 * - 'list': Hierarchical Bullet List style (▸ Field 1: Value 1 / Field 2: Value 2)
 * - 'rail': Corrected Tree Rail style (┌ ├ └ without broken floating pipes or detached space padding)
 * - 'grid': Text Micro-Aligned Grid (compact table with divider lines)
 */
function scheduleTableLayout(
  rawRows: string[][],
  tableStyle: WeChatTableStyle = 'card'
): {
  lines: string[]
  mode: TableScheduleMode
} {
  if (rawRows.length === 0) return { lines: [], mode: 'grid' }

  const colCount = Math.max(...rawRows.map((r) => r.length))
  const normalizedRows = rawRows.map((r) => {
    const copy = [...r]
    while (copy.length < colCount) copy.push('')
    return copy
  })

  const headers = normalizedRows[0].map((h, idx) => h || `字段${idx + 1}`)
  const dataRows = normalizedRows.slice(1)

  // If table only had 1 row (no data rows), render cleanly as single-row items
  if (dataRows.length === 0) {
    return {
      lines: headers.map((h) => `▪ ${h}`),
      mode: 'kv-pair'
    }
  }

  // Compute maximum visual em width per column across header and all data cells
  const colMaxEm: number[] = new Array(colCount).fill(0)
  for (let c = 0; c < colCount; c++) {
    colMaxEm[c] = fontMetrics.measureEm(headers[c])
    for (const row of dataRows) {
      const w = fontMetrics.measureEm(row[c] || '—')
      if (w > colMaxEm[c]) colMaxEm[c] = w
    }
  }

  const sep = ' │ '
  const sepEm = fontMetrics.measureEm(sep)
  const totalGridEm =
    colMaxEm.reduce((acc, w) => acc + w, 0) + Math.max(0, colCount - 1) * sepEm

  // =========================================================================
  // 1. GRID STYLE (紧凑网格风)
  // =========================================================================
  if (tableStyle === 'grid') {
    const out: string[] = []
    const renderGridRow = (cells: string[]): string =>
      cells
        .map((cell, cIdx) => {
          const val = cell || '—'
          return cIdx < colCount - 1 ? padToVisualEm(val, colMaxEm[cIdx]) : val
        })
        .join(sep)

    out.push(renderGridRow(headers))
    const ruleLen = Math.max(8, Math.min(14, Math.round(Math.min(totalGridEm, SAFE_STRUCTURED_LINE_EM))))
    out.push('─'.repeat(ruleLen))

    for (const row of dataRows) {
      out.push(renderGridRow(row))
    }

    return { lines: out, mode: 'grid' }
  }

  // =========================================================================
  // 2. CARD STYLE (卡片标头风 - 推荐，微信阅读最舒适)
  // Extracts column 0 as the Card Header 【Title】, bullets the remaining fields
  // =========================================================================
  if (tableStyle === 'card') {
    const out: string[] = []
    dataRows.forEach((row, rIdx) => {
      if (rIdx > 0) {
        out.push('') // Breathing line between cards
      }

      // First column acts as primary entity title
      const titleValue = row[0] ? row[0].trim() : `${headers[0]} ${rIdx + 1}`
      out.push(`【${titleValue}】`)

      // Remaining attributes bulleted cleanly
      for (let c = 1; c < colCount; c++) {
        const header = headers[c]
        const val = row[c] || '—'
        const prefix = `• ${header}：`
        const prefixEm = fontMetrics.measureEm(prefix)
        const budget = Math.max(5.0, SAFE_STRUCTURED_LINE_EM - prefixEm)

        const wrapped = wrapToVisualBudget(val, budget)
        out.push(`${prefix}${wrapped[0]}`)

        // Hanging indent for wrapped continuation lines (2 spaces indent under label)
        if (wrapped.length > 1) {
          for (let k = 1; k < wrapped.length; k++) {
            out.push(`  ${wrapped[k]}`)
          }
        }
      }
    })

    return { lines: out, mode: 'card-matrix' }
  }

  // =========================================================================
  // 3. LIST STYLE (精致条目风)
  // Uses `▸ 字段1：值1` for first item, and indented `  字段2：值2` for remaining fields
  // =========================================================================
  if (tableStyle === 'list') {
    const out: string[] = []
    dataRows.forEach((row, rIdx) => {
      if (rIdx > 0) {
        out.push('') // Breathing line between entities
      }

      for (let c = 0; c < colCount; c++) {
        const header = headers[c]
        const val = row[c] || '—'
        const isLead = c === 0
        const prefix = isLead ? `▸ ${header}：` : `  ${header}：`
        const prefixEm = fontMetrics.measureEm(prefix)
        const budget = Math.max(5.0, SAFE_STRUCTURED_LINE_EM - prefixEm)

        const wrapped = wrapToVisualBudget(val, budget)
        out.push(`${prefix}${wrapped[0]}`)

        if (wrapped.length > 1) {
          const hangingIndent = '    '
          for (let k = 1; k < wrapped.length; k++) {
            out.push(`${hangingIndent}${wrapped[k]}`)
          }
        }
      }
    })

    return { lines: out, mode: 'kv-pair' }
  }

  // =========================================================================
  // 4. RAIL STYLE (修复后的树状导轨风)
  // `┌`, `├`, `└` brackets define the card boundaries, colons attach naturally
  // WITHOUT spaces, and wrapped lines NEVER output a broken floating `│` pipe!
  // =========================================================================
  const out: string[] = []
  dataRows.forEach((row, rIdx) => {
    if (rIdx > 0) {
      out.push('') // Breathing line between cards
    }

    for (let c = 0; c < colCount; c++) {
      const isFirst = c === 0
      const isLast = c === colCount - 1
      const rail = colCount === 1 ? '▪ ' : isFirst ? '┌ ' : isLast ? '└ ' : '├ '
      const header = headers[c]
      const val = row[c] || '—'
      // Direct full-width colon attachment WITHOUT detached spaces
      const prefix = `${rail}${header}：`
      const prefixEm = fontMetrics.measureEm(prefix)
      const budget = Math.max(4.5, SAFE_STRUCTURED_LINE_EM - prefixEm)

      const wrapped = wrapToVisualBudget(val, budget)
      out.push(`${prefix}${wrapped[0]}`)

      if (wrapped.length > 1) {
        // Use clean hanging indent under value, NEVER broken disconnected `│ ` pipe!
        for (let k = 1; k < wrapped.length; k++) {
          out.push(`  ${wrapped[k]}`)
        }
      }
    }
  })

  return { lines: out, mode: 'card-matrix' }
}

/**
 * Main entry point: Converts Markdown source (post AI-naturalization) into
 * non-scrambling, proportional-font-calibrated WeChat plain text.
 */
export function scheduleWeChatDocument(
  markdown: string,
  options?: WeChatScheduleOptions
): WeChatScheduleResult {
  const tableStyle = options?.tableStyle || 'card'
  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: { kind: 'h1' | 'heading' | 'content'; text: string }[] = []
  const tableModes: TableScheduleMode[] = []
  let maxStructuredLineEm = 0

  const recordStructuredLines = (lines: string[]): void => {
    for (const l of lines) {
      const w = fontMetrics.measureEm(l)
      if (w > maxStructuredLineEm) maxStructuredLineEm = w
    }
  }

  let i = 0
  while (i < rawLines.length) {
    const line = rawLines[i]
    const trimmed = line.trim()

    // 1. Skip blank lines between blocks
    if (!trimmed) {
      i++
      continue
    }

    // 2. Fenced Code Blocks: ```lang ... ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
        codeLines.push(rawLines[i])
        i++
      }
      if (i < rawLines.length) i++ // consume closing ```

      const renderedCode: string[] = []
      const topLabel = lang ? `┄┄┄ ${lang} ┄┄┄` : DIVIDER_DASH
      renderedCode.push(topLabel)
      for (const cl of codeLines) {
        const leadingSpaces = (cl.match(/^\s*/) || [''])[0].length
        const indentEm = Math.min(3, Math.floor(leadingSpaces / 2)) * 0.6
        const indentStr = ' '.repeat(Math.min(6, leadingSpaces))
        const content = cl.trim()
        if (!content) {
          renderedCode.push('')
          continue
        }
        const wrapped = wrapToVisualBudget(content, SAFE_STRUCTURED_LINE_EM - indentEm)
        wrapped.forEach((wl, idx) => {
          renderedCode.push(idx === 0 ? `${indentStr}${wl}` : `${indentStr}  ${wl}`)
        })
      }
      renderedCode.push(DIVIDER_DASH)
      recordStructuredLines(renderedCode)
      blocks.push({ kind: 'content', text: renderedCode.join('\n') })
      continue
    }

    // 3. Horizontal Rule: --- or ***
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      recordStructuredLines([DIVIDER_LIGHT])
      blocks.push({ kind: 'content', text: DIVIDER_LIGHT })
      i++
      continue
    }

    // 4. Headings: # H1 .. #### H4
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (hMatch) {
      const level = hMatch[1].length
      const title = formatInlineWeChat(hMatch[2], true)
      if (level === 1) {
        const h1Lines = [`【 ${title} 】`, DIVIDER_HEAVY]
        recordStructuredLines([DIVIDER_HEAVY])
        blocks.push({ kind: 'h1', text: h1Lines.join('\n') })
      } else if (level === 2) {
        blocks.push({ kind: 'heading', text: `▍${title}` })
      } else {
        blocks.push({ kind: 'heading', text: `◈ ${title}` })
      }
      i++
      continue
    }

    // 5. Markdown Tables (pipe-delimited)
    const looksLikeTableStart =
      (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
      (trimmed.includes('|') && i + 1 < rawLines.length && isMarkdownTableDivider(rawLines[i + 1]))

    if (looksLikeTableStart) {
      const tableRows: string[][] = []
      while (i < rawLines.length) {
        const tLine = rawLines[i].trim()
        if (!tLine || !tLine.includes('|')) break
        if (!isMarkdownTableDivider(tLine)) {
          tableRows.push(parseTableRow(tLine))
        }
        i++
      }
      if (tableRows.length > 0) {
        const scheduled = scheduleTableLayout(tableRows, tableStyle)
        tableModes.push(scheduled.mode)
        recordStructuredLines(scheduled.lines)
        blocks.push({ kind: 'content', text: scheduled.lines.join('\n') })
      }
      continue
    }

    // 6. Blockquotes: > ...
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < rawLines.length && rawLines[i].trim().startsWith('>')) {
        const qContent = formatInlineWeChat(rawLines[i].trim().replace(/^>\s*/, ''))
        if (qContent) {
          const wrapped = wrapToVisualBudget(qContent, SAFE_STRUCTURED_LINE_EM - 1.2)
          for (const wl of wrapped) {
            quoteLines.push(`▏${wl}`)
          }
        }
        i++
      }
      if (quoteLines.length > 0) {
        recordStructuredLines(quoteLines)
        blocks.push({ kind: 'content', text: quoteLines.join('\n') })
      }
      continue
    }

    // 7. Lists (Unordered, Task List, Ordered, with indentation awareness)
    const isListLine = (s: string): boolean =>
      /^\s*([-*+]|\d+\.)\s+/.test(s)

    if (isListLine(line)) {
      const listOut: string[] = []
      while (i < rawLines.length && isListLine(rawLines[i])) {
        const rawL = rawLines[i]
        const indentSpaces = (rawL.match(/^\s*/) || [''])[0].length
        const isNested = indentSpaces >= 2
        const tL = rawL.trim()

        // Task list: - [x] or - [ ]
        const taskMatch = tL.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/)
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x'
          const prefix = isNested ? `  ${checked ? '☑' : '☐'} ` : `${checked ? '☑' : '☐'} `
          listOut.push(`${prefix}${formatInlineWeChat(taskMatch[2])}`)
          i++
          continue
        }

        const ulMatch = tL.match(/^[-*+]\s+(.+)$/)
        if (ulMatch) {
          const bullet = isNested ? '  ◦ ' : '• '
          listOut.push(`${bullet}${formatInlineWeChat(ulMatch[1])}`)
          i++
          continue
        }

        const olMatch = tL.match(/^(\d+)\.\s+(.+)$/)
        if (olMatch) {
          const numPrefix = isNested ? `  ${olMatch[1]}. ` : `${olMatch[1]}. `
          listOut.push(`${numPrefix}${formatInlineWeChat(olMatch[2])}`)
          i++
          continue
        }

        i++
      }
      if (listOut.length > 0) {
        blocks.push({ kind: 'content', text: listOut.join('\n') })
      }
      continue
    }

    // 8. Standard Paragraph
    blocks.push({ kind: 'content', text: formatInlineWeChat(trimmed) })
    i++
  }

  // Gestalt rhythm: attach section headings (`▍` / `◈`) tightly (`\n`) to their immediate body,
  // while keeping `\n\n` breathing space before headings, after H1 banner, and between content blocks.
  const outSegments: string[] = []
  for (let b = 0; b < blocks.length; b++) {
    const curr = blocks[b]
    if (b === 0) {
      outSegments.push(curr.text)
      continue
    }
    const prev = blocks[b - 1]
    const joiner = prev.kind === 'heading' && curr.kind === 'content' ? '\n' : '\n\n'
    outSegments.push(joiner + curr.text)
  }

  const formattedText = outSegments.join('').trim()
  const finalLines = formattedText ? formattedText.split('\n') : []

  return {
    formattedText,
    stats: {
      tableCount: tableModes.length,
      tableModes,
      lineCount: finalLines.length,
      charCount: formattedText.length,
      maxStructuredLineEm: Number(maxStructuredLineEm.toFixed(1))
    }
  }
}
