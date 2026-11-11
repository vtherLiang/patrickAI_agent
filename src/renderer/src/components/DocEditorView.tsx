import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  FileText,
  Copy,
  Check,
  Send,
  Sparkles,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageCircle,
  MoreHorizontal,
  Smile,
  PlusCircle,
  Volume2,
  ArrowLeftRight,
  Download,
  BookOpen,
  FileType2,
  Table
} from 'lucide-react'
import { DocExportFormat, DocPresetType, NaturalizeLevel } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { OverleafEditorPane } from './OverleafEditorPane'
import {
  scheduleWeChatDocument,
  isMarkdownTableDivider,
  TableScheduleMode,
  WeChatTableStyle,
  WECHAT_TABLE_STYLES,
  WeChatTableStyleMeta
} from '../utils/wechatFormatter'
import {
  DEFAULT_DOC_TEMPLATE,
  naturalizeMarkdownDocument
} from '../utils/docNaturalizer'
import { isLikelyInlineMathDollar, latexToHtml } from '../utils/latexMathUtils'

interface HealthCheckIssue {
  type: 'warning' | 'info' | 'error'
  message: string
}

const DOC_STYLES: {
  id: 'clean' | 'formal' | 'compact'
  label: string
  badge: string
  desc: string
}[] = [
  {
    id: 'clean',
    label: '清爽文档',
    badge: '现代清爽',
    desc: '飞书 / Notion 现代无衬线版式，段落呼吸感佳'
  },
  {
    id: 'formal',
    label: '正式公文',
    badge: '行政规范',
    desc: '严谨宋体衬线规范，适合立项报告与行政文书'
  },
  {
    id: 'compact',
    label: '紧凑备忘',
    badge: '高密度',
    desc: '高信息密度紧凑版式，适合快速工作简报与要点'
  }
]

const NATURALIZE_OPTIONS: {
  id: NaturalizeLevel
  label: string
  shortBadge: string
  desc: string
}[] = [
  {
    id: 'faithful',
    label: '用词: 100% 原文保真',
    shortBadge: '100% 原文保真',
    desc: '完全保留原始字句与表达，不做措辞改写'
  },
  {
    id: 'balanced',
    label: '用词: 均衡弱化 AI 腔',
    shortBadge: '均衡弱化 AI 腔',
    desc: '剔除过渡套话与生硬翻译腔，转为自然流畅的人类表达'
  },
  {
    id: 'deep',
    label: '用词: 深度精简公文风',
    shortBadge: '深度精简公文风',
    desc: '压缩冗余修饰与口语词，提炼为严谨干练的正式公文措辞'
  }
]

const DOWNLOAD_FORMATS: {
  format: DocExportFormat
  label: string
  extBadge: string
  desc: string
}[] = [
  {
    format: 'doc',
    label: 'Word 文档 (.doc)',
    extBadge: 'DOC',
    desc: '传统 Microsoft Word 97-2004 兼容格式'
  },
  {
    format: 'docx',
    label: 'Word 文档 (.docx)',
    extBadge: 'DOCX',
    desc: '现代 Office OpenXML 标准可编辑文档'
  },
  {
    format: 'pdf',
    label: 'PDF 文档 (.pdf)',
    extBadge: 'PDF',
    desc: 'A4 矢量印刷级版式，跨设备零跑版'
  }
]

const TABLE_MODE_LABELS: Record<TableScheduleMode, string> = {
  'card-matrix': '树状卡片矩阵',
  grid: '微缩对齐网格',
  'kv-pair': '键值对齐条目'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const DocEditorView: React.FC = () => {
  const {
    docTabs,
    activeDocTabId,
    addDocTab,
    closeDocTab,
    setActiveDocTab,
    updateDocTabContent,
    setDocTabNaturalizeLevel,
    reorderDocTabs,
    savePdfToKnowledgeBase
  } = useAppStore()

  const activeTab = useMemo(
    () => docTabs.find((t) => t.id === activeDocTabId) || docTabs[0],
    [docTabs, activeDocTabId]
  )

  const rawText = activeTab?.content ?? DEFAULT_DOC_TEMPLATE
  const baselineText = activeTab?.originalContent ?? rawText
  const naturalizeLevel: NaturalizeLevel = activeTab?.naturalizeLevel || 'faithful'

  const [docPreset, setDocPreset] = useState<DocPresetType>('clean')
  const [docSubPreset, setDocSubPreset] = useState<'clean' | 'formal' | 'compact'>('clean')
  const [docStyleMenuOpen, setDocStyleMenuOpen] = useState(false)
  const docStyleMenuRef = useRef<HTMLDivElement>(null)
  const [copiedPrimary, setCopiedPrimary] = useState(false)
  const [wechatPerspective, setWechatPerspective] = useState<'sender' | 'receiver'>('sender')

  // WeChat Table Layout Style: card (default) | list | rail | grid
  const [wechatTableStyle, setWechatTableStyle] = useState<WeChatTableStyle>(() => {
    try {
      const saved = localStorage.getItem('claude_studio_wechat_table_style')
      if (saved === 'card' || saved === 'list' || saved === 'rail' || saved === 'grid') {
        return saved
      }
    } catch {
      // ignore
    }
    return 'card'
  })
  const [tableStyleMenuOpen, setTableStyleMenuOpen] = useState(false)
  const tableStyleMenuRef = useRef<HTMLDivElement>(null)

  const handleSetWechatTableStyle = (style: WeChatTableStyle): void => {
    setWechatTableStyle(style)
    try {
      localStorage.setItem('claude_studio_wechat_table_style', style)
    } catch {
      // ignore
    }
  }

  // Popover states for Naturalize Wording & Multi-Format Download
  const [naturalizeMenuOpen, setNaturalizeMenuOpen] = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<DocExportFormat | null>(null)
  const [downloadedDone, setDownloadedDone] = useState<DocExportFormat | null>(null)

  // Knowledge Base PDF Archive CTA state
  const [savingToKb, setSavingToKb] = useState(false)
  const [savedToKbDone, setSavedToKbDone] = useState(false)

  // Overleaf resizable left pane state
  const [leftWidthPct, setLeftWidthPct] = useState<number>(48)
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef<boolean>(false)
  const naturalizeMenuRef = useRef<HTMLDivElement>(null)
  const downloadMenuRef = useRef<HTMLDivElement>(null)

  // Feishu modal state
  const [showFeishuModal, setShowFeishuModal] = useState(false)
  const [feishuWebhookUrl, setFeishuWebhookUrl] = useState('')
  const [feishuSending, setFeishuSending] = useState(false)
  const [feishuSuccess, setFeishuSuccess] = useState(false)

  // Close toolbar dropdowns on outside click
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      if (naturalizeMenuRef.current && !naturalizeMenuRef.current.contains(e.target as Node)) {
        setNaturalizeMenuOpen(false)
      }
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false)
      }
      if (tableStyleMenuRef.current && !tableStyleMenuRef.current.contains(e.target as Node)) {
        setTableStyleMenuOpen(false)
      }
      if (docStyleMenuRef.current && !docStyleMenuRef.current.contains(e.target as Node)) {
        setDocStyleMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onDocMouseDown)
    return () => window.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  // Overleaf Splitter Drag Resize Handler
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDraggingRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      if (rect.width <= 0) return
      const relX = moveEvent.clientX - rect.left
      const pct = Math.min(68, Math.max(28, (relX / rect.width) * 100))
      setLeftCollapsed(false)
      setLeftWidthPct(pct)
    }

    const onMouseUp = (): void => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  // Live Naturalization Diff Metrics relative to tab's 100% faithful baseline
  const naturalizeStats = useMemo(
    () => naturalizeMarkdownDocument(baselineText, naturalizeLevel),
    [baselineText, naturalizeLevel]
  )

  // Active text driving Preview, Copy, Download (.doc / .docx / .pdf), Feishu & Knowledge Base
  const processedText = rawText

  // WeChat Adaptive Typesetting & Table Layout Scheduler Output
  const wechatScheduled = useMemo(
    () => scheduleWeChatDocument(processedText, { tableStyle: wechatTableStyle }),
    [processedText, wechatTableStyle]
  )

  // Convert Markdown to clean rich HTML for Word, DOCX, PDF & Feishu
  const previewHtml = useMemo(() => {
    const lines = processedText.split('\n')
    const htmlChunks: string[] = []
    let inList = false
    let listType: 'ul' | 'ol' = 'ul'
    let inTable = false
    let tableRows: string[][] = []

    const flushList = (): void => {
      if (inList) {
        htmlChunks.push(`</${listType}>`)
        inList = false
      }
    }

    const flushTable = (): void => {
      if (inTable && tableRows.length > 0) {
        htmlChunks.push('<div class="feishu-table-wrapper"><table class="feishu-table">')
        tableRows.forEach((row, rIdx) => {
          htmlChunks.push('<tr>')
          row.forEach((cell) => {
            const tag = rIdx === 0 ? 'th' : 'td'
            htmlChunks.push(`<${tag}>${formatInline(cell)}</${tag}>`)
          })
          htmlChunks.push('</tr>')
        })
        htmlChunks.push('</table></div>')
        inTable = false
        tableRows = []
      }
    }

    const formatInline = (t: string): string => {
      // Protect LaTeX math spans before HTML escaping so `<`, `>`, `&` inside formulas render cleanly
      const mathHtmlSlots: string[] = []
      const withMathSlots = t.replace(
        /`[^`]+`|\\\[[^\n]+?\\\]|\$\$[^\n]+?\$\$|\\\(.+?\\\)|\$(?!\s)[^$\n]+?(?<!\s)\$/g,
        (m) => {
          if (m.startsWith('`')) return m
          let inner = ''
          if (m.startsWith('\\(') && m.endsWith('\\)')) {
            inner = m.slice(2, -2)
          } else if (m.startsWith('\\[') && m.endsWith('\\]')) {
            inner = m.slice(2, -2)
          } else if (m.startsWith('$$') && m.endsWith('$$')) {
            inner = m.slice(2, -2)
          } else if (m.startsWith('$') && m.endsWith('$')) {
            const candidate = m.slice(1, -1)
            if (!isLikelyInlineMathDollar(candidate)) return m
            inner = candidate
          } else {
            return m
          }
          const idx = mathHtmlSlots.length
          mathHtmlSlots.push(latexToHtml(inner, false))
          return `\uE002MATH_${idx}\uE003`
        }
      )

      return escapeHtml(withMathSlots)
        .replace(/`([^`]+)`/g, '<code class="doc-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\uE002MATH_(\d+)\uE003/g, (_m, idxStr) => mathHtmlSlots[Number(idxStr)] || '')
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        flushList()
        flushTable()
        continue
      }

      // Fenced Code Block
      if (trimmed.startsWith('```')) {
        flushList()
        flushTable()
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(escapeHtml(lines[i]))
          i++
        }
        htmlChunks.push(
          `<pre class="doc-pre"><code>${codeLines.join('\n')}</code></pre>`
        )
        continue
      }

      // Display Math Block (`\[ ... \]` or `$$ ... $$`)
      if (trimmed.startsWith('\\[') || trimmed.startsWith('$$')) {
        flushList()
        flushTable()
        const closeDelim = trimmed.startsWith('\\[') ? '\\]' : '$$'
        const sameLineClose = trimmed.indexOf(closeDelim, 2)
        if (sameLineClose !== -1) {
          htmlChunks.push(latexToHtml(trimmed.slice(2, sameLineClose), true))
          const trailing = trimmed.slice(sameLineClose + closeDelim.length).trim()
          if (trailing) htmlChunks.push(`<p class="doc-p">${formatInline(trailing)}</p>`)
          continue
        }
        const mathLines: string[] = []
        const firstRest = trimmed.slice(2).trim()
        if (firstRest) mathLines.push(firstRest)
        let j = i + 1
        let foundClose = false
        let trailing = ''
        while (j < lines.length) {
          const cand = lines[j].trim()
          const closeIdx = cand.indexOf(closeDelim)
          if (closeIdx !== -1) {
            const before = cand.slice(0, closeIdx).trim()
            if (before) mathLines.push(before)
            trailing = cand.slice(closeIdx + closeDelim.length).trim()
            foundClose = true
            break
          }
          mathLines.push(lines[j])
          j++
          if (mathLines.length > 40) break
        }
        if (foundClose) {
          htmlChunks.push(latexToHtml(mathLines.join('\n'), true))
          if (trailing) htmlChunks.push(`<p class="doc-p">${formatInline(trailing)}</p>`)
          i = j
          continue
        }
      }

      // Horizontal Rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushList()
        flushTable()
        htmlChunks.push('<hr class="my-4 border-black/[0.08]" />')
        continue
      }

      // Headings
      const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
      if (hMatch) {
        flushList()
        flushTable()
        const lvl = hMatch[1].length
        htmlChunks.push(`<h${lvl} class="doc-h${lvl}">${formatInline(hMatch[2])}</h${lvl}>`)
        continue
      }

      // Table line (filtering GFM alignment divider rows like `| :--- | :--- |`)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        flushList()
        if (isMarkdownTableDivider(trimmed)) {
          continue
        }
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim())
        tableRows.push(cells)
        inTable = true
        continue
      } else {
        flushTable()
      }

      // Unordered list
      const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/)
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          flushList()
          htmlChunks.push('<ul class="doc-ul">')
          inList = true
          listType = 'ul'
        }
        htmlChunks.push(`<li>${formatInline(ulMatch[1])}</li>`)
        continue
      }

      // Ordered list
      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/)
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          flushList()
          htmlChunks.push('<ol class="doc-ol">')
          inList = true
          listType = 'ol'
        }
        htmlChunks.push(`<li>${formatInline(olMatch[1])}</li>`)
        continue
      }

      flushList()

      // Blockquote
      if (trimmed.startsWith('>')) {
        const quoteContent = trimmed.replace(/^>\s*/, '')
        htmlChunks.push(
          `<blockquote class="doc-blockquote">${formatInline(quoteContent)}</blockquote>`
        )
        continue
      }

      // Standard Paragraph
      htmlChunks.push(`<p class="doc-p">${formatInline(trimmed)}</p>`)
    }

    flushList()
    flushTable()

    return htmlChunks.join('\n')
  }, [processedText])

  // Resolve clean document title from H1 heading or active tab's <=7-char smart title
  const resolvedDocTitle = useMemo(() => {
    const h1Match = processedText.match(/^#\s+(.+)$/m)
    if (h1Match && h1Match[1].trim()) {
      return h1Match[1].replace(/[`*_~]/g, '').trim().slice(0, 56)
    }
    return activeTab?.title || 'AI 排版文档'
  }, [processedText, activeTab?.title])

  // Typesetting Health Check (排版体检)
  const healthIssues: HealthCheckIssue[] = useMemo(() => {
    const issues: HealthCheckIssue[] = []
    const lines = rawText.split('\n')

    const longPara = lines.find((l) => l.trim().length > 260)
    if (longPara) {
      issues.push({
        type: 'warning',
        message: '检测到较长连续段落（>260 字），建议按句拆分为短段落以利于飞书和移动端阅读。'
      })
    }

    const fenceCount = (rawText.match(/```/g) || []).length
    if (fenceCount % 2 !== 0) {
      issues.push({
        type: 'error',
        message: '检测到未闭合的 Markdown 代码块围栏 (```)，可能导致文档样式错乱。'
      })
    }

    const hasH1 = /^#\s+/m.test(rawText)
    if (!hasH1) {
      issues.push({
        type: 'info',
        message: '文档尚未设置主标题 (# 一级标题)，添加后导出或归档时将优先作为文档正式标题。'
      })
    }

    return issues
  }, [rawText])

  // Select AI Wording Naturalization Level (100% 原文保真 / 均衡弱化 AI 腔 / 深度精简公文风)
  const handleSelectNaturalizeLevel = (level: NaturalizeLevel): void => {
    setNaturalizeMenuOpen(false)
    if (!activeTab) return
    setDocTabNaturalizeLevel(activeTab.id, level)
  }

  // Export & Download as Word (.doc), DOCX (.docx), or PDF (.pdf)
  const handleDownloadFormat = async (format: DocExportFormat): Promise<void> => {
    setDownloadMenuOpen(false)
    if (exportingFormat) return
    setExportingFormat(format)
    try {
      const exportMarkdown =
        docPreset === 'wechat' ? wechatScheduled.formattedText : processedText
      const exportHtml =
        docPreset === 'wechat'
          ? `<pre class="wechat-plain">${escapeHtml(wechatScheduled.formattedText)}</pre>`
          : previewHtml

      // Fallback if running in an Electron window opened before preload was updated
      if (typeof window.claudeDesktop?.exportDocument !== 'function') {
        if (format === 'doc') {
          const wordDocHtml = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(resolvedDocTitle)}</title></head><body>${exportHtml}</body></html>`
          const blob = new Blob(['\ufeff', wordDocHtml], { type: 'application/msword' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${resolvedDocTitle}.doc`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          setDownloadedDone(format)
          setTimeout(() => setDownloadedDone(null), 2400)
          return
        }
        throw new Error('新增的原生 DOCX / PDF 导出引擎需重启一次终端里的 npm run dev 后生效')
      }

      const res = await window.claudeDesktop.exportDocument({
        title: resolvedDocTitle,
        markdown: exportMarkdown,
        htmlBody: exportHtml,
        preset: docPreset,
        format
      })

      if (res.canceled) return

      // Browser fallback download when running in standalone web mode
      if (res.ok && res.dataBase64 && !res.filePath) {
        const binary = atob(res.dataBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const blob = new Blob([bytes], {
          type: res.mimeType || 'application/octet-stream'
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.fileName || `${resolvedDocTitle}.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      if (res.ok) {
        setDownloadedDone(format)
        setTimeout(() => setDownloadedDone(null), 2400)
      } else if (res.error) {
        alert(`导出文档失败: ${res.error}`)
      }
    } catch (err: any) {
      alert(`导出文档失败: ${err?.message || String(err)}`)
    } finally {
      setExportingFormat(null)
    }
  }

  // One-Click Save PDF to Knowledge Base (`知识库文档存储` folder)
  const handleSaveToKnowledgeBase = async (): Promise<void> => {
    if (savingToKb || !processedText.trim()) return
    setSavingToKb(true)
    try {
      const exportMarkdown =
        docPreset === 'wechat' ? wechatScheduled.formattedText : processedText
      const exportHtml =
        docPreset === 'wechat'
          ? `<pre class="wechat-plain">${escapeHtml(wechatScheduled.formattedText)}</pre>`
          : previewHtml

      await savePdfToKnowledgeBase({
        title: resolvedDocTitle,
        markdown: exportMarkdown,
        htmlBody: exportHtml,
        preset: docPreset,
        naturalizeLevel
      })
      setSavedToKbDone(true)
      setTimeout(() => setSavedToKbDone(false), 2600)
    } catch (err: any) {
      alert(`存入知识库文档区失败: ${err?.message || String(err)}`)
    } finally {
      setSavingToKb(false)
    }
  }

  // Copy WeChat Scheduled Text (100% matching the iPhone WeChat simulator preview)
  const handleCopyWeChatText = async (): Promise<void> => {
    await navigator.clipboard.writeText(wechatScheduled.formattedText)
    setCopiedPrimary(true)
    setTimeout(() => setCopiedPrimary(false), 2500)
  }

  // Copy Rich Text for Word / Feishu (or WeChat formatted text when in WeChat mode)
  const handleCopyPrimary = async (): Promise<void> => {
    if (docPreset === 'wechat') {
      await handleCopyWeChatText()
      return
    }

    try {
      const styledHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.75; color: #1f2329; }
            h1 { font-size: 24px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #1f2329; }
            h2 { font-size: 18px; font-weight: 600; margin-top: 20px; margin-bottom: 10px; color: #1f2329; }
            h3 { font-size: 15px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: #1f2329; }
            p { margin: 8px 0; font-size: 14px; }
            ul, ol { padding-left: 24px; margin: 8px 0; font-size: 14px; }
            li { margin: 4px 0; }
            table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; }
            th, td { border: 1px solid #dee0e3; padding: 8px 12px; text-align: left; }
            th { background-color: #f5f6f7; font-weight: 600; }
            code { background-color: #f2f3f5; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12.5px; }
            blockquote { border-left: 3px solid #3370ff; padding-left: 12px; color: #646a73; margin: 12px 0; font-style: italic; }
          </style>
        </head>
        <body>${previewHtml}</body>
        </html>
      `

      const blobHtml = new Blob([styledHtml], { type: 'text/html' })
      const blobText = new Blob([processedText], { type: 'text/plain' })

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ])
      setCopiedPrimary(true)
      setTimeout(() => setCopiedPrimary(false), 2500)
    } catch {
      await navigator.clipboard.writeText(processedText)
      setCopiedPrimary(true)
      setTimeout(() => setCopiedPrimary(false), 2500)
    }
  }

  const handleSendToFeishu = async (): Promise<void> => {
    if (!feishuWebhookUrl) return
    setFeishuSending(true)
    try {
      const payload = {
        msg_type: 'post',
        content: {
          post: {
            zh_cn: {
              title: resolvedDocTitle,
              content: [
                [
                  {
                    tag: 'text',
                    text:
                      processedText.slice(0, 1800) +
                      (processedText.length > 1800 ? '\n...(更多内容请在飞书文档查看)' : '')
                  }
                ]
              ]
            }
          }
        }
      }

      await fetch(feishuWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      setFeishuSuccess(true)
      setTimeout(() => {
        setFeishuSuccess(false)
        setShowFeishuModal(false)
      }, 2000)
    } catch {
      alert('发送到飞书失败，请检查 Webhook 地址或网络权限')
    } finally {
      setFeishuSending(false)
    }
  }

  const isWeChat = docPreset === 'wechat'

  const currentDocStyleMeta = useMemo(
    () => DOC_STYLES.find((s) => s.id === docSubPreset) || DOC_STYLES[0],
    [docSubPreset]
  )

  const currentNaturalizeMeta =
    NATURALIZE_OPTIONS.find((o) => o.id === naturalizeLevel) || NATURALIZE_OPTIONS[0]

  const currentTableStyleMeta = useMemo(
    () => WECHAT_TABLE_STYLES.find((s) => s.id === wechatTableStyle) || WECHAT_TABLE_STYLES[0],
    [wechatTableStyle]
  )

  const tableStrategySummary = useMemo(() => {
    if (wechatScheduled.stats.tableCount === 0) {
      return '自适应排版'
    }
    return `表格: ${currentTableStyleMeta.label}`
  }, [wechatScheduled.stats.tableCount, currentTableStyleMeta.label])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FBFBFC] overflow-hidden select-text">
      {/* Top Action Toolbar */}
      <div className="min-h-[56px] px-4 py-1.5 border-b border-black/[0.07] bg-white flex items-center justify-between gap-2 flex-wrap shrink-0 select-none relative z-30">
        {/* Left: Blue Icon & Black Title */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#0071e3]/12 flex items-center justify-center text-[#0071e3] shadow-sm">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-[14px] font-semibold text-[#1d1d1f] tracking-tight hidden 2xl:inline">
            AI 文本排版工坊
          </span>
          <span className="text-[13.5px] font-semibold text-[#1d1d1f] tracking-tight 2xl:hidden">
            排版工坊
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-nowrap justify-end shrink-0">
          {/* 1. Document Style Popover Selector: 清爽文档 | 正式公文 | 紧凑备忘 (greyed out in WeChat mode) */}
          <div className="relative shrink-0" ref={docStyleMenuRef}>
            <button
              type="button"
              disabled={isWeChat}
              onClick={() => {
                if (isWeChat) return
                setDocStyleMenuOpen((v) => !v)
                setNaturalizeMenuOpen(false)
                setDownloadMenuOpen(false)
                setTableStyleMenuOpen(false)
              }}
              title={
                isWeChat
                  ? '文档排版风格（仅在右侧切换为「文档文本」模式时生效）'
                  : '切换文档排版风格 (清爽文档 / 正式公文 / 紧凑备忘)'
              }
              className={`w-[150px] flex items-center justify-between px-2.5 py-1.5 rounded-full text-[11.5px] font-medium transition-all whitespace-nowrap select-none ${
                isWeChat
                  ? 'bg-[#F2F2F7] text-[#8e8e93] border border-black/[0.04] opacity-40 cursor-not-allowed'
                  : 'apple-press bg-[#0071e3]/10 hover:bg-[#0071e3]/16 border border-[#0071e3]/30 text-[#0071e3]'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <FileText
                  className={`w-3.5 h-3.5 shrink-0 ${isWeChat ? 'text-[#8e8e93]' : 'text-[#0071e3]'}`}
                />
                <span className="truncate">风格: {currentDocStyleMeta.label}</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>

            {!isWeChat && docStyleMenuOpen && (
              <div className="animate-apple-modal absolute left-0 top-full mt-2 min-w-[170px] rounded-2xl bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] border border-black/[0.08] z-50 flex flex-col gap-0.5">
                {DOC_STYLES.map((opt) => {
                  const isSelected = docPreset === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDocSubPreset(opt.id)
                        setDocPreset(opt.id)
                        setDocStyleMenuOpen(false)
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left text-[13px] font-medium flex items-center gap-2 transition-colors select-none ${
                        isSelected
                          ? 'bg-[#0071e3] text-white shadow-sm'
                          : 'hover:bg-black/[0.05] text-[#1d1d1f]'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 2. WeChat Table Style Popover Selector (greyed out in Document mode) */}
          <div className="relative shrink-0" ref={tableStyleMenuRef}>
            <button
              type="button"
              disabled={!isWeChat}
              onClick={() => {
                if (!isWeChat) return
                setTableStyleMenuOpen((v) => !v)
                setNaturalizeMenuOpen(false)
                setDownloadMenuOpen(false)
                setDocStyleMenuOpen(false)
              }}
              title={
                !isWeChat
                  ? '微信表格防错乱排版风格（仅在右侧切换为「微信文本」模式时生效）'
                  : '选择微信中表格的防错乱排版风格'
              }
              className={`w-[150px] flex items-center justify-between px-2.5 py-1.5 rounded-full text-[11.5px] font-medium transition-all whitespace-nowrap select-none ${
                !isWeChat
                  ? 'bg-[#F2F2F7] text-[#8e8e93] border border-black/[0.04] opacity-40 cursor-not-allowed'
                  : 'apple-press bg-[#07C160]/10 hover:bg-[#07C160]/18 border border-[#07C160]/30 text-[#07C160]'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Table
                  className={`w-3.5 h-3.5 shrink-0 ${!isWeChat ? 'text-[#8e8e93]' : 'text-[#07C160]'}`}
                />
                <span className="truncate">表格: {currentTableStyleMeta.label}</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>

            {isWeChat && tableStyleMenuOpen && (
              <div className="animate-apple-modal absolute left-0 top-full mt-2 min-w-[180px] rounded-2xl bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] border border-black/[0.08] z-50 flex flex-col gap-0.5">
                {WECHAT_TABLE_STYLES.map((opt) => {
                  const isSelected = wechatTableStyle === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        handleSetWechatTableStyle(opt.id)
                        setTableStyleMenuOpen(false)
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left text-[13px] font-medium flex items-center gap-2 transition-colors select-none ${
                        isSelected
                          ? 'bg-[#07C160] text-white shadow-sm'
                          : 'hover:bg-black/[0.05] text-[#1d1d1f]'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 3. AI Wording Naturalization Popover Selector: fixed width w-[178px] in both modes */}
          <div className="relative shrink-0" ref={naturalizeMenuRef}>
            <button
              type="button"
              onClick={() => {
                setNaturalizeMenuOpen((v) => !v)
                setDownloadMenuOpen(false)
                setTableStyleMenuOpen(false)
                setDocStyleMenuOpen(false)
              }}
              className={`apple-press w-[178px] flex items-center justify-between px-2.5 py-1.5 rounded-full border text-[11.5px] font-medium transition-all whitespace-nowrap ${
                naturalizeLevel !== 'faithful'
                  ? 'bg-[#5856D6]/10 border-[#5856D6]/30 text-[#4340B8]'
                  : 'bg-[#F2F2F7] hover:bg-[#E8E8EE] border-black/[0.06] text-[#1d1d1f]'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <Sparkles className="w-3.5 h-3.5 text-[#5856D6] shrink-0" />
                <span className="truncate">{currentNaturalizeMeta.label}</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>

            {naturalizeMenuOpen && (
              <div className="animate-apple-modal absolute left-0 top-full mt-2 min-w-[210px] rounded-2xl bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] border border-black/[0.08] z-50 flex flex-col gap-0.5">
                {NATURALIZE_OPTIONS.map((opt) => {
                  const isSelected = naturalizeLevel === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        handleSelectNaturalizeLevel(opt.id)
                        setNaturalizeMenuOpen(false)
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left text-[13px] font-medium flex items-center gap-2 transition-colors select-none ${
                        isSelected
                          ? 'bg-[#0071e3] text-white shadow-sm'
                          : 'hover:bg-black/[0.05] text-[#1d1d1f]'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 4. Multi-Format Download Dropdown Button (fixed width w-[88px], greyed out in WeChat mode) */}
          <div className="relative shrink-0" ref={downloadMenuRef}>
            <button
              type="button"
              disabled={isWeChat || Boolean(exportingFormat)}
              onClick={() => {
                if (isWeChat) return
                setDownloadMenuOpen((v) => !v)
                setNaturalizeMenuOpen(false)
                setTableStyleMenuOpen(false)
                setDocStyleMenuOpen(false)
              }}
              title={
                isWeChat
                  ? '格式导出下载（仅在右侧切换为「文档文本」模式时生效）'
                  : '选择格式下载当前排版文档 (Word .doc / DOCX / PDF)'
              }
              className={`w-[88px] flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[12px] font-medium transition-colors whitespace-nowrap select-none ${
                isWeChat
                  ? 'bg-[#F2F2F7] text-[#8e8e93] border-black/[0.04] opacity-40 cursor-not-allowed'
                  : 'apple-press bg-[#F2F2F7] hover:bg-[#E5E5EA] border-black/[0.06] text-[#1d1d1f]'
              }`}
            >
              {exportingFormat ? (
                <RefreshCw className="w-3.5 h-3.5 text-[#0071e3] animate-spin shrink-0" />
              ) : downloadedDone ? (
                <Check className="w-3.5 h-3.5 text-[#34C759] shrink-0" />
              ) : (
                <Download
                  className={`w-3.5 h-3.5 shrink-0 ${isWeChat ? 'text-[#8e8e93]' : 'text-[#6e6e73]'}`}
                />
              )}
              <span>
                {exportingFormat ? '导出中...' : downloadedDone ? `已下载` : '下载'}
              </span>
              {!exportingFormat && !downloadedDone && (
                <ChevronDown className="w-3 h-3 text-[#6e6e73] shrink-0 opacity-70" />
              )}
            </button>

            {!isWeChat && downloadMenuOpen && (
              <div className="animate-apple-modal absolute left-0 top-full mt-2 min-w-[190px] rounded-2xl bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)] border border-black/[0.08] z-50 flex flex-col gap-0.5">
                {DOWNLOAD_FORMATS.map((item) => (
                  <button
                    key={item.format}
                    type="button"
                    onClick={() => {
                      handleDownloadFormat(item.format)
                      setDownloadMenuOpen(false)
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-black/[0.05] flex items-center gap-2.5 text-left text-[13px] font-medium text-[#1d1d1f] transition-colors select-none"
                  >
                    <span
                      className={`w-9 py-0.5 rounded text-[10px] font-mono font-bold text-center shrink-0 ${
                        item.format === 'pdf'
                          ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                          : item.format === 'docx'
                            ? 'bg-[#0071e3]/12 text-[#0071e3]'
                            : 'bg-[#5856D6]/12 text-[#5856D6]'
                      }`}
                    >
                      {item.extBadge}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 5. Primary Copy Button (fixed width w-[154px], adapts color/text to WeChat or Document mode) */}
          <button
            type="button"
            onClick={handleCopyPrimary}
            title={
              isWeChat
                ? '一键复制经防错乱调度后的微信专属文本，粘贴到微信发送与右侧手机预览完全一致'
                : '一键复制富文本：粘贴进飞书文档或 Word 会保留标题、表格与加粗样式'
            }
            className={`apple-press w-[154px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-white text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              isWeChat
                ? 'bg-[#07C160] hover:bg-[#06AD56] shadow-[0_2px_10px_rgba(7,193,96,0.28)]'
                : 'bg-[#0071e3] hover:bg-[#0077ED] shadow-[0_2px_8px_rgba(0,113,227,0.25)]'
            }`}
          >
            {copiedPrimary ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : isWeChat ? (
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {isWeChat
                ? copiedPrimary
                  ? '已复制微信格式'
                  : '复制微信格式文本'
                : copiedPrimary
                  ? '已复制富文本'
                  : '复制到飞书 / Word'}
            </span>
          </button>

          {/* 6. Feishu One-Click Dispatch Button (fixed width w-[114px], greyed out in WeChat mode) */}
          <button
            type="button"
            disabled={isWeChat}
            onClick={() => {
              if (isWeChat) return
              setShowFeishuModal(true)
            }}
            title={
              isWeChat
                ? '飞书云端分发（仅在右侧切换为「文档文本」模式时生效）'
                : '接入飞书开放平台 Webhook / 接口一键分发文档'
            }
            className={`w-[114px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 select-none ${
              isWeChat
                ? 'bg-[#F2F2F7] text-[#8e8e93] border border-black/[0.04] opacity-40 cursor-not-allowed'
                : 'apple-press bg-[#34C759]/12 hover:bg-[#34C759]/20 text-[#177233] border border-[#34C759]/30'
            }`}
          >
            <Send
              className={`w-3.5 h-3.5 shrink-0 ${isWeChat ? 'text-[#8e8e93]' : 'text-[#177233]'}`}
            />
            <span>飞书一键生成</span>
          </button>

          {/* 7. Save PDF to Knowledge Base (`知识库文档存储`) Button (fixed width w-[156px], greyed out in WeChat mode) */}
          <button
            type="button"
            disabled={isWeChat || savingToKb || !processedText.trim()}
            onClick={() => {
              if (isWeChat) return
              handleSaveToKnowledgeBase()
            }}
            title={
              isWeChat
                ? 'PDF 文档知识库归档（仅在右侧切换为「文档文本」模式时生效）'
                : '将当前排版文档自动生成 PDF 并归档至后台「知识库文档存储」文件夹，可在工作台左侧「知识库文档」随时查阅'
            }
            className={`w-[156px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium transition-all whitespace-nowrap shrink-0 select-none ${
              isWeChat
                ? 'bg-[#F2F2F7] text-[#8e8e93] border-black/[0.04] opacity-40 cursor-not-allowed'
                : savedToKbDone
                  ? 'apple-press bg-[#5856D6] text-white border-[#5856D6] shadow-[0_2px_8px_rgba(88,86,214,0.28)]'
                  : 'apple-press bg-[#5856D6]/10 hover:bg-[#5856D6]/18 text-[#4340B8] border-[#5856D6]/28'
            }`}
          >
            {savingToKb ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : savedToKbDone ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <BookOpen
                className={`w-3.5 h-3.5 shrink-0 ${isWeChat ? 'text-[#8e8e93]' : 'text-[#4340B8]'}`}
              />
            )}
            <span>
              {savingToKb
                ? '归档中...'
                : savedToKbDone
                  ? '已存入知识库'
                  : '下载到知识库文档区'}
            </span>
          </button>

          {/* 8. Far Right 2-Mode Segmented Capsule: [ 微信文本 | 文档文本 ] (fixed width w-[156px]) */}
          <div
            role="tablist"
            aria-label="模式切换"
            className="relative flex items-center p-0.5 rounded-full bg-[#F2F2F7] border border-black/[0.06] text-[11.5px] shrink-0 w-[156px] ml-1 select-none"
          >
            <div
              className="apple-pill-slider absolute top-0.5 bottom-0.5 left-0.5 w-[76px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.10),0_0_1px_rgba(0,0,0,0.05)] pointer-events-none"
              style={{
                transform: `translate3d(${isWeChat ? 0 : 76}px, 0, 0)`
              }}
            />

            <button
              type="button"
              role="tab"
              aria-selected={isWeChat}
              onClick={() => {
                setDocPreset('wechat')
                setCopiedPrimary(false)
              }}
              className={`relative z-10 w-[76px] py-1 rounded-full transition-colors font-medium flex items-center justify-center gap-1.5 whitespace-nowrap ${
                isWeChat ? 'text-[#07C160] font-semibold' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  isWeChat ? 'bg-[#07C160]' : 'bg-[#34C759]/40'
                }`}
              />
              <span>微信文本</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!isWeChat}
              onClick={() => {
                setDocPreset(docSubPreset)
                setCopiedPrimary(false)
              }}
              className={`relative z-10 w-[76px] py-1 rounded-full transition-colors font-medium flex items-center justify-center gap-1.5 whitespace-nowrap ${
                !isWeChat ? 'text-[#0071e3] font-semibold' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  !isWeChat ? 'bg-[#0071e3]' : 'bg-[#0071e3]/30'
                }`}
              />
              <span>文档文本</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Stage: Left Overleaf Multi-Tab Editor | Resizable Splitter | Right Conditional Preview */}
      <div
        ref={splitContainerRef}
        className="flex-1 flex overflow-hidden bg-[#F5F5F7] relative"
      >
        {/* Left Pane: Overleaf-Style Markdown Code/Visual Editor with Safari Multi-Tab Bar */}
        {!leftCollapsed && (
          <div
            style={{ width: `${leftWidthPct}%` }}
            className="h-full shrink-0 min-w-[330px] max-w-[70%] flex flex-col overflow-hidden"
          >
            <OverleafEditorPane
              tabs={docTabs}
              activeTabId={activeTab?.id || activeDocTabId}
              onSelectTab={setActiveDocTab}
              onAddTab={() => addDocTab('')}
              onCloseTab={closeDocTab}
              onReorderTabs={reorderDocTabs}
              rawText={rawText}
              onChangeText={(next) => {
                if (activeTab) {
                  updateDocTabContent(activeTab.id, next)
                }
              }}
              healthIssues={healthIssues}
              onResetTemplate={() => {
                if (activeTab) {
                  updateDocTabContent(activeTab.id, DEFAULT_DOC_TEMPLATE, true)
                }
              }}
            />
          </div>
        )}

        {/* Overleaf Signature Vertical Splitter Bar with Collapse/Expand Chevron */}
        <div
          onMouseDown={handleSplitterMouseDown}
          title="拖拽调整左右分栏宽度"
          className="w-[11px] h-full shrink-0 bg-[#EAEEF2] hover:bg-[#DFE4EA] border-r border-[#D0D7DE] cursor-col-resize flex flex-col items-center justify-center relative select-none group transition-colors"
        >
          <div className="flex flex-col gap-[3px] opacity-60 group-hover:opacity-100">
            <span className="w-[3px] h-[3px] rounded-full bg-[#6E7781]" />
            <span className="w-[3px] h-[3px] rounded-full bg-[#6E7781]" />
            <span className="w-[3px] h-[3px] rounded-full bg-[#6E7781]" />
            <span className="w-[3px] h-[3px] rounded-full bg-[#6E7781]" />
          </div>

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setLeftCollapsed((v) => !v)}
            title={leftCollapsed ? '展开左侧编辑器' : '收起左侧编辑器'}
            className="mt-3 w-[16px] h-[28px] rounded-full bg-white border border-[#C5CDD5] shadow-sm flex items-center justify-center text-[#424A53] hover:text-[#138A36] hover:border-[#138A36] transition-colors z-20"
          >
            {leftCollapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronLeft className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Right Pane: Morphs into iPhone WeChat Simulator ONLY when `docPreset === 'wechat'` */}
        {docPreset === 'wechat' ? (
          <div
            key="wechat-phone-preview"
            className="animate-apple-view flex-1 overflow-y-auto py-4 px-6 flex flex-col items-center justify-center bg-[#F2F3F6]"
          >
            <div className="iphone-chassis w-[404px] h-[calc(100vh-132px)] max-h-[852px] min-h-[540px] p-[3px] rounded-[48px] relative flex flex-col shrink-0 transition-all duration-300">
              <div className="w-full h-full rounded-[45px] bg-[#1c1c1e] p-[2.5px] flex flex-col overflow-hidden relative shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                <div className="w-full h-full rounded-[43px] bg-[#EDEDED] flex flex-col overflow-hidden relative">
                  {/* iOS Top Status Bar & Dynamic Island */}
                  <div className="pt-2.5 pb-1 px-6 bg-[#EDEDED] flex items-center justify-between select-none shrink-0 relative z-10">
                    <span className="text-[11.5px] font-semibold text-[#111111] tracking-tight">
                      9:41
                    </span>

                    <div className="w-24 h-[20px] rounded-full bg-[#000000] flex items-center justify-between px-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.22)]">
                      <span className="w-2 h-2 rounded-full bg-[#1c1c1e] border border-white/10" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#07C160]/90 animate-pulse" />
                    </div>

                    <div className="flex items-center gap-1 text-[#111111]">
                      <div className="flex items-end gap-[1.5px] h-2.5">
                        <span className="w-[2px] h-[4px] bg-[#111111] rounded-[0.5px]" />
                        <span className="w-[2px] h-[6px] bg-[#111111] rounded-[0.5px]" />
                        <span className="w-[2px] h-[8px] bg-[#111111] rounded-[0.5px]" />
                        <span className="w-[2px] h-[10px] bg-[#111111] rounded-[0.5px]" />
                      </div>
                      <span className="text-[10px] font-semibold ml-0.5">5G</span>
                      <div className="w-[18px] h-[9px] rounded-[2.5px] border border-[#111111]/80 p-[1px] flex items-center ml-0.5">
                        <div className="w-full h-full bg-[#111111] rounded-[1px]" />
                      </div>
                    </div>
                  </div>

                  {/* Authentic iOS WeChat Navigation Header */}
                  <div className="px-3.5 py-2 bg-[#EDEDED] border-b border-black/[0.08] flex items-center justify-between select-none shrink-0">
                    <div className="flex items-center gap-0.5 text-[#111111] min-w-[64px]">
                      <ChevronLeft className="w-5 h-5 -ml-1 stroke-[2]" />
                      <span className="px-1.5 py-[1px] rounded-full bg-black/[0.08] text-[10.5px] font-medium text-[#191919]">
                        12
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <span className="text-[14.5px] font-semibold text-[#111111] leading-tight">
                        项目推进群 (8)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const idx = WECHAT_TABLE_STYLES.findIndex(
                            (s) => s.id === wechatTableStyle
                          )
                          const next =
                            WECHAT_TABLE_STYLES[(idx + 1) % WECHAT_TABLE_STYLES.length].id
                          handleSetWechatTableStyle(next)
                        }}
                        title="点击直接轮换微信表格排版风格 (卡片标头 / 精致条目 / 结构导轨 / 紧凑网格)"
                        className="apple-press px-1.5 py-0.5 rounded-full bg-[#07C160]/12 hover:bg-[#07C160]/22 text-[9px] text-[#07C160] font-medium leading-tight flex items-center gap-0.5 transition-colors mt-0.5"
                      >
                        <span>{tableStrategySummary}</span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 min-w-[64px]">
                      <button
                        onClick={() =>
                          setWechatPerspective((p) => (p === 'sender' ? 'receiver' : 'sender'))
                        }
                        title={
                          wechatPerspective === 'sender'
                            ? '当前：发送后己方绿气泡视角（点击切换接收方白气泡视角）'
                            : '当前：接收方白气泡视角（点击切换发送方绿气泡视角）'
                        }
                        className="px-1.5 py-0.5 rounded bg-black/[0.06] hover:bg-black/[0.11] text-[10px] font-medium text-[#333333] flex items-center gap-0.5 transition-colors"
                      >
                        <ArrowLeftRight className="w-2.5 h-2.5" />
                        <span>{wechatPerspective === 'sender' ? '己方' : '对方'}</span>
                      </button>
                      <MoreHorizontal className="w-4 h-4 text-[#111111]" />
                    </div>
                  </div>

                  {/* Authentic WeChat Chat Scroll Viewport (#EDEDED) */}
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5 bg-[#EDEDED]">
                    <div className="flex justify-center select-none">
                      <span className="text-[11px] text-[#999999] font-normal">16:00</span>
                    </div>

                    {wechatPerspective === 'sender' && (
                      <div className="flex items-start gap-2.5 pr-12 select-none">
                        <div className="w-[38px] h-[38px] rounded-[6px] bg-gradient-to-br from-[#4A90E2] to-[#2563EB] text-white text-[12px] font-semibold flex items-center justify-center shrink-0 shadow-sm">
                          林总
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[10.5px] text-[#888888] mb-0.5 ml-0.5">
                            林负责人
                          </span>
                          <div className="relative bg-white text-[#111111] px-3 py-2 rounded-[7px] text-[14.5px] leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
                            <span className="absolute top-[11px] -left-[5px] w-2.5 h-2.5 bg-white rotate-45 rounded-[1px]" />
                            <span className="relative z-10">
                              最新方案整理好了吗？发群里大家直接看下
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {wechatPerspective === 'sender' ? (
                      <div className="flex items-start justify-end gap-2.5">
                        <div className="relative max-w-[274px] bg-[#95EC69] px-[13px] py-[10.5px] rounded-[8px] shadow-[0_1px_1.5px_rgba(0,0,0,0.04)]">
                          <span className="absolute top-[13px] -right-[5px] w-2.5 h-2.5 bg-[#95EC69] rotate-45 rounded-[1px]" />
                          <div className="relative z-10 wechat-msg-text select-text">
                            {wechatScheduled.formattedText || '请在左侧输入或粘贴需要排版的文本...'}
                          </div>
                        </div>

                        <div className="w-[38px] h-[38px] rounded-[6px] bg-gradient-to-br from-[#1F2937] to-[#111827] text-white text-[12px] font-semibold flex items-center justify-center shrink-0 shadow-sm select-none">
                          我
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-start gap-2.5">
                        <div className="w-[38px] h-[38px] rounded-[6px] bg-gradient-to-br from-[#07C160] to-[#059669] text-white text-[12px] font-semibold flex items-center justify-center shrink-0 shadow-sm select-none">
                          汇报
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[10.5px] text-[#888888] mb-0.5 ml-0.5 select-none">
                            项目架构师
                          </span>
                          <div className="relative max-w-[274px] bg-white px-[13px] py-[10.5px] rounded-[8px] shadow-[0_1px_1.5px_rgba(0,0,0,0.04)]">
                            <span className="absolute top-[13px] -left-[5px] w-2.5 h-2.5 bg-white rotate-45 rounded-[1px]" />
                            <div className="relative z-10 wechat-msg-text select-text">
                              {wechatScheduled.formattedText || '请在左侧输入或粘贴需要排版的文本...'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Authentic iOS WeChat Bottom Input Bar + One-Click Copy Action */}
                  <div className="bg-[#F7F7F7] border-t border-black/[0.08] px-3 pt-2 pb-1 shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full border border-[#191919]/75 flex items-center justify-center text-[#191919] shrink-0">
                        <Volume2 className="w-3.5 h-3.5" />
                      </div>

                      <button
                        onClick={handleCopyWeChatText}
                        className={`apple-press flex-1 h-[34px] px-3 rounded-[6px] text-[12.5px] font-medium flex items-center justify-center gap-1.5 transition-all ${
                          copiedPrimary
                            ? 'bg-[#07C160] text-white shadow-sm'
                            : 'bg-white hover:bg-[#FAFAFA] text-[#07C160] border border-black/[0.06]'
                        }`}
                      >
                        {copiedPrimary ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>已复制微信格式 · 去微信粘贴发送</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>一键复制微信防错乱文本 ({wechatScheduled.stats.charCount} 字)</span>
                          </>
                        )}
                      </button>

                      <Smile className="w-6 h-6 text-[#191919]/80 stroke-[1.6] shrink-0" />
                      <PlusCircle className="w-6 h-6 text-[#191919]/80 stroke-[1.6] shrink-0" />
                    </div>

                    <div className="pt-2.5 pb-1 flex justify-center">
                      <div className="w-32 h-[4px] rounded-full bg-black/25" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Standard Feishu / Word Document Preview Sheet (clean / formal / compact) */
          <div
            key="doc-sheet-preview"
            className="animate-apple-view flex-1 overflow-y-auto py-5 px-7 flex justify-center"
          >
            <div
              className={`w-full max-w-[840px] h-fit min-h-full bg-white rounded-[32px] shadow-[0_12px_36px_-6px_rgba(0,0,0,0.07),0_2px_8px_rgba(0,0,0,0.03)] border border-black/[0.06] p-12 transition-all ${
                docPreset === 'formal'
                  ? 'font-serif text-[#111111]'
                  : docPreset === 'compact'
                    ? 'p-8 text-[13px] leading-[1.6]'
                    : 'font-sans text-[#1f2329]'
              }`}
            >
              {/* Feishu Header Meta + Active Wording Mode Pill */}
              <div className="border-b border-black/[0.07] pb-4 mb-6 flex items-center justify-between gap-2 flex-wrap text-[11px] text-[#86868b] select-none">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full bg-[#0071e3]" />
                  <span className="font-medium text-[#1d1d1f]">飞书文档排版仿真视图</span>
                  <span>·</span>
                  <span>
                    {docPreset === 'clean'
                      ? '清爽标准样式'
                      : docPreset === 'formal'
                        ? '正式公文规范'
                        : '紧凑备忘录'}
                  </span>
                  {naturalizeLevel !== 'faithful' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#5856D6]/10 text-[#4340B8] font-sans font-medium">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>
                        {currentNaturalizeMeta.shortBadge}
                        {naturalizeStats.changeCount > 0
                          ? ` · 已润色 ${naturalizeStats.changeCount} 处`
                          : ''}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[#86868b]">
                  <span className="inline-flex items-center gap-1">
                    <FileType2 className="w-3 h-3" />
                    <span>支持 DOC / DOCX / PDF 导出与知识库归档</span>
                  </span>
                </div>
              </div>

              {/* Document Rendered Content */}
              <div
                className="doc-preview-content prose max-w-none text-[14px] leading-relaxed text-[#1f2329]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Feishu Cloud Dispatch Modal */}
      {showFeishuModal && (
        <div
          onClick={() => setShowFeishuModal(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl apple-glass-Heavy p-6 shadow-2xl border border-black/[0.08] space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#34C759]/15 flex items-center justify-center text-[#177233]">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-[#1d1d1f]">
                  飞书一键生成与云端分发
                </h3>
                <p className="text-[11.5px] text-[#86868b]">
                  配置飞书机器人 Webhook 或开放平台接口
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11.5px] font-medium text-[#1d1d1f]">
                飞书自定义机器人 Webhook URL
              </label>
              <input
                type="text"
                value={feishuWebhookUrl}
                onChange={(e) => setFeishuWebhookUrl(e.target.value)}
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx"
                className="w-full px-3 py-2 rounded-xl bg-white border border-black/[0.08] text-[12px] font-mono text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
              />
              <p className="text-[10.5px] text-[#86868b]">
                输入飞书群机器人的 Webhook 地址后，可将当前格式化好的报告以富文本卡片一键发送至飞书群组或相关人员。
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowFeishuModal(false)}
                className="px-3.5 py-1.5 rounded-full text-[12px] text-[#6e6e73] hover:bg-black/[0.05]"
              >
                取消
              </button>
              <button
                onClick={handleSendToFeishu}
                disabled={!feishuWebhookUrl.trim() || feishuSending}
                className="apple-press px-4 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ED] text-white text-[12px] font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                {feishuSending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {feishuSuccess ? '发送成功！' : '确认分发'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
