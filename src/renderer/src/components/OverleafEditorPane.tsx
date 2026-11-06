import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback
} from 'react'
import {
  FileText,
  X,
  Undo2,
  Redo2,
  Bold,
  Italic,
  MoreHorizontal,
  Pencil,
  ChevronDown,
  Search,
  Stethoscope,
  Heading1,
  Heading2,
  Code,
  Quote,
  Table,
  List,
  Sparkles,
  Eraser,
  RotateCcw,
  Plus
} from 'lucide-react'
import { isMarkdownTableDivider } from '../utils/wechatFormatter'
import { DocEditorTab } from '../store/useAppStore'

export interface HealthIssueItem {
  type: 'warning' | 'info' | 'error'
  message: string
}

interface OverleafEditorPaneProps {
  tabs: DocEditorTab[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onAddTab: () => void
  onCloseTab: (tabId: string) => void
  onReorderTabs: (fromIndex: number, toIndex: number) => void
  rawText: string
  onChangeText: (next: string) => void
  healthIssues: HealthIssueItem[]
  onResetTemplate: () => void
}

interface SafariTabDragState {
  dragIdx: number
  targetIdx: number
  deltaX: number
  slotPitch: number
  settling: boolean
}

type EditorSubMode = 'code' | 'visual'

interface SyntaxToken {
  text: string
  color?: string
  bg?: string
}

/**
 * Tokenizes a single Markdown line into Overleaf-palette colored spans.
 * Invariant: `tokens.map(t => t.text).join('') === line` ALWAYS holds,
 * and no token alters font-weight/font-size/padding, guaranteeing 0px caret drift.
 */
function tokenizeMarkdownLine(
  line: string,
  inCodeFence: boolean,
  searchQuery: string
): SyntaxToken[] {
  if (!line) return []

  const baseTokens: SyntaxToken[] = []

  if (inCodeFence || line.trim().startsWith('```')) {
    baseTokens.push({
      text: line,
      color: line.trim().startsWith('```') ? '#1D4ED8' : '#0F766E'
    })
  } else if (/^\s*#{1,4}\s+/.test(line)) {
    const match = line.match(/^(\s*#{1,4}\s+)(.*)$/)
    if (match) {
      baseTokens.push({ text: match[1], color: '#1D4ED8' })
      baseTokens.push({ text: match[2], color: '#1E40AF' })
    } else {
      baseTokens.push({ text: line, color: '#1D4ED8' })
    }
  } else if (isMarkdownTableDivider(line)) {
    baseTokens.push({ text: line, color: '#2563EB' })
  } else if (line.trim().startsWith('|') || (line.includes('|') && /^\s*\|/.test(line))) {
    // Highlight table pipes like Overleaf `&` alignment tabs
    const parts = line.split(/(\|)/g)
    for (const part of parts) {
      if (!part) continue
      if (part === '|') {
        baseTokens.push({ text: '|', color: '#2563EB' })
      } else {
        baseTokens.push(...tokenizeInlineSpan(part))
      }
    }
  } else {
    // Check leading list / blockquote marker
    const prefixMatch = line.match(/^(\s*(?:[-*+]|\d+\.|>)\s+)(.*)$/)
    if (prefixMatch) {
      baseTokens.push({ text: prefixMatch[1], color: '#7C3AED' })
      baseTokens.push(...tokenizeInlineSpan(prefixMatch[2]))
    } else {
      baseTokens.push(...tokenizeInlineSpan(line))
    }
  }

  if (!searchQuery) return baseTokens

  // Apply search highlight overlay without altering character count
  const lowerQuery = searchQuery.toLowerCase()
  const highlighted: SyntaxToken[] = []
  for (const tok of baseTokens) {
    if (!tok.text) continue
    const lowerText = tok.text.toLowerCase()
    let cursor = 0
    let idx = lowerText.indexOf(lowerQuery, cursor)
    if (idx === -1) {
      highlighted.push(tok)
      continue
    }
    while (idx !== -1) {
      if (idx > cursor) {
        highlighted.push({
          text: tok.text.slice(cursor, idx),
          color: tok.color,
          bg: tok.bg
        })
      }
      highlighted.push({
        text: tok.text.slice(idx, idx + searchQuery.length),
        color: '#111827',
        bg: '#FEF08A'
      })
      cursor = idx + searchQuery.length
      idx = lowerText.indexOf(lowerQuery, cursor)
    }
    if (cursor < tok.text.length) {
      highlighted.push({
        text: tok.text.slice(cursor),
        color: tok.color,
        bg: tok.bg
      })
    }
  }
  return highlighted
}

function tokenizeInlineSpan(text: string): SyntaxToken[] {
  if (!text) return []
  const tokens: SyntaxToken[] = []
  // Match `code`, **bold**, *italic*, or [label](url)
  const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|(?<!\*)\*[^*]+\*(?!\*))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), color: '#1F2328' })
    }
    const seg = match[0]
    if (seg.startsWith('`')) {
      tokens.push({ text: seg, color: '#0F766E', bg: 'rgba(15, 118, 110, 0.07)' })
    } else if (seg.startsWith('**')) {
      tokens.push({ text: '**', color: '#2563EB' })
      tokens.push({
        text: seg.slice(2, -2),
        color: '#1D4ED8',
        bg: 'rgba(37, 99, 235, 0.05)'
      })
      tokens.push({ text: '**', color: '#2563EB' })
    } else if (seg.startsWith('[')) {
      const closeBracket = seg.indexOf('](')
      if (closeBracket !== -1) {
        tokens.push({ text: seg.slice(0, closeBracket + 1), color: '#0F766E' })
        tokens.push({ text: seg.slice(closeBracket + 1), color: '#2563EB' })
      } else {
        tokens.push({ text: seg, color: '#0F766E' })
      }
    } else {
      tokens.push({ text: seg, color: '#7C3AED' })
    }
    lastIndex = match.index + seg.length
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), color: '#1F2328' })
  }

  return tokens
}

interface VisualBlock {
  id: string
  type: 'heading' | 'table' | 'list-item' | 'quote' | 'code' | 'paragraph' | 'empty'
  startLine: number
  endLine: number
  level?: number
  listMarker?: string
  rawContent: string
  tableRows?: string[][]
}

function parseVisualBlocks(rawText: string): VisualBlock[] {
  const lines = rawText.split('\n')
  const blocks: VisualBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      blocks.push({
        id: `empty-${i}`,
        type: 'empty',
        startLine: i,
        endLine: i,
        rawContent: ''
      })
      i++
      continue
    }

    if (trimmed.startsWith('```')) {
      const start = i
      const codeLines: string[] = [line]
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({
        id: `code-${start}`,
        type: 'code',
        startLine: start,
        endLine: i - 1,
        rawContent: codeLines.join('\n')
      })
      continue
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (hMatch) {
      blocks.push({
        id: `h-${i}`,
        type: 'heading',
        startLine: i,
        endLine: i,
        level: hMatch[1].length,
        rawContent: hMatch[2]
      })
      i++
      continue
    }

    if (
      (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
      (trimmed.includes('|') && i + 1 < lines.length && isMarkdownTableDivider(lines[i + 1]))
    ) {
      const start = i
      const rows: string[][] = []
      while (i < lines.length) {
        const tl = lines[i].trim()
        if (!tl || !tl.includes('|')) break
        if (!isMarkdownTableDivider(tl)) {
          const cells = tl
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim())
          rows.push(cells)
        }
        i++
      }
      if (rows.length > 0) {
        const maxCols = Math.max(...rows.map((r) => r.length))
        const normalized = rows.map((r) => {
          const c = [...r]
          while (c.length < maxCols) c.push('')
          return c
        })
        blocks.push({
          id: `table-${start}`,
          type: 'table',
          startLine: start,
          endLine: i - 1,
          rawContent: lines.slice(start, i).join('\n'),
          tableRows: normalized
        })
        continue
      }
    }

    const listMatch = line.match(/^(\s*(?:[-*+]|\d+\.))\s+(.*)$/)
    if (listMatch) {
      blocks.push({
        id: `list-${i}`,
        type: 'list-item',
        startLine: i,
        endLine: i,
        listMarker: listMatch[1],
        rawContent: listMatch[2]
      })
      i++
      continue
    }

    if (trimmed.startsWith('>')) {
      blocks.push({
        id: `quote-${i}`,
        type: 'quote',
        startLine: i,
        endLine: i,
        rawContent: trimmed.replace(/^>\s*/, '')
      })
      i++
      continue
    }

    blocks.push({
      id: `p-${i}`,
      type: 'paragraph',
      startLine: i,
      endLine: i,
      rawContent: line
    })
    i++
  }

  return blocks
}

export const OverleafEditorPane: React.FC<OverleafEditorPaneProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onReorderTabs,
  rawText,
  onChangeText,
  healthIssues,
  onResetTemplate
}) => {
  const [editorMode, setEditorMode] = useState<EditorSubMode>('code')
  const [cursorLine, setCursorLine] = useState(1)
  const [cursorCol, setCursorCol] = useState(1)
  const [lineHeights, setLineHeights] = useState<number[]>([])

  // Per-tab Undo / Redo history
  const tabHistoriesRef = useRef<Record<string, { stack: string[]; idx: number }>>({})
  const [history, setHistory] = useState<string[]>([rawText])
  const [historyIdx, setHistoryIdx] = useState(0)
  const lastPushTimeRef = useRef<number>(0)
  const prevTabIdRef = useRef<string>(activeTabId)

  // Safari Tab Strip Compression & Drag-Reorder Physics State
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [stripWidth, setStripWidth] = useState<number>(520)
  const [dragState, setDragState] = useState<SafariTabDragState | null>(null)
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null)
  const settleTimerRef = useRef<number | null>(null)

  // Popovers & Search bar
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [editingMenuOpen, setEditingMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [showHealthDrawer, setShowHealthDrawer] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const editingMenuRef = useRef<HTMLDivElement>(null)

  // Measure Safari Tab Strip available width for responsive compression thresholds
  useEffect(() => {
    const el = tabStripRef.current
    if (!el) return
    const updateWidth = (): void => {
      setStripWidth(el.clientWidth || 520)
    }
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current)
      }
    }
  }, [])

  // Swap per-tab undo/redo stacks cleanly when switching tabs
  useEffect(() => {
    if (prevTabIdRef.current !== activeTabId) {
      tabHistoriesRef.current[prevTabIdRef.current] = { stack: history, idx: historyIdx }
      prevTabIdRef.current = activeTabId
      const saved = tabHistoriesRef.current[activeTabId]
      if (saved && saved.stack.length > 0) {
        setHistory(saved.stack)
        setHistoryIdx(saved.idx)
      } else {
        setHistory([rawText])
        setHistoryIdx(0)
      }
      setCursorLine(1)
      setCursorCol(1)
    }
  }, [activeTabId, rawText, history, historyIdx])

  // Keep history synced when external updates occur (e.g., AI naturalization wording mode toggled)
  useEffect(() => {
    if (prevTabIdRef.current === activeTabId && history[historyIdx] !== rawText) {
      setHistory((prev) => {
        const nextStack = [...prev.slice(0, historyIdx + 1), rawText].slice(-80)
        setHistoryIdx(nextStack.length - 1)
        return nextStack
      })
    }
  }, [rawText, activeTabId])

  // Close dropdown menus when clicking outside
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
      if (editingMenuRef.current && !editingMenuRef.current.contains(e.target as Node)) {
        setEditingMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onDocMouseDown)
    return () => window.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const commitTextChange = useCallback(
    (next: string, immediateHistory = false): void => {
      onChangeText(next)
      const now = Date.now()
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1)
        if (!immediateHistory && now - lastPushTimeRef.current < 450 && sliced.length > 1) {
          const updated = [...sliced]
          updated[updated.length - 1] = next
          return updated
        }
        lastPushTimeRef.current = now
        const nextStack = [...sliced, next].slice(-80)
        setHistoryIdx(nextStack.length - 1)
        return nextStack
      })
    },
    [onChangeText, historyIdx]
  )

  const handleUndo = useCallback((): void => {
    if (historyIdx > 0) {
      const nextIdx = historyIdx - 1
      setHistoryIdx(nextIdx)
      onChangeText(history[nextIdx])
    }
  }, [historyIdx, history, onChangeText])

  const handleRedo = useCallback((): void => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1
      setHistoryIdx(nextIdx)
      onChangeText(history[nextIdx])
    }
  }, [historyIdx, history, onChangeText])

  const lines = useMemo(() => rawText.split('\n'), [rawText])

  // Precompute syntax tokens per line with code-fence state tracking
  const tokenizedLines = useMemo(() => {
    let inFence = false
    return lines.map((line) => {
      const trimmed = line.trim()
      const currentInFence = inFence
      if (trimmed.startsWith('```')) {
        inFence = !inFence
      }
      return tokenizeMarkdownLine(line, currentInFence, searchOpen ? searchQuery : '')
    })
  }, [lines, searchOpen, searchQuery])

  // Measure exact wrapped height of each logical line in the backdrop for Overleaf line-wrap gutter alignment
  const measureLineHeights = useCallback((): void => {
    const container = backdropRef.current
    if (!container) return
    const children = container.children
    const heights: number[] = new Array(children.length)
    for (let i = 0; i < children.length; i++) {
      heights[i] = (children[i] as HTMLElement).offsetHeight || 23
    }
    setLineHeights((prev) => {
      if (prev.length === heights.length && prev.every((v, idx) => v === heights[idx])) {
        return prev
      }
      return heights
    })
  }, [])

  useLayoutEffect(() => {
    if (editorMode !== 'code') return
    measureLineHeights()
  }, [rawText, editorMode, measureLineHeights])

  useEffect(() => {
    if (editorMode !== 'code' || !backdropRef.current) return
    const ro = new ResizeObserver(() => {
      measureLineHeights()
    })
    ro.observe(backdropRef.current)
    return () => ro.disconnect()
  }, [editorMode, measureLineHeights])

  const updateCursorStats = (): void => {
    const el = textareaRef.current
    if (!el) return
    const pos = el.selectionStart || 0
    const before = rawText.slice(0, pos)
    const splitBefore = before.split('\n')
    setCursorLine(splitBefore.length)
    setCursorCol(splitBefore[splitBefore.length - 1].length + 1)
  }

  // Wrap selection or insert snippet in Code/Visual mode
  const wrapSelection = (prefix: string, suffix: string, placeholder: string): void => {
    const el = textareaRef.current
    if (!el || editorMode !== 'code') {
      const next = `${rawText}${rawText.endsWith('\n') || !rawText ? '' : '\n'}${prefix}${placeholder}${suffix}`
      commitTextChange(next, true)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = rawText.slice(start, end) || placeholder
    const next = rawText.slice(0, start) + prefix + selected + suffix + rawText.slice(end)
    commitTextChange(next, true)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
      updateCursorStats()
    })
  }

  const insertBlockSnippet = (snippet: string): void => {
    setMoreMenuOpen(false)
    const el = textareaRef.current
    if (!el || editorMode !== 'code') {
      const sep = !rawText || rawText.endsWith('\n\n') ? '' : rawText.endsWith('\n') ? '\n' : '\n\n'
      commitTextChange(rawText + sep + snippet, true)
      return
    }
    const start = el.selectionStart
    const before = rawText.slice(0, start)
    const after = rawText.slice(el.selectionEnd)
    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n')
    const insertStr = `${needsLeadingNewline ? '\n' : ''}${snippet}\n`
    const next = before + insertStr + after
    commitTextChange(next, true)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = before.length + insertStr.length
      el.setSelectionRange(cursor, cursor)
      updateCursorStats()
    })
  }

  // Download .md file (Overleaf `Download file` action)
  const handleDownloadFile = (): void => {
    const activeTab = tabs.find((t) => t.id === activeTabId)
    const h1Match = rawText.match(/^#\s+(.+)$/m)
    const fallbackTitle = activeTab?.title || '排版文稿'
    const safeTitle = h1Match
      ? h1Match[1].trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
      : fallbackTitle.replace(/[\\/:*?"<>|]/g, '_')
    const blob = new Blob([rawText], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeTitle}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Quick Typesetting Utilities inside `Editing ▾`
  const handleAutoSpaceCjkLatin = (): void => {
    setEditingMenuOpen(false)
    const spaced = rawText
      .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    commitTextChange(spaced, true)
  }

  const handleCleanBlankLines = (): void => {
    setEditingMenuOpen(false)
    const cleaned = rawText
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    commitTextChange(cleaned, true)
  }

  // Search match counter & Replace actions
  const searchMatchCount = useMemo(() => {
    if (!searchOpen || !searchQuery) return 0
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return (rawText.match(new RegExp(escaped, 'gi')) || []).length
  }, [rawText, searchOpen, searchQuery])

  const handleReplaceNext = (): void => {
    if (!searchQuery) return
    const idx = rawText.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return
    const next =
      rawText.slice(0, idx) + replaceQuery + rawText.slice(idx + searchQuery.length)
    commitTextChange(next, true)
  }

  const handleReplaceAll = (): void => {
    if (!searchQuery) return
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const next = rawText.replace(new RegExp(escaped, 'gi'), replaceQuery)
    commitTextChange(next, true)
  }

  // Visual mode block updates
  const visualBlocks = useMemo(
    () => (editorMode === 'visual' ? parseVisualBlocks(rawText) : []),
    [rawText, editorMode]
  )

  const updateVisualBlockLines = (startLine: number, endLine: number, replacementLines: string[]): void => {
    const copy = [...lines]
    copy.splice(startLine, endLine - startLine + 1, ...replacementLines)
    commitTextChange(copy.join('\n'), false)
  }

  const serializeMarkdownTable = (rows: string[][]): string[] => {
    if (rows.length === 0) return []
    const cols = rows[0].length
    const header = `| ${rows[0].join(' | ')} |`
    const divider = `| ${new Array(cols).fill(':---').join(' | ')} |`
    const body = rows.slice(1).map((r) => `| ${r.join(' | ')} |`)
    return [header, divider, ...body]
  }

  // Safari Tab Compression Metrics
  const estimatedTabWidth = useMemo(() => {
    const count = Math.max(1, tabs.length)
    const available = Math.max(120, stripWidth - 32)
    return Math.min(148, available / count)
  }, [stripWidth, tabs.length])

  const isCompactTabs = estimatedTabWidth < 96
  const isUltraCompactTabs = estimatedTabWidth < 68

  // Authentic macOS Safari 120fps Hardware-Accelerated Tab Drag-Reorder Handler
  const handleTabPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, tabIdx: number, tabId: string): void => {
      if (e.button !== 0) return
      const targetEl = e.target as HTMLElement
      if (targetEl.closest('[data-tab-close="true"]')) return

      // Cancel any in-flight drop settle immediately before starting a fresh interaction
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }

      onSelectTab(tabId)

      if (tabs.length <= 1 || !tabStripRef.current) return

      const tabNodes = Array.from(
        tabStripRef.current.querySelectorAll<HTMLElement>('[data-safari-tab="true"]')
      )
      if (tabNodes.length <= 1 || !tabNodes[tabIdx]) return

      const rects = tabNodes.map((n) => n.getBoundingClientRect())
      const firstRect = rects[0]
      const lastRect = rects[rects.length - 1]
      const dragRect = rects[tabIdx]
      const slotPitch =
        rects.length > 1
          ? Math.max(28, (lastRect.left - firstRect.left) / (rects.length - 1))
          : dragRect.width
      const slotCenters = rects.map((r) => r.left + r.width / 2)
      const dragStartCenter = slotCenters[tabIdx]

      const startX = e.clientX
      const minDx = firstRect.left - dragRect.left
      const maxDx = lastRect.right - dragRect.right

      let dragActivated = false
      let currentTargetIdx = tabIdx

      const onPointerMove = (moveEv: PointerEvent): void => {
        const rawDx = moveEv.clientX - startX
        if (!dragActivated) {
          if (Math.abs(rawDx) < 4) return
          dragActivated = true
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'
        }

        // Apple rubber-band resistance at the left & right boundaries of the tab strip
        let clampedDx = rawDx
        if (rawDx < minDx) {
          clampedDx = minDx + (rawDx - minDx) * 0.2
        } else if (rawDx > maxDx) {
          clampedDx = maxDx + (rawDx - maxDx) * 0.2
        }

        // 54% hysteresis deadband prevents boundary flutter when hovering at slot midpoints
        const virtualCenter = dragStartCenter + clampedDx
        while (
          currentTargetIdx < rects.length - 1 &&
          virtualCenter > slotCenters[currentTargetIdx] + slotPitch * 0.54
        ) {
          currentTargetIdx++
        }
        while (
          currentTargetIdx > 0 &&
          virtualCenter < slotCenters[currentTargetIdx] - slotPitch * 0.54
        ) {
          currentTargetIdx--
        }

        setDragState({
          dragIdx: tabIdx,
          targetIdx: currentTargetIdx,
          deltaX: clampedDx,
          slotPitch,
          settling: false
        })
      }

      const finishPointer = (): void => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', finishPointer)
        window.removeEventListener('pointercancel', finishPointer)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        if (!dragActivated) {
          setDragState(null)
          return
        }

        const finalFrom = tabIdx
        const finalTo = currentTargetIdx

        // Glide smoothly into target slot with Apple spring physics before committing DOM order
        setDragState((prev) => (prev ? { ...prev, settling: true } : null))
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null
          if (finalFrom !== finalTo) {
            onReorderTabs(finalFrom, finalTo)
          }
          setDragState(null)
        }, 190)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', finishPointer)
      window.addEventListener('pointercancel', finishPointer)
    },
    [tabs.length, onSelectTab, onReorderTabs]
  )

  const activeVisualIdx = useMemo(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    return idx === -1 ? 0 : idx
  }, [tabs, activeTabId])

  return (
    <div className="h-full w-full flex flex-col bg-white border-r border-[#D8DEE4] overflow-hidden select-text">
      {/* 1. Safari-Style Compressing & Spring-Draggable Multi-Tab Bar */}
      <div className="h-[38px] bg-[#E8ECEF] border-b border-[#D0D7DE] pl-2 pr-2.5 flex items-end justify-between gap-2 shrink-0 select-none">
        {/* Left: Safari Flex-Compressing Tab Strip + New Tab `+` Button */}
        <div
          ref={tabStripRef}
          role="tablist"
          aria-label="排版文稿标签栏"
          className="flex-1 min-w-0 h-full flex items-end overflow-hidden pt-[5px]"
        >
          <div className="flex items-end min-w-0 max-w-full flex-1 overflow-hidden">
            {tabs.map((tab, idx) => {
              const isActive = tab.id === activeTabId
              const isDraggingThis = dragState?.dragIdx === idx
              const isHovered = hoveredTabId === tab.id

              // Compute GPU translate3d offset for dragged tab & spring-parting sibling tabs
              let translateX = 0
              if (dragState) {
                if (isDraggingThis) {
                  translateX = dragState.settling
                    ? (dragState.targetIdx - dragState.dragIdx) * dragState.slotPitch
                    : dragState.deltaX
                } else if (
                  dragState.dragIdx < dragState.targetIdx &&
                  idx > dragState.dragIdx &&
                  idx <= dragState.targetIdx
                ) {
                  translateX = -dragState.slotPitch
                } else if (
                  dragState.dragIdx > dragState.targetIdx &&
                  idx >= dragState.targetIdx &&
                  idx < dragState.dragIdx
                ) {
                  translateX = dragState.slotPitch
                }
              }

              // Hide Safari hairline divider adjacent to active/hovered tab or during drag
              const hideRightDivider =
                Boolean(dragState) ||
                isActive ||
                idx === activeVisualIdx - 1 ||
                idx === tabs.length - 1 ||
                isHovered ||
                hoveredTabId === tabs[idx + 1]?.id

              return (
                <div
                  key={tab.id}
                  data-safari-tab="true"
                  role="tab"
                  aria-selected={isActive}
                  title={`${tab.title}（按住左右拖动可丝滑排序）`}
                  onPointerDown={(e) => handleTabPointerDown(e, idx, tab.id)}
                  onMouseEnter={() => setHoveredTabId(tab.id)}
                  onMouseLeave={() =>
                    setHoveredTabId((prev) => (prev === tab.id ? null : prev))
                  }
                  style={{
                    flex: '0 1 146px',
                    minWidth: '38px',
                    transform: dragState
                      ? `translate3d(${translateX}px, 0, 0)${
                          isDraggingThis && !dragState.settling ? ' scale(1.015)' : ''
                        }`
                      : undefined,
                    transition: dragState
                      ? isDraggingThis
                        ? dragState.settling
                          ? 'transform 190ms cubic-bezier(0.2, 0.9, 0.25, 1), box-shadow 190ms ease'
                          : 'box-shadow 160ms ease'
                        : 'transform 260ms cubic-bezier(0.2, 0.9, 0.25, 1)'
                      : 'background-color 150ms ease, color 150ms ease',
                    zIndex: isDraggingThis ? 30 : isActive ? 15 : 1,
                    willChange: dragState ? 'transform' : undefined
                  }}
                  className={`group relative h-[32px] flex items-center cursor-pointer ${
                    isActive
                      ? 'bg-white border-t border-l border-r border-[#C9D1D9] rounded-t-[8px] -mb-[1px] text-[#1d1d1f]'
                      : 'text-[#57606A] hover:text-[#1F2328] hover:bg-white/55 rounded-t-[7px] mb-[1px]'
                  } ${
                    isDraggingThis && !dragState?.settling
                      ? 'shadow-[0_8px_20px_-4px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.08)] rounded-t-[8px]'
                      : isActive
                        ? 'shadow-[0_-1px_3px_rgba(0,0,0,0.03)]'
                        : ''
                  } ${isUltraCompactTabs ? 'px-1.5' : 'px-2.5'}`}
                >
                  {/* Tab Icon (auto-hides like Safari favicon when many tabs compress width) */}
                  {!isCompactTabs && (
                    <FileText
                      className={`w-3.5 h-3.5 mr-1.5 shrink-0 transition-colors ${
                        isActive ? 'text-[#0071e3]' : 'text-[#8C959F]'
                      }`}
                    />
                  )}

                  {/* Concise <= 7-Char Smart Title */}
                  <span
                    className={`flex-1 min-w-0 truncate text-[12px] tracking-tight ${
                      isActive ? 'font-semibold text-[#1d1d1f]' : 'font-medium'
                    }`}
                  >
                    {tab.title}
                  </span>

                  {/* Safari Close `×` Button (overlays cleanly on compressed tabs on hover) */}
                  <button
                    type="button"
                    data-tab-close="true"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseTab(tab.id)
                    }}
                    title={tabs.length > 1 ? `关闭「${tab.title}」标签页` : '清空并重置当前标签页'}
                    className={`shrink-0 p-0.5 rounded-[5px] transition-all ${
                      isUltraCompactTabs
                        ? isActive || isHovered
                          ? 'ml-0.5 opacity-100 bg-white/90 hover:bg-[#E5E7EB] text-[#57606A] hover:text-[#1F2328]'
                          : 'w-0 p-0 overflow-hidden opacity-0 pointer-events-none'
                        : isActive
                          ? 'ml-1 opacity-100 hover:bg-[#EAEEF2] text-[#8C959F] hover:text-[#24292F]'
                          : 'ml-1 opacity-0 group-hover:opacity-100 hover:bg-black/[0.08] text-[#8C959F] hover:text-[#24292F]'
                    }`}
                  >
                    <X className="w-3 h-3" />
                  </button>

                  {/* Safari Subtle Hairline Tab Separator */}
                  <span
                    aria-hidden="true"
                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-[1px] h-3.5 bg-[#C2CAD2] transition-opacity duration-150 pointer-events-none ${
                      hideRightDivider ? 'opacity-0' : 'opacity-80'
                    }`}
                  />
                </div>
              )
            })}

            {/* Safari Trailing `+` New Tab Button */}
            <button
              type="button"
              onClick={onAddTab}
              title="新建空白排版标签页"
              className="shrink-0 ml-1 mb-[4px] w-[24px] h-[24px] rounded-[6px] hover:bg-black/[0.07] active:scale-95 flex items-center justify-center text-[#57606A] hover:text-[#1F2328] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Compact Typesetting Health & Cursor Metrics */}
        <div className="shrink-0 pb-1.5 flex items-center gap-2 text-[11px] font-mono text-[#656D76]">
          {healthIssues.length > 0 && (
            <button
              onClick={() => setShowHealthDrawer((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0071e3]/10 text-[#0071e3] font-sans font-medium hover:bg-[#0071e3]/15 transition-colors whitespace-nowrap"
              title="查看排版体检建议"
            >
              <Stethoscope className="w-3 h-3" />
              <span>体检 {healthIssues.length}</span>
            </button>
          )}
          <span className="hidden xl:inline whitespace-nowrap">
            Ln {cursorLine}, Col {cursorCol}
          </span>
          <span className="hidden xl:inline text-[#D0D7DE]">|</span>
          <span className="whitespace-nowrap">{rawText.length} 字</span>
        </div>
      </div>

      {/* 2. Overleaf Formatting & Code/Visual Switch Toolbar (参考图1.png) */}
      <div className="h-[44px] bg-white border-b border-[#D8DEE4] px-2.5 flex items-center justify-between gap-1.5 shrink-0 select-none">
        {/* Left: Undo / Redo + B / I / More */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleUndo}
            disabled={historyIdx <= 0}
            title="撤销 (⌘Z)"
            className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#24292F] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIdx >= history.length - 1}
            title="重做 (⇧⌘Z)"
            className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#24292F] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-[#D8DEE4] mx-1" />

          <button
            onClick={() => wrapSelection('**', '**', '加粗文本')}
            title="加粗 (**文本**)"
            className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#1F2328] transition-colors"
          >
            <Bold className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
          <button
            onClick={() => wrapSelection('*', '*', '斜体文本')}
            title="斜体 (*文本*)"
            className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#1F2328] transition-colors"
          >
            <Italic className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>

          {/* More Markdown Quick-Insert Menu */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen((v) => !v)}
              title="插入标题、表格、代码与列表"
              className={`p-1.5 rounded transition-colors ${
                moreMenuOpen ? 'bg-[#E5E7EB] text-[#111827]' : 'hover:bg-[#F3F4F6] text-[#424A53]'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {moreMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-44 rounded-xl bg-white border border-[#D0D7DE] shadow-lg py-1.5 z-40 text-[12px] text-[#24292F]">
                <button
                  onClick={() => insertBlockSnippet('# 一级主标题')}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <Heading1 className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>一级标题 (#)</span>
                </button>
                <button
                  onClick={() => insertBlockSnippet('## 二级章节标题')}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <Heading2 className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>二级标题 (##)</span>
                </button>
                <button
                  onClick={() => wrapSelection('`', '`', 'code')}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <Code className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>行内代码 (`code`)</span>
                </button>
                <button
                  onClick={() => insertBlockSnippet('> 核心结论或引用说明')}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <Quote className="w-3.5 h-3.5 text-[#7C3AED]" />
                  <span>引用段落 (&gt;)</span>
                </button>
                <button
                  onClick={() => insertBlockSnippet('- 列表要点一\n- 列表要点二')}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <List className="w-3.5 h-3.5 text-[#7C3AED]" />
                  <span>无序列表 (-)</span>
                </button>
                <div className="my-1 border-t border-[#EAEEF2]" />
                <button
                  onClick={() =>
                    insertBlockSnippet(
                      '| 维度 | 方案指标 | 当前进展 |\n| :--- | :--- | :--- |\n| 响应性能 | 首屏 < 300ms | 已达标 |\n| 排版引擎 | 微信防错乱调度 | 已上线 |'
                    )
                  }
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left font-medium text-[#1D4ED8]"
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>插入标准表格</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center: Overleaf `Download file` Pill + Green `Code | Visual` Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadFile}
            title="下载当前 Markdown 源文件 (.md)"
            className="px-3 py-[3px] rounded-full border border-[#495365] text-[#24292F] hover:bg-[#F3F4F6] active:scale-[0.98] text-[12px] font-semibold tracking-tight transition-all whitespace-nowrap"
          >
            Download file
          </button>

          <div className="flex items-center p-[2px] rounded-full bg-[#E3E7ED]">
            <button
              onClick={() => setEditorMode('code')}
              className={`px-2.5 py-[2.5px] rounded-full text-[12px] transition-all ${
                editorMode === 'code'
                  ? 'bg-[#138A36] text-white font-semibold shadow-sm'
                  : 'text-[#424A53] hover:text-[#1F2328] font-medium'
              }`}
            >
              Code
            </button>
            <button
              onClick={() => setEditorMode('visual')}
              className={`px-2.5 py-[2.5px] rounded-full text-[12px] transition-all ${
                editorMode === 'visual'
                  ? 'bg-[#138A36] text-white font-semibold shadow-sm'
                  : 'text-[#424A53] hover:text-[#1F2328] font-medium'
              }`}
            >
              Visual
            </button>
          </div>
        </div>

        {/* Right: Overleaf `Editing ▾` + Search Button */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={editingMenuRef}>
            <button
              onClick={() => setEditingMenuOpen((v) => !v)}
              className="px-2 py-1 rounded-[6px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#24292F] text-[12px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Pencil className="w-3 h-3 text-[#424A53]" />
              <span>Editing</span>
              <ChevronDown className="w-3 h-3 text-[#656D76]" />
            </button>

            {editingMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white border border-[#D0D7DE] shadow-lg py-1.5 z-40 text-[12px] text-[#24292F]">
                <div className="px-3 py-1 text-[10.5px] font-semibold text-[#8C959F] uppercase tracking-wider">
                  快捷排版整理
                </div>
                <button
                  onClick={handleAutoSpaceCjkLatin}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#138A36]" />
                  <span>规范中英文与数字间距</span>
                </button>
                <button
                  onClick={handleCleanBlankLines}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left"
                >
                  <Eraser className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>清理多余连续空行</span>
                </button>
                <div className="my-1 border-t border-[#EAEEF2]" />
                <button
                  onClick={() => {
                    setEditingMenuOpen(false)
                    onResetTemplate()
                  }}
                  className="w-full px-3 py-1.5 hover:bg-[#F3F4F6] flex items-center gap-2 text-left text-[#57606A]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>恢复示例架构报告</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setSearchOpen((v) => !v)}
            title="查找与替换"
            className={`p-1.5 rounded transition-colors ${
              searchOpen
                ? 'bg-[#138A36]/12 text-[#138A36]'
                : 'hover:bg-[#F3F4F6] text-[#424A53]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Optional Find & Replace Strip */}
      {searchOpen && (
        <div className="px-3 py-2 bg-[#F6F8FA] border-b border-[#D8DEE4] flex flex-wrap items-center gap-2 text-[12px] shrink-0">
          <div className="flex items-center gap-1.5 bg-white border border-[#D0D7DE] rounded-md px-2 py-1 flex-1 min-w-[140px]">
            <Search className="w-3.5 h-3.5 text-[#8C959F] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="查找内容..."
              className="w-full bg-transparent text-[12px] focus:outline-none"
            />
            {searchQuery && (
              <span className="text-[10.5px] font-mono text-[#656D76] shrink-0">
                {searchMatchCount} 处
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-[#D0D7DE] rounded-md px-2 py-1 flex-1 min-w-[130px]">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="替换为..."
              className="w-full bg-transparent text-[12px] focus:outline-none"
            />
          </div>

          <button
            onClick={handleReplaceNext}
            disabled={!searchQuery || searchMatchCount === 0}
            className="px-2 py-1 rounded bg-white border border-[#D0D7DE] hover:bg-[#F3F4F6] text-[11.5px] font-medium disabled:opacity-40"
          >
            替换
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={!searchQuery || searchMatchCount === 0}
            className="px-2 py-1 rounded bg-white border border-[#D0D7DE] hover:bg-[#F3F4F6] text-[11.5px] font-medium disabled:opacity-40"
          >
            全部替换
          </button>
          <button
            onClick={() => setSearchOpen(false)}
            className="p-1 rounded hover:bg-[#E5E7EB] text-[#656D76]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Main Overleaf Editor Body: Code Mode vs Visual Mode */}
      {editorMode === 'code' ? (
        <div
          className="flex-1 overflow-y-auto flex items-stretch bg-white cursor-text"
          onClick={(e) => {
            if (e.target === e.currentTarget && textareaRef.current) {
              textareaRef.current.focus()
            }
          }}
        >
          {/* Left Line-Number Gutter (Wrap-Height Synchronized like Overleaf 参考图1.png) */}
          <div
            aria-hidden="true"
            className="w-[46px] shrink-0 bg-[#F4F5F8] border-r border-[#E6E9EF] pt-3.5 pb-16 select-none"
          >
            {lines.map((_, idx) => {
              const lineNum = idx + 1
              const isActive = lineNum === cursorLine
              const rowHeight = lineHeights[idx] || 23
              return (
                <div
                  key={idx}
                  style={{ height: `${rowHeight}px` }}
                  className={`pr-2.5 text-right font-mono text-[12px] leading-[23px] transition-colors ${
                    isActive
                      ? 'bg-[#E5ECF6] text-[#1F2328] font-medium'
                      : 'text-[#6E7781]'
                  }`}
                >
                  {lineNum}
                </div>
              )
            })}
          </div>

          {/* Right Syntax-Highlighted Overlay Stack */}
          <div className="flex-1 relative min-w-0">
            {/* Syntax-Highlighted Backdrop (Drives exact wrapped line heights) */}
            <div
              ref={backdropRef}
              aria-hidden="true"
              className="pt-3.5 pb-16 px-4 overleaf-code-metrics pointer-events-none select-none min-h-full"
            >
              {tokenizedLines.map((tokens, idx) => {
                const isActive = idx + 1 === cursorLine
                return (
                  <div
                    key={idx}
                    className={`min-h-[23px] -mx-4 px-4 ${
                      isActive ? 'bg-[#F0F5FC]' : ''
                    }`}
                  >
                    {tokens.length === 0 ? (
                      <br />
                    ) : (
                      tokens.map((tok, tIdx) => (
                        <span
                          key={tIdx}
                          style={{
                            color: tok.color || '#1F2328',
                            backgroundColor: tok.bg || 'transparent'
                          }}
                        >
                          {tok.text}
                        </span>
                      ))
                    )}
                  </div>
                )
              })}
            </div>

            {/* Transparent Caret-Aligned Textarea */}
            <textarea
              ref={textareaRef}
              value={rawText}
              spellCheck={false}
              onChange={(e) => {
                commitTextChange(e.target.value, false)
                requestAnimationFrame(updateCursorStats)
              }}
              onClick={updateCursorStats}
              onKeyUp={updateCursorStats}
              onSelect={updateCursorStats}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                  e.preventDefault()
                  if (e.shiftKey) {
                    handleRedo()
                  } else {
                    handleUndo()
                  }
                  return
                }
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const el = e.currentTarget
                  const start = el.selectionStart
                  const end = el.selectionEnd
                  const next = rawText.slice(0, start) + '  ' + rawText.slice(end)
                  commitTextChange(next, false)
                  requestAnimationFrame(() => {
                    el.setSelectionRange(start + 2, start + 2)
                    updateCursorStats()
                  })
                }
              }}
              placeholder="在此粘贴 AI 生成的文本或表格，体验实时排版..."
              className="overleaf-textarea overleaf-code-metrics absolute inset-0 w-full h-full pt-3.5 pb-16 px-4 bg-transparent text-transparent caret-[#1F2328] resize-none overflow-hidden focus:outline-none placeholder-[#8C959F]/60"
            />
          </div>
        </div>
      ) : (
        /* Overleaf Visual Mode: Structured Interactive Block & Table Editor */
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-white space-y-2.5">
          {visualBlocks.map((block) => {
            if (block.type === 'empty') {
              return <div key={block.id} className="h-1.5" />
            }

            if (block.type === 'heading') {
              const lvl = block.level || 1
              const sizeClass =
                lvl === 1
                  ? 'text-[21px] font-bold text-[#1F2328] border-b border-[#EAEEF2] pb-1.5 pt-1'
                  : lvl === 2
                    ? 'text-[17px] font-semibold text-[#1F2328] pt-2'
                    : 'text-[14.5px] font-semibold text-[#24292F] pt-1'
              return (
                <div key={block.id} className="group flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] select-none shrink-0">
                    H{lvl}
                  </span>
                  <input
                    type="text"
                    value={block.rawContent}
                    onChange={(e) =>
                      updateVisualBlockLines(block.startLine, block.endLine, [
                        `${'#'.repeat(lvl)} ${e.target.value}`
                      ])
                    }
                    className={`w-full bg-transparent focus:outline-none focus:bg-[#F8FAFC] rounded px-1.5 ${sizeClass}`}
                  />
                </div>
              )
            }

            if (block.type === 'table' && block.tableRows) {
              const rows = block.tableRows
              return (
                <div
                  key={block.id}
                  className="my-3 rounded-xl border border-[#D0D7DE] overflow-hidden bg-white shadow-sm"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[12.5px]">
                      <tbody>
                        {rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={
                              rIdx === 0
                                ? 'bg-[#F6F8FA] font-semibold text-[#1F2328]'
                                : 'border-t border-[#EAEEF2]'
                            }
                          >
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="border-r last:border-r-0 border-[#EAEEF2] p-0"
                              >
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => {
                                    const nextRows = rows.map((r, ri) =>
                                      ri === rIdx
                                        ? r.map((c, ci) => (ci === cIdx ? e.target.value : c))
                                        : r
                                    )
                                    updateVisualBlockLines(
                                      block.startLine,
                                      block.endLine,
                                      serializeMarkdownTable(nextRows)
                                    )
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-transparent focus:outline-none focus:bg-[#EFF6FF]/60"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-1.5 bg-[#F6F8FA] border-t border-[#EAEEF2] flex items-center justify-between text-[11px] text-[#57606A]">
                    <span>可视化表格编辑（修改自动同步 Markdown 源码）</span>
                    <button
                      onClick={() => {
                        const cols = rows[0]?.length || 3
                        const nextRows = [...rows, new Array(cols).fill('新单元格')]
                        updateVisualBlockLines(
                          block.startLine,
                          block.endLine,
                          serializeMarkdownTable(nextRows)
                        )
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[#D0D7DE] hover:bg-[#F3F4F6] text-[#1F2328] font-medium"
                    >
                      <Plus className="w-3 h-3" />
                      <span>添加行</span>
                    </button>
                  </div>
                </div>
              )
            }

            if (block.type === 'list-item') {
              return (
                <div key={block.id} className="flex items-start gap-2 pl-1">
                  <span className="mt-1.5 text-[12px] font-mono text-[#7C3AED] select-none shrink-0">
                    {block.listMarker}
                  </span>
                  <input
                    type="text"
                    value={block.rawContent}
                    onChange={(e) =>
                      updateVisualBlockLines(block.startLine, block.endLine, [
                        `${block.listMarker} ${e.target.value}`
                      ])
                    }
                    className="w-full py-1 px-1.5 text-[13.5px] text-[#1F2328] bg-transparent rounded focus:outline-none focus:bg-[#F8FAFC]"
                  />
                </div>
              )
            }

            if (block.type === 'quote') {
              return (
                <div
                  key={block.id}
                  className="border-l-[3px] border-[#2563EB] pl-3 py-1 bg-[#F8FAFC] rounded-r-lg"
                >
                  <input
                    type="text"
                    value={block.rawContent}
                    onChange={(e) =>
                      updateVisualBlockLines(block.startLine, block.endLine, [
                        `> ${e.target.value}`
                      ])
                    }
                    className="w-full text-[13px] text-[#424A53] bg-transparent focus:outline-none"
                  />
                </div>
              )
            }

            if (block.type === 'code') {
              return (
                <textarea
                  key={block.id}
                  value={block.rawContent}
                  rows={Math.max(2, block.rawContent.split('\n').length)}
                  onChange={(e) =>
                    updateVisualBlockLines(
                      block.startLine,
                      block.endLine,
                      e.target.value.split('\n')
                    )
                  }
                  className="w-full p-3 rounded-lg bg-[#F6F8FA] border border-[#D0D7DE] font-mono text-[12.5px] text-[#0F766E] focus:outline-none focus:border-[#138A36]"
                />
              )
            }

            return (
              <textarea
                key={block.id}
                value={block.rawContent}
                rows={Math.max(1, Math.ceil(block.rawContent.length / 42))}
                onChange={(e) =>
                  updateVisualBlockLines(
                    block.startLine,
                    block.endLine,
                    e.target.value.split('\n')
                  )
                }
                className="w-full py-1 px-1.5 text-[13.5px] leading-relaxed text-[#1F2328] bg-transparent rounded resize-none focus:outline-none focus:bg-[#F8FAFC]"
              />
            )
          })}
        </div>
      )}

      {/* Collapsible Typesetting Health Check Strip */}
      {showHealthDrawer && healthIssues.length > 0 && (
        <div className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#D8DEE4] text-[11.5px] space-y-1 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-[#1F2328]">
              <Stethoscope className="w-3.5 h-3.5 text-[#0071e3]" />
              <span>排版体检诊断 ({healthIssues.length})</span>
            </div>
            <button
              onClick={() => setShowHealthDrawer(false)}
              className="text-[#656D76] hover:text-[#1F2328]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {healthIssues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[#57606A]">
              <span className="text-[#0071e3]">•</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
