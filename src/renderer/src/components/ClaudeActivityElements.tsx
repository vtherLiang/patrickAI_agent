import React, { useState, useEffect, useMemo } from 'react'
import { ChevronRight, Sparkles, Copy, Check } from 'lucide-react'
import { MemoryLayer, RecalledMemoryItem, ToolCallItem } from '@shared/types'
import { maskSensitiveSecrets } from '@shared/secretMasker'
import { useAppStore } from '../store/useAppStore'

/**
 * Exact glyph cycle from Claude Code v2.1.88 leaked source (`CLAUDE_ACTIVITY_GLYPHS`)
 */
const CLAUDE_ACTIVITY_GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']

/**
 * Signature rotating verbs inspired by Claude Code's `spinnerVerbs`
 */
const CLAUDE_SPINNER_VERBS = [
  'Thinking…',
  'Pondering…',
  'Analyzing…',
  'Synthesizing…',
  'Ruminating…',
  'Architecting…',
  'Clauding…'
]

export const LAYER_BADGE_STYLE: Record<MemoryLayer, string> = {
  L1: 'bg-[#D97757]/15 text-[#C45533] border-[#D97757]/30',
  L2: 'bg-[#0071e3]/12 text-[#0071e3] border-[#0071e3]/25',
  L3: 'bg-[#5856D6]/12 text-[#5856D6] border-[#5856D6]/25',
  L4: 'bg-[#FF9500]/14 text-[#C96A00] border-[#FF9500]/30',
  L5: 'bg-[#34C759]/14 text-[#177233] border-[#34C759]/30'
}

/**
 * Brand App Icon Component: Fused Mathematical `π` + Claude Code 10-Spoke Sunburst (`π✻` / π*)
 * Pure White Apple macOS Squircle Background + Multi-Stop Royal-to-Orchid Purple Gradient
 */
export const PiClaudeBrandIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14'
}) => (
  <svg
    viewBox="0 0 1024 1024"
    className={`select-none shrink-0 ${className}`}
    aria-label="Pi × Claude Code Icon"
  >
    <defs>
      <linearGradient id="uiPiPurpleGrad" x1="15%" y1="85%" x2="88%" y2="12%">
        <stop offset="0%" stopColor="#3811AD" />
        <stop offset="30%" stopColor="#6D28D9" />
        <stop offset="58%" stopColor="#8B4BF6" />
        <stop offset="82%" stopColor="#AF5DFB" />
        <stop offset="100%" stopColor="#CE86FE" />
      </linearGradient>
    </defs>
    <rect
      x="72"
      y="72"
      width="880"
      height="880"
      rx="200"
      ry="200"
      fill="#FFFFFF"
      stroke="#E6E0FA"
      strokeWidth="18"
    />
    <path
      d="M 354 402 C 350 548, 322 680, 280 774"
      fill="none"
      stroke="url(#uiPiPurpleGrad)"
      strokeWidth="86"
      strokeLinecap="round"
    />
    <path
      d="M 550 402 C 546 556, 542 682, 550 734 C 558 780, 606 786, 644 752"
      fill="none"
      stroke="url(#uiPiPurpleGrad)"
      strokeWidth="86"
      strokeLinecap="round"
    />
    <path
      d="M 224 430 C 266 386, 344 390, 452 392 C 524 393, 568 391, 598 386"
      fill="none"
      stroke="url(#uiPiPurpleGrad)"
      strokeWidth="84"
      strokeLinecap="round"
    />
    <g
      transform="translate(752, 292)"
      stroke="url(#uiPiPurpleGrad)"
      strokeWidth="26"
      strokeLinecap="round"
    >
      <circle cx="0" cy="0" r="25" fill="url(#uiPiPurpleGrad)" stroke="none" />
      <line x1="0" y1="0" x2="115" y2="-37" />
      <line x1="0" y1="0" x2="75" y2="-75" />
      <line x1="0" y1="0" x2="0" y2="-115" />
      <line x1="0" y1="0" x2="-75" y2="-75" />
      <line x1="0" y1="0" x2="-115" y2="-37" />
      <line x1="0" y1="0" x2="-100" y2="32" />
      <line x1="0" y1="0" x2="-68" y2="92" />
      <line x1="0" y1="0" x2="0" y2="102" />
      <line x1="0" y1="0" x2="68" y2="92" />
      <line x1="0" y1="0" x2="100" y2="32" />
    </g>
  </svg>
)

export const ClaudeAsteriskGlyph: React.FC<{ active?: boolean; className?: string }> = ({
  active = true,
  className = ''
}) => {
  const [frameIdx, setFrameIdx] = useState(4) // '✻'

  useEffect(() => {
    if (!active) {
      setFrameIdx(4)
      return
    }
    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % CLAUDE_ACTIVITY_GLYPHS.length)
    }, 115)
    return () => clearInterval(timer)
  }, [active])

  return (
    <span
      className={`inline-block w-4 text-center font-mono select-none text-[#D97757] ${
        active ? 'font-bold' : 'opacity-80'
      } ${className}`}
    >
      {CLAUDE_ACTIVITY_GLYPHS[frameIdx]}
    </span>
  )
}

/**
 * Claude Code's Per-Query Hierarchical Memory Recall Callback Block:
 * `⏺ Memory Recall (回调 3 条分层记忆 · L1, L2, L5)`
 * `  ⎿ [L1 · 96%] Apple 纯白极简美学与零妥协工程品质 (展开详情)`
 */
export const ClaudeMemoryRecallBlock: React.FC<{
  memories: RecalledMemoryItem[]
  onInspectLayerCenter?: () => void
}> = ({ memories, onInspectLayerCenter }) => {
  const [expanded, setExpanded] = useState(false)
  if (!memories || memories.length === 0) return null

  const uniqueLayers = Array.from(new Set(memories.map((m) => m.layer)))
  const topHit = memories[0]

  return (
    <div className="py-0.5 font-mono text-[12px]">
      <div className="flex items-start gap-2">
        <span className="w-4 text-center select-none shrink-0 text-[#5856D6]">⏺</span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 text-left group flex-wrap"
          >
            <span className="font-semibold text-[#1d1d1f]">MemoryRecall</span>
            <span className="text-[#6e6e73]">
              (回调 {memories.length} 条分层记忆 · {uniqueLayers.join(', ')})
            </span>
          </button>

          <div className="mt-0.5 flex items-start gap-2 text-[11.5px] text-[#6e6e73]">
            <span className="text-[#aeaeb2] select-none shrink-0">⎿</span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="hover:text-[#1d1d1f] text-left transition-colors flex items-center gap-1.5 flex-wrap"
            >
              <span
                className={`px-1.5 py-0.2 rounded border text-[10px] font-semibold ${
                  LAYER_BADGE_STYLE[topHit.layer]
                }`}
              >
                {topHit.layer} · {Math.round(topHit.score * 100)}%
              </span>
              <span className="truncate max-w-[440px] font-sans">{topHit.title}</span>
              <span className="text-[11px] text-[#86868b]">
                {expanded ? '(收起)' : memories.length > 1 ? `(+${memories.length - 1} 条展开)` : '(展开)'}
              </span>
            </button>
          </div>

          {expanded && (
            <div className="animate-apple-view mt-2 ml-4 rounded-2xl border border-black/[0.07] bg-[#F5F5F7]/80 p-3 space-y-2 font-sans">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl bg-white border border-black/[0.05] px-3 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`px-1.5 py-0.2 rounded border text-[10px] font-mono font-semibold shrink-0 ${
                          LAYER_BADGE_STYLE[m.layer]
                        }`}
                      >
                        {m.layer}
                      </span>
                      <span className="text-[12px] font-semibold text-[#1d1d1f] truncate">
                        {m.title}
                      </span>
                    </div>
                    <span className="text-[10.5px] text-[#86868b] font-mono shrink-0">
                      {m.matchReason} · {Math.round(m.score * 100)}%
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#6e6e73] leading-relaxed">{m.content}</p>
                </div>
              ))}
              {onInspectLayerCenter && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={onInspectLayerCenter}
                    className="text-[11px] font-medium text-[#0071e3] hover:underline"
                  >
                    前往 L1–L5 分层记忆库查看全部 →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Automatic Post-Turn Memory Crystallization Pill:
 * Shown automatically when `AutoDream + A-MEM` extracts or evolves L1-L5 memories at end of turn!
 */
export const ClaudeMemoryCrystallizedBadge: React.FC<{
  items: Array<{
    id: string
    layer: MemoryLayer
    title: string
    content: string
    isEvolved?: boolean
  }>
  onOpenMemoryCenter?: () => void
}> = ({ items, onOpenMemoryCenter }) => {
  if (!items || items.length === 0) return null

  return (
    <div className="pl-6 pt-1">
      <button
        type="button"
        onClick={onOpenMemoryCenter}
        className="apple-press inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#5856D6]/8 hover:bg-[#5856D6]/14 border border-[#5856D6]/20 text-[11.5px] text-[#4845B8] transition-colors"
      >
        <Sparkles className="w-3 h-3 shrink-0" />
        <span>
          AutoDream 已自动结晶 {items.length} 条记忆：
          {items.map((it) => `[${it.layer}${it.isEvolved ? '·演化' : ''}] ${it.title}`).join(' · ')}
        </span>
      </button>
    </div>
  )
}

/**
 * Claude Code's active bottom status spinner line:
 * `✻ Thinking… (esc to interrupt · 4s · ↓ 1.2k tokens)`
 */
export const ClaudeLiveStatusRow: React.FC<{
  startedAt: number | null
  tokenCount: number
  onInterrupt?: () => void
}> = ({ startedAt, tokenCount, onInterrupt }) => {
  const [verbIdx, setVerbIdx] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    const verbTimer = setInterval(() => {
      setVerbIdx((prev) => (prev + 1) % CLAUDE_SPINNER_VERBS.length)
    }, 3200)
    return () => clearInterval(verbTimer)
  }, [])

  useEffect(() => {
    const base = startedAt || Date.now()
    const tick = (): void => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - base) / 1000)))
    }
    tick()
    const secTimer = setInterval(tick, 500)
    return () => clearInterval(secTimer)
  }, [startedAt])

  const formattedTokens =
    tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : String(tokenCount)

  return (
    <div className="flex items-center gap-2 py-1.5 text-[13px] font-mono select-none animate-apple-view">
      <ClaudeAsteriskGlyph active />
      <span className="claude-shimmer-text font-medium">{CLAUDE_SPINNER_VERBS[verbIdx]}</span>
      <span className="text-[#86868b] text-[12px]">
        (
        {onInterrupt ? (
          <button
            type="button"
            onClick={onInterrupt}
            className="hover:text-[#1d1d1f] underline decoration-black/20 underline-offset-2 transition-colors"
          >
            esc to interrupt
          </button>
        ) : (
          'esc to interrupt'
        )}
        {' · '}
        {elapsedSec}s
        {tokenCount > 0 ? ` · ↓ ${formattedTokens} tokens` : ''})
      </span>
    </div>
  )
}

/**
 * Thinking Process Block:
 * - While actively thinking (`isStreaming === true`): Preserves exact Claude Code live form (`✻ Thinking… (Xs)` + open live trace).
 * - Once thinking finishes (`isStreaming === false`): Automatically collapses into a quiet OpenAI Codex-style disclosure row (`已思考 Xs ›`) so primary output takes center stage; expanding shows the exact unchanged reasoning trace.
 */
export const ClaudeThinkingBlock: React.FC<{
  reasoningContent: string
  isStreaming?: boolean
  durationMs?: number
  interrupted?: boolean
  onInterrupt?: () => void
}> = ({ reasoningContent, isStreaming = false, durationMs, interrupted = false, onInterrupt }) => {
  const effectivelyStreaming = Boolean(isStreaming && !interrupted)
  const [isOpen, setIsOpen] = useState<boolean>(effectivelyStreaming)
  const [liveMs, setLiveMs] = useState(0)

  useEffect(() => {
    if (effectivelyStreaming) {
      setIsOpen(true)
    } else {
      // Automatically collapse in Codex style as soon as thinking completes and answer begins
      setIsOpen(false)
    }
  }, [effectivelyStreaming])

  useEffect(() => {
    if (!effectivelyStreaming) return
    const start = Date.now()
    const timer = setInterval(() => {
      setLiveMs(Date.now() - start)
    }, 100)
    return () => clearInterval(timer)
  }, [effectivelyStreaming])

  // Solidify duration: once durationMs is provided or interrupted, it is frozen and never ticks again
  const secondsText = durationMs
    ? `${(durationMs / 1000).toFixed(1)}s`
    : liveMs > 0
      ? `${(liveMs / 1000).toFixed(1)}s`
      : '1.2s'

  return (
    <div className={effectivelyStreaming ? 'my-1.5' : 'my-0.5'}>
      {effectivelyStreaming ? (
        <div className="inline-flex items-center gap-2 py-0.5 select-none flex-wrap">
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="group inline-flex items-center gap-2 text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
          >
            <ClaudeAsteriskGlyph active />
            <span className="claude-shimmer-text font-mono font-medium">
              Thinking… ({secondsText})
            </span>
            <ChevronRight
              className={`w-3.5 h-3.5 text-[#86868b] transition-transform duration-200 ${
                isOpen ? 'rotate-90' : ''
              }`}
            />
          </button>
          {onInterrupt && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onInterrupt()
              }}
              className="apple-press px-2 py-0.5 rounded-md bg-[#FF3B30]/10 hover:bg-[#FF3B30]/18 text-[#C41E16] text-[11px] font-medium transition-colors"
              title="中断当前思考与生成 (快捷键 Esc)"
            >
              停止思考
            </button>
          )}
        </div>
      ) : (
        /* OpenAI Codex-Style Quiet Collapsed Post-Thinking Disclosure */
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="group inline-flex items-center gap-1.5 px-2 py-0.5 -ml-1 rounded-lg hover:bg-black/[0.04] text-[12px] text-[#86868b] hover:text-[#1d1d1f] transition-colors select-none"
        >
          <span className="font-mono">已思考 {secondsText}{interrupted ? '（已中断）' : ''}</span>
          <ChevronRight
            className={`w-3.5 h-3.5 text-[#aeaeb2] group-hover:text-[#1d1d1f] transition-transform duration-200 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        </button>
      )}

      {isOpen && reasoningContent && (
        <div className="animate-apple-view ml-2 mt-1.5 pl-4 border-l-2 border-[#D97757]/30 text-[12.5px] text-[#6e6e73] italic whitespace-pre-wrap leading-[1.65] font-sans">
          {reasoningContent}
          {effectivelyStreaming && (
            <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-[#D97757]/70 animate-pulse rounded-sm" />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Unicode East Asian display width & Box-Drawing Table alignment utilities
 * Ensures mixed CJK/English/special symbol tables maintain a razor-sharp vertical right border.
 */
function getCharDisplayWidth(char: string): number {
  const code = char.codePointAt(0) || 0
  if (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x3000 && code <= 0x303f) || // CJK Symbols and Punctuation
    (code >= 0x2460 && code <= 0x24ff) || // Enclosed Alphanumerics (①, ②, ③, etc.)
    (code >= 0x2190 && code <= 0x21ff) // Arrows (←, →, ↕, etc.)
  ) {
    return 2
  }
  return 1
}

export function getDisplayWidth(str: string): number {
  let width = 0
  for (const ch of str) {
    width += getCharDisplayWidth(ch)
  }
  return width
}

const BOX_BORDER_START = /^[┌├└╭╰+│|╔╠╚║┃]/
const BOX_BORDER_END = /[┐┤┘╮╯+│|╗╣╝║┃]$/
const BOX_H_BORDER = /^[┌├└╭╰+│|╔╠╚║┃].*[─━═-]{3,}.*[┐┤┘╮╯+│|╗╣╝║┃]$/

export interface AsciiBoxRow {
  type: 'border' | 'content' | 'raw'
  leftChar?: string
  rightChar?: string
  filler?: string
  content?: string
  rawText?: string
}

export function parseAsciiBoxTable(code: string): AsciiBoxRow[] | null {
  const rawLines = code.replace(/\r\n/g, '\n').split('\n')
  const trimmedLines = rawLines.map((l) => l.trim()).filter(Boolean)
  if (trimmedLines.length < 3) return null

  const startMatches = trimmedLines.filter((l) => BOX_BORDER_START.test(l)).length
  const endMatches = trimmedLines.filter((l) => BOX_BORDER_END.test(l)).length
  const hasHBorder = trimmedLines.some((l) => BOX_H_BORDER.test(l))

  if (startMatches / trimmedLines.length < 0.6 || endMatches / trimmedLines.length < 0.6 || !hasHBorder) {
    return null
  }

  const rows: AsciiBoxRow[] = []
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      rows.push({ type: 'raw', rawText: '' })
      continue
    }

    if (BOX_H_BORDER.test(trimmed)) {
      const leftChar = trimmed[0]
      const rightChar = trimmed[trimmed.length - 1]
      const fillerMatch = trimmed.slice(1, -1).match(/[─━═-]/)
      rows.push({
        type: 'border',
        leftChar,
        rightChar,
        filler: fillerMatch ? fillerMatch[0] : '─'
      })
      continue
    }

    if (BOX_BORDER_START.test(trimmed) && BOX_BORDER_END.test(trimmed) && trimmed.length >= 2) {
      const leftChar = trimmed[0]
      const rightChar = trimmed[trimmed.length - 1]
      const content = trimmed.slice(1, -1).trimEnd()
      rows.push({
        type: 'content',
        leftChar,
        rightChar,
        content
      })
      continue
    }

    rows.push({
      type: 'raw',
      rawText: rawLine
    })
  }

  return rows
}

export function alignAsciiBoxText(code: string): string {
  const rows = parseAsciiBoxTable(code)
  if (!rows) return code

  let maxInnerWidth = 0
  for (const row of rows) {
    if (row.type === 'content' && row.content) {
      const w = getDisplayWidth(row.content)
      if (w > maxInnerWidth) {
        maxInnerWidth = w
      }
    }
  }

  maxInnerWidth = Math.max(maxInnerWidth, 40)

  const alignedLines: string[] = []
  for (const row of rows) {
    if (row.type === 'border' && row.leftChar && row.rightChar) {
      const filler = row.filler || '─'
      const fillerW = getCharDisplayWidth(filler) || 1
      const count = Math.max(1, Math.round((maxInnerWidth + 2) / fillerW))
      alignedLines.push(`${row.leftChar}${filler.repeat(count)}${row.rightChar}`)
    } else if (row.type === 'content' && row.leftChar && row.rightChar) {
      const content = row.content || ''
      const curW = getDisplayWidth(content)
      const padLen = Math.max(1, maxInnerWidth - curW + 2)
      alignedLines.push(`${row.leftChar}${content}${' '.repeat(padLen)}${row.rightChar}`)
    } else {
      alignedLines.push(row.rawText ?? '')
    }
  }

  return alignedLines.join('\n')
}

export const AsciiBoxTableRenderer: React.FC<{ rows: AsciiBoxRow[] }> = ({ rows }) => {
  return (
    <div className="w-fit min-w-full font-mono text-[12.8px] leading-[1.62] select-text">
      {rows.map((row, idx) => {
        if (row.type === 'border' && row.leftChar && row.rightChar) {
          return (
            <div
              key={idx}
              className="flex items-center w-full select-none text-[#8e8e93] font-mono leading-none my-0.5"
            >
              <span className="shrink-0">{row.leftChar}</span>
              <span className="flex-1 overflow-hidden whitespace-nowrap opacity-65 leading-none">
                {(row.filler || '─').repeat(220)}
              </span>
              <span className="shrink-0">{row.rightChar}</span>
            </div>
          )
        }

        if (row.type === 'content' && row.leftChar && row.rightChar) {
          return (
            <div
              key={idx}
              className="flex items-center justify-between w-full text-[#1d1d1f] font-mono leading-[1.62]"
            >
              <span className="shrink-0 text-[#8e8e93] select-none">{row.leftChar}</span>
              <span className="whitespace-pre flex-1 min-w-0 pr-3">{row.content}</span>
              <span className="shrink-0 text-[#8e8e93] select-none">{row.rightChar}</span>
            </div>
          )
        }

        return (
          <div key={idx} className="whitespace-pre text-[#1d1d1f]">
            {row.rawText}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Copyable Fenced Code Block styled after Claude Code CLI Terminal
 */
const TerminalCodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false)

  const parsedBoxTable = useMemo(() => {
    return parseAsciiBoxTable(code)
  }, [code])

  const handleCopy = (): void => {
    const textToCopy = parsedBoxTable ? alignAsciiBoxText(code) : code
    navigator.clipboard?.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="my-3.5 rounded-2xl border border-black/[0.085] bg-[#F6F6F8] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
      <div className="px-4 py-2 bg-[#EBEBEF]/80 border-b border-black/[0.06] flex items-center justify-between text-[11.5px] font-mono text-[#6e6e73] select-none">
        <span className="font-semibold text-[#1d1d1f]">{language || (parsedBoxTable ? '架构拓扑 / 表格' : 'code')}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#28CD41]" />
              <span className="text-[#177233] font-medium">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制代码</span>
            </>
          )}
        </button>
      </div>
      {parsedBoxTable ? (
        <div className="claude-terminal-code p-4 overflow-x-auto">
          <AsciiBoxTableRenderer rows={parsedBoxTable} />
        </div>
      ) : (
        <pre className="claude-terminal-code p-4 overflow-x-auto text-[#1d1d1f] text-[13px] leading-[1.65] whitespace-pre">
          {code}
        </pre>
      )}
    </div>
  )
}

/**
 * Safety & Risk Detection Algorithm for Code Bubbles:
 * Determines whether an inline code pill represents a destructive command,
 * sensitive credential exposure, unsafe runtime bypass, or is part of a security warning.
 * If true, renders as red alert bubble; otherwise renders in calm Apple slate gray (#48484a).
 */
function detectCodeBubbleRisk(code: string, contextLine: string): boolean {
  const codeLower = code.toLowerCase().trim()
  const ctxLower = contextLine.toLowerCase()

  // 1. Direct Destructive / Dangerous Command Patterns
  const dangerousCommandPatterns = [
    /\b(rm\s+-rf|rmdir|mkfs|dd\s+if=|kill\s+-9|killall|chmod\s+-r\s+777|wipefs|shred|fdisk|format)\b/,
    /\b(drop\s+table|drop\s+database|truncate\s+table|delete\s+from)\b/,
    /:\(\)\s*\{\s*:\|:&\s*\};:/,
    /\b(curl|wget)\s+.*\|\s*(sh|bash)\b/,
    /\b(eval|exec)\s*\(/
  ]
  if (dangerousCommandPatterns.some((pattern) => pattern.test(codeLower))) {
    return true
  }

  // 2. Sensitive Credentials / Token / Secret Exposure Patterns
  const sensitiveCredentialPatterns = [
    /\b(api[_-]?key|secret[_-]?key|private[_-]?key|auth[_-]?token|access[_-]?token)\b/,
    /\b(sk-ant-[a-z0-9_-]+|sk-proj-[a-z0-9_-]+)\b/,
    /\b(password|passwd|credentials)\b/
  ]
  if (sensitiveCredentialPatterns.some((pattern) => pattern.test(codeLower))) {
    return true
  }

  // 3. Security Bypass / Unsafe Flags / Vulnerabilities
  const securityBypassPatterns = [
    /\b(disable-library-validation|allow-jit|--no-sandbox|--unsafe|--danger|hardenedruntime\s*[:=]\s*false)\b/,
    /\bcve-\d{4}-\d+\b/
  ]
  if (securityBypassPatterns.some((pattern) => pattern.test(codeLower))) {
    return true
  }

  // 4. Contextual Security / Danger / Warning Indicator
  const contextSecurityMarkers = [
    '⚠️',
    '🚨',
    '[!]',
    '安全提醒',
    '安全提示',
    '安全风险',
    '安全隐患',
    '安全漏洞',
    '明文存储',
    '泄漏风险',
    '越权风险',
    '高危',
    '危险',
    '风险',
    '警告',
    'security risk',
    'security warning',
    'caution',
    'danger',
    'vulnerability'
  ]
  const hasSecurityContext = contextSecurityMarkers.some((marker) => ctxLower.includes(marker))
  if (hasSecurityContext) {
    const warningRelatedKeywords = [
      'key',
      'token',
      'secret',
      'config',
      'auth',
      'bypass',
      'validation',
      'jit',
      'eval',
      'exec',
      'root',
      'sudo',
      'password',
      'permission'
    ]
    if (
      warningRelatedKeywords.some((kw) => codeLower.includes(kw)) ||
      contextLine.includes('⚠️') ||
      contextLine.includes('🚨') ||
      contextLine.includes('高危') ||
      contextLine.includes('明文存储')
    ) {
      return true
    }
  }

  return false
}

/**
 * Inline token parser for Claude Code Terminal Output (`code`, **bold**, *italic*, [link](url), raw URLs)
 */
function renderInlineTerminalText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const tokenRegex =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>'")]+|\*[^*\s][^*\n]*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let keySeq = 0

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const raw = match[0]
    if (raw.startsWith('`') && raw.endsWith('`')) {
      const codeContent = raw.slice(1, -1)
      const isRisk = detectCodeBubbleRisk(codeContent, text)

      nodes.push(
        <code
          key={`ic_${keySeq++}`}
          className={`px-1.5 py-0.5 mx-[2px] rounded-[5px] text-[12.5px] font-mono transition-colors ${
            isRisk
              ? 'bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#D70015] font-semibold'
              : 'bg-[#F2F2F7] border border-black/[0.08] text-[#48484a] font-medium'
          }`}
        >
          {codeContent}
        </code>
      )
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      nodes.push(
        <strong key={`b_${keySeq++}`} className="font-bold text-[#000000]">
          {raw.slice(2, -2)}
        </strong>
      )
    } else if (raw.startsWith('[') && raw.includes('](')) {
      const splitIdx = raw.indexOf('](')
      const label = raw.slice(1, splitIdx)
      const url = raw.slice(splitIdx + 2, -1)
      nodes.push(
        <a
          key={`a_${keySeq++}`}
          href={url}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            useAppStore.getState().openWebPreview(url, label)
          }}
          className="text-[#0071e3] hover:text-[#005bb5] underline decoration-[#0071e3]/40 underline-offset-2 hover:decoration-[#0071e3] font-medium cursor-pointer transition-colors"
          title={`在侧边浏览区交互打开: ${url}`}
        >
          {label}
        </a>
      )
    } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = raw
      nodes.push(
        <a
          key={`url_${keySeq++}`}
          href={url}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            useAppStore.getState().openWebPreview(url)
          }}
          className="text-[#0071e3] hover:text-[#005bb5] underline decoration-[#0071e3]/40 underline-offset-2 hover:decoration-[#0071e3] font-medium cursor-pointer transition-colors break-all"
          title={`在侧边浏览区交互打开: ${url}`}
        >
          {url}
        </a>
      )
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      nodes.push(
        <em key={`em_${keySeq++}`} className="italic text-[#3a3a3c]">
          {raw.slice(1, -1)}
        </em>
      )
    } else {
      nodes.push(raw)
    }
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

/**
 * Claude Code CLI Terminal Primary Output Renderer (`ClaudeTerminalOutput`)
 * Uses Apple editorial + Claude Code monospace hybrid typography with generous breathing space,
 * prominent headings, elegant structured tables, lists, and directory tree diagrams.
 */
export const ClaudeTerminalOutput: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null

  const sanitizedContent = maskSensitiveSecrets(content)

  // 1. Split fenced code blocks (supports unclosed trailing fence while streaming)
  const segments: Array<
    { type: 'code'; lang: string; code: string } | { type: 'prose'; text: string }
  > = []

  const lines = sanitizedContent.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  let fenceLang = ''
  let buffer: string[] = []

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*```([\w+-]*)\s*$/)
    if (fenceMatch) {
      if (!inFence) {
        if (buffer.length > 0) {
          segments.push({ type: 'prose', text: buffer.join('\n') })
          buffer = []
        }
        inFence = true
        fenceLang = fenceMatch[1] || ''
      } else {
        segments.push({ type: 'code', lang: fenceLang, code: buffer.join('\n') })
        buffer = []
        inFence = false
        fenceLang = ''
      }
      continue
    }
    buffer.push(line)
  }

  if (buffer.length > 0) {
    if (inFence) {
      segments.push({ type: 'code', lang: fenceLang, code: buffer.join('\n') })
    } else {
      segments.push({ type: 'prose', text: buffer.join('\n') })
    }
  }

  const renderProseLines = (text: string, segIdx: number): React.ReactNode[] => {
    const pLines = text.split('\n')
    const blocks: React.ReactNode[] = []
    let i = 0

    while (i < pLines.length) {
      const line = pLines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        // Preserve intentional empty lines as distinct paragraph / section breathing room
        let blankCount = 0
        while (i < pLines.length && !pLines[i].trim()) {
          blankCount++
          i++
        }
        blocks.push(<div key={`blank_${segIdx}_${i}`} className="h-3" />)
        continue
      }

      // Horizontal Rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        blocks.push(<hr key={`hr_${segIdx}_${i}`} className="my-4 border-t border-black/[0.08]" />)
        i++
        continue
      }

      // Markdown Table (`| a | b |` followed by `| --- | --- |`)
      if (
        trimmed.startsWith('|') &&
        i + 1 < pLines.length &&
        /^\s*\|[\s:-]+\|/.test(pLines[i + 1])
      ) {
        const parseRow = (r: string): string[] =>
          r
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim())
        const headers = parseRow(pLines[i])
        i += 2
        const rows: string[][] = []
        while (i < pLines.length && pLines[i].trim().startsWith('|')) {
          rows.push(parseRow(pLines[i]))
          i++
        }
        blocks.push(
          <div
            key={`tbl_${segIdx}_${i}`}
            className="my-4.5 rounded-2xl border border-black/[0.08] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px] leading-relaxed">
                <thead>
                  <tr className="bg-[#F5F5F7] border-b border-black/[0.07]">
                    {headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-4 py-2.5 font-semibold text-[#1d1d1f] text-[12px] tracking-wide"
                      >
                        {renderInlineTerminalText(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className="bg-white hover:bg-[#FBFBFD] transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-4 py-2.5 text-[#2c2c2e]">
                          {renderInlineTerminalText(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
        continue
      }

      // Headings (`#`, `##`, `###`, `####`)
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const headingText = headingMatch[2]
        const cls =
          level === 1
            ? 'text-[18px] sm:text-[19px] font-bold text-[#111111] mt-6 mb-3 pb-2 border-b border-black/[0.08] tracking-tight'
            : level === 2
              ? 'text-[15.5px] sm:text-[16px] font-bold text-[#111111] mt-5 mb-2.5 flex items-center gap-2 tracking-tight'
              : 'text-[14.5px] font-bold text-[#1d1d1f] mt-4 mb-2'
        blocks.push(
          <div key={`h_${segIdx}_${i}`} className={cls}>
            {level === 2 && <span className="text-[#0071e3] text-[12px] select-none">▍</span>}
            <span>{renderInlineTerminalText(headingText)}</span>
          </div>
        )
        i++
        continue
      }

      // Blockquote (`> ...`)
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = []
        while (i < pLines.length && pLines[i].trim().startsWith('>')) {
          quoteLines.push(pLines[i].trim().replace(/^>\s?/, ''))
          i++
        }
        blocks.push(
          <blockquote
            key={`q_${segIdx}_${i}`}
            className="my-3.5 pl-4 py-2 border-l-3 border-[#D97757] bg-[#F5F5F7]/70 rounded-r-xl text-[#3a3a3c] text-[13.5px] space-y-1 font-sans"
          >
            {quoteLines.map((ql, qIdx) => (
              <div key={qIdx}>{renderInlineTerminalText(ql)}</div>
            ))}
          </blockquote>
        )
        continue
      }

      // ASCII Directory Tree / Box-Drawing Diagram (`├──`, `└──`, `│`) — preserves exact column alignment!
      const isTreeLine = (s: string): boolean => /[├└│┌┐┘┴┬┼]/.test(s)
      const isTreeRootBeforeBranch =
        !isTreeLine(line) &&
        /\/(\s+#.*)?$/.test(trimmed) &&
        i + 1 < pLines.length &&
        isTreeLine(pLines[i + 1])

      if (isTreeLine(line) || isTreeRootBeforeBranch) {
        const treeLines: string[] = [line]
        i++
        while (i < pLines.length && (isTreeLine(pLines[i]) || /^\s+[│├└]/.test(pLines[i]))) {
          treeLines.push(pLines[i])
          i++
        }
        const fullTreeText = treeLines.join('\n')
        const boxData = parseAsciiBoxTable(fullTreeText)
        if (boxData) {
          blocks.push(
            <div
              key={`tree_${segIdx}_${i}`}
              className="claude-terminal-code my-3.5 p-4 rounded-2xl bg-[#F6F6F8] border border-black/[0.08] overflow-x-auto"
            >
              <AsciiBoxTableRenderer rows={boxData} />
            </div>
          )
        } else {
          blocks.push(
            <pre
              key={`tree_${segIdx}_${i}`}
              className="claude-terminal-code my-3.5 p-4 rounded-2xl bg-[#F6F6F8] border border-black/[0.08] overflow-x-auto text-[#1d1d1f] whitespace-pre leading-[1.58] text-[12.5px]"
            >
              {fullTreeText}
            </pre>
          )
        }
        continue
      }

      // Bullet or Numbered List Items
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/)
      if (listMatch) {
        const items: Array<{ indent: number; marker: string; body: string }> = []
        while (i < pLines.length) {
          const m = pLines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/)
          if (!m) break
          items.push({
            indent: Math.min(3, Math.floor(m[1].length / 2)),
            marker: /^\d+\./.test(m[2]) ? m[2] : '•',
            body: m[3]
          })
          i++
        }
        blocks.push(
          <div key={`ul_${segIdx}_${i}`} className="my-2.5 space-y-1.5 text-[14px] leading-[1.72] text-[#2c2c2e] font-sans">
            {items.map((it, idx) => (
              <div
                key={idx}
                style={{ paddingLeft: `${it.indent * 18}px` }}
                className="flex items-start gap-2.5"
              >
                <span className="text-[#86868b] font-mono select-none shrink-0 min-w-[16px] text-[13px] mt-0.5">
                  {it.marker}
                </span>
                <div className="flex-1 min-w-0">{renderInlineTerminalText(it.body)}</div>
              </div>
            ))}
          </div>
        )
        continue
      }

      // Standard Paragraph (collect consecutive plain lines)
      const paraLines: string[] = [line]
      i++
      while (i < pLines.length) {
        const next = pLines[i]
        const nextTrim = next.trim()
        const nextIsTreeStart =
          /[├└│┌┐┘┴┬┼]/.test(next) ||
          (/\/(\s+#.*)?$/.test(nextTrim) &&
            i + 1 < pLines.length &&
            /[├└│┌┐┘┴┬┼]/.test(pLines[i + 1]))
        if (
          !nextTrim ||
          nextIsTreeStart ||
          /^(#{1,4})\s+/.test(nextTrim) ||
          nextTrim.startsWith('>') ||
          nextTrim.startsWith('|') ||
          /^(\s*)([-*+]|\d+\.)\s+/.test(next) ||
          /^(-{3,}|\*{3,}|_{3,})$/.test(nextTrim)
        ) {
          break
        }
        paraLines.push(next)
        i++
      }
      blocks.push(
        <p key={`p_${segIdx}_${i}`} className="my-2.5 text-[14px] leading-[1.78] text-[#2c2c2e] whitespace-pre-wrap font-sans">
          {paraLines.map((pl, pIdx) => (
            <React.Fragment key={pIdx}>
              {pIdx > 0 && '\n'}
              {renderInlineTerminalText(pl)}
            </React.Fragment>
          ))}
        </p>
      )
    }

    return blocks
  }

  return (
    <div className="claude-terminal-output flex-1 min-w-0">
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <TerminalCodeBlock key={`code_${idx}`} language={seg.lang} code={seg.code} />
        ) : (
          <React.Fragment key={`prose_${idx}`}>
            {renderProseLines(seg.text, idx)}
          </React.Fragment>
        )
      )}
    </div>
  )
}

// ============================================================================
// Claude Code v2.1.88 Semantic Tool Summarizer & Folded Activity Group
// (`CollapsedReadSearchGroup` + `BashTool` + `FileWriteTool` + `FileEditTool`)
// ============================================================================

export type ToolStatsCategory =
  | 'search'
  | 'read'
  | 'list'
  | 'bash'
  | 'write'
  | 'update'
  | 'other'

export interface SemanticToolAnalysis {
  title: string
  headerTarget: string
  intentSummary: string
  digestTopic?: string
  outcomeDetail: string
  category: ToolStatsCategory
  fileName?: string
  lineCount?: number
  addedLines?: number
  removedLines?: number
  rawCommand?: string
  writtenContent?: string
}

function getBaseName(p: string): string {
  const clean = p.replace(/\/+$/, '')
  const parts = clean.split('/')
  return parts[parts.length - 1] || p
}

function stripCdPrefix(cmd: string): string {
  return cmd
    .trim()
    .replace(/^cd\s+(?:"[^"]+"|'[^']+'|\S+)\s*(?:&&|;)\s*/i, '')
    .trim()
}

function inferBashHumanIntent(rawCmd: string): string {
  const cmd = stripCdPrefix(rawCmd)
  if (!cmd) return '执行终端环境检查'

  if (/\btsc\b|typecheck/i.test(cmd)) return '运行 TypeScript 类型检查'
  if (/electron-vite\s+build|npm\s+run\s+build|vite\s+build/i.test(cmd)) return '执行项目构建编译验证'
  if (/electron-builder|\bdmg\b|\bpack\b/i.test(cmd)) return '检查或执行桌面应用打包'
  if (/\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b/i.test(cmd)) return '安装或同步项目依赖包'
  if (/\b(vitest|jest|pytest|cargo\s+test|npm\s+test)\b/i.test(cmd)) return '运行自动化测试套件'

  // Detect heredoc or file redirection writes (`cat << 'EOF' > file` / `echo ... >> file`)
  const redirectMatch = cmd.match(/(?:>>|>)\s*(['"]?)([^\s'"|;&<]+)\1/)
  if (redirectMatch && /^(cat|echo|printf|tee)\b/i.test(cmd)) {
    const target = getBaseName(redirectMatch[2])
    return target && !target.startsWith('/dev/')
      ? `生成或写入内容片段至 ${target}`
      : '生成临时内容片段'
  }

  if (/\bgit\s+status\b/i.test(cmd)) return '检查 Git 工作区变更状态'
  if (/\bgit\s+diff\b/i.test(cmd)) return '查看 Git 代码变更差异'
  if (/\bgit\s+log\b/i.test(cmd)) return '查看 Git 提交历史'
  if (/\bgit\s+branch\b|\bgit\s+rev-parse\b/i.test(cmd)) return '检查当前 Git 分支信息'
  if (/\b(sips|iconutil)\b/i.test(cmd)) return '处理图像尺寸或生成应用图标'
  if (/\b(clang|gcc|g\+\+|swiftc|cargo\s+build|go\s+build)\b/i.test(cmd)) return '编译原生二进制模块'
  if (/\b(lsof|pgrep|ps\s+aux)\b/i.test(cmd)) return '检查本地进程与端口状态'
  if (/\b(curl|wget)\b/i.test(cmd)) return '请求接口或拉取远程资源'
  if (/\b(rg|ripgrep|grep)\b/i.test(cmd)) {
    return '检索项目文本与代码匹配项'
  }
  if (/^(cat|head|tail|sed\s+-n)\s+/i.test(cmd) && !cmd.includes('<<')) {
    const tokens = cmd
      .split(/\s+/)
      .slice(1)
      .map((t) => t.replace(/['"]/g, ''))
      .filter(
        (t) =>
          t.length > 0 &&
          !t.startsWith('-') &&
          !t.startsWith('<') &&
          !t.startsWith('>') &&
          !/^\d+(?:,\d+)?[p]?$/.test(t)
      )
    const target = tokens[0] ? getBaseName(tokens[0]) : ''
    return target ? `读取 ${target} 内容片段` : '读取文件片段内容'
  }
  if (/^(ls|tree|du|stat|file)\b/i.test(cmd) || /\bls\s+-[la]/i.test(cmd)) {
    return /\bwc\s+-l\b/i.test(cmd)
      ? '勘探目录结构并统计代码规模'
      : '勘探目录结构与文件信息'
  }
  if (/^find\b|\bfd\b/i.test(cmd)) return '检索目录树文件路径'
  if (/^(wc)\b|\|\s*wc\s+-l/i.test(cmd)) return '统计代码行数与文件规模'
  if (/^(mkdir|cp|mv)\b/i.test(cmd)) return '整理目录与文件位置'
  if (/^rm\b/i.test(cmd)) return '清理临时文件'
  if (/^(node|python3?|sh|zsh|bash)\b/i.test(cmd)) return '运行脚本验证逻辑或处理数据'
  if (/^(which|command\s+-v|uname|sw_vers)\b|--version\b/i.test(cmd)) return '检查系统环境与工具链版本'

  const compact = cmd.replace(/\s+/g, ' ')
  return compact.length > 36 ? `执行命令: ${compact.slice(0, 36)}…` : `执行命令: ${compact}`
}

export function analyzeToolCallSemantics(toolCall: ToolCallItem): SemanticToolAnalysis {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(toolCall.argumentsJson || '{}')
  } catch {
    args = {}
  }

  const explicitDesc = (
    toolCall.description ||
    (typeof args.description === 'string' ? args.description : '')
  ).trim()

  const outLines = toolCall.resultOutput ? toolCall.resultOutput.trim().split('\n') : []

  switch (toolCall.name) {
    case 'run_bash': {
      const rawCommand = String(args.command || toolCall.commandPreview || '').trim()
      const cleanCmd = stripCdPrefix(rawCommand)
      const intentSummary = explicitDesc || inferBashHumanIntent(rawCommand)
      const exitMatch = toolCall.resultOutput?.match(/Exit Code:\s*(-?\d+)/)
      const exitCode = exitMatch ? Number(exitMatch[1]) : 0

      // Count actual stdout lines (excluding our 3-line wrapper header)
      const bodyLines = Math.max(0, outLines.length - 3)
      let outcomeDetail = intentSummary
      if (toolCall.status === 'pending_approval') {
        outcomeDetail = `${intentSummary} · 等待执行确认…`
      } else if (toolCall.status === 'running') {
        outcomeDetail = `正在${intentSummary}…`
      } else if (toolCall.status === 'rejected') {
        outcomeDetail = `${intentSummary} · 用户已跳过`
      } else if (toolCall.status === 'error' || exitCode !== 0) {
        outcomeDetail = `${intentSummary} · 退出码 ${exitCode}`
      } else {
        outcomeDetail =
          bodyLines > 0
            ? `${intentSummary} · 已完成 (${bodyLines} 行输出)`
            : `${intentSummary} · 已完成`
      }

      return {
        title: 'Bash',
        headerTarget: cleanCmd.length > 56 ? `${cleanCmd.slice(0, 56)}…` : cleanCmd,
        intentSummary,
        outcomeDetail,
        category: 'bash',
        lineCount: bodyLines,
        rawCommand
      }
    }

    case 'write_file': {
      const filePath = String(args.file_path || toolCall.diffPreview?.filePath || '')
      const fileName = getBaseName(filePath)
      const writtenContent = String(args.content || toolCall.diffPreview?.newContent || '')
      const lineCountMatch = toolCall.resultOutput?.match(/\((\d+)\s*行\)/)
      const lineCount =
        toolCall.diffPreview?.totalLines ||
        (lineCountMatch ? Number(lineCountMatch[1]) : 0) ||
        (writtenContent ? writtenContent.split('\n').length : 0)

      // Extract first meaningful heading or non-empty line as natural summary
      const firstHeading = writtenContent
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith('---') && !l.startsWith('```'))
        ?.replace(/^#+\s*/, '')
        .slice(0, 34)

      const topicNote = explicitDesc || (firstHeading ? `「${firstHeading}」` : '')
      const intentSummary = topicNote
        ? `写入 ${fileName}（${lineCount} 行 · ${topicNote}）`
        : `写入 ${lineCount} 行至 ${fileName}`

      const outcomeDetail =
        toolCall.status === 'running'
          ? `正在写入 ${fileName}…`
          : toolCall.status === 'pending_approval'
            ? `准备写入 ${lineCount} 行至 ${fileName} · 等待确认…`
            : `已写入 ${lineCount} 行至 ${fileName}${topicNote ? ` — ${topicNote}` : ''}`

      return {
        title: 'Write',
        headerTarget: filePath,
        intentSummary,
        digestTopic: explicitDesc || (firstHeading ? `撰写「${firstHeading}」` : undefined),
        outcomeDetail,
        category: 'write',
        fileName,
        lineCount,
        writtenContent
      }
    }

    case 'edit_file': {
      const filePath = String(args.file_path || toolCall.diffPreview?.filePath || '')
      const fileName = getBaseName(filePath)
      const oldStr = String(args.old_string || toolCall.diffPreview?.oldContent || '')
      const newStr = String(args.new_string || toolCall.diffPreview?.newContent || '')
      const removedLines = oldStr ? oldStr.split('\n').length : 0
      const addedLines = newStr ? newStr.split('\n').length : 0

      const intentSummary = explicitDesc
        ? `更新 ${fileName}（${explicitDesc}）`
        : `更新 ${fileName}（+${addedLines} / -${removedLines} 行）`

      const outcomeDetail =
        toolCall.status === 'running'
          ? `正在更新 ${fileName}…`
          : toolCall.status === 'pending_approval'
            ? `准备更新 ${fileName} (+${addedLines} / -${removedLines} 行) · 等待确认…`
            : `已更新 ${fileName}（+${addedLines} 行 / -${removedLines} 行）${explicitDesc ? ` — ${explicitDesc}` : ''}`

      return {
        title: 'Update',
        headerTarget: filePath,
        intentSummary,
        digestTopic: explicitDesc || undefined,
        outcomeDetail,
        category: 'update',
        fileName,
        addedLines,
        removedLines
      }
    }

    case 'read_file': {
      const filePath = String(args.file_path || '')
      const fileName = getBaseName(filePath) || '.'
      const isDirListing = toolCall.resultOutput?.startsWith('目录 ')
      const lineCount = Math.max(1, outLines.length - 1)

      if (isDirListing) {
        return {
          title: 'ListDir',
          headerTarget: filePath,
          intentSummary: explicitDesc || `浏览目录 ${fileName}`,
          digestTopic: explicitDesc || undefined,
          outcomeDetail: `已列出目录 ${fileName}（${lineCount} 项）`,
          category: 'list',
          fileName,
          lineCount
        }
      }

      return {
        title: 'Read',
        headerTarget: filePath,
        intentSummary: explicitDesc || `读取 ${fileName}`,
        digestTopic: explicitDesc || undefined,
        outcomeDetail: `已读取 ${fileName}（${lineCount} 行）${explicitDesc ? ` — ${explicitDesc}` : ''}`,
        category: 'read',
        fileName,
        lineCount
      }
    }

    case 'search_files': {
      const query = args.query ? String(args.query).trim() : ''
      const pattern = args.file_pattern ? String(args.file_pattern).trim() : ''
      const countMatch = toolCall.resultOutput?.match(/找到\s*(\d+)\s*条/)
      const hitCount = countMatch ? Number(countMatch[1]) : Math.max(0, outLines.length - 1)

      if (!query) {
        return {
          title: 'ListFiles',
          headerTarget: pattern || '.',
          intentSummary: explicitDesc || '扫描工作区文件目录清单',
          outcomeDetail: `已列出工作区文件结构（共 ${hitCount} 个文件）`,
          category: 'list',
          lineCount: hitCount
        }
      }

      return {
        title: 'Search',
        headerTarget: `"${query}"${pattern ? ` in ${pattern}` : ''}`,
        intentSummary: explicitDesc || `搜索代码模式 "${query.slice(0, 22)}"`,
        outcomeDetail: `搜索 "${query}"（命中 ${hitCount} 处）`,
        category: 'search',
        lineCount: hitCount
      }
    }

    case 'install_skill': {
      const name = String(args.name || args.source_url || 'Skill')
      return {
        title: 'MountSkill',
        headerTarget: name,
        intentSummary: `装载技能 ${name}`,
        outcomeDetail: `已装载技能 ${name} 至本地 Skills 中心`,
        category: 'other'
      }
    }

    case 'list_skills':
      return {
        title: 'ListSkills',
        headerTarget: 'workspace skills',
        intentSummary: '查看已装载技能列表',
        outcomeDetail: `已读取当前装载的技能清单`,
        category: 'other'
      }

    case 'install_mcp_server': {
      const name = String(args.name || 'MCP')
      return {
        title: 'MountMCP',
        headerTarget: name,
        intentSummary: `挂载 MCP 服务 ${name}`,
        outcomeDetail: `已挂载 MCP 服务 ${name}`,
        category: 'other'
      }
    }

    case 'call_mcp_tool': {
      const srv = String(args.server_id || '')
      const fn = String(args.tool_name || '')
      return {
        title: 'MCP',
        headerTarget: `${srv} → ${fn}`,
        intentSummary: `调用 MCP 工具 ${fn}`,
        outcomeDetail: `已完成 MCP 调用 ${fn}`,
        category: 'other'
      }
    }

    case 'delegate_to_swarm': {
      const goal = String(args.goal || '').slice(0, 40)
      return {
        title: 'Swarm',
        headerTarget: goal,
        intentSummary: `启动多智能体并行任务`,
        outcomeDetail: `已完成 Swarm 集群调度`,
        category: 'other'
      }
    }

    default:
      return {
        title: toolCall.name,
        headerTarget: toolCall.argumentsJson.slice(0, 48),
        intentSummary: explicitDesc || `调用工具 ${toolCall.name}`,
        outcomeDetail: outLines[0]?.slice(0, 88) || '已完成',
        category: 'other'
      }
  }
}

/**
 * Individual Folded Tool Item (`ClaudeToolTreeItem`)
 * - Collapsed by default (`expanded = false`): Shows ONLY 2 crisp lines (`● Write(file)` / `└ 已写入 101 行...`) — NEVER dumps giant diff/stdout boxes uninvited!
 * - Expanded (`expanded = true`):
 *   - `Write`: Authentic Claude Code CLI line-numbered preview (`1 # Title ...` + `… +N lines` toggle, matching user's reference Image 3!)
 *   - `Update`: Clean unified diff hunks (`+` / `-`)
 *   - `Bash`: `$ <full command>` header + clean stdout/stderr output
 */
export const ClaudeToolTreeItem: React.FC<{ toolCall: ToolCallItem }> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false)
  const [showAllPreviewLines, setShowAllPreviewLines] = useState(false)
  const meta = analyzeToolCallSemantics(toolCall)

  const bulletColor = {
    pending_approval: 'text-[#FF9500]',
    running: 'text-[#D97757]',
    completed: 'text-[#28CD41]',
    rejected: 'text-[#86868b]',
    error: 'text-[#FF3B30]'
  }[toolCall.status]

  const hasExpandableDetail = Boolean(
    meta.writtenContent || toolCall.diffPreview || toolCall.resultOutput || meta.rawCommand
  )

  // Extract clean Bash stdout body (strip `Command: ...\nExit Code: ...\nOutput:\n` prefix)
  const cleanBashOutput = React.useMemo(() => {
    if (toolCall.name !== 'run_bash' || !toolCall.resultOutput) return toolCall.resultOutput || ''
    const idx = toolCall.resultOutput.indexOf('Output:\n')
    const raw = idx >= 0 ? toolCall.resultOutput.slice(idx + 8) : toolCall.resultOutput
    return maskSensitiveSecrets(raw)
  }, [toolCall.name, toolCall.resultOutput])

  const writeLines = React.useMemo(() => {
    if (toolCall.name !== 'write_file' || !meta.writtenContent) return []
    return meta.writtenContent.split('\n')
  }, [toolCall.name, meta.writtenContent])

  return (
    <div className="py-1 font-mono text-[12.5px]">
      <div className="flex items-start gap-2">
        {toolCall.status === 'running' ? (
          <ClaudeAsteriskGlyph active className="mt-0.5 shrink-0" />
        ) : (
          <span className={`w-4 text-center select-none shrink-0 ${bulletColor}`}>●</span>
        )}

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => hasExpandableDetail && setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 text-left max-w-full group"
          >
            <span className="font-semibold text-[#1d1d1f]">{meta.title}</span>
            <span className="text-[#6e6e73] truncate max-w-[500px]">({meta.headerTarget})</span>
            {hasExpandableDetail && (
              <ChevronRight
                className={`w-3.5 h-3.5 text-[#aeaeb2] group-hover:text-[#1d1d1f] shrink-0 transition-transform duration-200 ${
                  expanded ? 'rotate-90' : ''
                }`}
              />
            )}
          </button>

          <div className="mt-0.5 flex items-start gap-2 text-[12px] text-[#6e6e73]">
            <span className="text-[#aeaeb2] select-none shrink-0">└</span>
            <button
              type="button"
              onClick={() => hasExpandableDetail && setExpanded((v) => !v)}
              className="hover:text-[#1d1d1f] text-left transition-colors flex items-center gap-1.5 flex-wrap font-sans"
            >
              <span>{meta.outcomeDetail}</span>
              {hasExpandableDetail && (
                <span className="text-[11px] font-mono text-[#86868b]">
                  {expanded ? '(收起)' : '(查看详情)'}
                </span>
              )}
            </button>
          </div>

          {/* Expanded Detail Drawer (Folded by default!) */}
          {expanded && (
            <div className="animate-apple-view mt-2 ml-3">
              {/* Case A: `Write` -> Claude Code CLI Line-Numbered File Preview (Reference Image 3!) */}
              {toolCall.name === 'write_file' && writeLines.length > 0 ? (
                <div className="rounded-xl border border-black/[0.08] bg-[#F6F6F8] p-3 text-[11.5px] overflow-x-auto">
                  <div className="space-y-0.5">
                    {(showAllPreviewLines ? writeLines : writeLines.slice(0, 10)).map(
                      (ln, idx) => (
                        <div key={idx} className="flex items-start gap-3 whitespace-pre">
                          <span className="w-6 text-right text-[#86868b] select-none shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-[#1d1d1f]">{ln || ' '}</span>
                        </div>
                      )
                    )}
                  </div>
                  {writeLines.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPreviewLines((v) => !v)}
                      className="mt-2 pl-9 text-[11px] text-[#6e6e73] hover:text-[#0071e3] transition-colors"
                    >
                      {showAllPreviewLines
                        ? '收起多余行'
                        : `… +${writeLines.length - 10} lines（点击展开全部）`}
                    </button>
                  )}
                </div>
              ) : toolCall.diffPreview ? (
                /* Case B: `Update` (`edit_file`) -> Clean Folded Diff Hunk */
                <div className="rounded-xl border border-black/[0.08] bg-[#F9F9FB] p-2.5 text-[11.5px] overflow-x-auto max-h-60">
                  <div className="text-[#86868b] mb-1 text-[10.5px]">
                    {toolCall.diffPreview.filePath}
                  </div>
                  {toolCall.diffPreview.unifiedDiff
                    .split('\n')
                    .filter((l) => !l.startsWith('--- ') && !l.startsWith('+++ '))
                    .map((line, idx) => {
                      const cls = line.startsWith('+ ')
                        ? 'bg-[#34C759]/14 text-[#177233]'
                        : line.startsWith('- ')
                          ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                          : 'text-[#6e6e73]'
                      return (
                        <div key={idx} className={`px-2 py-0.5 rounded-sm whitespace-pre ${cls}`}>
                          {line}
                        </div>
                      )
                    })}
                </div>
              ) : toolCall.name === 'run_bash' ? (
                /* Case C: `Bash` -> Command Header + Clean Terminal Output */
                <div className="rounded-xl border border-black/[0.08] bg-[#F5F5F7] overflow-hidden text-[11.5px]">
                  {meta.rawCommand && (
                    <div className="px-3 py-1.5 bg-[#EBEBEF]/80 border-b border-black/[0.06] text-[#1d1d1f] break-all">
                      <span className="text-[#86868b] select-none mr-1.5">$</span>
                      {maskSensitiveSecrets(meta.rawCommand)}
                    </div>
                  )}
                  <pre className="p-3 text-[#3a3a3c] whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                    {cleanBashOutput || '(无标准输出)'}
                  </pre>
                </div>
              ) : toolCall.resultOutput ? (
                /* Case D: `Read` / `Search` / `MCP` / `Skill` Output */
                <div className="rounded-xl border border-black/[0.07] bg-[#F5F5F7] p-3 text-[11.5px] text-[#3a3a3c] whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                  {maskSensitiveSecrets(toolCall.resultOutput)}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export type TurnActivityStep =
  | {
      kind: 'thinking'
      id: string
      reasoningContent: string
      isStreaming: boolean
      durationMs?: number
      interrupted?: boolean
    }
  | {
      kind: 'tool'
      id: string
      toolCall: ToolCallItem
    }
  | {
      kind: 'note'
      id: string
      content: string
    }

function buildCollapsedActivitySummary(steps: TurnActivityStep[]): {
  statsSentence: string
  purposeDigest: string
} {
  let totalThinkingMs = 0
  let thinkingCount = 0
  let searchCount = 0
  let readCount = 0
  let listCount = 0
  let bashCount = 0
  const writtenFiles: Array<{ name: string; lines: number }> = []
  const updatedFiles: Array<{ name: string; added: number; removed: number }> = []
  const readFileNames: string[] = []
  let otherCount = 0

  const digestHints: string[] = []
  const pushHint = (hint?: string): void => {
    const clean = (hint || '').trim()
    if (!clean) return
    if (!digestHints.includes(clean)) {
      digestHints.push(clean)
    }
  }

  for (const step of steps) {
    if (step.kind === 'thinking') {
      thinkingCount++
      totalThinkingMs += step.durationMs || 1200
    } else if (step.kind === 'note') {
      // Intermediate progress narration note: extract punchy topic hint for summary
      const firstLine = step.content.split('\n')[0].replace(/^●\s*/, '').trim()
      if (firstLine) {
        pushHint(firstLine.slice(0, 24))
      }
    } else {
      const m = analyzeToolCallSemantics(step.toolCall)
      switch (m.category) {
        case 'search':
          searchCount++
          if (searchCount <= 2) pushHint(m.intentSummary)
          break
        case 'read':
          readCount++
          if (m.fileName && !readFileNames.includes(m.fileName)) {
            readFileNames.push(m.fileName)
          }
          pushHint(m.digestTopic)
          break
        case 'list':
          listCount++
          pushHint(m.digestTopic)
          break
        case 'bash':
          bashCount++
          pushHint(m.intentSummary)
          break
        case 'write':
          writtenFiles.push({ name: m.fileName || '文件', lines: m.lineCount || 0 })
          pushHint(m.digestTopic)
          break
        case 'update':
          updatedFiles.push({
            name: m.fileName || '文件',
            added: m.addedLines || 0,
            removed: m.removedLines || 0
          })
          pushHint(m.digestTopic)
          break
        default:
          otherCount++
          pushHint(m.intentSummary)
          break
      }
    }
  }

  const clauses: string[] = []
  if (thinkingCount > 0) {
    const sec = totalThinkingMs >= 10000
      ? `${Math.round(totalThinkingMs / 1000)}s`
      : `${(totalThinkingMs / 1000).toFixed(1)}s`
    clauses.push(`已思考 ${sec}`)
  }
  if (searchCount > 0) clauses.push(`搜索 ${searchCount} 处模式`)
  if (readCount > 0) clauses.push(`读取 ${readCount} 个文件`)
  if (listCount > 0) clauses.push(`浏览 ${listCount} 个目录`)
  if (bashCount > 0) clauses.push(`执行 ${bashCount} 条终端命令`)

  if (writtenFiles.length === 1 && updatedFiles.length === 0) {
    const wf = writtenFiles[0]
    clauses.push(`新建写入 ${wf.name}${wf.lines ? ` (${wf.lines} 行)` : ''}`)
  } else if (writtenFiles.length > 0 || updatedFiles.length > 0) {
    const touchedNames = Array.from(
      new Set([...writtenFiles.map((f) => f.name), ...updatedFiles.map((f) => f.name)])
    )
    const namePreview =
      touchedNames.length <= 2
        ? touchedNames.join(', ')
        : `${touchedNames.slice(0, 2).join(', ')} 等 ${touchedNames.length} 个文件`
    if (writtenFiles.length > 0 && updatedFiles.length > 0) {
      clauses.push(`写入并更新 ${namePreview}`)
    } else if (writtenFiles.length > 1) {
      clauses.push(`写入 ${namePreview}`)
    } else {
      const totalAdd = updatedFiles.reduce((acc, f) => acc + f.added, 0)
      const totalRem = updatedFiles.reduce((acc, f) => acc + f.removed, 0)
      clauses.push(`更新 ${namePreview} (+${totalAdd}/-${totalRem} 行)`)
    }
  }

  if (otherCount > 0) {
    clauses.push(`调用 ${otherCount} 项扩展工具`)
  }

  const statsSentence = clauses.join('，') || '已完成步骤执行'

  // Build concise human-readable purpose summary ("让用户一看就知道在干什么")
  let purposeDigest = ''
  if (digestHints.length > 0) {
    purposeDigest = digestHints.slice(0, 2).join('；')
  } else if (readFileNames.length > 0 && writtenFiles.length === 0 && updatedFiles.length === 0) {
    purposeDigest = `检查 ${readFileNames.slice(0, 2).join(', ')}${readFileNames.length > 2 ? ' 等' : ''}`
  }

  return { statsSentence, purposeDigest }
}

/**
 * Claude Code Turn-Level Folded Activity Group (`ClaudeTurnActivityGroup`)
 * Modeled after Claude Code v2.1.88 `CollapsedReadSearchGroup` / `GroupedToolUse` (Reference Image 2):
 * - Automatically folds all completed intermediate `Thinking` + `Bash` + `Write` + `Update` + `Read` + `Search` steps
 *   into a single quiet, descriptive summary line (`已思考 29s，搜索 5 处模式，读取 3 个文件，执行 6 条命令（…） ›`).
 * - While a step is actively streaming/running, renders that active step live right below the folded summary!
 */
export const ClaudeTurnActivityGroup: React.FC<{
  steps: TurnActivityStep[]
  onInterrupt?: () => void
  defaultExpanded?: boolean
}> = ({ steps, onInterrupt, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (!steps || steps.length === 0) return null

  const isStepActive = (s: TurnActivityStep): boolean =>
    s.kind === 'thinking'
      ? Boolean(s.isStreaming && !s.interrupted)
      : s.kind === 'note'
        ? false
        : s.toolCall.status === 'running' || s.toolCall.status === 'pending_approval'

  const completedSteps = steps.filter((s) => !isStepActive(s))
  const activeSteps = steps.filter(isStepActive)

  // Special case: only 1 pure completed thinking step & 0 tools -> delegates cleanly to quiet collapsed thinking row
  if (
    completedSteps.length === 1 &&
    completedSteps[0].kind === 'thinking' &&
    activeSteps.length === 0
  ) {
    const th = completedSteps[0]
    return (
      <ClaudeThinkingBlock
        key={th.id}
        reasoningContent={th.reasoningContent}
        isStreaming={false}
        durationMs={th.durationMs}
        interrupted={th.interrupted}
      />
    )
  }

  const { statsSentence, purposeDigest } = buildCollapsedActivitySummary(completedSteps)

  return (
    <div className="space-y-1">
      {completedSteps.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="group inline-flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-lg hover:bg-black/[0.04] text-[12.5px] text-[#7c7c80] hover:text-[#1d1d1f] transition-colors text-left flex-wrap select-none"
          >
            <span className="font-mono">{statsSentence}</span>
            {purposeDigest && (
              <span className="text-[#8e8e93] group-hover:text-[#3a3a3c] font-sans text-[12px]">
                （{purposeDigest}）
              </span>
            )}
            <ChevronRight
              className={`w-3.5 h-3.5 text-[#aeaeb2] group-hover:text-[#1d1d1f] shrink-0 transition-transform duration-200 ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {expanded && (
            <div className="animate-apple-view mt-1 ml-2 pl-3.5 border-l border-black/[0.09] space-y-1">
              {completedSteps.map((step) =>
                step.kind === 'thinking' ? (
                  <ClaudeThinkingBlock
                    key={step.id}
                    reasoningContent={step.reasoningContent}
                    isStreaming={false}
                    durationMs={step.durationMs}
                    interrupted={step.interrupted}
                  />
                ) : step.kind === 'note' ? (
                  <div
                    key={step.id}
                    className="flex items-start gap-2 py-1 text-[13px] text-[#48484a] leading-relaxed font-sans"
                  >
                    <span className="w-3 text-center font-mono text-[10.5px] text-[#86868b] select-none mt-1 shrink-0">
                      ●
                    </span>
                    <span className="flex-1 whitespace-pre-wrap">{step.content}</span>
                  </div>
                ) : (
                  <ClaudeToolTreeItem key={step.id} toolCall={step.toolCall} />
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Live Active Thinking / Running Tool Step (Preserves exact live Claude Code animation!) */}
      {activeSteps.map((step) =>
        step.kind === 'thinking' ? (
          <ClaudeThinkingBlock
            key={step.id}
            reasoningContent={step.reasoningContent}
            isStreaming={true}
            durationMs={step.durationMs}
            interrupted={step.interrupted}
            onInterrupt={onInterrupt}
          />
        ) : step.kind === 'tool' ? (
          <ClaudeToolTreeItem key={step.id} toolCall={step.toolCall} />
        ) : null
      )}
    </div>
  )
}
