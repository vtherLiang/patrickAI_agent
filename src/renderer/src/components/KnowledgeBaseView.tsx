import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { DocPresetType, KnowledgeDocItem, KnowledgeDocKind, NaturalizeLevel, ReadKnowledgeDocResult } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

const PRESET_LABEL_MAP: Record<DocPresetType, string> = {
  clean: '清爽文档',
  formal: '正式公文',
  compact: '紧凑备忘',
  wechat: '微信文本'
}

const NATURALIZE_LABEL_MAP: Record<NaturalizeLevel, string> = {
  faithful: '原文保真',
  balanced: '弱化 AI 腔',
  deep: '精简公文风'
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function base64ToBlobUrl(base64: string, mimeType = 'application/pdf'): string {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: mimeType })
  return URL.createObjectURL(blob)
}

function renderDocBadge(kind?: KnowledgeDocKind, fileName?: string): JSX.Element {
  const ext = (fileName ? fileName.split('.').pop() || '' : '').toUpperCase()
  if (kind === 'pdf' || ext === 'PDF') {
    return (
      <span className="px-1.5 py-0.5 rounded-lg bg-[#FF3B30]/12 text-[#C41E16] text-[10px] font-mono font-bold shrink-0">
        PDF
      </span>
    )
  }
  if (kind === 'tex' || ext === 'TEX') {
    return (
      <span className="px-1.5 py-0.5 rounded-lg bg-[#5856D6]/12 text-[#5856D6] text-[10px] font-mono font-bold shrink-0">
        TEX
      </span>
    )
  }
  if (kind === 'image' || ['PNG', 'JPG', 'JPEG', 'JPJ', 'WEBP', 'GIF', 'BMP', 'SVG'].includes(ext)) {
    return (
      <span className="px-1.5 py-0.5 rounded-lg bg-[#FF9500]/12 text-[#D97706] text-[10px] font-mono font-bold shrink-0">
        {ext || 'IMG'}
      </span>
    )
  }
  if (kind === 'word' || ext === 'DOC' || ext === 'DOCX') {
    return (
      <span className="px-1.5 py-0.5 rounded-lg bg-[#0071e3]/12 text-[#0071e3] text-[10px] font-mono font-bold shrink-0">
        {ext || 'DOC'}
      </span>
    )
  }
  return (
    <span className="px-1.5 py-0.5 rounded-lg bg-black/[0.06] text-[#48484a] text-[10px] font-mono font-bold shrink-0">
      {ext || 'DOC'}
    </span>
  )
}

export const KnowledgeBaseView: React.FC = () => {
  const {
    knowledgeDocs,
    refreshKnowledgeDocs,
    deleteKnowledgeDoc,
    openKnowledgeDocExternal,
    openKnowledgeFolder,
    importLocalFilesToKnowledgeBase,
    setWorkbenchSubView,
    setActiveMode,
    launchExamplePromptInChat
  } = useAppStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [docContent, setDocContent] = useState<ReadKnowledgeDocResult | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  useEffect(() => {
    refreshKnowledgeDocs()
  }, [refreshKnowledgeDocs])

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return knowledgeDocs
    return knowledgeDocs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.fileName.toLowerCase().includes(q) ||
        (doc.summarySnippet && doc.summarySnippet.toLowerCase().includes(q))
    )
  }, [knowledgeDocs, searchQuery])

  const activeDoc: KnowledgeDocItem | null = useMemo(() => {
    if (selectedId) {
      const match = filteredDocs.find((d) => d.id === selectedId)
      if (match) return match
    }
    return filteredDocs[0] || null
  }, [filteredDocs, selectedId])

  const totalBytes = useMemo(
    () => knowledgeDocs.reduce((acc, item) => acc + (item.sizeBytes || 0), 0),
    [knowledgeDocs]
  )

  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null

    if (!activeDoc) {
      setDocContent(null)
      setBlobUrl(null)
      setPreviewError(null)
      setIsLoadingPreview(false)
      return
    }

    setIsLoadingPreview(true)
    setPreviewError(null)

    if (typeof window.claudeDesktop?.readKnowledgeDocPdf !== 'function') {
      setDocContent(null)
      setBlobUrl(null)
      setPreviewError('新增知识库预览接口需重启一次桌面端进程 (npm run dev) 后生效')
      setIsLoadingPreview(false)
      return
    }

    window.claudeDesktop
      .readKnowledgeDocPdf(activeDoc.id)
      .then((res) => {
        if (cancelled) return
        if (!res || !res.base64) {
          setDocContent(null)
          setBlobUrl(null)
          setPreviewError('无法读取该归档文档文件')
          return
        }

        const ext = activeDoc.fileName.toLowerCase()
        const isPdf = res.kind === 'pdf' || ext.endsWith('.pdf')

        if (isPdf) {
          currentUrl = base64ToBlobUrl(res.base64, 'application/pdf')
          setBlobUrl(currentUrl)
        } else {
          setBlobUrl(null)
        }

        setDocContent(res)
      })
      .catch((err) => {
        if (cancelled) return
        setDocContent(null)
        setBlobUrl(null)
        setPreviewError(err instanceof Error ? err.message : '文档预览加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPreview(false)
        }
      })

    return () => {
      cancelled = true
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [activeDoc?.id, activeDoc?.createdAt])

  const handleManualRefresh = async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      await refreshKnowledgeDocs()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleImportFiles = async (): Promise<void> => {
    setIsImporting(true)
    try {
      await importLocalFilesToKnowledgeBase()
    } finally {
      setIsImporting(false)
    }
  }

  const handleCopyText = (text: string): void => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FBFBFD] animate-apple-view">
      {/* Header */}
      <div className="px-7 pt-6 pb-4 bg-white border-b border-black/[0.06] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setWorkbenchSubView('chat')}
            className="apple-press px-3 py-1.5 rounded-full bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回线程对话</span>
          </button>

          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-tight text-[#1d1d1f]">
              知识库文档
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleImportFiles}
            disabled={isImporting}
            title="选择本地 .tex, 图片, Word (.doc/.docx) 或 PDF 存入知识库"
            className="apple-press px-3.5 py-2 rounded-full bg-[#5856D6]/10 hover:bg-[#5856D6]/20 border border-[#5856D6]/25 text-[12px] font-semibold text-[#5856D6] flex items-center gap-1.5 shadow-xs"
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>导入本地文档</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="apple-press px-3 py-2 rounded-full bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.06] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#6e6e73] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            type="button"
            onClick={() => openKnowledgeFolder()}
            title="在系统访达 / 文件资源管理器中打开后台生成的「知识库文档存储」文件夹"
            className="apple-press px-3.5 py-2 rounded-full bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.06] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#0071e3]" />
            <span>打开「知识库文档存储」</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('doc-editor')}
            className="apple-press px-4 py-2 rounded-full bg-[#1d1d1f] hover:bg-black text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-[0_3px_12px_rgba(0,0,0,0.14)]"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>前往文本排版归档</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left List */}
        <div className="w-[340px] border-r border-black/[0.06] bg-[#F5F5F7]/55 flex flex-col shrink-0">
          <div className="p-3.5 pb-2 space-y-2 border-b border-black/[0.05]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标题、文件名或摘要内容..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-black/[0.08] focus:border-[#5856D6]/40 text-[12px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none transition-all"
              />
            </div>
            <div className="px-1 flex items-center justify-between text-[11px] text-[#86868b]">
              <span>共 {knowledgeDocs.length} 份知识库文档</span>
              <span className="font-mono">{formatFileSize(totalBytes)}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {filteredDocs.length === 0 ? (
              <div className="pt-10 pb-6 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center mx-auto">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-[13.5px] font-semibold text-[#1d1d1f]">
                    {knowledgeDocs.length === 0 ? '暂无归档的知识库文档' : '未匹配到相关文档'}
                  </div>
                  <p className="text-[11.5px] text-[#6e6e73] leading-relaxed">
                    {knowledgeDocs.length === 0
                      ? '知识库支持 .tex 源码、图片、Word (.doc/.docx) 以及 PDF。你可以点击上方「导入本地文档」，或在对话中对上传过的文件右键选择「加入知识库」。'
                      : '请尝试更换关键词，或点击右上角刷新同步本地文件夹。'}
                  </p>
                </div>
                {knowledgeDocs.length === 0 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleImportFiles}
                      className="apple-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#5856D6] hover:bg-[#4B49C8] text-white text-[12px] font-medium shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>导入本地文档</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMode('doc-editor')}
                      className="apple-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-[#F5F5F7] border border-black/[0.08] text-[#1d1d1f] text-[12px] font-medium shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>排版生成 PDF</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isSelected = activeDoc?.id === doc.id
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedId(doc.id)}
                    className={`apple-press rounded-2xl p-3.5 cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-white border-[#5856D6]/30 shadow-[0_4px_16px_rgba(88,86,214,0.09)]'
                        : 'bg-white/70 hover:bg-white border-black/[0.05]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {renderDocBadge(doc.kind, doc.fileName)}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-[#1d1d1f] truncate">
                          {doc.title}
                        </div>
                        <div className="text-[11px] font-mono text-[#86868b] truncate mt-0.5">
                          {doc.fileName}
                        </div>
                      </div>
                    </div>

                    {doc.summarySnippet && (
                      <p className="text-[11.5px] text-[#6e6e73] line-clamp-2 leading-relaxed mt-2">
                        {doc.summarySnippet}
                      </p>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-black/[0.04] flex items-center justify-between gap-2 text-[10.5px] text-[#86868b]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {doc.preset && (
                          <span className="px-1.5 py-0.5 rounded bg-black/[0.045] text-[#48484a]">
                            {PRESET_LABEL_MAP[doc.preset] || doc.preset}
                          </span>
                        )}
                        {doc.naturalizeLevel && (
                          <span className="px-1.5 py-0.5 rounded bg-[#5856D6]/10 text-[#5856D6]">
                            {NATURALIZE_LABEL_MAP[doc.naturalizeLevel] || doc.naturalizeLevel}
                          </span>
                        )}
                        {doc.charCount && doc.charCount > 0 && (
                          <span className="font-mono text-[#86868b]">
                            {doc.charCount.toLocaleString()} 字
                          </span>
                        )}
                      </div>
                      <span className="font-mono shrink-0">{formatFileSize(doc.sizeBytes)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Preview & Inspector Pane */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F5F5F7]/35">
          {!activeDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-3xl bg-white border border-black/[0.06] shadow-sm flex items-center justify-center mb-4">
                <BookOpen className="w-7 h-7 text-[#5856D6]" />
              </div>
              <h2 className="text-[17px] font-semibold text-[#1d1d1f] mb-1.5">
                知识库文档存储已就绪
              </h2>
              <p className="text-[12.5px] text-[#6e6e73] max-w-md leading-relaxed mb-4">
                后台已自动接入
                <span className="font-mono text-[#1d1d1f] mx-1">知识库文档存储</span>
                专属文件夹。全面兼容
                <span className="font-medium text-[#1d1d1f] mx-1">.tex 源码、高清图片、Word (.doc/.docx) 以及 PDF 归档</span>
                ，支持多格式预览、右键快速存入与对话无缝引用。
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleImportFiles}
                  className="apple-press px-4 py-2 rounded-full bg-[#5856D6] hover:bg-[#4B49C8] text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>导入本地文档</span>
                </button>
                <button
                  type="button"
                  onClick={() => openKnowledgeFolder()}
                  className="apple-press px-3.5 py-2 rounded-full bg-white hover:bg-[#F5F5F7] border border-black/[0.08] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5 shadow-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#0071e3]" />
                  <span>打开存储文件夹</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Document Metadata & Action Toolbar */}
              <div className="px-5 py-3 bg-white border-b border-black/[0.06] flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {renderDocBadge(activeDoc.kind, activeDoc.fileName)}
                    <h2 className="text-[14px] font-semibold text-[#1d1d1f] truncate" title={activeDoc.title}>
                      {activeDoc.title}
                    </h2>
                    <span className="text-[11px] font-mono text-[#86868b] shrink-0">
                      ({formatFileSize(activeDoc.sizeBytes)})
                    </span>
                  </div>
                  <div
                    className="text-[10.5px] font-mono text-[#86868b] truncate mt-0.5"
                    title={activeDoc.filePath}
                  >
                    {activeDoc.filePath}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      launchExamplePromptInChat(
                        `请调用 read_file 工具读取并深入分析知识库归档文档「${activeDoc.filePath}」（标题：${activeDoc.title}）。读取完成后，请直接交付一份完整的结构化深度分析报告，必须包含：\n1. 【核心结论与命题判断】\n2. 【关键要点与架构机制】\n3. 【量化指标与论据数据】\n4. 【局限性与落地建议】。`,
                        false
                      )
                    }
                    className="apple-press px-2.5 py-1.5 rounded-full bg-[#5856D6]/10 hover:bg-[#5856D6]/18 text-[#5856D6] text-[11.5px] font-medium flex items-center gap-1"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>引用至对话</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openKnowledgeDocExternal(activeDoc.id, true)}
                    className="apple-press px-2.5 py-1.5 rounded-full bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1d1d1f] text-[11.5px] font-medium flex items-center gap-1"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#0071e3]" />
                    <span>文件夹定位</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openKnowledgeDocExternal(activeDoc.id, false)}
                    className="apple-press px-2.5 py-1.5 rounded-full bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#1d1d1f] text-[11.5px] font-medium flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#1d1d1f]" />
                    <span>系统打开</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteKnowledgeDoc(activeDoc.id)}
                    title="从知识库文档存储中删除该文档"
                    className="apple-press p-1.5 rounded-full bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 text-[#C41E16] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Multi-Format Preview Body */}
              <div
                className="flex-1 p-4 overflow-hidden flex flex-col"
                style={{ overscrollBehavior: 'contain' }}
              >
                {isLoadingPreview ? (
                  <div className="flex-1 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-center gap-2 text-[13px] text-[#6e6e73]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#5856D6]" />
                    <span>正在加载文档内容...</span>
                  </div>
                ) : previewError ? (
                  <div className="flex-1 rounded-2xl bg-white border border-black/[0.06] flex flex-col items-center justify-center p-6 text-center gap-3">
                    <p className="text-[13px] text-[#C41E16]">{previewError}</p>
                    <button
                      type="button"
                      onClick={() => openKnowledgeDocExternal(activeDoc.id, false)}
                      className="apple-press px-3.5 py-1.5 rounded-full bg-[#1d1d1f] text-white text-[12px] font-medium"
                    >
                      使用本地默认应用打开
                    </button>
                  </div>
                ) : blobUrl ? (
                  /* 1. PDF iframe viewer */
                  <iframe
                    src={blobUrl}
                    title={activeDoc.title}
                    style={{ overscrollBehavior: 'contain' }}
                    className="w-full h-full rounded-2xl bg-white border border-black/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
                  />
                ) : docContent?.kind === 'image' ||
                  ['.png', '.jpg', '.jpeg', '.jpj', '.webp', '.gif', '.bmp', '.svg'].some((ext) =>
                    activeDoc.fileName.toLowerCase().endsWith(ext)
                  ) ? (
                  /* 2. Image full preview */
                  <div className="flex-1 rounded-2xl bg-white border border-black/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col items-center justify-center p-6 relative">
                    <img
                      src={`data:${docContent?.mimeType || 'image/png'};base64,${docContent?.base64}`}
                      alt={activeDoc.title}
                      className="max-w-full max-h-full object-contain rounded-xl shadow-xs"
                    />
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-black/[0.08] text-[11px] text-[#6e6e73]">
                      <ImageIcon className="w-3.5 h-3.5 text-[#FF9500]" />
                      <span>{docContent?.mimeType || '图像'}</span>
                      <span>·</span>
                      <span>{formatFileSize(activeDoc.sizeBytes)}</span>
                    </div>
                  </div>
                ) : docContent?.kind === 'tex' || activeDoc.fileName.toLowerCase().endsWith('.tex') ? (
                  /* 3. LaTeX source code viewer */
                  <div className="flex-1 rounded-2xl bg-white border border-black/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
                    <div className="px-4 py-2.5 bg-[#F5F5F7] border-b border-black/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px] font-mono text-[#1d1d1f]">
                        <FileCode className="w-4 h-4 text-[#5856D6]" />
                        <span>LaTeX 源码</span>
                        <span className="text-[#86868b] text-[11px]">
                          ({(docContent?.text || '').split('\n').length} 行 / {(docContent?.text || '').length} 字符)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText(docContent?.text || '')}
                        className="apple-press px-2.5 py-1 rounded-lg bg-white hover:bg-black/[0.04] border border-black/[0.08] text-[11px] font-medium text-[#1d1d1f] flex items-center gap-1 shadow-2xs"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#34C759]" />
                            <span className="text-[#34C759]">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#6e6e73]" />
                            <span>复制 LaTeX 源码</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 bg-[#FBFBFD] font-mono text-[12.5px] leading-relaxed text-[#1d1d1f] selection:bg-[#5856D6]/20">
                      <pre className="whitespace-pre-wrap font-mono">
                        {docContent?.text || 'LaTeX 文件内容为空'}
                      </pre>
                    </div>
                  </div>
                ) : docContent?.kind === 'word' ||
                  activeDoc.fileName.toLowerCase().endsWith('.docx') ||
                  activeDoc.fileName.toLowerCase().endsWith('.doc') ? (
                  /* 4. Word (.doc / .docx) formatted document viewer */
                  <div className="flex-1 rounded-2xl bg-white border border-black/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
                    <div className="px-4 py-2.5 bg-[#F5F5F7] border-b border-black/[0.06] flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-[#1d1d1f]">
                        <FileText className="w-4 h-4 text-[#0071e3]" />
                        <span>Word 文档排版预览</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openKnowledgeDocExternal(activeDoc.id, false)}
                        className="apple-press px-2.5 py-1 rounded-lg bg-white hover:bg-black/[0.04] border border-black/[0.08] text-[11px] font-medium text-[#1d1d1f] flex items-center gap-1 shadow-2xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#0071e3]" />
                        <span>在系统 Word / Pages 中编辑</span>
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-8 bg-white">
                      {docContent?.html ? (
                        <div
                          className="prose prose-sm max-w-none text-[#1d1d1f] leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: docContent.html }}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap font-sans text-[13.5px] text-[#1d1d1f] leading-relaxed">
                          {docContent?.text || 'Word 文档内容提取中...'}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 5. Fallback generic text viewer */
                  <div className="flex-1 rounded-2xl bg-white border border-black/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col p-6">
                    <div className="whitespace-pre-wrap font-mono text-[12.5px] text-[#1d1d1f] leading-relaxed">
                      {docContent?.text || '已归档知识库文件'}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
