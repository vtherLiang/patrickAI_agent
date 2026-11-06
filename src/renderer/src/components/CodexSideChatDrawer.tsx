import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  Trash2,
  Send,
  StopCircle,
  Copy,
  Check,
  ArrowLeftToLine,
  Sparkles,
  ChevronDown,
  MessageSquare,
  Bot,
  Clock,
  RotateCcw,
  Paperclip,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  Loader2
} from 'lucide-react'
import { ChatAttachment } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { AttachmentContextMenu } from './AttachmentContextMenu'
import { isKnowledgeBaseCompatibleAttachment } from '../utils/attachmentUtils'
import {
  ClaudeAsteriskGlyph,
  ClaudeTerminalOutput,
  ClaudeThinkingBlock
} from './ClaudeActivityElements'

const QUICK_SIDE_CHIPS = [
  {
    label: '💡 解释代码逻辑',
    prompt:
      '请帮我深入剖析下面这段代码的核心逻辑与底层实现机制，并按以下结构用通俗易懂的大白话讲清楚（拒绝晦涩术语堆砌）：\n' +
      '1. 整体作用：一句话说清这段代码到底在干什么、解决了什么问题；\n' +
      '2. 执行流程：按先后顺序梳理数据是怎么流转、逻辑是怎么一步步跑通的；\n' +
      '3. 核心代码逐行精讲：挑出关键核心代码，对每一行代码用大白话详细解释它在做什么、为什么要这么写；\n' +
      '4. 易错点与注意事项：指出潜在的边界情况、隐藏坑点或可优化的地方。\n\n' +
      '待解释的代码如下：\n'
  },
  {
    label: '⚡ 速查 API 语法',
    prompt:
      '请帮我快速讲解以下 API / 语法特性的核心用法与最佳实践，全程用通俗直白的大白话说明白：\n' +
      '1. 它是干嘛的：用一句大白话讲清楚它的核心作用和典型适用场景；\n' +
      '2. 语法与关键参数：列出最常用的写法、核心参数含义及返回值说明（抓重点，不堆砌冷门参数）；\n' +
      '3. 开箱即用示例：给出 1～2 个最贴近实战的标准代码示例，并对核心代码逐行配上大白话注释；\n' +
      '4. 常见踩坑与最佳实践：提醒实际开发中最容易写错的地方和避坑技巧。\n\n' +
      '我想速查的内容是：\n'
  },
  {
    label: '🔍 临时报错诊断',
    prompt:
      '我遇到了下面这个报错，请帮我快速定位问题并给出可直接落地的修复方案，请用通俗易懂的大白话讲清楚：\n' +
      '1. 报错人话翻译：直白告诉我这串报错信息到底在抱怨什么；\n' +
      '2. 根本原因分析：剖析触发该报错的核心根因（最可能是哪一步数据、类型、环境或调用时序出了问题）；\n' +
      '3. 具体修复方案：给出修改前后的代码对照，并对关键修复代码的每一行用大白话解释为什么这样改就能修好；\n' +
      '4. 排查与预防建议：如果还需进一步确认，告诉我优先检查哪里，以及今后如何避免同类坑。\n\n' +
      '报错信息与相关代码如下：\n'
  },
  {
    label: '📐 编写通用工具函数',
    prompt:
      '请帮我编写一个健壮、类型安全、可直接复用的通用工具函数，并满足以下要求：\n' +
      '1. 完整实现与类型定义：写出清晰优雅的代码实现，补齐完整的入参与返回值类型，做好空值与异常边界兜底；\n' +
      '2. 核心逻辑大白话逐行注释：对函数内部的核心实现代码，每一行都写上通俗易懂的大白话注释，让我一眼看懂实现原理；\n' +
      '3. 设计思路简述：用大白话简要说明为什么要这样设计（比如性能、兼容性或防坑考量）；\n' +
      '4. 调用示例：附带 1～2 个典型场景的调用示例与预期输出结果。\n\n' +
      '我需要的工具函数功能是：\n'
  }
]

export const CodexSideChatDrawer: React.FC = () => {
  const {
    isSideChatOpen,
    isSideChatBusy,
    isSideChatExpired,
    sideChatMessages,
    setSideChatOpen,
    sendSideChatMessage,
    clearSideChat,
    restartSideChat,
    checkCurrentSideChatExpiration,
    abortSideChat,
    setDraftComposerText,
    openAttachmentPreview,
    importAttachmentToKnowledgeBase,
    workbenchSubView,
    activeMode
  } = useAppStore()

  const [input, setInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [attachmentContextMenu, setAttachmentContextMenu] = useState<{
    x: number
    y: number
    attachment: ChatAttachment
  } | null>(null)

  const handleAttachmentContextMenu = (e: React.MouseEvent, att: ChatAttachment): void => {
    if (!isKnowledgeBaseCompatibleAttachment(att)) return
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 195
    const menuHeight = 115
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 12)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 12)
    setAttachmentContextMenu({ x, y, attachment: att })
  }
  const [isParsingAttachment, setIsParsingAttachment] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isScrolledUpRef = useRef(false)
  const [isScrolledUp, setIsScrolledUp] = useState(false)

  useEffect(() => {
    if (isSideChatOpen) {
      checkCurrentSideChatExpiration()
      setTimeout(() => textareaRef.current?.focus(), 80)
    }
  }, [isSideChatOpen, checkCurrentSideChatExpiration])

  useEffect(() => {
    const timer = setInterval(() => {
      checkCurrentSideChatExpiration()
    }, 60000)
    return () => clearInterval(timer)
  }, [checkCurrentSideChatExpiration])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 46), 180)}px`
  }, [input, isSideChatOpen, pendingAttachments])

  // Scroll detection: allow user to scroll up freely during generation
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const up = distanceFromBottom > 60
    if (isScrolledUpRef.current !== up) {
      isScrolledUpRef.current = up
      setIsScrolledUp(up)
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < -2) {
      if (!isScrolledUpRef.current) {
        isScrolledUpRef.current = true
        setIsScrolledUp(true)
      }
    }
  }, [])

  // Stick-to-bottom without jitter: instant scroll during streaming, smooth scroll when not busy
  useEffect(() => {
    if (isScrolledUpRef.current) return
    const el = scrollRef.current
    if (!el) return

    if (isSideChatBusy) {
      el.scrollTop = el.scrollHeight
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [sideChatMessages, isSideChatBusy])

  if (!isSideChatOpen || workbenchSubView !== 'chat' || activeMode !== 'workbench') return null

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const ingestFiles = async (fileList: FileList | File[]): Promise<void> => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    // 单文件 150MB 安全上限校验
    const MAX_SINGLE_FILE_BYTES = 150 * 1024 * 1024
    const validFiles: File[] = []
    for (const file of files) {
      if (file.size && file.size > MAX_SINGLE_FILE_BYTES) {
        useAppStore.setState({
          toastNotification: {
            title: '文件超出允许大小',
            body: `文件「${file.name}」体积为 ${(file.size / (1024 * 1024)).toFixed(1)}MB，超出单文件允许上限 (150MB)`,
            timestamp: Date.now()
          }
        })
      } else {
        validFiles.push(file)
      }
    }
    if (validFiles.length === 0) return

    setIsParsingAttachment(true)
    try {
      const nativePaths: string[] = []
      const blobFiles: File[] = []

      for (const file of validFiles) {
        const nativePath =
          window.claudeDesktop?.getPathForFile?.(file) ||
          (file as File & { path?: string }).path ||
          ''
        if (nativePath) {
          nativePaths.push(nativePath)
        } else {
          blobFiles.push(file)
        }
      }

      const added: ChatAttachment[] = []
      if (nativePaths.length > 0 && window.claudeDesktop?.parseAttachmentPaths) {
        const parsedFromPaths = await window.claudeDesktop.parseAttachmentPaths(nativePaths)
        added.push(...parsedFromPaths)
      }

      for (const blob of blobFiles) {
        const dataBase64 = await readFileAsDataUrl(blob)
        if (window.claudeDesktop?.parseDataAttachment) {
          const parsed = await window.claudeDesktop.parseDataAttachment({
            name: blob.name || `clipboard_${Date.now()}.png`,
            mimeType: blob.type,
            dataBase64
          })
          if (parsed) added.push(parsed)
        }
      }

      if (added.length > 0) {
        setPendingAttachments((prev) => [...prev, ...added])
      }
    } finally {
      setIsParsingAttachment(false)
    }
  }

  const handlePickAttachments = async (): Promise<void> => {
    setIsParsingAttachment(true)
    try {
      if (window.claudeDesktop?.pickAttachments) {
        const picked = await window.claudeDesktop.pickAttachments()
        if (picked && picked.length > 0) {
          setPendingAttachments((prev) => [...prev, ...picked])
          return
        }
      }
      fileInputRef.current?.click()
    } finally {
      setIsParsingAttachment(false)
    }
  }

  const removePendingAttachment = (id: string): void => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleSelectChip = (prompt: string): void => {
    if (isSideChatExpired) {
      restartSideChat()
    }
    setInput(prompt)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(prompt.length, prompt.length)
        el.scrollTop = el.scrollHeight
      }
    })
  }

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    const atts = [...pendingAttachments]
    if ((!text && atts.length === 0) || isSideChatBusy || isParsingAttachment) return

    setInput('')
    setPendingAttachments([])
    isScrolledUpRef.current = false
    setIsScrolledUp(false)

    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, 20)

    await sendSideChatMessage(text, atts)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        return // Shift + Enter allowed for multiline
      }
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (id: string, text: string): void => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleInsertIntoMain = (text: string): void => {
    setDraftComposerText(text)
    setCopiedId('inserted_' + text.slice(0, 10))
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <aside
      className="w-[440px] shrink-0 border-l border-black/[0.08] bg-white flex flex-col h-full z-30 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] select-text relative"
      aria-label="侧边临时对话"
    >
      {/* 1. Header */}
      <div className="h-[52px] px-4 border-b border-black/[0.07] bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center shrink-0">
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13.5px] font-semibold text-[#1d1d1f] tracking-tight truncate">
              侧边临时对话
            </span>
            <span
              className="px-1.5 py-0.2 rounded-full bg-black/[0.05] text-[#86868b] text-[10px] font-mono shrink-0"
              title="独立计时：此对话侧边聊天保存时长为 24 小时，超时自动清理"
            >
              24h
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Clear Side Chat */}
          {sideChatMessages.length > 0 && !isSideChatExpired && (
            <button
              type="button"
              onClick={clearSideChat}
              title="清空当前侧边临时会话"
              className="p-1.5 rounded-lg text-[#86868b] hover:text-[#FF3B30] hover:bg-black/[0.05] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Close Drawer */}
          <button
            type="button"
            onClick={() => setSideChatOpen(false)}
            title="关闭侧边临时对话"
            className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.05] transition-colors ml-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Message History Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        className="flex-1 overflow-y-auto p-4 space-y-4 relative"
      >
        {isSideChatExpired ? (
          <div className="h-full flex flex-col justify-center items-center text-center px-6 py-8 animate-apple-view">
            <div className="w-13 h-13 rounded-2xl bg-[#FF9500]/12 border border-[#FF9500]/25 flex items-center justify-center text-[#FF9500] mb-3.5 shadow-[0_4px_16px_rgba(255,149,0,0.12)]">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-1.5">
              会话过期，请重新开启
            </h3>
            <p className="text-[12px] text-[#86868b] leading-relaxed max-w-[280px] mb-5">
              此独立侧边会话已超过 24 小时有效保存期，历史临时记录已自动删除。各对话独立计时 24h。
            </p>
            <button
              type="button"
              onClick={restartSideChat}
              className="apple-press px-4 py-2 rounded-xl bg-[#5856D6] hover:bg-[#4845B8] text-white text-[12.5px] font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重新开启</span>
            </button>
          </div>
        ) : sideChatMessages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#5856D6]/15 to-[#AF5DFB]/15 border border-[#5856D6]/20 flex items-center justify-center text-[#5856D6] mb-3 shadow-[0_4px_16px_rgba(88,86,214,0.1)]">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-1">
              随时速查，轻巧不扰主线
            </h3>
            <p className="text-[12px] text-[#6e6e73] leading-relaxed max-w-[280px] mb-6">
              这是独立的临时会话。您在此处提问的任何片段或拖入的文件，均独立保留，不会写入主任务的 Git 仓库。
            </p>

            <div className="w-full space-y-2 text-left">
              <div className="text-[11px] font-medium text-[#86868b] px-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#5856D6]" />
                <span>常用临时速查快捷模板：</span>
              </div>
              {QUICK_SIDE_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectChip(chip.prompt)}
                  className="w-full apple-press text-left px-3 py-2 rounded-xl bg-[#F6F6F8] hover:bg-[#EBEBEF] text-[12px] text-[#1d1d1f] border border-black/[0.04] transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          sideChatMessages.map((msg, idx) => {
            const isLast = idx === sideChatMessages.length - 1
            const isLastAssistant = isLast && msg.role === 'assistant'
            return (
              <div key={msg.id} className="space-y-1.5">
                {msg.role === 'user' ? (
                  <div className="flex justify-end group">
                    <div className="relative max-w-[88%] bg-[#F2F2F7] border border-black/[0.05] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] text-[#1d1d1f] leading-relaxed">
                      {/* Attached images / documents preview */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                          {msg.attachments.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => openAttachmentPreview(att)}
                              onContextMenu={(e) => handleAttachmentContextMenu(e, att)}
                              title={`点击在预览区查看，右键可加入知识库 · ${att.name}`}
                              className="apple-press flex items-center gap-1.5 p-1.5 rounded-xl bg-white border border-black/[0.08] hover:border-[#5856D6]/40 transition-all text-left max-w-[190px]"
                            >
                              {att.kind === 'image' && att.previewDataUrl ? (
                                <img
                                  src={att.previewDataUrl}
                                  alt={att.name}
                                  className="w-7 h-7 rounded-lg object-cover shrink-0 border border-black/[0.05]"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center shrink-0">
                                  {att.kind === 'excel' ? (
                                    <FileSpreadsheet className="w-3.5 h-3.5" />
                                  ) : (
                                    <FileText className="w-3.5 h-3.5" />
                                  )}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-medium text-[#1d1d1f] truncate">
                                  {att.name}
                                </div>
                                <div className="text-[9.5px] text-[#86868b] truncate font-mono">
                                  {att.summaryMeta || att.ext}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.content && (
                        <div className="whitespace-pre-wrap">
                          {(() => {
                            const linkRegex =
                              /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>'")]+)/g
                            const chunks = msg.content.split(linkRegex)
                            return chunks.map((chunk, cIdx) => {
                              if (chunk.startsWith('[') && chunk.includes('](')) {
                                const splitIdx = chunk.indexOf('](')
                                const label = chunk.slice(1, splitIdx)
                                const url = chunk.slice(splitIdx + 2, -1)
                                return (
                                  <a
                                    key={cIdx}
                                    href={url}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      useAppStore.getState().openWebPreview(url, label)
                                    }}
                                    className="text-[#0071e3] hover:text-[#005bb5] underline font-medium cursor-pointer"
                                  >
                                    {label}
                                  </a>
                                )
                              }
                              if (chunk.startsWith('http://') || chunk.startsWith('https://')) {
                                return (
                                  <a
                                    key={cIdx}
                                    href={chunk}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      useAppStore.getState().openWebPreview(chunk)
                                    }}
                                    className="text-[#0071e3] hover:text-[#005bb5] underline font-medium cursor-pointer break-all"
                                  >
                                    {chunk}
                                  </a>
                                )
                              }
                              return chunk
                            })
                          })()}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        title="复制"
                        className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 p-1 text-[#86868b] hover:text-[#1d1d1f] transition-opacity"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-[#34C759]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 group">
                    {/* Assistant Reasoning Content via ClaudeThinkingBlock */}
                    {msg.reasoningContent && (
                      <ClaudeThinkingBlock
                        reasoningContent={msg.reasoningContent}
                        isStreaming={Boolean(isSideChatBusy && !msg.content && isLastAssistant)}
                      />
                    )}

                    {/* Assistant Answer Body */}
                    <div className="relative bg-[#FAFAFC] border border-black/[0.07] rounded-2xl rounded-tl-sm p-3.5 text-[13px] text-[#1d1d1f] shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
                      {msg.content ? (
                        <div>
                          <ClaudeTerminalOutput content={msg.content} />
                          {isSideChatBusy && isLastAssistant && (
                            <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-[#5856D6] animate-pulse rounded-sm" />
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[#86868b] font-mono text-[12px] py-1">
                          <ClaudeAsteriskGlyph active />
                          <span>侧边思考生成中…</span>
                        </div>
                      )}

                      {/* Action Bar */}
                      {msg.content && (
                        <div className="mt-2.5 pt-2 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-[#86868b]">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="apple-press flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-black/[0.05] hover:text-[#1d1d1f] transition-colors"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-[#34C759]" />
                                <span className="text-[#34C759]">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>复制回答</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleInsertIntoMain(msg.content)}
                            title="将这段代码/回答直接插入主任务输入框"
                            className="apple-press flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0071e3]/8 text-[#0071e3] hover:bg-[#0071e3]/15 transition-colors font-medium"
                          >
                            <ArrowLeftToLine className="w-3 h-3" />
                            <span>填入主输入框</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}

        {isSideChatBusy && sideChatMessages[sideChatMessages.length - 1]?.role !== 'assistant' && (
          <div className="flex items-center gap-2 text-[12px] text-[#86868b] font-mono pl-1">
            <ClaudeAsteriskGlyph active />
            <span>侧边临时助手思考中…</span>
          </div>
        )}

        {/* Floating Scroll to Bottom Button */}
        {isScrolledUp && (
          <div className="sticky bottom-1 flex justify-center pointer-events-none z-20">
            <button
              type="button"
              onClick={() => {
                isScrolledUpRef.current = false
                setIsScrolledUp(false)
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: 'smooth'
                })
              }}
              className="pointer-events-auto apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-black/[0.12] shadow-[0_4px_16px_rgba(0,0,0,0.12)] text-[11.5px] font-medium text-[#1d1d1f] hover:text-[#5856D6] transition-all"
            >
              <ChevronDown className="w-3.5 h-3.5 text-[#5856D6]" />
              <span>回到底部</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Footer Composer */}
      <div
        className="p-3 border-t border-black/[0.07] bg-white relative"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOver(false)
          if (e.dataTransfer.files?.length) {
            ingestFiles(e.dataTransfer.files)
          }
        }}
      >
        {/* Drag Over Drop Zone Banner */}
        {isDragOver && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-[#5856D6]/10 border border-dashed border-[#5856D6]/40 text-[11.5px] font-medium text-[#5856D6] flex items-center justify-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" />
            <span>松开鼠标附加图片或文件</span>
          </div>
        )}

        <div className="rounded-2xl border border-black/[0.12] focus-within:border-[#5856D6]/60 focus-within:shadow-[0_0_0_3px_rgba(88,86,214,0.12)] transition-all bg-[#FAFAFC] overflow-hidden flex flex-col">
          {/* Pending Attachments Strip */}
          {(pendingAttachments.length > 0 || isParsingAttachment) && (
            <div className="px-2.5 pt-2 pb-1 flex items-center gap-1.5 flex-wrap border-b border-black/[0.05]">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  onClick={() => openAttachmentPreview(att)}
                  onContextMenu={(e) => handleAttachmentContextMenu(e, att)}
                  title={`点击预览，右键可加入知识库 · ${att.name}`}
                  className="group relative flex items-center gap-1.5 pl-1.5 pr-6 py-1 rounded-xl bg-white border border-black/[0.08] hover:border-[#5856D6]/40 transition-all cursor-pointer max-w-[170px]"
                >
                  {att.kind === 'image' && att.previewDataUrl ? (
                    <img
                      src={att.previewDataUrl}
                      alt={att.name}
                      className="w-6 h-6 rounded-md object-cover shrink-0 border border-black/[0.05]"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center shrink-0">
                      {att.kind === 'excel' ? (
                        <FileSpreadsheet className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-[#1d1d1f] truncate">
                      {att.name}
                    </div>
                    <div className="text-[9px] text-[#86868b] truncate font-mono">
                      {att.summaryMeta || att.ext}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removePendingAttachment(att.id)
                    }}
                    title="移除附件"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-black/[0.06] hover:bg-black/[0.15] text-[#3a3a3c] flex items-center justify-center transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}

              {isParsingAttachment && (
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-black/[0.04] text-[10.5px] text-[#6e6e73]">
                  <Loader2 className="w-3 h-3 animate-spin text-[#5856D6]" />
                  <span>正在解析文件...</span>
                </div>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const files = e.clipboardData?.files
              if (files && files.length > 0) {
                e.preventDefault()
                ingestFiles(files)
              }
            }}
            rows={2}
            placeholder={
              isSideChatExpired
                ? '会话已过期，输入新问题按 Enter 重新开启...'
                : '提问代码片段、报错或速查 (Enter 发送 · 支持图片/文件拖入)...'
            }
            className="w-full bg-transparent px-3.5 pt-2.5 pb-1.5 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] resize-none outline-none leading-relaxed max-h-[180px] overflow-y-auto"
          />

          <div className="px-3 pb-2 pt-0.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10.5px] text-[#86868b]">
              <span className="font-mono">Enter 发送</span>
              <span>·</span>
              <span className="font-mono text-[#86868b]">⇧Enter 换行</span>
              <span>·</span>
              <span className="flex items-center gap-1 text-[#34C759] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] inline-block animate-pulse" />
                <span>已关联主对话</span>
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Paperclip attachment button */}
              <button
                type="button"
                onClick={handlePickAttachments}
                title="附加图片或文件 (支持图片、PDF、DOCX、代码等，也可截图粘贴/拖入)"
                disabled={isSideChatBusy || isParsingAttachment}
                className="apple-press p-1.5 rounded-lg text-[#86868b] hover:text-[#5856D6] hover:bg-black/[0.05] transition-colors disabled:opacity-40"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.jpj,.webp,.gif,.bmp,.svg,.pdf,.docx,.doc,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.txt,.md,.markdown,.json,.jsonl,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rs,.go,.c,.cpp,.h,.hpp,.java,.swift,.sh,.sql,.toml,.ini,.log,.env,.vue,.svelte"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) ingestFiles(e.target.files)
                  e.target.value = ''
                }}
              />

              {isSideChatBusy ? (
                <button
                  type="button"
                  onClick={abortSideChat}
                  title="中断侧边生成"
                  className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FF3B30]/10 text-[#C41E16] hover:bg-[#FF3B30]/20 text-[11px] font-medium transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>停止</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={
                    (!input.trim() && pendingAttachments.length === 0) || isParsingAttachment
                  }
                  title="发送"
                  className={`apple-press w-7 h-7 rounded-xl flex items-center justify-center transition-all ${
                    input.trim() || pendingAttachments.length > 0
                      ? 'bg-[#5856D6] hover:bg-[#4845B8] text-white shadow-sm'
                      : 'bg-black/[0.06] text-[#aeaeb2] cursor-not-allowed'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {attachmentContextMenu && (
        <AttachmentContextMenu
          x={attachmentContextMenu.x}
          y={attachmentContextMenu.y}
          attachment={attachmentContextMenu.attachment}
          onClose={() => setAttachmentContextMenu(null)}
          onAddToKnowledgeBase={(att) => importAttachmentToKnowledgeBase(att)}
          onPreview={(att) => openAttachmentPreview(att)}
        />
      )}
    </aside>
  )
}
