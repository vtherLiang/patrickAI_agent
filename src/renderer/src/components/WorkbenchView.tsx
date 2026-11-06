import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import {
  ArrowUp,
  Square,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Terminal,
  ShieldCheck,
  Blocks,
  Layers,
  GitBranch,
  GitFork,
  Check,
  Copy,
  RotateCcw,
  PanelRight,
  Paperclip,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  X,
  Loader2,
  MessageSquare,
  AtSign
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  AgentPermissionMode,
  AgentSkillItem,
  ChatAttachment,
  ChatMessage,
  RecalledMemoryItem
} from '@shared/types'
import { CodexSidebar } from './CodexSidebar'
import { SkillsHubView } from './SkillsHubView'
import { McpHubView } from './McpHubView'
import { KnowledgeBaseView } from './KnowledgeBaseView'
import { CodexRightInspector } from './CodexRightInspector'
import { CodexSideChatDrawer } from './CodexSideChatDrawer'
import { AttachmentContextMenu } from './AttachmentContextMenu'
import { isKnowledgeBaseCompatibleAttachment } from '../utils/attachmentUtils'
import {
  ClaudeLiveStatusRow,
  ClaudeMemoryCrystallizedBadge,
  ClaudeMemoryRecallBlock,
  ClaudeTerminalOutput,
  ClaudeTurnActivityGroup,
  PiClaudeBrandIcon,
  TurnActivityStep
} from './ClaudeActivityElements'

type AssistantTurnSegment =
  | { kind: 'activity'; id: string; steps: TurnActivityStep[] }
  | { kind: 'prose'; id: string; content: string }

interface AssistantTurnData {
  id: string
  lastMessageId: string
  isCompactedSummary: boolean
  recalledMemories: RecalledMemoryItem[]
  segments: AssistantTurnSegment[]
  crystallizedMemories: NonNullable<ChatMessage['crystallizedMemories']>
  interrupted?: boolean
}

interface TranscriptTurnGroup {
  id: string
  userTurn?: {
    id: string
    message: ChatMessage
  }
  assistantTurn?: AssistantTurnData
}

function buildTranscriptTurnGroups(allMessages: ChatMessage[]): TranscriptTurnGroup[] {
  const visible = allMessages.filter((m) => m.role !== 'tool')
  const groups: TranscriptTurnGroup[] = []
  let idx = 0

  const processAssistantMessages = (assistantMsgs: ChatMessage[]): AssistantTurnData => {
    const recalledMap = new Map<string, RecalledMemoryItem>()
    const crystallizedList: NonNullable<ChatMessage['crystallizedMemories']> = []
    let isCompactedSummary = false
    const allActivitySteps: TurnActivityStep[] = []
    const lastMsg = assistantMsgs[assistantMsgs.length - 1]
    let finalProse = ''

    for (let mIdx = 0; mIdx < assistantMsgs.length; mIdx++) {
      const m = assistantMsgs[mIdx]
      const isLast = mIdx === assistantMsgs.length - 1

      if (m.isCompactedSummary) isCompactedSummary = true
      if (m.recalledMemories) {
        for (const rm of m.recalledMemories) {
          if (!recalledMap.has(rm.id)) recalledMap.set(rm.id, rm)
        }
      }
      if (m.crystallizedMemories) {
        crystallizedList.push(...m.crystallizedMemories)
      }

      // 1. Thinking step
      if (m.reasoningContent || (m.isThinkingStreaming && !m.interrupted)) {
        allActivitySteps.push({
          kind: 'thinking',
          id: `th_${m.id}`,
          reasoningContent: m.reasoningContent || '',
          isStreaming: Boolean(m.isThinkingStreaming && !m.interrupted),
          durationMs: m.thinkingDurationMs,
          interrupted: Boolean(m.interrupted)
        })
      }

      // 2. Intermediate progress narration vs. Final answer prose
      // In Claude Code CLI & OpenAI Codex:
      // Any text generated during intermediate tool calls (like "我先尝试抓取...", "必应返回动态外壳...")
      // belongs to the intermediate execution logs and MUST be folded inside the activity block!
      // Only the final message's text (after tools are done) is the user-facing response prose.
      const contentTrimmed = (m.content || '').trim()
      const hasToolCalls = Boolean(m.toolCalls && m.toolCalls.length > 0)

      if (contentTrimmed) {
        // If it's an intermediate step followed by more turns, or purely short tool narration, fold into activity log.
        // But if it's the last message or contains substantial analysis content (> 120 chars or multiple lines),
        // ensure it surfaces as finalProse so the user never misses the core conclusions!
        const isSubstantialAnalysis =
          contentTrimmed.length > 120 ||
          contentTrimmed.includes('\n\n') ||
          contentTrimmed.startsWith('#') ||
          contentTrimmed.includes('核心结论') ||
          contentTrimmed.includes('关键要点')

        if (!isLast || (hasToolCalls && !isSubstantialAnalysis)) {
          allActivitySteps.push({
            kind: 'note',
            id: `note_${m.id}`,
            content: contentTrimmed
          })
        } else {
          finalProse = m.content
        }
      }

      // 3. Tool calls
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          allActivitySteps.push({
            kind: 'tool',
            id: `tc_${tc.id}`,
            toolCall: tc
          })
        }
      }
    }

    const segments: AssistantTurnSegment[] = []
    if (allActivitySteps.length > 0) {
      segments.push({
        kind: 'activity',
        id: `act_${assistantMsgs[0].id}`,
        steps: allActivitySteps
      })
    }
    if (finalProse.trim()) {
      segments.push({
        kind: 'prose',
        id: `prose_${lastMsg.id}`,
        content: finalProse
      })
    }

    return {
      id: `turn_${assistantMsgs[0].id}`,
      lastMessageId: lastMsg.id,
      isCompactedSummary,
      recalledMemories: Array.from(recalledMap.values()),
      segments,
      crystallizedMemories: crystallizedList,
      interrupted: assistantMsgs.some((m) => m.interrupted)
    }
  }

  while (idx < visible.length) {
    const current = visible[idx]
    if (current.role === 'user') {
      const userMsg = current
      idx++

      const assistantMsgs: ChatMessage[] = []
      while (idx < visible.length && visible[idx].role !== 'user') {
        assistantMsgs.push(visible[idx])
        idx++
      }

      groups.push({
        id: `group_${userMsg.id}`,
        userTurn: {
          id: userMsg.id,
          message: userMsg
        },
        assistantTurn: assistantMsgs.length > 0 ? processAssistantMessages(assistantMsgs) : undefined
      })
    } else {
      const assistantMsgs: ChatMessage[] = []
      while (idx < visible.length && visible[idx].role !== 'user') {
        assistantMsgs.push(visible[idx])
        idx++
      }
      if (assistantMsgs.length > 0) {
        groups.push({
          id: `group_ast_${assistantMsgs[0].id}`,
          assistantTurn: processAssistantMessages(assistantMsgs)
        })
      }
    }
  }

  return groups
}

interface StickyUserPromptCardProps {
  userTurn: { id: string; message: ChatMessage }
  scrollContainerRef: React.RefObject<HTMLDivElement>
  copiedMsgId: string | null
  setCopiedMsgId: (id: string | null) => void
  rollbackToMessage: (id?: string) => Promise<void>
  openAttachmentPreview: (att: ChatAttachment) => void
  onAttachmentContextMenu?: (e: React.MouseEvent, att: ChatAttachment) => void
  renderContent: (content: string) => React.ReactNode
}

const StickyUserPromptCard: React.FC<StickyUserPromptCardProps> = ({
  userTurn,
  scrollContainerRef,
  copiedMsgId,
  setCopiedMsgId,
  rollbackToMessage,
  openAttachmentPreview,
  onAttachmentContextMenu,
  renderContent
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isPinned, setIsPinned] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const msg = userTurn.message
  const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0)
  const rawContent = (msg.content || '').trim()

  const lines = useMemo(() => (rawContent ? rawContent.split('\n') : []), [rawContent])
  const isTextLong = lines.length > 3 || rawContent.length > 180

  const lastThreeLinesText = useMemo(() => {
    if (!rawContent) return ''
    if (lines.length > 3) {
      return lines.slice(-3).join('\n')
    }
    if (rawContent.length > 180) {
      return '...' + rawContent.slice(-140).trimStart()
    }
    return rawContent
  }, [rawContent, lines])

  useEffect(() => {
    const container = scrollContainerRef.current
    const sentinel = sentinelRef.current
    if (!container || !sentinel) return

    const checkPinned = () => {
      const sRect = sentinel.getBoundingClientRect()
      const cRect = container.getBoundingClientRect()
      // Sentinel reached the top boundary of the scroll view
      const pinned = sRect.top <= cRect.top + 6
      setIsPinned(pinned)
    }

    container.addEventListener('scroll', checkPinned, { passive: true })
    checkPinned()
    return () => container.removeEventListener('scroll', checkPinned)
  }, [scrollContainerRef])

  return (
    <>
      {/* 0-height sentinel placed above sticky header to detect exact pinning point */}
      <div ref={sentinelRef} className="h-0 w-full pointer-events-none -mb-px" />

      {/* Sticky pinned header with seamless progressive frosted-to-clear glass backdrop */}
      <div
        className={`sticky top-0 transition-all duration-200 relative ${
          isPinned ? 'z-20 pt-0 pb-1.5 -mt-1' : 'z-0 pt-1 pb-1'
        }`}
      >
        {/* Edge-free progressive frosted glass layers (fades smoothly to clear on bottom & sides) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-x-8 -top-2 -bottom-10 transition-opacity duration-300 ${
            isPinned ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className="absolute inset-0 backdrop-blur-md bg-gradient-to-b from-white/75 via-white/35 to-transparent"
            style={{
              WebkitMaskImage:
                'linear-gradient(to bottom, black 0%, black 38%, rgba(0,0,0,0.45) 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)',
              WebkitMaskComposite: 'source-in',
              maskImage:
                'linear-gradient(to bottom, black 0%, black 38%, rgba(0,0,0,0.45) 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)',
              maskComposite: 'intersect'
            }}
          />
          <div
            className="absolute inset-x-0 top-0 bottom-3 backdrop-blur-2xl bg-gradient-to-b from-white/95 via-white/70 to-transparent"
            style={{
              WebkitMaskImage:
                'linear-gradient(to bottom, black 0%, black 45%, rgba(0,0,0,0.5) 72%, transparent 100%), linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)',
              WebkitMaskComposite: 'source-in',
              maskImage:
                'linear-gradient(to bottom, black 0%, black 45%, rgba(0,0,0,0.5) 72%, transparent 100%), linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)',
              maskComposite: 'intersect'
            }}
          />
        </div>

        <div
          key={userTurn.id}
          className={`group animate-apple-view rounded-2xl bg-[#F5F5F7] border border-black/[0.05] transition-all relative z-10 flex items-start gap-2.5 ${
            isPinned ? 'px-3.5 py-1.5' : 'px-4 py-3'
          }`}
        >
          <span className="font-mono font-bold text-[#D97757] select-none text-[12.5px] mt-0.5 shrink-0">
            ❯
          </span>

          <div className="flex-1 min-w-0 space-y-1.5">
            {/* 1. Attachments: image thumbnails and document pills */}
            {hasAttachments && (
              <div className="flex items-center gap-2 flex-wrap">
                {msg.attachments!.map((att) =>
                  att.kind === 'image' && att.previewDataUrl ? (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => openAttachmentPreview(att)}
                      onContextMenu={(e) => onAttachmentContextMenu?.(e, att)}
                      title={`点击交互预览，右键可加入知识库 · ${att.name}`}
                      className={`apple-press group relative flex items-center gap-2 pr-2.5 rounded-xl bg-white border border-black/[0.08] hover:border-[#0071e3]/40 hover:bg-[#F2F7FF]/40 shadow-xs text-left transition-all cursor-pointer ${
                        isPinned ? 'p-1' : 'p-1.5'
                      }`}
                    >
                      <img
                        src={att.previewDataUrl}
                        alt={att.name}
                        className={`rounded-lg object-cover border border-black/[0.06] shrink-0 ${
                          isPinned ? 'w-8 h-8' : 'w-11 h-11'
                        }`}
                      />
                      <div className="min-w-0 max-w-[160px]">
                        <div className="text-[11.5px] font-semibold text-[#1d1d1f] group-hover:text-[#0071e3] truncate transition-colors">
                          {att.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#86868b]">
                          {att.summaryMeta || att.ext}
                        </div>
                      </div>
                    </button>
                  ) : (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => openAttachmentPreview(att)}
                      onContextMenu={(e) => onAttachmentContextMenu?.(e, att)}
                      title={`点击交互预览，右键可加入知识库 · ${att.name}`}
                      className={`apple-press group flex items-center gap-2 rounded-xl bg-white border border-black/[0.08] hover:border-[#0071e3]/40 hover:bg-[#F2F7FF]/40 shadow-xs text-left transition-all cursor-pointer ${
                        isPinned ? 'px-2.5 py-1' : 'px-3 py-2'
                      }`}
                    >
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-mono font-bold shrink-0 ${
                          att.kind === 'pdf'
                            ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                            : att.kind === 'docx'
                              ? 'bg-[#0071e3]/12 text-[#0071e3]'
                              : att.kind === 'excel'
                                ? 'bg-[#34C759]/15 text-[#177233]'
                                : 'bg-[#5856D6]/12 text-[#5856D6]'
                        }`}
                      >
                        {att.ext}
                      </span>
                      <div className="min-w-0 max-w-[180px]">
                        <div className="text-[11.5px] font-semibold text-[#1d1d1f] group-hover:text-[#0071e3] truncate transition-colors">
                          {att.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#86868b]">
                          {att.summaryMeta || att.ext}
                        </div>
                      </div>
                    </button>
                  )
                )}
              </div>
            )}

            {/* 2. Text Content Display Rules:
                - If pinned & hasAttachments: ONLY show images and documents, hide text!
                - If unpinned or no attachments: show text. If text is long, show the last 3 lines! */}
            {rawContent && (!isPinned || !hasAttachments) && (
              <div className="text-[13.5px] text-[#1d1d1f] font-medium whitespace-pre-wrap leading-relaxed">
                {isPinned ? (
                  <span>
                    {isTextLong && (
                      <span className="text-[10.5px] font-mono text-[#86868b] select-none mr-1">
                        ...[前文折叠]
                      </span>
                    )}
                    {renderContent(lastThreeLinesText)}
                  </span>
                ) : (
                  <span>
                    {isTextLong && !isExpanded && (
                      <span className="text-[10.5px] font-mono text-[#86868b] select-none mr-1">
                        ...[前文折叠]
                      </span>
                    )}
                    {renderContent(isExpanded || !isTextLong ? rawContent : lastThreeLinesText)}
                    {isTextLong && (
                      <button
                        type="button"
                        onClick={() => setIsExpanded((prev) => !prev)}
                        className="ml-2 text-[11px] text-[#0071e3] hover:underline font-normal inline-block select-none"
                      >
                        {isExpanded ? '收起' : `展开全文 (${lines.length}行)`}
                      </button>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* DeepSeek-style User Message Copy & Gemini Antigravity Rollback */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(rawContent || '')
                setCopiedMsgId(userTurn.id)
                setTimeout(() => setCopiedMsgId(null), 2000)
              }}
              title="复制发过的内容 (DeepSeek 风格)"
              className="p-1 rounded-md hover:bg-black/[0.08] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
            >
              {copiedMsgId === userTurn.id ? (
                <Check className="w-3.5 h-3.5 text-[#34C759]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => rollbackToMessage(userTurn.id)}
              title="回退并重新编辑此内容 (Gemini Antigravity 风格)"
              className="p-1 rounded-md hover:bg-black/[0.08] text-[#86868b] hover:text-[#0071e3] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const MODE_CONFIG: Record<
  AgentPermissionMode,
  {
    shortLabel: string
    title: string
    desc: string
    glyph: string
    pillClass: string
    composerRingClass: string
  }
> = {
  default: {
    shortLabel: 'Default · 默认审批',
    title: 'Default (默认安全审批)',
    desc: '只读工具自动执行，修改文件与运行终端命令前请求确认',
    glyph: '●',
    pillClass: 'bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1d1d1f] border-black/[0.07]',
    composerRingClass: 'focus-within:border-black/[0.20]'
  },
  acceptEdits: {
    shortLabel: 'Accept Edits · 自动编辑',
    title: 'Accept Edits (自动接受文件编辑)',
    desc: '自动放行代码写入与文件修改，仅对高危终端命令弹窗确认',
    glyph: '⏵',
    pillClass: 'bg-[#5856D6]/10 hover:bg-[#5856D6]/15 text-[#5856D6] border-[#5856D6]/25',
    composerRingClass: 'border-[#5856D6]/30 focus-within:border-[#5856D6]/50'
  },
  plan: {
    shortLabel: 'Plan Mode · 只读规划',
    title: 'Plan Mode (只读架构规划)',
    desc: '禁止修改任何文件，仅深入勘探代码并输出分步实施计划',
    glyph: '⏸',
    pillClass: 'bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] border-[#0071e3]/25',
    composerRingClass: 'border-[#0071e3]/35 focus-within:border-[#0071e3]/55'
  },
  bypassPermissions: {
    shortLabel: 'Bypass · 跳过所有审批',
    title: 'Bypass Permissions (全自动执行)',
    desc: '跳过所有文件编辑与终端命令确认 (--dangerously-skip-permissions)',
    glyph: '⏵⏵',
    pillClass: 'bg-[#D97757]/12 hover:bg-[#D97757]/18 text-[#C45533] border-[#D97757]/30',
    composerRingClass: 'border-[#D97757]/40 focus-within:border-[#D97757]/65'
  }
}

export const WorkbenchView: React.FC = () => {
  const {
    config,
    workbenchSubView,
    messages,
    draftComposerText,
    setDraftComposerText,
    draftComposerAttachments,
    setDraftComposerAttachments,
    isBusy,
    busyStartedAt,
    tokenStats,
    pendingApproval,
    terminalLogs,
    isInspectorOpen,
    setInspectorOpen,
    sendMessage,
    abortGeneration,
    resolveApproval,
    setActiveMode,
    startSwarm,
    setPermissionMode,
    cyclePermissionMode,
    createNewThread,
    addProjectFolder,
    isSideChatMode,
    toggleSideChatMode,
    isSideChatOpen,
    toggleSideChat,
    sideChatMessages,
    stageContentForDocEditor,
    branchThreadFromMessage,
    rollbackToMessage,
    openAttachmentPreview,
    openWebPreview,
    importAttachmentToKnowledgeBase,
    skills,
    activeThreadId,
    threadDrafts,
    setThreadDraft
  } = useAppStore()

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

  const [input, setInput] = useState(() => {
    const curId = useAppStore.getState().activeThreadId
    const initial = useAppStore.getState().threadDrafts[curId]
    return initial?.text || ''
  })
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>(() => {
    const curId = useAppStore.getState().activeThreadId
    const initial = useAppStore.getState().threadDrafts[curId]
    return initial?.attachments || []
  })
  const currentThreadIdRef = useRef(activeThreadId)
  const inputRef = useRef(input)
  inputRef.current = input
  const pendingAttachmentsRef = useRef(pendingAttachments)
  pendingAttachmentsRef.current = pendingAttachments
  const [isParsingAttachment, setIsParsingAttachment] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewImageModal, setPreviewImageModal] = useState<ChatAttachment | null>(null)
  const [dispatchToSwarm, setDispatchToSwarm] = useState(false)
  const [rememberSessionApproval, setRememberSessionApproval] = useState(false)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)

  // @Skill Mention & Selection Menu State
  const [showSkillMenu, setShowSkillMenu] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [skillMentionStartIndex, setSkillMentionStartIndex] = useState<number>(-1)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)
  const skillMenuRef = useRef<HTMLDivElement>(null)

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'security':
        return { icon: '🛡️', label: '安全逆向', bg: 'bg-[#D97757]/10 text-[#C45533]' }
      case 'low-level':
        return { icon: '⚙️', label: '系统底层', bg: 'bg-[#0071e3]/10 text-[#0071e3]' }
      case 'architecture':
        return { icon: '🏗️', label: '架构设计', bg: 'bg-[#5856D6]/10 text-[#5856D6]' }
      case 'workflow':
        return { icon: '🔄', label: '工作流', bg: 'bg-emerald-500/10 text-emerald-600' }
      case 'testing':
        return { icon: '🧪', label: '质量测试', bg: 'bg-amber-500/10 text-amber-600' }
      default:
        return { icon: '🧩', label: '专属技能', bg: 'bg-black/[0.05] text-[#6e6e73]' }
    }
  }

  // Filtered skills list based on query behind @
  const filteredSkills = useMemo(() => {
    if (!skills || skills.length === 0) return []
    const q = skillQuery.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.triggers.some((t) => t.toLowerCase().includes(q))
    )
  }, [skills, skillQuery])

  // Extract skills explicitly locked/mentioned in current input text
  const detectedMentionedSkills = useMemo(() => {
    if (!skills || skills.length === 0 || !input.includes('@')) return []
    return skills.filter((s) => {
      const escName = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escId = s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`@(?:${escName}|${escId})(?=$|[\\s,，。！？!?;；:：\\]\\)\\}])`, 'i')
      return pattern.test(input)
    })
  }, [skills, input])

  // Check if cursor is currently placed right after @... to open or filter the skills menu
  const checkSkillMention = (text: string, cursorPos: number) => {
    const textBefore = text.slice(0, cursorPos)
    const atIdx = textBefore.lastIndexOf('@')
    if (atIdx === -1) {
      setShowSkillMenu(false)
      return
    }

    const isAtValid = atIdx === 0 || /[\s\n([{\]}:：,，.。!！?？]/.test(textBefore[atIdx - 1])
    const between = textBefore.slice(atIdx + 1)

    // Close menu if user broke onto a new line
    if (!isAtValid || between.includes('\n')) {
      setShowSkillMenu(false)
      return
    }

    setShowSkillMenu(true)
    setSkillQuery(between)
    setSkillMentionStartIndex(atIdx)
    setSelectedSkillIndex(0)
  }

  // Replace `@query` with `@SkillName ` in textarea
  const insertSkill = (skill: AgentSkillItem) => {
    const start = skillMentionStartIndex >= 0 ? skillMentionStartIndex : (composerRef.current?.selectionStart ?? input.length)
    const currentCursor = composerRef.current?.selectionStart ?? input.length
    const replacement = `@${skill.name} `
    const before = input.slice(0, start)
    const after = input.slice(Math.max(start, currentCursor))
    const updated = before + replacement + after

    setInput(updated)
    inputRef.current = updated
    setThreadDraft(activeThreadId, {
      text: updated,
      attachments: pendingAttachmentsRef.current
    })
    setShowSkillMenu(false)

    const nextPos = start + replacement.length
    setTimeout(() => {
      if (composerRef.current) {
        composerRef.current.focus()
        composerRef.current.setSelectionRange(nextPos, nextPos)
      }
    }, 20)
  }

  // Remove skill mention from composer input
  const removeSkillMention = (skill: AgentSkillItem) => {
    const escName = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escId = skill.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`@(?:${escName}|${escId})\\s?`, 'gi')
    setInput((prev) => {
      const updated = prev.replace(pattern, '').trim()
      inputRef.current = updated
      setThreadDraft(activeThreadId, {
        text: updated,
        attachments: pendingAttachmentsRef.current
      })
      return updated
    })
  }

  // Click handler for bottom "@技能" button
  const handleTriggerAtSign = () => {
    if (!composerRef.current) return
    const pos = composerRef.current.selectionStart || input.length
    const before = input.slice(0, pos)
    const after = input.slice(pos)
    const updated = before + '@' + after
    setInput(updated)
    inputRef.current = updated
    setThreadDraft(activeThreadId, {
      text: updated,
      attachments: pendingAttachmentsRef.current
    })
    setTimeout(() => {
      if (composerRef.current) {
        composerRef.current.focus()
        composerRef.current.setSelectionRange(pos + 1, pos + 1)
        checkSkillMention(updated, pos + 1)
      }
    }, 20)
  }

  // Render user message text highlighting @SkillName mentions and clickable blue hyperlinks
  const renderMessageContentWithSkillMentions = (content: string) => {
    if (!content) return content

    // Tokenize for links (both [title](url) and bare https?://...)
    const linkRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>'")]+)/g
    const chunks = content.split(linkRegex)

    return chunks.map((chunk, chunkIdx) => {
      if (chunk.startsWith('[') && chunk.includes('](')) {
        const splitIdx = chunk.indexOf('](')
        const label = chunk.slice(1, splitIdx)
        const url = chunk.slice(splitIdx + 2, -1)
        return (
          <a
            key={`mdl_${chunkIdx}`}
            href={url}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openWebPreview(url, label)
            }}
            className="text-[#0071e3] hover:text-[#005bb5] underline decoration-[#0071e3]/40 underline-offset-2 hover:decoration-[#0071e3] font-medium cursor-pointer transition-colors"
            title={`在侧边浏览区交互打开: ${url}`}
          >
            {label}
          </a>
        )
      }
      if (chunk.startsWith('http://') || chunk.startsWith('https://')) {
        return (
          <a
            key={`url_${chunkIdx}`}
            href={chunk}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openWebPreview(chunk)
            }}
            className="text-[#0071e3] hover:text-[#005bb5] underline decoration-[#0071e3]/40 underline-offset-2 hover:decoration-[#0071e3] font-medium cursor-pointer transition-colors break-all"
            title={`在侧边浏览区交互打开: ${chunk}`}
          >
            {chunk}
          </a>
        )
      }

      // Check skill mentions in text
      if (!skills || skills.length === 0 || !chunk.includes('@')) {
        return <React.Fragment key={chunkIdx}>{chunk}</React.Fragment>
      }

      const matchedSkills = skills.filter((s) => {
        const escName = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const escId = s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`@(?:${escName}|${escId})(?=$|[\\s,，。！？!?;；:：\\]\\)\\}])`, 'i')
        return pattern.test(chunk)
      })

      if (matchedSkills.length === 0) return <React.Fragment key={chunkIdx}>{chunk}</React.Fragment>

      const terms = matchedSkills.flatMap((s) => [s.name, s.id].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      const unionRegex = new RegExp(`(@(?:${terms.join('|')}))(?=$|[\\s,，。！？!?;；:：\\]\\)\\}])`, 'gi')
      const parts = chunk.split(unionRegex)

      return (
        <React.Fragment key={chunkIdx}>
          {parts.map((part, i) => {
            if (part.startsWith('@')) {
              const nameOrId = part.slice(1).toLowerCase()
              const found = matchedSkills.find(
                (s) => s.name.toLowerCase() === nameOrId || s.id.toLowerCase() === nameOrId
              )
              if (found) {
                const meta = getCategoryBadge(found.category)
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#5856D6]/10 text-[#5856D6] font-semibold text-[13px] border border-[#5856D6]/20 mx-0.5 align-baseline"
                    title={`已指定使用的技能: ${found.name} (${found.summary})`}
                  >
                    <span>{meta.icon}</span>
                    <span>@{found.name}</span>
                  </span>
                )
              }
            }
            return <React.Fragment key={i}>{part}</React.Fragment>
          })}
        </React.Fragment>
      )
    })
  }

  // Close skill mention menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        skillMenuRef.current &&
        !skillMenuRef.current.contains(e.target as Node) &&
        composerRef.current &&
        !composerRef.current.contains(e.target as Node)
      ) {
        setShowSkillMenu(false)
      }
    }
    if (showSkillMenu) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [showSkillMenu])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeGeneratingRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isScrolledUp, setIsScrolledUp] = useState(false)
  const isScrolledUpRef = useRef(false)

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const up = distanceFromBottom > 80
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

  const scrollToActiveResponse = useCallback(() => {
    isScrolledUpRef.current = false
    setIsScrolledUp(false)
    if (isBusy && activeGeneratingRef.current) {
      activeGeneratingRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isBusy])

  const currentMode: AgentPermissionMode = config?.permissionMode || 'default'
  const activeModeMeta = MODE_CONFIG[currentMode]

  // Isolate & preserve uncommitted draft per thread on thread switch
  useLayoutEffect(() => {
    const prevThreadId = currentThreadIdRef.current
    if (prevThreadId !== activeThreadId) {
      // 1. Save previous thread draft before leaving
      setThreadDraft(prevThreadId, {
        text: inputRef.current,
        attachments: pendingAttachmentsRef.current
      })

      // 2. Load target thread draft
      const targetDraft = useAppStore.getState().threadDrafts[activeThreadId] || {
        text: '',
        attachments: []
      }
      setInput(targetDraft.text || '')
      setPendingAttachments(targetDraft.attachments || [])
      inputRef.current = targetDraft.text || ''
      pendingAttachmentsRef.current = targetDraft.attachments || []

      // 3. Update ref to active thread
      currentThreadIdRef.current = activeThreadId

      setTimeout(() => composerRef.current?.focus(), 60)
    }
  }, [activeThreadId, setThreadDraft])

  // Save current draft on unmount
  useEffect(() => {
    return () => {
      setThreadDraft(currentThreadIdRef.current, {
        text: inputRef.current,
        attachments: pendingAttachmentsRef.current
      })
    }
  }, [setThreadDraft])

  // Sync draftComposerText & draftComposerAttachments injected from SkillsHub / McpHub / Right File Inspector / Rollback
  useEffect(() => {
    const hasText = Boolean(draftComposerText)
    const hasAttachmentUpdate = draftComposerAttachments !== null

    if (hasText || hasAttachmentUpdate) {
      const nextText = hasText ? draftComposerText : hasAttachmentUpdate ? '' : inputRef.current
      const nextAttachments = hasAttachmentUpdate
        ? (draftComposerAttachments || [])
        : pendingAttachmentsRef.current

      if (hasText) {
        setInput(draftComposerText)
        inputRef.current = draftComposerText
        setDraftComposerText('')
      } else if (hasAttachmentUpdate) {
        setInput('')
        inputRef.current = ''
      }

      if (hasAttachmentUpdate) {
        setPendingAttachments(draftComposerAttachments || [])
        pendingAttachmentsRef.current = draftComposerAttachments || []
        setDraftComposerAttachments(null)
      }

      setThreadDraft(activeThreadId, {
        text: nextText,
        attachments: nextAttachments
      })

      setTimeout(() => composerRef.current?.focus(), 60)
    }
  }, [
    draftComposerText,
    draftComposerAttachments,
    setDraftComposerText,
    setDraftComposerAttachments,
    activeThreadId,
    setThreadDraft
  ])

  useEffect(() => {
    // If the user has scrolled up, do not force them back down
    if (isScrolledUpRef.current) return
    const el = scrollContainerRef.current
    if (!el) return

    if (isBusy) {
      el.scrollTop = el.scrollHeight
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, pendingApproval, isBusy])

  // Reset scroll-up lock on thread change
  useEffect(() => {
    isScrolledUpRef.current = false
    setIsScrolledUp(false)
    chatEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [activeThreadId])

  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false)
      }
    }
    if (modeMenuOpen) window.addEventListener('mousedown', onDocClick)
    return () => window.removeEventListener('mousedown', onDocClick)
  }, [modeMenuOpen])

  // Global keyboard shortcuts matching OpenAI Codex & Claude Code (`Esc`, `⌘N`, `⌘O`)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isBusy) {
        abortGeneration()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        // Only trigger new chat thread when on chat view to prevent interrupting document reading
        if (workbenchSubView === 'chat') {
          e.preventDefault()
          createNewThread()
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        if (workbenchSubView === 'chat') {
          e.preventDefault()
          addProjectFolder()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isBusy, abortGeneration, createNewThread, addProjectFolder, workbenchSubView])

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
          window.claudeDesktop.getPathForFile?.(file) ||
          (file as File & { path?: string }).path ||
          ''
        if (nativePath) {
          nativePaths.push(nativePath)
        } else {
          blobFiles.push(file)
        }
      }

      const added: ChatAttachment[] = []
      if (nativePaths.length > 0) {
        const parsedFromPaths = await window.claudeDesktop.parseAttachmentPaths(nativePaths)
        added.push(...parsedFromPaths)
      }

      for (const blob of blobFiles) {
        const dataBase64 = await readFileAsDataUrl(blob)
        const parsed = await window.claudeDesktop.parseDataAttachment({
          name: blob.name || `clipboard_${Date.now()}.png`,
          mimeType: blob.type,
          dataBase64
        })
        if (parsed) added.push(parsed)
      }

      if (added.length > 0) {
        setPendingAttachments((prev) => {
          const next = [...prev, ...added]
          pendingAttachmentsRef.current = next
          setThreadDraft(activeThreadId, {
            text: inputRef.current,
            attachments: next
          })
          return next
        })
      }
    } finally {
      setIsParsingAttachment(false)
    }
  }

  const handlePickAttachments = async (): Promise<void> => {
    setIsParsingAttachment(true)
    try {
      const picked = await window.claudeDesktop.pickAttachments()
      if (picked && picked.length > 0) {
        setPendingAttachments((prev) => {
          const next = [...prev, ...picked]
          pendingAttachmentsRef.current = next
          setThreadDraft(activeThreadId, {
            text: inputRef.current,
            attachments: next
          })
          return next
        })
        return
      }
      // Browser fallback mode when native Electron dialog is absent
      if (!window.claudeDesktop.getPathForFile) {
        fileInputRef.current?.click()
      }
    } finally {
      setIsParsingAttachment(false)
    }
  }

  const removePendingAttachment = (id: string): void => {
    setPendingAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id)
      pendingAttachmentsRef.current = next
      setThreadDraft(activeThreadId, {
        text: inputRef.current,
        attachments: next
      })
      return next
    })
  }

  const handleSubmit = async (): Promise<void> => {
    const text = input.trim()
    if ((!text && pendingAttachments.length === 0) || isBusy || isParsingAttachment) return
    const atts = [...pendingAttachments]
    setInput('')
    setPendingAttachments([])
    inputRef.current = ''
    pendingAttachmentsRef.current = []
    setThreadDraft(activeThreadId, { text: '', attachments: [] })

    isScrolledUpRef.current = false
    setIsScrolledUp(false)
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 40)

    if (dispatchToSwarm) {
      setDispatchToSwarm(false)
      setActiveMode('coordinator')
      const swarmGoal =
        atts.length > 0
          ? `${text || '请分析以下附件并并行处理'}\n\n${atts
              .map((a) => `[附件 ${a.name} (${a.ext})]:\n${(a.extractedText || '').slice(0, 6000)}`)
              .join('\n\n')}`
          : text
      await startSwarm(swarmGoal, true)
    } else {
      await sendMessage(text, atts)
    }
  }

  const bentoCards = [
    {
      icon: Blocks,
      accent: 'text-[#D97757] bg-[#D97757]/12',
      title: '对话内自动装载 Skill',
      desc: '直接告诉智能体你想装载的 GitHub 技能或定制能力，实时同步到左侧 Skills 页面。',
      prompt:
        '请参考 low-level-dev-skills 规范，帮我创建并装载一个「C++/Rust 二进制崩溃栈与 CoreDump 诊断」Skill，包含详细原理解释与 2 个使用示例。'
    },
    {
      icon: Layers,
      accent: 'text-[#0071e3] bg-[#0071e3]/10',
      title: 'L1–L5 分层记忆检索与自动结晶',
      desc: '每次对话自动回调相关分层记忆，并在回复完成后后台无感结晶新认知。',
      isPlanDemo: true,
      prompt: '结合你召回的项目核心架构记忆与 reverse-engineering 技能，规划一套本地二进制安全巡检流程'
    },
    {
      icon: GitBranch,
      accent: 'text-[#28CD41] bg-[#34C759]/12',
      title: '启动多智能体集群',
      desc: '拆解 DAG 子任务，在隔离的 Git Worktree 分支并行推进。',
      isSwarm: true,
      prompt: '全面审查当前项目的引擎层与 UI 组件，输出性能优化与测试覆盖方案'
    }
  ]

  return (
    <div className="flex-1 flex overflow-hidden bg-white">
      {/* Left: Full OpenAI Codex Multi-Project Sidebar + Skills & MCP Navigation */}
      <CodexSidebar />

      {/* Center Stage: Switches cleanly between Chat Thread, Skills Hub, MCP Hub, and Knowledge Base */}
      {workbenchSubView === 'skills' ? (
        <SkillsHubView />
      ) : workbenchSubView === 'mcp' ? (
        <McpHubView />
      ) : workbenchSubView === 'knowledge-base' ? (
        <KnowledgeBaseView />
      ) : (
        <div className="flex-1 flex flex-col min-w-0 relative bg-white">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onWheel={handleWheel}
            className="flex-1 overflow-y-auto px-6 pt-2 pb-52 isolate relative z-0"
          >
            <div className="max-w-3xl mx-auto w-full">
              {messages.length === 0 ? (
                <div className="pt-10 pb-8 flex flex-col items-center text-center">
                  <PiClaudeBrandIcon className="w-16 h-16 mb-4 drop-shadow-[0_6px_18px_rgba(109,40,217,0.12)]" />

                  <h1 className="text-[34px] sm:text-[40px] font-semibold tracking-tight apple-hero-text leading-[1.15] mb-3">
                    灵感就位，即刻构建。
                  </h1>
                  <p className="text-[14px] text-[#6e6e73] max-w-lg leading-relaxed mb-10">
                    每次提问自动检索 <span className="text-[#1d1d1f] font-medium">L1–L5 分层记忆</span> 并后台自动结晶；按{' '}
                    <kbd className="px-1.5 py-0.5 text-[11px] font-mono rounded-md bg-[#F5F5F7] text-[#1d1d1f] border border-black/[0.08]">
                      ⇧Tab
                    </kbd>{' '}
                    切换 <span className="text-[#1d1d1f] font-medium">Plan / Bypass</span> 模式，或按{' '}
                    <kbd className="px-1.5 py-0.5 text-[11px] font-mono rounded-md bg-[#F5F5F7] text-[#1d1d1f] border border-black/[0.08]">
                      ⌘O
                    </kbd>{' '}
                    添加新项目文件夹。
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full text-left">
                    {bentoCards.map((card, idx) => {
                      const Icon = card.icon
                      return (
                        <button
                          key={idx}
                          onClick={async () => {
                            isScrolledUpRef.current = false
                            setIsScrolledUp(false)
                            if (card.isSwarm) {
                              setActiveMode('coordinator')
                              await startSwarm(card.prompt, true)
                            } else {
                              if (card.isPlanDemo) {
                                await setPermissionMode('plan')
                              }
                              await sendMessage(card.prompt)
                            }
                          }}
                          className="apple-bento apple-bento-interactive apple-press rounded-3xl p-5 flex flex-col justify-between h-44 group text-left"
                        >
                          <div
                            className={`w-9 h-9 rounded-2xl flex items-center justify-center ${card.accent}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1 flex items-center justify-between">
                              <span>{card.title}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#aeaeb2] group-hover:text-[#1d1d1f] group-hover:translate-x-0.5 transition-all" />
                            </div>
                            <p className="text-[12px] text-[#6e6e73] leading-relaxed line-clamp-2">
                              {card.desc}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* Authentic Claude Code CLI Transcript Layout with Gemini Antigravity Sticky Questions */
                <div className="space-y-6">
                  {buildTranscriptTurnGroups(messages).map((group) => {
                    const userTurn = group.userTurn
                    const ast = group.assistantTurn

                    return (
                      <div key={group.id} className="relative turn-group space-y-3 pb-2">
                        {userTurn && (
                          <StickyUserPromptCard
                            userTurn={userTurn}
                            scrollContainerRef={scrollContainerRef}
                            copiedMsgId={copiedMsgId}
                            setCopiedMsgId={setCopiedMsgId}
                            rollbackToMessage={rollbackToMessage}
                            openAttachmentPreview={openAttachmentPreview}
                            onAttachmentContextMenu={handleAttachmentContextMenu}
                            renderContent={renderMessageContentWithSkillMentions}
                          />
                        )}

                        {ast && (
                          <div key={ast.id} className="animate-apple-view space-y-2.5 pl-1">
                            {ast.isCompactedSummary && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF9500]/12 border border-[#FF9500]/25 text-[11px] text-[#C96A00] font-medium">
                                <Sparkles className="w-3 h-3" />
                                <span>AutoCompact 已自动浓缩早期历史上下文</span>
                              </div>
                            )}

                            {/* 0. Automatic L1-L5 Hierarchical Memory Recall Callback */}
                            {ast.recalledMemories.length > 0 && (
                              <ClaudeMemoryRecallBlock
                                memories={ast.recalledMemories}
                                onInspectLayerCenter={() => setActiveMode('kairos')}
                              />
                            )}

                            {/* 1 & 2. Chronological Folded Activity Summaries (`Thinking` + `Bash` + `Write` + `Update` + `Read` + `Search`) & `●` Terminal Prose */}
                            {ast.segments.map((seg) =>
                              seg.kind === 'activity' ? (
                                <ClaudeTurnActivityGroup
                                  key={seg.id}
                                  steps={seg.steps}
                                  onInterrupt={abortGeneration}
                                  defaultExpanded={false}
                                />
                              ) : (
                                <div key={seg.id} className="flex items-start gap-2 pt-0.5">
                                  <span className="w-4 text-center font-mono text-[11px] text-[#1d1d1f] select-none mt-1.5 shrink-0">
                                    ●
                                  </span>
                                  <ClaudeTerminalOutput content={seg.content} />
                                </div>
                              )
                            )}

                            {ast.segments.every((s) => s.kind !== 'prose') && (!isBusy || ast.interrupted) && (
                              <div className="flex flex-col gap-1.5 pt-1 pl-1 text-[13px] text-[#6e6e73] font-sans">
                                <div className="flex items-center gap-2">
                                  <span className="w-4 text-center font-mono text-[11px] text-[#1d1d1f] select-none shrink-0">
                                    ●
                                  </span>
                                  <span>
                                    {ast.interrupted
                                      ? '已停止思考（可展开上方步骤查看已生成的思考轨迹）。'
                                      : '已完成对文件的检索与解析（可展开上方步骤查看执行详情）。'}
                                  </span>
                                </div>
                                {!ast.interrupted && (
                                  <div className="pl-6">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        sendMessage(
                                          '请根据上述步骤获取到的全部文档事实与调研结果，直接向我交付核心结论与关键要点分析报告。'
                                        )
                                      }
                                      className="apple-press inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0071e3]/10 hover:bg-[#0071e3]/18 text-[#0071e3] text-[12px] font-medium transition-colors"
                                    >
                                      <span>⚡️ 提炼输出核心结论与要点</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 3. Non-Blocking Automatic Post-Turn Memory Crystallization Pill */}
                            {ast.crystallizedMemories.length > 0 && (
                              <ClaudeMemoryCrystallizedBadge
                                items={ast.crystallizedMemories}
                                onOpenMemoryCenter={() => setActiveMode('kairos')}
                              />
                            )}

                            {/* 4. Codex Turn Action Bar: Branch Thread, Copy Response, Send to Doc Editor */}
                            {!isBusy && (
                              <div className="flex items-center gap-2 pt-1 pl-6 text-[11.5px] text-[#86868b]">
                                {/* Codex Branch Conversation Action */}
                                <button
                                  type="button"
                                  onClick={() => branchThreadFromMessage(ast.lastMessageId || ast.id)}
                                  title="参考 Codex：从当前节点分支出新对话，保留此前全部上下文"
                                  className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-black/[0.05] text-[#6e6e73] hover:text-[#0071e3] transition-colors"
                                >
                                  <GitFork className="w-3.5 h-3.5" />
                                  <span>对话分支</span>
                                </button>

                                {/* Copy Returned Result Action (Codex style) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fullProse = ast.segments
                                      .filter((s) => s.kind === 'prose')
                                      .map((s) => s.content)
                                      .join('\n\n')
                                    navigator.clipboard.writeText(fullProse || '')
                                    setCopiedMsgId(ast.id)
                                    setTimeout(() => setCopiedMsgId(null), 2000)
                                  }}
                                  title="复制返回的结果 (参考 Codex)"
                                  className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-black/[0.05] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
                                >
                                  {copiedMsgId === ast.id ? (
                                    <Check className="w-3.5 h-3.5 text-[#34C759]" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>{copiedMsgId === ast.id ? '已复制' : '复制结果'}</span>
                                </button>

                                {/* Send to AI Doc Editor Workspace */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fullProse = ast.segments
                                      .filter((s) => s.kind === 'prose')
                                      .map((s) => s.content)
                                      .join('\n\n')
                                      .trim()
                                    const fallbackNotes = ast.segments
                                      .filter((s) => s.kind === 'activity')
                                      .flatMap((s) =>
                                        s.steps
                                          .filter((st) => st.kind === 'note')
                                          .map((st) => st.content)
                                      )
                                      .join('\n\n')
                                      .trim()
                                    stageContentForDocEditor(fullProse || fallbackNotes || '')
                                  }}
                                  title="发送到文本排版区新建标签页精修，并准备分发至飞书/Word/PDF"
                                  className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-black/[0.05] text-[#6e6e73] hover:text-[#5856D6] transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#5856D6]" />
                                  <span>转存精修</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {isBusy && !pendingApproval && (
                    <div className="pl-1 pt-1" ref={activeGeneratingRef}>
                      <ClaudeLiveStatusRow
                        startedAt={busyStartedAt}
                        tokenCount={tokenStats.currentTokens}
                        onInterrupt={abortGeneration}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Approval Dialog (Preserved intact as requested) */}
              {pendingApproval && (
                <div className="animate-apple-modal mt-6 rounded-3xl apple-glass p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-2xl bg-[#FF9500]/15 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-[#FF9500]" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-[#1d1d1f]">
                          请求执行{' '}
                          <span className="font-mono text-[#D97757]">{pendingApproval.name}</span>
                        </div>
                        <div className="text-[11px] text-[#6e6e73]">
                          请确认以下变更或终端指令是否安全
                        </div>
                      </div>
                    </div>
                  </div>

                  {pendingApproval.commandPreview && (
                    <div className="my-3 px-3.5 py-2.5 rounded-2xl bg-[#F5F5F7] border border-black/[0.07] font-mono text-[12px] text-[#177233]">
                      $ {pendingApproval.commandPreview}
                    </div>
                  )}

                  {pendingApproval.diffPreview && (
                    <div className="my-3 p-3 rounded-2xl bg-[#F9F9FB] border border-black/[0.07] font-mono text-[11px] max-h-48 overflow-y-auto">
                      <div className="text-[#86868b] mb-1.5 text-[10px]">
                        {pendingApproval.diffPreview.filePath}
                      </div>
                      {pendingApproval.diffPreview.unifiedDiff.split('\n').map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.startsWith('+ ')
                              ? 'text-[#177233] bg-[#34C759]/15 px-1.5'
                              : line.startsWith('- ')
                                ? 'text-[#C41E16] bg-[#FF3B30]/12 px-1.5'
                                : 'text-[#6e6e73] px-1.5'
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[12px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rememberSessionApproval}
                        data-checked={rememberSessionApproval}
                        onClick={() => setRememberSessionApproval((v) => !v)}
                        className="apple-switch"
                      >
                        <span className="apple-switch-thumb" />
                      </button>
                      <span>本会话免确认</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => resolveApproval(pendingApproval.id, 'reject')}
                        className="apple-press px-4 py-1.5 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[12px] font-medium text-[#1d1d1f]"
                      >
                        拒绝
                      </button>
                      <button
                        onClick={() =>
                          resolveApproval(
                            pendingApproval.id,
                            rememberSessionApproval ? 'approve_session' : 'approve_once'
                          )
                        }
                        className="apple-press px-5 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ED] text-[12px] font-semibold text-white flex items-center gap-1.5 shadow-[0_4px_14px_rgba(0,113,227,0.3)]"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>允许</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Floating Daylight Composer Capsule with Multi-Format File Support & Integrated Mode Switcher */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-6 pb-5 pt-10 bg-gradient-to-t from-white via-white/95 to-transparent">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.jpj,.webp,.gif,.bmp,.svg,.pdf,.docx,.doc,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.txt,.md,.markdown,.json,.jsonl,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rs,.go,.c,.cpp,.h,.hpp,.java,.swift,.sh,.sql,.toml,.ini,.log,.env,.vue,.svelte"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  ingestFiles(e.target.files)
                  e.target.value = ''
                }
              }}
              className="hidden"
            />

            {/* Jump-to-Active Indicator when Scrolled Up during Generation */}
            {isBusy && isScrolledUp && (
              <div className="pointer-events-auto max-w-3xl mx-auto mb-2.5 flex justify-center animate-apple-view">
                <button
                  type="button"
                  onClick={scrollToActiveResponse}
                  title="点击快速回到正在回答的那一行"
                  className="apple-press group flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/95 backdrop-blur-xl border border-[#0071e3]/30 shadow-[0_4px_16px_rgba(0,113,227,0.15)] hover:shadow-[0_6px_22px_rgba(0,113,227,0.22)] hover:border-[#0071e3]/60 transition-all cursor-pointer text-[#1d1d1f]"
                >
                  <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0071e3] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0071e3]" />
                  </span>
                  <span className="text-[12px] font-medium text-[#1d1d1f]">
                    Claude 正在回答中...
                  </span>
                  <span className="text-[11.5px] text-[#0071e3] font-semibold flex items-center gap-0.5 group-hover:translate-y-0.5 transition-transform">
                    <span>回到正在回答的那一行</span>
                    <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
                  </span>
                </button>
              </div>
            )}

            {!isBusy && isScrolledUp && messages.length > 0 && (
              <div className="pointer-events-auto max-w-3xl mx-auto mb-2 flex justify-center animate-apple-view">
                <button
                  type="button"
                  onClick={scrollToActiveResponse}
                  title="点击回到对话底部"
                  className="apple-press group flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 backdrop-blur-xl border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.06)] hover:border-[#0071e3]/30 hover:shadow-[0_4px_14px_rgba(0,0,0,0.1)] text-[11.5px] text-[#6e6e73] hover:text-[#1d1d1f] transition-all cursor-pointer"
                >
                  <span>回到底部</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#86868b] group-hover:text-[#0071e3] group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!isDragOver) setIsDragOver(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragOver(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragOver(false)
                if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                  ingestFiles(e.dataTransfer.files)
                }
              }}
              className={`pointer-events-auto max-w-3xl mx-auto apple-glass bg-white/95 backdrop-blur-2xl rounded-[26px] p-2.5 transition-all duration-300 relative shadow-[0_8px_32px_rgba(0,0,0,0.08)] ${
                isDragOver
                  ? 'border-[#0071e3] ring-2 ring-[#0071e3]/20 bg-[#0071e3]/[0.03]'
                  : activeModeMeta.composerRingClass
              }`}
            >
              {/* @Skill Mention Autocomplete Popover List */}
              {showSkillMenu && (
                <div
                  ref={skillMenuRef}
                  className="absolute bottom-full left-0 mb-3 w-full max-w-[500px] bg-white/95 backdrop-blur-2xl rounded-2xl border border-black/[0.12] shadow-[0_16px_48px_rgba(0,0,0,0.16)] overflow-hidden z-50 animate-apple-view"
                  style={{ maxHeight: '340px' }}
                >
                  {/* Popover Header */}
                  <div className="flex items-center justify-between px-3.5 py-2 border-b border-black/[0.06] bg-[#F5F5F7]/80">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                      <Sparkles className="w-3.5 h-3.5 text-[#5856D6]" />
                      <span>选择调用的 Skill 技能</span>
                      {skillQuery && (
                        <span className="text-[11px] font-normal text-[#86868b]">
                          (匹配: &quot;{skillQuery}&quot;)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#86868b]">
                      <span>↑↓ 导航</span>
                      <span>↵ / Tab 选中</span>
                      <span>ESC 关闭</span>
                    </div>
                  </div>

                  {/* Skills List */}
                  <div className="overflow-y-auto max-h-[275px] p-1.5 space-y-1">
                    {filteredSkills.length === 0 ? (
                      <div className="py-7 text-center text-[12px] text-[#86868b] space-y-1">
                        <div>没有找到匹配 &quot;{skillQuery}&quot; 的技能</div>
                        <div className="text-[11px] text-[#aeaeb2]">可在左侧「Skills」页面导入或创建新技能</div>
                      </div>
                    ) : (
                      filteredSkills.map((skill: AgentSkillItem, index: number) => {
                        const isSelected = index === selectedSkillIndex
                        const meta = getCategoryBadge(skill.category)
                        return (
                          <div
                            key={skill.id}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              insertSkill(skill)
                            }}
                            onMouseEnter={() => setSelectedSkillIndex(index)}
                            className={`flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#5856D6]/10 text-[#5856D6]'
                                : 'hover:bg-black/[0.04] text-[#1d1d1f]'
                            }`}
                          >
                            <div className="mt-0.5 text-[15px] shrink-0 leading-none">
                              {meta.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[13px] font-semibold truncate ${
                                    isSelected ? 'text-[#5856D6]' : 'text-[#1d1d1f]'
                                  }`}
                                >
                                  {skill.name}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${meta.bg}`}
                                >
                                  {meta.label}
                                </span>
                                {skill.enabled && (
                                  <span className="text-[10px] text-emerald-600 font-medium ml-auto">
                                    ● 已启用
                                  </span>
                                )}
                              </div>
                              <p className="text-[11.5px] text-[#6e6e73] truncate mt-0.5 leading-normal">
                                {skill.summary}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Drag & Drop Banner */}
              {isDragOver && (
                <div className="mx-2 mb-2 px-3 py-2 rounded-2xl bg-[#0071e3]/10 border border-dashed border-[#0071e3]/40 text-[12px] font-medium text-[#0071e3] flex items-center justify-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>松开鼠标附加文件（单文件最高支持 150MB，支持图像、PDF、Word、Excel 表格、代码与文本）</span>
                </div>
              )}

              {/* Explicitly Locked/Mentioned Skills Bar */}
              {detectedMentionedSkills.length > 0 && (
                <div className="mx-1 mb-2 px-3 py-1.5 rounded-xl bg-[#5856D6]/[0.08] border border-[#5856D6]/20 flex items-center justify-between gap-2 flex-wrap animate-fadeIn">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-[#5856D6] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      已指定技能:
                    </span>
                    {detectedMentionedSkills.map((s: AgentSkillItem) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-[#5856D6]/30 text-[11px] font-medium text-[#1d1d1f] shadow-xs"
                      >
                        <span>{getCategoryBadge(s.category).icon}</span>
                        <span className="text-[#5856D6] font-semibold">{s.name}</span>
                        <button
                          type="button"
                          onClick={() => removeSkillMention(s)}
                          className="text-[#86868b] hover:text-[#FF3B30] ml-0.5 transition-colors"
                          title="移除此技能指定"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-[#5856D6]/80 hidden sm:inline">
                    ● 系统已感知并将以此技能为最高准则执行
                  </span>
                </div>
              )}

              {/* Pending Attachments Preview Strip */}
              {(pendingAttachments.length > 0 || isParsingAttachment) && (
                <div className="px-2 pt-1 pb-2 flex items-center gap-2 flex-wrap border-b border-black/[0.05] mb-1.5">
                  {pendingAttachments.map((att) => (
                    <div
                      key={att.id}
                      onClick={() => openAttachmentPreview(att)}
                      onContextMenu={(e) => handleAttachmentContextMenu(e, att)}
                      title={`点击在侧边“浏览”区查看，右键可加入知识库 · ${att.name}`}
                      className="animate-apple-view group relative flex items-center gap-2 pl-2 pr-7 py-1.5 rounded-2xl bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.07] hover:border-[#0071e3]/30 transition-all cursor-pointer"
                    >
                      {att.kind === 'image' && att.previewDataUrl ? (
                        <img
                          src={att.previewDataUrl}
                          alt={att.name}
                          className="w-9 h-9 rounded-xl object-cover border border-black/[0.07] shrink-0"
                        />
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center text-[9.5px] font-mono font-bold shrink-0 ${
                            att.kind === 'pdf'
                              ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                              : att.kind === 'docx'
                                ? 'bg-[#0071e3]/12 text-[#0071e3]'
                                : att.kind === 'excel'
                                  ? 'bg-[#34C759]/15 text-[#177233]'
                                  : 'bg-[#5856D6]/12 text-[#5856D6]'
                          }`}
                        >
                          {att.kind === 'excel' ? (
                            <FileSpreadsheet className="w-3.5 h-3.5 mb-0.5" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 mb-0.5" />
                          )}
                          <span>{att.ext.slice(0, 4)}</span>
                        </div>
                      )}

                      <div className="min-w-0 max-w-[155px]">
                        <div className="text-[12px] font-medium text-[#1d1d1f] group-hover:text-[#0071e3] truncate transition-colors">
                          {att.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#86868b] truncate">
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
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/[0.07] hover:bg-black/[0.16] text-[#3a3a3c] flex items-center justify-center transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {isParsingAttachment && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#F5F5F7] text-[11.5px] text-[#6e6e73]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071e3]" />
                      <span>正在解析文档 / 图像内容...</span>
                    </div>
                  )}
                </div>
              )}

              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => {
                  const val = e.target.value
                  setInput(val)
                  inputRef.current = val
                  setThreadDraft(activeThreadId, {
                    text: val,
                    attachments: pendingAttachmentsRef.current
                  })
                  checkSkillMention(val, e.target.selectionStart)
                }}
                onClick={(e) => {
                  checkSkillMention(e.currentTarget.value, e.currentTarget.selectionStart)
                }}
                onKeyUp={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                    checkSkillMention(e.currentTarget.value, e.currentTarget.selectionStart)
                  }
                }}
                onPaste={(e) => {
                  const files = e.clipboardData?.files
                  if (files && files.length > 0) {
                    e.preventDefault()
                    ingestFiles(files)
                  }
                }}
                onKeyDown={(e) => {
                  // Skill selection popup navigation
                  if (showSkillMenu && filteredSkills.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedSkillIndex((prev) => (prev + 1) % filteredSkills.length)
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length)
                      return
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      insertSkill(filteredSkills[selectedSkillIndex])
                      return
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setShowSkillMenu(false)
                      return
                    }
                  }

                  if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault()
                    cyclePermissionMode()
                    return
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={
                  dispatchToSwarm
                    ? '描述需要多智能体并行拆解的目标（将自动创建 Git Worktree 并行执行）...'
                    : currentMode === 'plan'
                      ? 'Plan Mode 已开启：输入需求或输入 @ 指定 Skill，Claude 将仅做只读调研并输出完整计划...'
                      : currentMode === 'bypassPermissions'
                        ? 'Bypass 模式已开启：输入 @ 可快速指定 Skill，所有文件修改与终端命令将直接无感执行...'
                        : '输入指令（输入 @ 快速选择调用的 Skill），或拖入图像、PDF、DOCX、代码文件...'
                }
                rows={2}
                className="w-full bg-transparent px-3 pt-1.5 pb-1 text-[14px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between px-1.5 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Multi-Format File Attachment Picker Button */}
                  <button
                    type="button"
                    onClick={handlePickAttachments}
                    disabled={isParsingAttachment}
                    title="添加附件：支持 PNG / JPG / JPJ 图像、PDF、DOCX、XLSX / CSV 表格、TXT / MD / 代码等（支持最高 150MB 单文件，可直接拖拽或 ⌘V 粘贴）"
                    className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-black/[0.07] text-[11.5px] font-medium text-[#1d1d1f] disabled:opacity-50"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-[#6e6e73]" />
                    <span>附件</span>
                  </button>

                  {/* Quick @Skill Trigger Button */}
                  <button
                    type="button"
                    onClick={handleTriggerAtSign}
                    title="快捷调用 Skill 技能 (也可以直接在输入框打 @ 自动拉出技能列表)"
                    className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-black/[0.07] text-[11.5px] font-medium text-[#1d1d1f]"
                  >
                    <AtSign className="w-3.5 h-3.5 text-[#5856D6]" />
                    <span>@技能</span>
                  </button>

                  {/* Gemini Antigravity-Style Input Rollback Button */}
                  {messages.some((m) => m.role === 'user') && (
                    <button
                      type="button"
                      onClick={() => rollbackToMessage()}
                      title="回退上一条输入并重新编辑 (Gemini Antigravity 风格)"
                      className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-black/[0.07] text-[11.5px] font-medium text-[#1d1d1f]"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#6e6e73]" />
                      <span>回退输入</span>
                    </button>
                  )}

                  {/* Codex Side Chat Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleSideChat}
                    title={
                      isSideChatOpen
                        ? '收起侧边临时对话'
                        : '打开侧边临时对话'
                    }
                    className={`apple-press flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11.5px] font-medium transition-colors ${
                      isSideChatOpen
                        ? 'bg-[#5856D6]/12 border-[#5856D6]/35 text-[#5856D6]'
                        : 'bg-[#F2F2F7] hover:bg-[#E5E5EA] border-black/[0.07] text-[#1d1d1f]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#5856D6]" />
                    <span>{isSideChatOpen ? '收起侧边对话' : '侧边临时对话'}</span>
                    {sideChatMessages.length > 0 && !isSideChatOpen && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5856D6]" />
                    )}
                  </button>

                  <div className="relative" ref={modeMenuRef}>
                    <button
                      type="button"
                      onClick={() => setModeMenuOpen((v) => !v)}
                      title="点击切换模式，或在输入框内按 Shift + Tab 循环切换"
                      className={`apple-press flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${activeModeMeta.pillClass}`}
                    >
                      <span className="font-mono text-[10px]">{activeModeMeta.glyph}</span>
                      <span>{activeModeMeta.shortLabel}</span>
                      <kbd className="text-[9.5px] font-mono opacity-60 ml-0.5">⇧Tab</kbd>
                    </button>

                    {modeMenuOpen && (
                      <div className="animate-apple-modal absolute bottom-full left-0 mb-2.5 w-80 rounded-2xl apple-glass-Heavy p-2 z-50 origin-bottom-left">
                        <div className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#86868b] flex items-center justify-between">
                          <span>Claude Code 执行权限模式</span>
                          <span className="font-mono">Shift + Tab</span>
                        </div>
                        <div className="space-y-1">
                          {(Object.keys(MODE_CONFIG) as AgentPermissionMode[]).map((modeKey) => {
                            const item = MODE_CONFIG[modeKey]
                            const selected = currentMode === modeKey
                            return (
                              <button
                                key={modeKey}
                                type="button"
                                onClick={async () => {
                                  setModeMenuOpen(false)
                                  await setPermissionMode(modeKey)
                                }}
                                className={`apple-press w-full px-3 py-2 rounded-xl text-left flex items-start justify-between gap-2 transition-colors ${
                                  selected ? 'bg-[#F2F2F7]' : 'hover:bg-black/[0.035]'
                                }`}
                              >
                                <div>
                                  <div className="text-[12.5px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                                    <span className="font-mono text-[11px] text-[#D97757]">
                                      {item.glyph}
                                    </span>
                                    <span>{item.title}</span>
                                  </div>
                                  <div className="text-[11px] text-[#6e6e73] mt-0.5 leading-snug">
                                    {item.desc}
                                  </div>
                                </div>
                                {selected && (
                                  <Check className="w-4 h-4 text-[#0071e3] shrink-0 mt-0.5" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDispatchToSwarm((v) => !v)}
                    className={`apple-press flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                      dispatchToSwarm
                        ? 'bg-[#34C759]/15 border-[#34C759]/35 text-[#177233]'
                        : 'bg-[#F2F2F7] hover:bg-[#E5E5EA] border-black/[0.06] text-[#6e6e73] hover:text-[#1d1d1f]'
                    }`}
                  >
                    <GitBranch className="w-3 h-3" />
                    <span>{dispatchToSwarm ? 'Swarm 集群已开启' : 'Swarm'}</span>
                  </button>

                  {!isInspectorOpen && terminalLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setInspectorOpen(true)}
                      className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0071e3]/10 text-[11px] font-medium text-[#0071e3]"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>终端 ({terminalLogs.length})</span>
                    </button>
                  )}
                </div>

                {isBusy ? (
                  <button
                    onClick={abortGeneration}
                    title="停止生成 (Esc)"
                    className="apple-press w-8 h-8 rounded-full bg-[#FF3B30] hover:bg-[#E0352B] text-white flex items-center justify-center shadow-[0_2px_10px_rgba(255,59,48,0.3)]"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={(!input.trim() && pendingAttachments.length === 0) || isParsingAttachment}
                    title="发送 (Enter)"
                    className={`apple-press w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      (input.trim() || pendingAttachments.length > 0) && !isParsingAttachment
                        ? 'bg-[#1d1d1f] text-white shadow-[0_2px_10px_rgba(0,0,0,0.18)]'
                        : 'bg-black/[0.06] text-black/25 cursor-not-allowed'
                    }`}
                  >
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Full-Resolution Image Attachment Lightbox Modal */}
          {previewImageModal && previewImageModal.previewDataUrl && (
            <div
              onClick={() => setPreviewImageModal(null)}
              className="animate-apple-backdrop fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-6"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="animate-apple-modal relative max-w-4xl max-h-[86vh] rounded-3xl bg-white p-3 shadow-2xl border border-black/[0.1] flex flex-col gap-2"
              >
                <div className="flex items-center justify-between px-2 pt-0.5">
                  <div className="text-[12.5px] font-medium text-[#1d1d1f] truncate">
                    {previewImageModal.name}{' '}
                    <span className="font-mono text-[#86868b] ml-1.5">
                      {previewImageModal.summaryMeta}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewImageModal(null)}
                    className="apple-press p-1.5 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1d1d1f]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <img
                  src={previewImageModal.previewDataUrl}
                  alt={previewImageModal.name}
                  className="max-h-[76vh] w-auto object-contain rounded-2xl bg-[#F5F5F7]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Codex Ephemeral Side Chat Drawer (Independent Scratchpad) */}
      <CodexSideChatDrawer />

      {/* Right: Upgraded Codex Right Browser (Terminal | Project Files | Git Diff Review) */}
      <CodexRightInspector />

      {/* Right-click Attachment Context Menu */}
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
    </div>
  )
}
