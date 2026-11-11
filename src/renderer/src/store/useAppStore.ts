import { create } from 'zustand'
import {
  AgentPermissionMode,
  AgentSkillItem,
  AIProviderConfig,
  AppConfig,
  AppMode,
  BrowserPreviewItem,
  BrowserPreviewType,
  ChatAttachment,
  ChatMessage,
  DreamLogEntry,
  FileTreeNode,
  GitStatusSummary,
  InspectorTab,
  InstalledBrowserInfo,
  KairosTriggerRule,
  KnowledgeBaseState,
  KnowledgeDocItem,
  McpServerItem,
  MemoryLayer,
  MemoryNode,
  ModelProviderPreset,
  NaturalizeLevel,
  RecalledMemoryItem,
  SaveKnowledgePdfPayload,
  SwarmRunState,
  TestProviderResult,
  TokenUsageStats,
  ToolCallItem,
  WorkbenchSubView
} from '@shared/types'
import { InstallSkillPayload } from '../../../preload/index'
import {
  DEFAULT_DOC_TEMPLATE,
  generateSmartDocTabTitle,
  naturalizeMarkdownDocument,
  NaturalizeResult
} from '../utils/docNaturalizer'
import { maskSensitiveSecrets } from '@shared/secretMasker'

export interface TerminalLogLine {
  id: string
  commandId: string
  text: string
  stream: 'stdout' | 'stderr'
  timestamp: number
}

export interface CodexThread {
  id: string
  title: string
  workspaceDir: string
  messages: ChatMessage[]
  sideChatMessages?: CodexSideChatMessage[]
  sideChatUpdatedAt?: number
  sideChatExpired?: boolean
  isSideChatOpen?: boolean
  status: 'idle' | 'running' | 'waiting_approval' | 'completed'
  pinned: boolean
  updatedAt: number
  toolCount: number
}

export const SIDE_CHAT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours independent retention

export function isThreadSideChatExpired(thread: Partial<CodexThread>): boolean {
  if (thread.sideChatExpired) return true
  if (!thread.sideChatMessages || thread.sideChatMessages.length === 0) return false
  const lastActive =
    thread.sideChatUpdatedAt ||
    thread.sideChatMessages[thread.sideChatMessages.length - 1]?.timestamp ||
    0
  if (!lastActive) return false
  return Date.now() - lastActive > SIDE_CHAT_TTL_MS
}

export function cleanObjectText(text?: any): string {
  if (typeof text !== 'string') return ''
  return text.replace(/\[object\s+Object\]/gi, '')
}

export function sanitizeSideChatMessage(msg: CodexSideChatMessage): CodexSideChatMessage {
  return {
    ...msg,
    content: cleanObjectText(msg.content),
    reasoningContent: cleanObjectText(msg.reasoningContent) || undefined
  }
}

export function sanitizeThreadSideChat(thread: CodexThread): CodexThread {
  if (isThreadSideChatExpired(thread)) {
    return {
      ...thread,
      sideChatMessages: [],
      sideChatUpdatedAt: undefined,
      sideChatExpired: true
    }
  }
  return {
    ...thread,
    sideChatMessages: (thread.sideChatMessages || []).map(sanitizeSideChatMessage)
  }
}

export interface CodexSideChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
  attachments?: ChatAttachment[]
  timestamp: number
}

export interface DocEditorTab {
  id: string
  title: string
  originalContent: string
  content: string
  naturalizeLevel: NaturalizeLevel
  pendingSmartTitle?: boolean
  createdAt: number
  updatedAt: number
}

const THREADS_STORAGE_KEY = 'claude_studio_codex_threads_v2'
const LEGACY_THREADS_KEY = 'claude_studio_codex_threads_v1'
const SIDE_CHAT_STORAGE_KEY = 'claude_studio_side_chat_v1'
const DOC_TABS_STORAGE_KEY = 'claude_studio_doc_tabs_v1'
const WORKBENCH_SUBVIEW_KEY = 'claude_studio_workbench_subview_v1'
const THREAD_DRAFTS_STORAGE_KEY = 'claude_studio_thread_drafts_v1'

export interface ThreadDraft {
  text: string
  attachments: ChatAttachment[]
}

function loadSavedDrafts(): Record<string, ThreadDraft> {
  try {
    const raw = localStorage.getItem(THREAD_DRAFTS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return {}
}

function persistThreadDrafts(drafts: Record<string, ThreadDraft>): void {
  try {
    localStorage.setItem(THREAD_DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    try {
      const compact: Record<string, ThreadDraft> = {}
      for (const [id, d] of Object.entries(drafts)) {
        if (!d) continue
        compact[id] = {
          text: d.text || '',
          attachments: (d.attachments || []).map(({ previewDataUrl: _p, ...rest }) => rest)
        }
      }
      localStorage.setItem(THREAD_DRAFTS_STORAGE_KEY, JSON.stringify(compact))
    } catch {
      // ignore
    }
  }
}

function loadSavedWorkbenchSubView(): WorkbenchSubView {
  try {
    const raw = localStorage.getItem(WORKBENCH_SUBVIEW_KEY)
    if (raw === 'skills' || raw === 'mcp' || raw === 'knowledge-base' || raw === 'chat') {
      return raw
    }
  } catch {
    // ignore
  }
  return 'chat'
}

function persistWorkbenchSubView(view: WorkbenchSubView): void {
  try {
    localStorage.setItem(WORKBENCH_SUBVIEW_KEY, view)
  } catch {
    // ignore
  }
}

function createInitialDocTab(): DocEditorTab {
  const now = Date.now()
  return {
    id: 'doctab_initial',
    title: generateSmartDocTabTitle(DEFAULT_DOC_TEMPLATE),
    originalContent: DEFAULT_DOC_TEMPLATE,
    content: DEFAULT_DOC_TEMPLATE,
    naturalizeLevel: 'faithful',
    pendingSmartTitle: false,
    createdAt: now,
    updatedAt: now
  }
}

function loadSavedDocTabs(): DocEditorTab[] {
  try {
    const raw = localStorage.getItem(DOC_TABS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: DocEditorTab) => ({
          ...t,
          title:
            !t.title || t.title === 'main' || t.title === 'main.md'
              ? generateSmartDocTabTitle(t.originalContent || t.content)
              : Array.from(t.title).slice(0, 7).join(''),
          originalContent: t.originalContent ?? t.content ?? '',
          content: t.content ?? t.originalContent ?? '',
          naturalizeLevel: t.naturalizeLevel || 'faithful'
        }))
      }
    }
  } catch {
    // ignore
  }
  return [createInitialDocTab()]
}

function persistDocTabs(tabs: DocEditorTab[]): void {
  try {
    localStorage.setItem(DOC_TABS_STORAGE_KEY, JSON.stringify(tabs.slice(-40)))
  } catch {
    // ignore
  }
}

function loadSavedSideChat(): CodexSideChatMessage[] {
  try {
    const raw = localStorage.getItem(SIDE_CHAT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(sanitizeSideChatMessage)
    }
  } catch {
    // ignore
  }
  return []
}

function formatSideChatUserContent(content: string, attachments: ChatAttachment[]): string {
  const blocks: string[] = []
  if (content.trim()) {
    blocks.push(content.trim())
  } else {
    blocks.push('请阅读并分析以下上传的文件与图像附件：')
  }

  for (const att of attachments) {
    if (att.kind === 'image') {
      const ocrBody = att.extractedText?.trim()
        ? `[图像文字识别 (OCR) 提取内容]:\n${att.extractedText.trim()}`
        : '[图像附件：请结合上下文或视觉信息分析]'
      blocks.push(
        `<attached_image name="${att.name}" format="${att.ext}" meta="${att.summaryMeta || att.mimeType}">\n${ocrBody}\n</attached_image>`
      )
    } else {
      blocks.push(
        `<attached_document name="${att.name}" format="${att.ext}" meta="${att.summaryMeta || att.mimeType}">\n${att.extractedText || '(空文档)'}\n</attached_document>`
      )
    }
  }

  return blocks.join('\n\n')
}

function persistSideChat(messages: CodexSideChatMessage[]): void {
  try {
    const compact = messages.slice(-50).map((m) => {
      if (m.attachments && m.attachments.length > 0) {
        return {
          ...m,
          attachments: m.attachments.map(({ previewDataUrl: _p, ...rest }) => rest)
        }
      }
      return m
    })
    localStorage.setItem(SIDE_CHAT_STORAGE_KEY, JSON.stringify(compact))
  } catch {
    // ignore
  }
}
const PERMISSION_MODES_ORDER: AgentPermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions'
]

function normalizeCodexThread(t: CodexThread, defaultWorkspace: string): CodexThread {
  const threadWithDefaults: CodexThread = {
    ...t,
    workspaceDir: t.workspaceDir || defaultWorkspace,
    messages: Array.isArray(t.messages) ? t.messages : [],
    sideChatMessages: Array.isArray(t.sideChatMessages) ? t.sideChatMessages : [],
    sideChatUpdatedAt: typeof t.sideChatUpdatedAt === 'number' ? t.sideChatUpdatedAt : undefined,
    sideChatExpired: Boolean(t.sideChatExpired),
    isSideChatOpen: Boolean(t.isSideChatOpen)
  }
  return sanitizeThreadSideChat(threadWithDefaults)
}

function createInitialThread(defaultWorkspace: string): CodexThread {
  return {
    id: 'thread_initial',
    title: '新任务线程',
    workspaceDir: defaultWorkspace,
    messages: [],
    sideChatMessages: [],
    sideChatUpdatedAt: undefined,
    sideChatExpired: false,
    status: 'idle',
    pinned: false,
    updatedAt: Date.now(),
    toolCount: 0
  }
}

function isPlaceholderInitialThread(t: CodexThread): boolean {
  return (
    t.id === 'thread_initial' &&
    t.title === '新任务线程' &&
    (!t.messages || t.messages.length === 0) &&
    (!t.sideChatMessages || t.sideChatMessages.length === 0)
  )
}

function loadLocalSavedThreads(defaultWorkspace: string): CodexThread[] {
  try {
    const raw =
      localStorage.getItem(THREADS_STORAGE_KEY) || localStorage.getItem(LEGACY_THREADS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: CodexThread) => normalizeCodexThread(t, defaultWorkspace))
      }
    }
  } catch {
    // ignore
  }
  return []
}

function mergeThreads(
  diskThreads: CodexThread[],
  localThreads: CodexThread[],
  defaultWorkspace: string
): CodexThread[] {
  const byId = new Map<string, CodexThread>()
  const consider = (raw: CodexThread): void => {
    if (!raw || typeof raw.id !== 'string' || !raw.id) return
    const normalized = normalizeCodexThread(raw, defaultWorkspace)
    const existing = byId.get(normalized.id)
    if (!existing) {
      byId.set(normalized.id, normalized)
      return
    }
    const existingMsgs = existing.messages.length
    const nextMsgs = normalized.messages.length
    if (
      nextMsgs > existingMsgs ||
      (nextMsgs === existingMsgs && (normalized.updatedAt || 0) > (existing.updatedAt || 0))
    ) {
      byId.set(normalized.id, normalized)
    }
  }

  for (const t of diskThreads) consider(t)
  for (const t of localThreads) consider(t)

  const merged = Array.from(byId.values())
  const hasRealThreads = merged.some((t) => !isPlaceholderInitialThread(t))
  const filtered = hasRealThreads ? merged.filter((t) => !isPlaceholderInitialThread(t)) : merged
  filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return filtered.slice(0, 60)
}

function loadSavedThreads(defaultWorkspace: string): CodexThread[] {
  const local = loadLocalSavedThreads(defaultWorkspace)
  return local.length > 0 ? local : [createInitialThread(defaultWorkspace)]
}

let activeStreamUnsubscribe: (() => void) | null = null
let diskPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingDiskThreads: CodexThread[] | null = null

function writeThreadsToLocalStorage(sliced: CodexThread[]): void {
  try {
    localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(sliced))
  } catch {
    // Quota fallback: strip bulky base64 `previewDataUrl` from older threads while preserving extractedText
    try {
      const compactThreads = sliced.map((t, idx) =>
        idx === 0
          ? t
          : {
              ...t,
              messages: t.messages.map((m) =>
                m.attachments
                  ? {
                      ...m,
                      attachments: m.attachments.map(({ previewDataUrl: _p, ...rest }) => rest)
                    }
                  : m
              )
            }
      )
      localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(compactThreads))
    } catch {
      // ignore
    }
  }
}

async function flushThreadsToDiskNow(threads?: CodexThread[]): Promise<void> {
  if (diskPersistTimer) {
    clearTimeout(diskPersistTimer)
    diskPersistTimer = null
  }
  const target = threads ? threads.slice(0, 60) : pendingDiskThreads
  pendingDiskThreads = null
  if (!target) return
  try {
    await window.claudeDesktop?.saveThreads?.(target)
  } catch {
    // ignore disk persistence failures cleanly
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushThreadsToDiskNow()
  })
}

function persistThreads(threads: CodexThread[]): void {
  const sliced = threads.slice(0, 60)
  writeThreadsToLocalStorage(sliced)
  pendingDiskThreads = sliced
  if (diskPersistTimer) {
    clearTimeout(diskPersistTimer)
  }
  diskPersistTimer = setTimeout(() => {
    void flushThreadsToDiskNow()
  }, 250)
}

/**
 * Synthesizes a concise, elegant, punchy 4-12 character thread title from the user's first query.
 * Replaces 30+ character raw sentence truncations with clear, intent-driven topic titles.
 */
export function generateConciseThreadTitle(rawInput: string): string {
  if (!rawInput || !rawInput.trim()) return '新任务线程'

  // 1. Remove trailing parenthesized notes e.g. （不要帮我封装只是看一下） or (只看不用改)
  let clean = rawInput
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[。？！?!~…]+$/g, '')
    .trim()

  const lower = clean.toLowerCase()

  // 2. High-value intent pattern recognition
  if (
    (clean.includes('文件夹') || clean.includes('目录') || clean.includes('文件')) &&
    (clean.includes('封装') || clean.includes('app') || clean.includes('打包'))
  ) {
    return '文件结构与 App 封装评估'
  }
  if (
    (clean.includes('文件夹') || clean.includes('目录') || clean.includes('结构')) &&
    (clean.includes('有什么') || clean.includes('查看') || clean.includes('看下') || clean.includes('勘探'))
  ) {
    return '工作区文件目录勘探'
  }
  if (
    (clean.includes('启动') || clean.includes('跑起来') || clean.includes('运行')) &&
    (clean.includes('项目') || clean.includes('服务') || clean.includes('dev') || clean.includes('app'))
  ) {
    return '启动项目开发服务'
  }
  if (
    clean.includes('我能帮你做什么') ||
    (clean.includes('说明') && clean.includes('文档')) ||
    clean.includes('readme')
  ) {
    return '完善项目说明文档'
  }
  if (clean.includes('打包') || clean.includes('builder') || clean.includes('dist')) {
    return '配置桌面应用打包'
  }
  if (clean.includes('重构') || clean.includes('架构')) {
    return '代码架构与重构'
  }
  if (clean.includes('测试') || lower.includes('test') || lower.includes('jest')) {
    return '自动化测试与校验'
  }
  if (clean.includes('git') || clean.includes('分支') || clean.includes('commit') || clean.includes('提交')) {
    return 'Git 仓库版本管理'
  }
  if (clean.includes('skill') || clean.includes('技能')) {
    return 'Skill 技能中心管理'
  }
  if (clean.includes('mcp')) {
    return 'MCP 协议服务集成'
  }
  if (clean.includes('记忆') || lower.includes('memory')) {
    return '认知记忆与经验沉淀'
  }
  if (clean.includes('玻璃') || clean.includes('主题') || clean.includes('样式') || clean.includes('ui') || clean.includes('动画')) {
    return '界面风格与体验微调'
  }

  // 3. Remove conversational prefixes and polite fillers
  clean = clean
    .replace(/^(你好|hello|hi|请问|能否|麻烦|帮我|请帮我|你可以帮我|我想让你|你能|帮我看一下|看一下|看看|请|我想)/g, '')
    .trim()

  // 4. Remove leading action verbs if they leave a clear topic
  clean = clean
    .replace(/^(查看一下|查看|检查一下|检查|分析一下|分析|写一个|编写一个|编写|实现一个|实现|做一下)/g, '')
    .trim()

  if (clean.length >= 2 && clean.length <= 12) {
    return clean
  }
  if (clean.length > 12) {
    return clean.slice(0, 11) + '…'
  }
  return rawInput.trim().slice(0, 10) || '新任务线程'
}

function deriveThreadMeta(
  prev: CodexThread,
  messages: ChatMessage[],
  isBusy: boolean,
  hasPendingApproval: boolean
): CodexThread {
  const firstUser = messages.find((m) => m.role === 'user')
  let title = prev.title

  // Synthesize a concise, intent-driven title upon the first user prompt
  if ((!title || title === '新任务线程') && firstUser) {
    const rawText = firstUser.content || firstUser.attachments?.[0]?.name || ''
    if (rawText.trim()) {
      title = generateConciseThreadTitle(rawText)
    }
  }

  let toolCount = 0
  for (const m of messages) {
    if (m.toolCalls) toolCount += m.toolCalls.length
  }

  let status: CodexThread['status'] = 'idle'
  if (hasPendingApproval) status = 'waiting_approval'
  else if (isBusy) status = 'running'
  else if (messages.length > 0) status = 'completed'

  return {
    ...prev,
    title: title || '新任务线程',
    messages,
    toolCount,
    status,
    updatedAt: Date.now()
  }
}

interface AppState {
  activeMode: AppMode
  workbenchSubView: WorkbenchSubView
  config: AppConfig | null
  presets: ModelProviderPreset[]
  messages: ChatMessage[]
  draftComposerText: string
  draftComposerAttachments: ChatAttachment[] | null
  isBusy: boolean
  busyStartedAt: number | null
  pendingApproval: ToolCallItem | null
  tokenStats: TokenUsageStats
  terminalLogs: TerminalLogLine[]
  fileTree: FileTreeNode[]
  selectedFilePreview: { path: string; content: string } | null
  gitStatus: GitStatusSummary
  selectedDiffPreview: { path: string; diff: string } | null

  // Codex Left Sidebar State (Feature A)
  threads: CodexThread[]
  activeThreadId: string
  threadDrafts: Record<string, ThreadDraft>
  isLeftSidebarOpen: boolean
  skills: AgentSkillItem[]
  mcpServers: McpServerItem[]
  knowledgeDocs: KnowledgeDocItem[]
  knowledgeStorageDir: string

  // AI Doc Editor Safari Multi-Tab State
  docTabs: DocEditorTab[]
  activeDocTabId: string

  // Direction B
  swarmState: SwarmRunState | null

  // Direction C: L1-L5 Hierarchical Memory & KAIROS
  memoryMarkdown: string
  memoryNodes: MemoryNode[]
  dreamLogs: DreamLogEntry[]
  kairosRules: KairosTriggerRule[]
  toastNotification: {
    title: string
    body: string
    timestamp: number
    actionLabel?: string
    onAction?: () => void
  } | null

  // Modals & Drawers
  isSettingsOpen: boolean
  isModelSwitcherOpen: boolean
  isQuickLauncherOpen: boolean
  isInspectorOpen: boolean
  inspectorTab: InspectorTab
  previewTabs: BrowserPreviewItem[]
  activePreviewId: string | null
  activePreview: BrowserPreviewItem | null
  inspectorWidth: number
  isInspectorExpanded: boolean
  isInspectorResizing: boolean
  isSideChatMode: boolean
  isSideChatOpen: boolean
  isSideChatBusy: boolean
  isSideChatExpired: boolean
  sideChatContextHintEnabled: boolean
  sideChatMessages: CodexSideChatMessage[]
  stagedDocContent: string

  // Actions
  setActiveMode: (mode: AppMode) => void
  setWorkbenchSubView: (view: WorkbenchSubView) => void
  setDraftComposerText: (text: string) => void
  setDraftComposerAttachments: (attachments: ChatAttachment[] | null) => void
  setSettingsOpen: (open: boolean) => void
  setModelSwitcherOpen: (open: boolean) => void
  setQuickLauncherOpen: (open: boolean) => void
  setInspectorOpen: (open: boolean) => void
  toggleInspector: () => void
  setInspectorTab: (tab: InspectorTab) => void
  openPreview: (item: BrowserPreviewItem) => void
  closePreview: () => void
  closePreviewTab: (tabId: string) => void
  setActivePreviewTab: (tabId: string) => void
  createNewWebTab: (initialUrl?: string) => void
  updatePreviewTab: (tabId: string, partial: Partial<BrowserPreviewItem>) => void
  closeAllPreviewTabs: () => void
  openWebPreview: (url: string, title?: string) => void
  openAttachmentPreview: (att: ChatAttachment) => Promise<void>
  openFileInBrowserPreview: (filePath: string) => Promise<void>
  toggleInspectorExpanded: () => void
  setInspectorWidth: (width: number) => void
  setIsInspectorResizing: (resizing: boolean) => void
  toggleLeftSidebar: () => void
  toggleSideChatMode: () => void
  toggleSideChat: () => void
  setSideChatOpen: (open: boolean) => void
  toggleSideChatContextHint: () => void
  sendSideChatMessage: (input: string, attachments?: ChatAttachment[]) => Promise<void>
  clearSideChat: () => void
  restartSideChat: () => void
  checkCurrentSideChatExpiration: () => void
  abortSideChat: () => Promise<void>
  stageContentForDocEditor: (content: string) => void
  addDocTab: (initialContent?: string) => void

  // CC-Switch Provider & Model Actions
  switchProvider: (providerId: string, model?: string) => Promise<void>
  switchModel: (model: string) => Promise<void>
  testProviderConnection: (provider: AIProviderConfig) => Promise<TestProviderResult>
  upsertProvider: (provider: AIProviderConfig) => Promise<void>
  deleteProvider: (providerId: string) => Promise<void>
  closeDocTab: (tabId: string) => void
  setActiveDocTab: (tabId: string) => void
  updateDocTabContent: (tabId: string, nextContent: string, resetBaseline?: boolean) => void
  setDocTabNaturalizeLevel: (tabId: string, level: NaturalizeLevel) => NaturalizeResult
  reorderDocTabs: (fromIndex: number, toIndex: number) => void
  refreshKnowledgeDocs: () => Promise<void>
  savePdfToKnowledgeBase: (payload: SaveKnowledgePdfPayload) => Promise<KnowledgeDocItem>
  importAttachmentToKnowledgeBase: (att: ChatAttachment) => Promise<KnowledgeDocItem | null>
  importLocalFilesToKnowledgeBase: () => Promise<void>
  deleteKnowledgeDoc: (docId: string) => Promise<void>
  openKnowledgeDocExternal: (docId: string, revealInFolder?: boolean) => Promise<void>
  openKnowledgeFolder: () => Promise<void>
  branchThreadFromMessage: (messageId: string) => Promise<void>
  rollbackToMessage: (messageId?: string) => Promise<void>
  setThreadDraft: (threadId: string, draft: ThreadDraft) => void
  getThreadDraft: (threadId: string) => ThreadDraft
  clearToast: () => void
  initialize: () => Promise<void>
  refreshFileTree: () => Promise<void>
  refreshGitStatus: () => Promise<void>
  previewFile: (filePath: string) => Promise<void>
  closeFilePreview: () => void
  previewGitDiff: (relativePath: string) => Promise<void>
  closeDiffPreview: () => void
  runQuickTerminalCommand: (cmd: string) => Promise<void>
  clearTerminalLogs: () => void
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>
  setPermissionMode: (mode: AgentPermissionMode) => Promise<void>
  cyclePermissionMode: () => Promise<void>

  // Codex Multi-Project Folder Actions
  selectWorkspace: () => Promise<void>
  addProjectFolder: () => Promise<void>
  switchProjectFolder: (dirPath: string) => Promise<void>
  removeProjectFolder: (dirPath: string) => Promise<void>

  // Codex Thread Actions
  createNewThread: (projectDir?: string) => Promise<void>
  switchThread: (threadId: string) => Promise<void>
  togglePinThread: (threadId: string) => void
  archiveThread: (threadId: string) => Promise<void>

  // Codex Skills & MCP Actions
  toggleSkill: (skillId: string) => Promise<void>
  installSkill: (payload: InstallSkillPayload) => Promise<void>
  deleteSkill: (skillId: string) => Promise<void>
  toggleMcpServer: (serverId: string) => Promise<void>
  upsertMcpServer: (payload: Partial<McpServerItem> & { name: string }) => Promise<void>
  deleteMcpServer: (serverId: string) => Promise<void>
  probeMcpServer: (serverId: string) => Promise<void>
  launchExamplePromptInChat: (promptText: string, autoSend?: boolean) => Promise<void>

  // Direction A Actions
  sendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>
  abortGeneration: () => Promise<void>
  clearSession: () => Promise<void>
  resolveApproval: (
    toolCallId: string,
    decision: 'approve_once' | 'approve_session' | 'reject'
  ) => Promise<void>
  triggerCompact: () => Promise<void>

  // Direction B Actions
  startSwarm: (goal: string, useWorktree: boolean) => Promise<void>
  mergeSwarmTask: (taskId: string) => Promise<string>
  cleanupWorktrees: () => Promise<string>

  // Direction C Actions
  triggerDream: () => Promise<void>
  saveMemoryMarkdown: (content: string) => Promise<void>
  upsertMemoryNode: (payload: {
    id?: string
    layer: MemoryLayer
    title: string
    content: string
    keywords?: string[]
    tags?: string[]
    importance?: number
  }) => Promise<void>
  deleteMemoryNode: (nodeId: string) => Promise<void>
  searchMemories: (query: string) => Promise<RecalledMemoryItem[]>
  toggleKairosRule: (ruleId: string) => Promise<void>
  addKairosRule: (rule: Omit<KairosTriggerRule, 'id' | 'enabled'>) => Promise<void>
  runKairosRuleNow: (ruleId: string) => Promise<void>
}

async function safeBridgeCall<T>(
  fn: () => Promise<T> | undefined,
  fallback: T
): Promise<T> {
  try {
    const promise = fn()
    if (!promise || typeof (promise as Promise<T>).then !== 'function') {
      return fallback
    }
    const res = await promise
    return res !== undefined && res !== null ? res : fallback
  } catch {
    return fallback
  }
}

const initialDocTabs = loadSavedDocTabs()
const initialSavedThreads = loadSavedThreads('')
const legacySideChat = loadSavedSideChat()
if (
  initialSavedThreads[0] &&
  (!initialSavedThreads[0].sideChatMessages || initialSavedThreads[0].sideChatMessages.length === 0) &&
  legacySideChat.length > 0 &&
  !initialSavedThreads[0].sideChatExpired
) {
  initialSavedThreads[0].sideChatMessages = legacySideChat
  initialSavedThreads[0] = sanitizeThreadSideChat(initialSavedThreads[0])
}

export const useAppStore = create<AppState>((set, get) => ({
  activeMode: 'workbench',
  workbenchSubView: loadSavedWorkbenchSubView(),
  config: null,
  presets: [],
  messages: initialSavedThreads[0]?.messages || [],
  draftComposerText: '',
  draftComposerAttachments: null,
  isBusy: false,
  busyStartedAt: null,
  pendingApproval: null,
  tokenStats: {
    currentTokens: 0,
    maxTokens: 200000,
    usageRatio: 0,
    microCompactedCount: 0,
    autoCompactedCount: 0,
    totalSavedTokens: 0
  },
  terminalLogs: [],
  fileTree: [],
  selectedFilePreview: null,
  gitStatus: { branch: 'main', isRepo: false, changes: [] },
  selectedDiffPreview: null,

  threads: initialSavedThreads,
  activeThreadId: initialSavedThreads[0]?.id || 'thread_initial',
  threadDrafts: loadSavedDrafts(),
  isLeftSidebarOpen: true,
  skills: [],
  mcpServers: [],
  knowledgeDocs: [],
  knowledgeStorageDir: '',

  docTabs: initialDocTabs,
  activeDocTabId: initialDocTabs[0]?.id || 'doctab_initial',

  swarmState: null,
  memoryMarkdown: '',
  memoryNodes: [],
  dreamLogs: [],
  kairosRules: [],
  toastNotification: null,
  isSettingsOpen: false,
  isModelSwitcherOpen: false,
  isQuickLauncherOpen: false,
  isInspectorOpen: true,
  inspectorTab: 'files',
  previewTabs: [],
  activePreviewId: null,
  activePreview: null,
  inspectorWidth: 360,
  isInspectorExpanded: false,
  isInspectorResizing: false,
  isSideChatMode: Boolean(initialSavedThreads[0]?.isSideChatOpen),
  isSideChatOpen: Boolean(initialSavedThreads[0]?.isSideChatOpen),
  isSideChatBusy: false,
  isSideChatExpired: Boolean(initialSavedThreads[0]?.sideChatExpired),
  sideChatContextHintEnabled: true,
  sideChatMessages: initialSavedThreads[0]?.sideChatMessages || [],
  stagedDocContent: '',

  setActiveMode: (mode) => {
    const state = get()
    const activeThread = state.threads.find((t) => t.id === state.activeThreadId)
    const shouldShowSideChat =
      mode === 'workbench' && state.workbenchSubView === 'chat' && Boolean(activeThread?.isSideChatOpen)
    set({
      activeMode: mode,
      isSideChatOpen: shouldShowSideChat,
      isSideChatMode: shouldShowSideChat
    })
  },
  setWorkbenchSubView: (view) => {
    persistWorkbenchSubView(view)
    const state = get()
    const activeThread = state.threads.find((t) => t.id === state.activeThreadId)
    const shouldShowSideChat =
      state.activeMode === 'workbench' && view === 'chat' && Boolean(activeThread?.isSideChatOpen)
    set({
      workbenchSubView: view,
      isSideChatOpen: shouldShowSideChat,
      isSideChatMode: shouldShowSideChat
    })
  },
  setDraftComposerText: (text) => set({ draftComposerText: text }),
  setDraftComposerAttachments: (attachments) => set({ draftComposerAttachments: attachments }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setModelSwitcherOpen: (open) => set({ isModelSwitcherOpen: open }),
  setQuickLauncherOpen: (open) => set({ isQuickLauncherOpen: open }),
  setInspectorOpen: (open) => set({ isInspectorOpen: open }),
  toggleInspector: () => set((s) => ({ isInspectorOpen: !s.isInspectorOpen })),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  openPreview: (item) =>
    set((s) => {
      const existing = s.previewTabs.find(
        (t) =>
          t.id === item.id ||
          (item.filePath && t.filePath === item.filePath) ||
          (item.url && t.url === item.url)
      )
      if (existing) {
        return {
          isInspectorOpen: true,
          inspectorTab: 'preview',
          activePreviewId: existing.id,
          activePreview: existing
        }
      }
      const nextTabs = [...s.previewTabs, item]
      return {
        isInspectorOpen: true,
        inspectorTab: 'preview',
        previewTabs: nextTabs,
        activePreviewId: item.id,
        activePreview: item
      }
    }),
  closePreview: () =>
    set((s) => {
      if (s.activePreviewId) {
        const idx = s.previewTabs.findIndex((t) => t.id === s.activePreviewId)
        const nextTabs = s.previewTabs.filter((t) => t.id !== s.activePreviewId)
        if (nextTabs.length === 0) {
          return { previewTabs: [], activePreviewId: null, activePreview: null }
        }
        const nextIdx = Math.min(idx >= 0 ? idx : 0, nextTabs.length - 1)
        const nextActive = nextTabs[nextIdx]
        return { previewTabs: nextTabs, activePreviewId: nextActive.id, activePreview: nextActive }
      }
      return { previewTabs: [], activePreviewId: null, activePreview: null }
    }),
  closePreviewTab: (tabId) =>
    set((s) => {
      const idx = s.previewTabs.findIndex((t) => t.id === tabId)
      if (idx === -1) return s
      const nextTabs = s.previewTabs.filter((t) => t.id !== tabId)
      if (nextTabs.length === 0) {
        return { previewTabs: [], activePreviewId: null, activePreview: null }
      }
      if (s.activePreviewId === tabId) {
        const nextIdx = Math.min(idx, nextTabs.length - 1)
        const nextActive = nextTabs[nextIdx]
        return {
          previewTabs: nextTabs,
          activePreviewId: nextActive.id,
          activePreview: nextActive
        }
      }
      return { previewTabs: nextTabs }
    }),
  setActivePreviewTab: (tabId) =>
    set((s) => {
      const found = s.previewTabs.find((t) => t.id === tabId)
      if (found) {
        return {
          isInspectorOpen: true,
          inspectorTab: 'preview',
          activePreviewId: found.id,
          activePreview: found
        }
      }
      return s
    }),
  createNewWebTab: (initialUrl) =>
    set((s) => {
      const url = (initialUrl || '').trim()
      const newTab: BrowserPreviewItem = {
        id: `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'web',
        title: url ? url.replace(/^https?:\/\//, '') : '新标签页',
        url: url || undefined,
        meta: '网页实时交互'
      }
      return {
        isInspectorOpen: true,
        inspectorTab: 'preview',
        previewTabs: [...s.previewTabs, newTab],
        activePreviewId: newTab.id,
        activePreview: newTab
      }
    }),
  updatePreviewTab: (tabId, partial) =>
    set((s) => {
      let updatedActive = s.activePreview
      const nextTabs = s.previewTabs.map((t) => {
        if (t.id === tabId) {
          const updated = { ...t, ...partial }
          if (s.activePreviewId === tabId) {
            updatedActive = updated
          }
          return updated
        }
        return t
      })
      return {
        previewTabs: nextTabs,
        activePreview: updatedActive
      }
    }),
  closeAllPreviewTabs: () =>
    set({
      previewTabs: [],
      activePreviewId: null,
      activePreview: null
    }),
  openWebPreview: (url, title) => {
    let cleanUrl = (url || '').trim()
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('file://')) {
      const hostPart = cleanUrl.split('/')[0]
      if (
        !hostPart.startsWith('www.') &&
        !hostPart.includes(':') &&
        !hostPart.includes('localhost') &&
        hostPart.split('.').length === 2
      ) {
        cleanUrl = `www.${cleanUrl}`
      }
      cleanUrl = `https://${cleanUrl}`
    }
    set((s) => {
      const existing = s.previewTabs.find((t) => t.type === 'web' && t.url === cleanUrl)
      if (existing) {
        return {
          isInspectorOpen: true,
          inspectorTab: 'preview',
          activePreviewId: existing.id,
          activePreview: existing
        }
      }
      const newTab: BrowserPreviewItem = {
        id: `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'web',
        title: title || cleanUrl.replace(/^https?:\/\//, ''),
        url: cleanUrl,
        meta: '网页实时交互'
      }
      return {
        isInspectorOpen: true,
        inspectorTab: 'preview',
        previewTabs: [...s.previewTabs, newTab],
        activePreviewId: newTab.id,
        activePreview: newTab
      }
    })
  },
  openAttachmentPreview: async (att) => {
    const type: BrowserPreviewType =
      att.kind === 'image'
        ? 'image'
        : att.kind === 'pdf'
          ? 'pdf'
          : att.kind === 'docx'
            ? 'docx'
            : att.kind === 'excel'
              ? 'excel'
              : 'text'

    let htmlContent = ''
    let excelData = att.excelData

    if (type === 'docx' && att.filePath && window.claudeDesktop?.convertDocxToHtml) {
      try {
        const res = await window.claudeDesktop.convertDocxToHtml(att.filePath)
        if (res && res.html) {
          htmlContent = res.html
        }
      } catch {
        // ignore
      }
    }

    if (type === 'excel' && !excelData && att.filePath && window.claudeDesktop?.parseExcelData) {
      try {
        const res = await window.claudeDesktop.parseExcelData(att.filePath)
        if (res && res.sheets) {
          excelData = {
            sheets: res.sheets,
            totalRows: res.totalRows,
            totalCols: res.totalCols
          }
        }
      } catch {
        // ignore
      }
    }

    set((s) => {
      const existing = s.previewTabs.find(
        (t) => t.id === `att_${att.id}` || (att.filePath && t.filePath === att.filePath)
      )
      if (existing) {
        return {
          isInspectorOpen: true,
          inspectorTab: 'preview',
          activePreviewId: existing.id,
          activePreview: existing
        }
      }
      const newTab: BrowserPreviewItem = {
        id: `att_${att.id}`,
        type,
        title: att.name,
        fileName: att.name,
        filePath: att.filePath,
        dataUrl: att.previewDataUrl,
        htmlContent: htmlContent || undefined,
        excelData,
        rawText: att.extractedText,
        meta: att.summaryMeta || `${att.ext} · ${(att.sizeBytes / 1024).toFixed(1)} KB`,
        attachment: att
      }
      return {
        isInspectorOpen: true,
        inspectorTab: 'preview',
        previewTabs: [...s.previewTabs, newTab],
        activePreviewId: newTab.id,
        activePreview: newTab
      }
    })
  },
  openFileInBrowserPreview: async (filePath) => {
    const name = filePath.split('/').pop() || filePath
    const ext = (name.split('.').pop() || '').toLowerCase()
    const isImage = ['png', 'jpg', 'jpeg', 'jpj', 'webp', 'gif', 'svg', 'bmp'].includes(ext)
    const isPdf = ext === 'pdf'
    const isDoc = ['docx', 'doc', 'rtf', 'odt'].includes(ext)
    const isExcel = ['xlsx', 'xls', 'csv', 'tsv'].includes(ext)
    const isHtml = ['html', 'htm'].includes(ext)

    let type: BrowserPreviewType = 'text'
    let dataUrl: string | undefined
    let htmlContent: string | undefined
    let excelData:
      | { sheets: Array<{ name: string; rows: string[][] }>; totalRows: number; totalCols: number }
      | undefined

    if (isImage) {
      type = 'image'
      if (window.claudeDesktop?.readFileAsDataUrl) {
        dataUrl = (await window.claudeDesktop.readFileAsDataUrl(filePath)) || undefined
      }
    } else if (isPdf) {
      type = 'pdf'
    } else if (isDoc) {
      type = 'docx'
      if (window.claudeDesktop?.convertDocxToHtml) {
        const res = await window.claudeDesktop.convertDocxToHtml(filePath)
        if (res && res.html) htmlContent = res.html
      }
    } else if (isExcel) {
      type = 'excel'
      if (window.claudeDesktop?.parseExcelData) {
        const res = await window.claudeDesktop.parseExcelData(filePath)
        if (res && res.sheets) {
          excelData = {
            sheets: res.sheets,
            totalRows: res.totalRows,
            totalCols: res.totalCols
          }
        }
      }
    } else if (isHtml) {
      type = 'web'
    }

    set((s) => {
      const existing = s.previewTabs.find((t) => t.filePath === filePath)
      if (existing) {
        return {
          isInspectorOpen: true,
          inspectorTab: 'preview',
          activePreviewId: existing.id,
          activePreview: existing
        }
      }
      const newTab: BrowserPreviewItem = {
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        title: name,
        fileName: name,
        filePath,
        url: isHtml ? `file://${filePath}` : undefined,
        dataUrl,
        htmlContent,
        excelData,
        meta: `${ext.toUpperCase()} 文件`
      }
      return {
        isInspectorOpen: true,
        inspectorTab: 'preview',
        previewTabs: [...s.previewTabs, newTab],
        activePreviewId: newTab.id,
        activePreview: newTab
      }
    })
  },
  toggleInspectorExpanded: () =>
    set((s) => ({
      isInspectorExpanded: !s.isInspectorExpanded,
      inspectorWidth: !s.isInspectorExpanded ? 580 : 360
    })),
  setInspectorWidth: (width) => set({ inspectorWidth: width }),
  setIsInspectorResizing: (resizing) => set({ isInspectorResizing: resizing }),
  toggleLeftSidebar: () => set((s) => ({ isLeftSidebarOpen: !s.isLeftSidebarOpen })),
  toggleSideChatMode: () =>
    set((s) => {
      const next = !s.isSideChatOpen
      const curThread = s.threads.find((t) => t.id === s.activeThreadId)
      let nextThreads = s.threads
      if (curThread) {
        if (next && isThreadSideChatExpired(curThread)) {
          const sanitized = sanitizeThreadSideChat(curThread)
          nextThreads = s.threads.map((t) =>
            t.id === sanitized.id ? { ...sanitized, isSideChatOpen: true } : t
          )
          persistThreads(nextThreads)
          return {
            isSideChatMode: true,
            isSideChatOpen: true,
            threads: nextThreads,
            sideChatMessages: [],
            isSideChatExpired: true
          }
        }
        nextThreads = s.threads.map((t) =>
          t.id === curThread.id ? { ...t, isSideChatOpen: next } : t
        )
        persistThreads(nextThreads)
      }
      return { isSideChatMode: next, isSideChatOpen: next, threads: nextThreads }
    }),
  toggleSideChat: () =>
    set((s) => {
      const next = !s.isSideChatOpen
      const curThread = s.threads.find((t) => t.id === s.activeThreadId)
      let nextThreads = s.threads
      if (curThread) {
        if (next && isThreadSideChatExpired(curThread)) {
          const sanitized = sanitizeThreadSideChat(curThread)
          nextThreads = s.threads.map((t) =>
            t.id === sanitized.id ? { ...sanitized, isSideChatOpen: true } : t
          )
          persistThreads(nextThreads)
          return {
            isSideChatMode: true,
            isSideChatOpen: true,
            threads: nextThreads,
            sideChatMessages: [],
            isSideChatExpired: true
          }
        }
        nextThreads = s.threads.map((t) =>
          t.id === curThread.id ? { ...t, isSideChatOpen: next } : t
        )
        persistThreads(nextThreads)
      }
      return { isSideChatMode: next, isSideChatOpen: next, threads: nextThreads }
    }),
  setSideChatOpen: (open: boolean) =>
    set((s) => {
      const curThread = s.threads.find((t) => t.id === s.activeThreadId)
      let nextThreads = s.threads
      if (curThread) {
        if (open && isThreadSideChatExpired(curThread)) {
          const sanitized = sanitizeThreadSideChat(curThread)
          nextThreads = s.threads.map((t) =>
            t.id === sanitized.id ? { ...sanitized, isSideChatOpen: true } : t
          )
          persistThreads(nextThreads)
          return {
            isSideChatOpen: true,
            isSideChatMode: true,
            threads: nextThreads,
            sideChatMessages: [],
            isSideChatExpired: true
          }
        }
        nextThreads = s.threads.map((t) =>
          t.id === curThread.id ? { ...t, isSideChatOpen: open } : t
        )
        persistThreads(nextThreads)
      }
      return { isSideChatOpen: open, isSideChatMode: open, threads: nextThreads }
    }),
  toggleSideChatContextHint: () =>
    set((s) => ({ sideChatContextHintEnabled: !s.sideChatContextHintEnabled })),
  restartSideChat: () => {
    const state = get()
    const nextThreads = state.threads.map((t) =>
      t.id === state.activeThreadId
        ? {
            ...t,
            sideChatMessages: [],
            sideChatUpdatedAt: undefined,
            sideChatExpired: false
          }
        : t
    )
    set({
      sideChatMessages: [],
      isSideChatExpired: false,
      threads: nextThreads
    })
    persistThreads(nextThreads)
    persistSideChat([])
  },
  checkCurrentSideChatExpiration: () => {
    const state = get()
    const currentThread = state.threads.find((t) => t.id === state.activeThreadId)
    if (!currentThread) return
    if (isThreadSideChatExpired(currentThread)) {
      const sanitized = sanitizeThreadSideChat(currentThread)
      const nextThreads = state.threads.map((t) => (t.id === sanitized.id ? sanitized : t))
      set({
        threads: nextThreads,
        sideChatMessages: [],
        isSideChatExpired: true
      })
      persistThreads(nextThreads)
      persistSideChat([])
    }
  },
  sendSideChatMessage: async (input: string, attachments?: ChatAttachment[]) => {
    const text = input.trim()
    const atts = attachments && attachments.length > 0 ? attachments : []
    if ((!text && atts.length === 0) || get().isSideChatBusy) return

    const now = Date.now()
    const userMsg: CodexSideChatMessage = {
      id: `sc_user_${now}`,
      role: 'user',
      content: text,
      attachments: atts.length > 0 ? atts : undefined,
      timestamp: now
    }
    const assistantMsg: CodexSideChatMessage = {
      id: `sc_ast_${now + 1}`,
      role: 'assistant',
      content: '',
      timestamp: now + 1
    }

    const state = get()
    const nextMessages = [...state.sideChatMessages, userMsg, assistantMsg]
    const nextThreads = state.threads.map((t) =>
      t.id === state.activeThreadId
        ? {
            ...t,
            sideChatMessages: nextMessages,
            sideChatUpdatedAt: now,
            sideChatExpired: false
          }
        : t
    )
    set({
      sideChatMessages: nextMessages,
      isSideChatExpired: false,
      threads: nextThreads,
      isSideChatBusy: true
    })
    persistThreads(nextThreads)
    persistSideChat(nextMessages)

    // Extract recent main task conversation messages (up to 30) for side chat context awareness
    const rawMainMsgs =
      state.messages && state.messages.length > 0
        ? state.messages
        : state.threads.find((t) => t.id === state.activeThreadId)?.messages || []

    const mainConversationMessages = rawMainMsgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-30)
      .map((m) => {
        let textContent = ''
        if (typeof m.content === 'string') {
          textContent = m.content
        } else if (Array.isArray(m.content)) {
          textContent = (m.content as any[])
            .map((part) => (typeof part === 'string' ? part : part?.text || ''))
            .filter(Boolean)
            .join('\n')
        } else {
          textContent = String(m.content || '')
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: textContent
        }
      })
      .filter((m) => m.content.trim().length > 0)

    let contextHint = ''
    if (state.sideChatContextHintEnabled) {
      const activeThread = state.threads.find((t) => t.id === state.activeThreadId)
      const lastUserMsg = state.messages.filter((m) => m.role === 'user').slice(-1)[0]
      const fileNames = state.fileTree.slice(0, 10).map((f) => f.name).join(', ')
      contextHint = `当前项目: ${state.config?.workspaceDir || '未设定'}\n当前主任务: ${activeThread?.title || '新会话'}\n最近主任务提问: ${lastUserMsg?.content?.slice(0, 120) || '无'}\n工作区核心文件: ${fileNames}`
    }

    try {
      const historyPayload = nextMessages
        .slice(0, -1)
        .map((m) => {
          let content = m.content
          if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
            content = formatSideChatUserContent(m.content, m.attachments)
          }
          return { role: m.role, content }
        })

      const res = await window.claudeDesktop.sendSideChatMessage({
        messages: historyPayload,
        contextHint: contextHint || undefined,
        mainConversationMessages
      })

      const completionTime = Date.now()
      const cleanFinalContent = cleanObjectText(res.content || '')
      const cleanFinalReasoning = cleanObjectText(res.reasoningContent || '')
      const finalMessages = get().sideChatMessages.map((m) =>
        m.id === assistantMsg.id
          ? {
              ...m,
              content: cleanFinalContent || cleanObjectText(m.content) || '(无返回内容)',
              reasoningContent:
                cleanFinalReasoning || cleanObjectText(m.reasoningContent) || undefined
            }
          : m
      )
      const currentThreads = get().threads.map((t) =>
        t.id === get().activeThreadId
          ? {
              ...t,
              sideChatMessages: finalMessages,
              sideChatUpdatedAt: completionTime,
              sideChatExpired: false
            }
          : t
      )
      set({
        isSideChatBusy: false,
        sideChatMessages: finalMessages,
        isSideChatExpired: false,
        threads: currentThreads
      })
      persistThreads(currentThreads)
      persistSideChat(finalMessages)
    } catch (err: any) {
      const errorTime = Date.now()
      const finalMessages = get().sideChatMessages.map((m) =>
        m.id === assistantMsg.id
          ? {
              ...m,
              content: cleanObjectText(m.content) || `请求失败: ${err.message || String(err)}`
            }
          : m
      )
      const currentThreads = get().threads.map((t) =>
        t.id === get().activeThreadId
          ? {
              ...t,
              sideChatMessages: finalMessages,
              sideChatUpdatedAt: errorTime,
              sideChatExpired: false
            }
          : t
      )
      set({
        isSideChatBusy: false,
        sideChatMessages: finalMessages,
        isSideChatExpired: false,
        threads: currentThreads
      })
      persistThreads(currentThreads)
      persistSideChat(finalMessages)
    }
  },
  clearSideChat: () => {
    const state = get()
    const nextThreads = state.threads.map((t) =>
      t.id === state.activeThreadId
        ? {
            ...t,
            sideChatMessages: [],
            sideChatUpdatedAt: undefined,
            sideChatExpired: false
          }
        : t
    )
    set({ sideChatMessages: [], isSideChatExpired: false, threads: nextThreads })
    persistThreads(nextThreads)
    persistSideChat([])
  },
  abortSideChat: async () => {
    await window.claudeDesktop.abortSideChat()
    set({ isSideChatBusy: false })
  },
  stageContentForDocEditor: (content: string) => {
    const state = get()
    const raw = content || ''
    const existingTitles = state.docTabs.map((t) => t.title)
    const smartTitle = generateSmartDocTabTitle(raw, existingTitles)
    const now = Date.now()
    const newTab: DocEditorTab = {
      id: `doctab_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title: smartTitle,
      originalContent: raw,
      content: raw,
      naturalizeLevel: 'faithful',
      pendingSmartTitle: !raw.trim(),
      createdAt: now,
      updatedAt: now
    }
    const nextTabs = [...state.docTabs, newTab]
    persistDocTabs(nextTabs)
    set({
      docTabs: nextTabs,
      activeDocTabId: newTab.id,
      stagedDocContent: raw,
      activeMode: 'doc-editor',
      isSideChatOpen: false,
      isSideChatMode: false,
      toastNotification: {
        title: `已新建标签「${smartTitle}」`,
        body: '已转存至文本排版工坊，原有标签页完整保留',
        timestamp: now
      }
    })
  },
  addDocTab: (initialContent = '') => {
    const state = get()
    const existingTitles = state.docTabs.map((t) => t.title)
    const hasContent = Boolean(initialContent.trim())
    const title = generateSmartDocTabTitle(initialContent, existingTitles)
    const now = Date.now()
    const newTab: DocEditorTab = {
      id: `doctab_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      originalContent: initialContent,
      content: initialContent,
      naturalizeLevel: 'faithful',
      pendingSmartTitle: !hasContent,
      createdAt: now,
      updatedAt: now
    }
    const nextTabs = [...state.docTabs, newTab]
    persistDocTabs(nextTabs)
    set({
      docTabs: nextTabs,
      activeDocTabId: newTab.id
    })
  },
  closeDocTab: (tabId: string) => {
    const state = get()
    if (state.docTabs.length <= 1) {
      const now = Date.now()
      const freshTab: DocEditorTab = {
        id: `doctab_${now}`,
        title: '新建排版稿',
        originalContent: '',
        content: '',
        naturalizeLevel: 'faithful',
        pendingSmartTitle: true,
        createdAt: now,
        updatedAt: now
      }
      persistDocTabs([freshTab])
      set({
        docTabs: [freshTab],
        activeDocTabId: freshTab.id
      })
      return
    }

    const idx = state.docTabs.findIndex((t) => t.id === tabId)
    const nextTabs = state.docTabs.filter((t) => t.id !== tabId)
    let nextActiveId = state.activeDocTabId
    if (state.activeDocTabId === tabId) {
      const fallbackIdx = Math.min(Math.max(0, idx), nextTabs.length - 1)
      nextActiveId = nextTabs[fallbackIdx].id
    }
    persistDocTabs(nextTabs)
    set({
      docTabs: nextTabs,
      activeDocTabId: nextActiveId
    })
  },
  setActiveDocTab: (tabId: string) => {
    if (get().docTabs.some((t) => t.id === tabId)) {
      set({ activeDocTabId: tabId })
    }
  },
  updateDocTabContent: (tabId: string, nextContent: string, resetBaseline = false) => {
    const state = get()
    const otherTitles = state.docTabs.filter((t) => t.id !== tabId).map((t) => t.title)
    const nextTabs = state.docTabs.map((t) => {
      if (t.id !== tabId) return t
      const shouldUpdateBaseline =
        resetBaseline || t.naturalizeLevel === 'faithful' || !t.originalContent.trim()
      const shouldAutoName = Boolean(t.pendingSmartTitle && nextContent.trim().length >= 4)
      return {
        ...t,
        title: shouldAutoName ? generateSmartDocTabTitle(nextContent, otherTitles) : t.title,
        pendingSmartTitle: shouldAutoName ? false : t.pendingSmartTitle,
        originalContent: shouldUpdateBaseline ? nextContent : t.originalContent,
        content: nextContent,
        naturalizeLevel: resetBaseline ? 'faithful' : t.naturalizeLevel,
        updatedAt: Date.now()
      }
    })
    persistDocTabs(nextTabs)
    set({ docTabs: nextTabs })
  },
  setDocTabNaturalizeLevel: (tabId: string, level: NaturalizeLevel): NaturalizeResult => {
    const state = get()
    const target = state.docTabs.find((t) => t.id === tabId)
    if (!target) {
      return { text: '', changeCount: 0, charDelta: 0 }
    }
    const baseline = target.originalContent || target.content
    const result = naturalizeMarkdownDocument(baseline, level)
    const nextTabs = state.docTabs.map((t) =>
      t.id === tabId
        ? {
            ...t,
            originalContent: baseline,
            content: result.text,
            naturalizeLevel: level,
            updatedAt: Date.now()
          }
        : t
    )
    persistDocTabs(nextTabs)
    set({ docTabs: nextTabs })
    return result
  },
  reorderDocTabs: (fromIndex: number, toIndex: number) => {
    const state = get()
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= state.docTabs.length ||
      toIndex >= state.docTabs.length
    ) {
      return
    }
    const nextTabs = [...state.docTabs]
    const [moved] = nextTabs.splice(fromIndex, 1)
    nextTabs.splice(toIndex, 0, moved)
    persistDocTabs(nextTabs)
    set({ docTabs: nextTabs })
  },
  refreshKnowledgeDocs: async () => {
    const kbState = await safeBridgeCall(
      () => window.claudeDesktop?.listKnowledgeDocs?.(),
      null
    )
    if (kbState) {
      set({
        knowledgeDocs: kbState.docs || [],
        knowledgeStorageDir: kbState.storageDir || ''
      })
    }
  },
  savePdfToKnowledgeBase: async (payload: SaveKnowledgePdfPayload) => {
    if (typeof window.claudeDesktop?.saveToKnowledgeBase !== 'function') {
      set({
        toastNotification: {
          title: '需重启一次桌面端主进程',
          body: '新增后台模块已就绪，请在终端重启一次 npm run dev 即可启用知识库归档',
          timestamp: Date.now()
        }
      })
      throw new Error('新增后台知识库接口需重启一次 Electron 主进程 (npm run dev) 后生效')
    }
    const res = await window.claudeDesktop.saveToKnowledgeBase(payload)
    set({
      knowledgeDocs: res.state.docs,
      knowledgeStorageDir: res.state.storageDir,
      toastNotification: {
        title: '已存入知识库文档区',
        body: `已归档 ${res.item.fileName} 至「知识库文档存储」文件夹`,
        timestamp: Date.now()
      }
    })
    return res.item
  },
  importAttachmentToKnowledgeBase: async (att: ChatAttachment) => {
    if (typeof window.claudeDesktop?.importToKnowledgeBase !== 'function') {
      set({
        toastNotification: {
          title: '需重启一次桌面端主进程',
          body: '请在终端重启一次 npm run dev 即可启用附件加入知识库功能',
          timestamp: Date.now()
        }
      })
      return null
    }

    try {
      const res = await window.claudeDesktop.importToKnowledgeBase({
        name: att.name,
        filePath: att.filePath,
        previewDataUrl: att.previewDataUrl,
        extractedText: att.extractedText,
        ext: att.ext,
        kind: att.kind
      })

      if (res && res.state) {
        set({
          knowledgeDocs: res.state.docs || [],
          knowledgeStorageDir: res.state.storageDir || '',
          toastNotification: {
            title: '已存入知识库文档',
            body: `文件「${res.item.fileName}」已成功归档至后台知识库`,
            timestamp: Date.now(),
            actionLabel: '前往查看',
            onAction: () => {
              get().setWorkbenchSubView('knowledge-base')
              get().clearToast()
            }
          }
        })
        return res.item
      }
      return null
    } catch (err) {
      set({
        toastNotification: {
          title: '加入知识库失败',
          body: err instanceof Error ? err.message : '保存文件至知识库时发生错误',
          timestamp: Date.now()
        }
      })
      return null
    }
  },
  importLocalFilesToKnowledgeBase: async () => {
    if (
      typeof window.claudeDesktop?.pickAttachments !== 'function' ||
      typeof window.claudeDesktop?.importToKnowledgeBase !== 'function'
    ) {
      set({
        toastNotification: {
          title: '需重启一次桌面端主进程',
          body: '请在终端重启一次 npm run dev 即可启用文档导入功能',
          timestamp: Date.now()
        }
      })
      return
    }

    try {
      const picked = await window.claudeDesktop.pickAttachments()
      if (!picked || picked.length === 0) return

      let lastState: KnowledgeBaseState | null = null
      let successCount = 0

      for (const att of picked) {
        try {
          const res = await window.claudeDesktop.importToKnowledgeBase({
            name: att.name,
            filePath: att.filePath,
            previewDataUrl: att.previewDataUrl,
            extractedText: att.extractedText,
            ext: att.ext,
            kind: att.kind
          })
          if (res?.state) {
            lastState = res.state
            successCount++
          }
        } catch {
          // ignore error for single file
        }
      }

      if (lastState) {
        set({
          knowledgeDocs: lastState.docs || [],
          knowledgeStorageDir: lastState.storageDir || '',
          toastNotification: {
            title: '文档导入成功',
            body: `已成功将 ${successCount} 份文档归档至「知识库文档存储」`,
            timestamp: Date.now()
          }
        })
      }
    } catch (err) {
      set({
        toastNotification: {
          title: '导入文档失败',
          body: err instanceof Error ? err.message : '选择或导入文件时发生错误',
          timestamp: Date.now()
        }
      })
    }
  },
  deleteKnowledgeDoc: async (docId: string) => {
    if (typeof window.claudeDesktop?.deleteKnowledgeDoc !== 'function') return
    const kbState = await window.claudeDesktop.deleteKnowledgeDoc(docId)
    set({
      knowledgeDocs: kbState.docs,
      knowledgeStorageDir: kbState.storageDir
    })
  },
  openKnowledgeDocExternal: async (docId: string, revealInFolder = false) => {
    if (typeof window.claudeDesktop?.openKnowledgeDoc !== 'function') return
    await window.claudeDesktop.openKnowledgeDoc({ docId, revealInFolder })
  },
  openKnowledgeFolder: async () => {
    if (typeof window.claudeDesktop?.openKnowledgeFolder !== 'function') {
      set({
        toastNotification: {
          title: '需重启一次桌面端主进程',
          body: '请在终端重启一次 npm run dev 以激活「知识库文档存储」文件夹打开功能',
          timestamp: Date.now()
        }
      })
      return
    }
    const res = await window.claudeDesktop.openKnowledgeFolder()
    if (res?.storageDir) {
      set({ knowledgeStorageDir: res.storageDir })
    }
  },
  clearToast: () => set({ toastNotification: null }),

  initialize: async () => {
    const defaultTokenStats: TokenUsageStats = {
      currentTokens: 0,
      maxTokens: 200000,
      usageRatio: 0,
      microCompactedCount: 0,
      autoCompactedCount: 0,
      totalSavedTokens: 0
    }

    const [
      configBundle,
      sessionState,
      swarmState,
      memoryState,
      fileTree,
      gitStatus,
      skills,
      mcpServers,
      kbState,
      diskThreadsRaw
    ] = await Promise.all([
      safeBridgeCall<{ config: AppConfig | null; presets: ModelProviderPreset[] }>(
        () => window.claudeDesktop?.getConfig?.(),
        { config: null, presets: [] }
      ),
      safeBridgeCall(
        () => window.claudeDesktop?.getSessionState?.(),
        { messages: [] as ChatMessage[], tokenStats: defaultTokenStats }
      ),
      safeBridgeCall(() => window.claudeDesktop?.getSwarmState?.(), null),
      safeBridgeCall(
        () => window.claudeDesktop?.getMemoryState?.(),
        {
          memoryMarkdown: '',
          memoryNodes: [] as MemoryNode[],
          dreamLogs: [] as DreamLogEntry[],
          kairosRules: [] as KairosTriggerRule[]
        }
      ),
      safeBridgeCall(() => window.claudeDesktop?.getFileTree?.(), [] as FileTreeNode[]),
      safeBridgeCall(
        () => window.claudeDesktop?.getGitStatus?.(),
        { branch: 'main', isRepo: false, changes: [] } as GitStatusSummary
      ),
      safeBridgeCall(() => window.claudeDesktop?.getSkills?.(), [] as AgentSkillItem[]),
      safeBridgeCall(() => window.claudeDesktop?.getMcpServers?.(), [] as McpServerItem[]),
      safeBridgeCall(
        () => window.claudeDesktop?.listKnowledgeDocs?.(),
        { storageDir: '', docs: [] as KnowledgeDocItem[] }
      ),
      safeBridgeCall(() => window.claudeDesktop?.loadThreads?.(), [] as unknown[])
    ])

    const config = configBundle.config
    const presets = configBundle.presets || []
    const workspaceDir =
      config?.workspaceDir ||
      get().threads.find((t) => Boolean(t.workspaceDir))?.workspaceDir ||
      ''

    const diskThreads = Array.isArray(diskThreadsRaw) ? (diskThreadsRaw as CodexThread[]) : []
    const localThreads = loadLocalSavedThreads(workspaceDir)
    const mergedThreads = mergeThreads(diskThreads, localThreads, workspaceDir)
    const initialThreads =
      mergedThreads.length > 0 ? mergedThreads : [createInitialThread(workspaceDir)]

    writeThreadsToLocalStorage(initialThreads)
    if (localThreads.length > 0 || diskThreads.length !== initialThreads.length) {
      void flushThreadsToDiskNow(initialThreads)
    }

    const activeId = initialThreads[0].id

    if (sessionState.messages && sessionState.messages.length > 0) {
      initialThreads[0] = deriveThreadMeta(
        initialThreads[0],
        sessionState.messages,
        false,
        false
      )
    } else if (
      initialThreads[0].messages.length > 0 &&
      typeof window.claudeDesktop?.setSessionMessages === 'function'
    ) {
      await safeBridgeCall(
        () => window.claudeDesktop.setSessionMessages(initialThreads[0].messages),
        { ok: false }
      )
    }

    set({
      config: config
        ? {
            ...config,
            permissionMode: config.permissionMode || 'default',
            autoMemoryCrystallize: config.autoMemoryCrystallize ?? true
          }
        : get().config,
      presets,
      messages: initialThreads[0].messages,
      threads: initialThreads,
      activeThreadId: activeId,
      tokenStats: sessionState.tokenStats || defaultTokenStats,
      swarmState,
      memoryMarkdown: memoryState.memoryMarkdown || '',
      memoryNodes: memoryState.memoryNodes || [],
      dreamLogs: memoryState.dreamLogs || [],
      kairosRules: memoryState.kairosRules || [],
      fileTree: fileTree || [],
      gitStatus: gitStatus || { branch: 'main', isRepo: false, changes: [] },
      skills: skills || [],
      mcpServers: mcpServers || [],
      knowledgeDocs: kbState?.docs || [],
      knowledgeStorageDir: kbState?.storageDir || ''
    })

    const syncActiveThreadSnapshot = (): void => {
      const state = get()
      const updatedThreads = state.threads.map((t) =>
        t.id === state.activeThreadId
          ? deriveThreadMeta(t, state.messages, state.isBusy, Boolean(state.pendingApproval))
          : t
      )
      set({ threads: updatedThreads })
      persistThreads(updatedThreads)
    }

    if (activeStreamUnsubscribe) {
      activeStreamUnsubscribe()
      activeStreamUnsubscribe = null
    }

    if (typeof window.claudeDesktop?.onStreamUpdate === 'function') {
      activeStreamUnsubscribe = window.claudeDesktop.onStreamUpdate((payload) => {
      if (payload.type === 'messages_updated') {
        set((state) => ({
          messages: payload.messages || state.messages,
          tokenStats: payload.tokenStats || state.tokenStats
        }))
        syncActiveThreadSnapshot()
        get().refreshFileTree()
        get().refreshGitStatus()
      } else if (payload.type === 'streaming_delta' && payload.streamingMessageId) {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === payload.streamingMessageId && !m.interrupted
              ? {
                  ...m,
                  content: m.content + (payload.contentDelta || ''),
                  isThinkingStreaming:
                    payload.contentDelta || m.content ? false : m.isThinkingStreaming,
                  thinkingDurationMs:
                    (payload.contentDelta || m.content) && m.isThinkingStreaming && !m.thinkingDurationMs
                      ? Math.max(200, Date.now() - m.timestamp)
                      : m.thinkingDurationMs,
                  reasoningContent:
                    (m.reasoningContent || '') + (payload.reasoningDelta || '') || undefined
                }
              : m
          )
        }))
      } else if (payload.type === 'tool_approval_required') {
        set({ pendingApproval: payload.pendingApproval || null })
        syncActiveThreadSnapshot()
      } else if (payload.type === 'terminal_output' && payload.terminalLine) {
        set((state) => ({
          terminalLogs: [
            ...state.terminalLogs.slice(-240),
            {
              id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              commandId: payload.terminalLine!.commandId,
              text: maskSensitiveSecrets(payload.terminalLine!.text),
              stream: payload.terminalLine!.stream,
              timestamp: Date.now()
            }
          ]
        }))
      } else if (payload.type === 'side_chat_delta') {
        const rawContent =
          typeof payload.contentDelta === 'string'
            ? payload.contentDelta
            : typeof payload.sideChatDelta === 'string'
              ? payload.sideChatDelta
              : typeof payload.sideChatDelta?.content === 'string'
                ? payload.sideChatDelta.content
                : ''

        const rawReasoning =
          typeof payload.reasoningDelta === 'string'
            ? payload.reasoningDelta
            : typeof payload.sideChatDelta?.reasoning === 'string'
              ? payload.sideChatDelta.reasoning
              : ''

        if (!rawContent && !rawReasoning) return

        set((state) => {
          const msgs = [...state.sideChatMessages]
          if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
            const last = msgs[msgs.length - 1]
            const cleanPrevContent = cleanObjectText(last.content)
            const cleanPrevReasoning = cleanObjectText(last.reasoningContent)
            msgs[msgs.length - 1] = {
              ...last,
              content: rawContent ? cleanPrevContent + rawContent : cleanPrevContent,
              reasoningContent: rawReasoning
                ? (cleanPrevReasoning ? cleanPrevReasoning + rawReasoning : rawReasoning)
                : cleanPrevReasoning || undefined
            }
          }
          const nextThreads = state.threads.map((t) =>
            t.id === state.activeThreadId
              ? {
                  ...t,
                  sideChatMessages: msgs,
                  sideChatUpdatedAt: Date.now(),
                  sideChatExpired: false
                }
              : t
          )
          persistSideChat(msgs)
          persistThreads(nextThreads)
          return { sideChatMessages: msgs, threads: nextThreads, isSideChatExpired: false }
        })
      } else if (payload.type === 'token_stats' && payload.tokenStats) {
        set({ tokenStats: payload.tokenStats })
      } else if (payload.type === 'swarm_updated' && payload.swarmState) {
        set({ swarmState: payload.swarmState })
      } else if (payload.type === 'dream_updated') {
        set((state) => ({
          dreamLogs: payload.dreamLogs || state.dreamLogs,
          memoryMarkdown: payload.memoryMarkdown ?? state.memoryMarkdown,
          memoryNodes: payload.memoryNodes || state.memoryNodes,
          toastNotification: payload.notification || state.toastNotification
        }))
      } else if (payload.type === 'skills_updated') {
        set((state) => ({
          skills: payload.skills || state.skills,
          toastNotification: payload.notification || state.toastNotification
        }))
      } else if (payload.type === 'mcp_updated') {
        set((state) => ({
          mcpServers: payload.mcpServers || state.mcpServers,
          toastNotification: payload.notification || state.toastNotification
        }))
      } else if (payload.type === 'knowledge_docs_updated') {
        set((state) => ({
          knowledgeDocs: payload.knowledgeDocs || state.knowledgeDocs,
          toastNotification: payload.notification || state.toastNotification
        }))
      } else if (payload.type === 'projects_updated' && payload.projects) {
        set((state) => ({
          config: state.config ? { ...state.config, projects: payload.projects } : state.config
        }))
      } else if (payload.type === 'kairos_notification' && payload.notification) {
        set({ toastNotification: payload.notification })
      } else if (payload.type === 'agent_status') {
        const busy = Boolean(payload.isBusy)
        set((state) => ({
          isBusy: busy,
          busyStartedAt: busy ? state.busyStartedAt || Date.now() : null,
          messages: !busy
            ? state.messages.map((m) =>
                m.isThinkingStreaming
                  ? {
                      ...m,
                      isThinkingStreaming: false,
                      thinkingDurationMs: m.thinkingDurationMs || Math.max(200, Date.now() - m.timestamp),
                      interrupted: true
                    }
                  : m
              )
            : state.messages
        }))
        syncActiveThreadSnapshot()
      }
      })
    }

    if (typeof window.claudeDesktop?.onOpenQuickLauncher === 'function') {
      window.claudeDesktop.onOpenQuickLauncher(() => {
        set({ isQuickLauncherOpen: true })
      })
    }
  },

  refreshFileTree: async () => {
    const fileTree = await window.claudeDesktop.getFileTree()
    set({ fileTree })
  },

  refreshGitStatus: async () => {
    const gitStatus = await window.claudeDesktop.getGitStatus()
    set({ gitStatus })
  },

  previewFile: async (filePath) => {
    const content = await window.claudeDesktop.readWorkspaceFile(filePath)
    set({ selectedFilePreview: { path: filePath, content } })
  },

  closeFilePreview: () => set({ selectedFilePreview: null }),

  previewGitDiff: async (relativePath) => {
    const diff = await window.claudeDesktop.getGitDiff(relativePath)
    set({ selectedDiffPreview: { path: relativePath, diff } })
  },

  closeDiffPreview: () => set({ selectedDiffPreview: null }),

  runQuickTerminalCommand: async (cmd) => {
    const trimmed = cmd.trim()
    if (!trimmed) return
    if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'cls') {
      set({ terminalLogs: [] })
      return
    }
    await window.claudeDesktop.runQuickTerminal(trimmed)
    await Promise.all([get().refreshFileTree(), get().refreshGitStatus()])
  },

  clearTerminalLogs: () => {
    set({ terminalLogs: [] })
  },

  updateConfig: async (partial) => {
    const updated = await window.claudeDesktop.updateConfig(partial)
    const sessionState = await window.claudeDesktop.getSessionState()
    set({ config: updated, tokenStats: sessionState.tokenStats })
  },

  switchProvider: async (providerId: string, model?: string) => {
    const updated = await window.claudeDesktop.switchProvider({ providerId, model })
    set({ config: updated })
  },

  switchModel: async (model: string) => {
    const state = get()
    const activeProviderId = state.config?.activeProviderId
    const activeProvider = state.config?.providers?.find((p) => p.id === activeProviderId)
    const updatedProviders = (state.config?.providers || []).map((p) =>
      p.id === activeProvider?.id
        ? {
            ...p,
            mainModel: model,
            availableModels: p.availableModels.includes(model)
              ? p.availableModels
              : [...p.availableModels, model]
          }
        : p
    )
    const updated = await window.claudeDesktop.updateConfig({
      mainModel: model,
      providers: updatedProviders
    })
    set({ config: updated })
  },

  testProviderConnection: async (provider: AIProviderConfig) => {
    const res = await window.claudeDesktop.testProviderConnection(provider)
    const configBundle = await window.claudeDesktop.getConfig()
    if (configBundle?.config) {
      set({ config: configBundle.config })
    }
    return res
  },

  upsertProvider: async (provider: AIProviderConfig) => {
    const state = get()
    const list = state.config?.providers || []
    const idx = list.findIndex((p) => p.id === provider.id)
    const nextList = [...list]
    if (idx >= 0) {
      nextList[idx] = provider
    } else {
      nextList.push(provider)
    }
    const updated = await window.claudeDesktop.updateConfig({
      providers: nextList,
      ...(state.config?.activeProviderId === provider.id
        ? {
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            mainModel: provider.mainModel,
            fastModel: provider.fastModel,
            proxyMode: provider.proxyMode,
            customProxyUrl: provider.customProxyUrl,
            maxContextTokens: provider.defaultContextTokens
          }
        : {})
    })
    set({ config: updated })
  },

  deleteProvider: async (providerId: string) => {
    const state = get()
    const list = (state.config?.providers || []).filter((p) => p.id !== providerId)
    if (list.length === 0) return
    const isDeletingActive = state.config?.activeProviderId === providerId
    const nextActiveId = isDeletingActive ? list[0].id : state.config?.activeProviderId
    const nextActive = list.find((p) => p.id === nextActiveId) || list[0]

    const updated = await window.claudeDesktop.updateConfig({
      providers: list,
      activeProviderId: nextActive.id,
      baseUrl: nextActive.baseUrl,
      apiKey: nextActive.apiKey,
      mainModel: nextActive.mainModel,
      fastModel: nextActive.fastModel,
      proxyMode: nextActive.proxyMode,
      customProxyUrl: nextActive.customProxyUrl,
      maxContextTokens: nextActive.defaultContextTokens
    })
    set({ config: updated })
  },

  setPermissionMode: async (mode) => {
    const partial: Partial<AppConfig> = {
      permissionMode: mode,
      autoApproveWriteInSession: mode === 'bypassPermissions'
    }
    const updated = await window.claudeDesktop.updateConfig(partial)
    set({ config: updated })
  },

  cyclePermissionMode: async () => {
    const current = get().config?.permissionMode || 'default'
    const idx = PERMISSION_MODES_ORDER.indexOf(current)
    const next = PERMISSION_MODES_ORDER[(idx + 1) % PERMISSION_MODES_ORDER.length]
    await get().setPermissionMode(next)
  },

  selectWorkspace: async () => {
    await get().addProjectFolder()
  },

  addProjectFolder: async () => {
    const updated = await window.claudeDesktop.addProjectFolder()
    if (updated) {
      const [fileTree, gitStatus, memoryState] = await Promise.all([
        window.claudeDesktop.getFileTree(),
        window.claudeDesktop.getGitStatus(),
        window.claudeDesktop.getMemoryState()
      ])
      set({
        config: updated,
        fileTree,
        gitStatus,
        selectedFilePreview: null,
        selectedDiffPreview: null,
        memoryMarkdown: memoryState.memoryMarkdown,
        memoryNodes: memoryState.memoryNodes || [],
        workbenchSubView: 'chat'
      })
      persistWorkbenchSubView('chat')

      // Ensure at least one thread exists under this newly added folder
      const state = get()
      const folderThread = state.threads.find((t) => t.workspaceDir === updated.workspaceDir)
      if (folderThread) {
        await get().switchThread(folderThread.id)
      } else {
        await get().createNewThread(updated.workspaceDir)
      }
    }
  },

  switchProjectFolder: async (dirPath) => {
    const state = get()
    if (state.config?.workspaceDir === dirPath) return
    const updated = await window.claudeDesktop.switchProjectFolder(dirPath)
    const [fileTree, gitStatus, memoryState] = await Promise.all([
      window.claudeDesktop.getFileTree(),
      window.claudeDesktop.getGitStatus(),
      window.claudeDesktop.getMemoryState()
    ])
    set({
      config: updated,
      fileTree,
      gitStatus,
      selectedFilePreview: null,
      selectedDiffPreview: null,
      memoryMarkdown: memoryState.memoryMarkdown,
      memoryNodes: memoryState.memoryNodes || []
    })
  },

  removeProjectFolder: async (dirPath) => {
    const updated = await window.claudeDesktop.removeProjectFolder(dirPath)
    const [fileTree, gitStatus, memoryState] = await Promise.all([
      window.claudeDesktop.getFileTree(),
      window.claudeDesktop.getGitStatus(),
      window.claudeDesktop.getMemoryState()
    ])
    set({
      config: updated,
      fileTree,
      gitStatus,
      memoryMarkdown: memoryState.memoryMarkdown,
      memoryNodes: memoryState.memoryNodes || []
    })
  },

  createNewThread: async (projectDir) => {
    const state = get()
    const targetDir = projectDir || state.config?.workspaceDir || ''

    if (targetDir && targetDir !== state.config?.workspaceDir) {
      await get().switchProjectFolder(targetDir)
    }

    const currentThread = get().threads.find((t) => t.id === get().activeThreadId)
    const currentDraft = get().threadDrafts[get().activeThreadId]
    const hasDraft = Boolean(
      (currentDraft?.text && currentDraft.text.trim()) ||
      (currentDraft?.attachments && currentDraft.attachments.length > 0)
    )
    if (
      currentThread &&
      currentThread.workspaceDir === targetDir &&
      get().messages.length === 0 &&
      !hasDraft
    ) {
      persistWorkbenchSubView('chat')
      set({ workbenchSubView: 'chat' })
      return
    }

    const currentActiveId = get().activeThreadId
    const currentSideOpen = get().isSideChatOpen
    const updatedThreads = get().threads.map((t) =>
      t.id === currentActiveId ? { ...t, isSideChatOpen: currentSideOpen } : t
    )

    await window.claudeDesktop.clearSession()
    const newThread: CodexThread = {
      id: `thread_${Date.now()}`,
      title: '新任务线程',
      workspaceDir: targetDir,
      messages: [],
      sideChatMessages: [],
      sideChatUpdatedAt: undefined,
      sideChatExpired: false,
      isSideChatOpen: false,
      status: 'idle',
      pinned: false,
      updatedAt: Date.now(),
      toolCount: 0
    }
    const nextThreads = [newThread, ...updatedThreads]
    persistWorkbenchSubView('chat')
    set({
      threads: nextThreads,
      activeThreadId: newThread.id,
      messages: [],
      sideChatMessages: [],
      isSideChatExpired: false,
      isSideChatOpen: false,
      isSideChatMode: false,
      pendingApproval: null,
      terminalLogs: [],
      workbenchSubView: 'chat'
    })
    persistThreads(nextThreads)
  },

  switchThread: async (threadId) => {
    const state = get()
    // First, save current active thread's side chat open state
    const currentId = state.activeThreadId
    const currentSideOpen = state.isSideChatOpen
    const baseThreads = state.threads.map((t) =>
      t.id === currentId ? { ...t, isSideChatOpen: currentSideOpen } : t
    )

    let target = baseThreads.find((t) => t.id === threadId)
    if (!target) return

    target = sanitizeThreadSideChat(target)
    const nextThreads = baseThreads.map((t) => (t.id === target!.id ? target! : t))

    if (target.workspaceDir && target.workspaceDir !== state.config?.workspaceDir) {
      await get().switchProjectFolder(target.workspaceDir)
    }

    if (threadId !== state.activeThreadId) {
      await window.claudeDesktop.setSessionMessages(target.messages)
    }

    const shouldOpenSideChat = Boolean(target.isSideChatOpen)

    set({
      threads: nextThreads,
      activeThreadId: target.id,
      messages: target.messages,
      sideChatMessages: target.sideChatMessages || [],
      isSideChatExpired: Boolean(target.sideChatExpired),
      isSideChatOpen: shouldOpenSideChat,
      isSideChatMode: shouldOpenSideChat,
      pendingApproval: null,
      workbenchSubView: 'chat'
    })
    persistWorkbenchSubView('chat')
    persistThreads(nextThreads)
  },

  togglePinThread: (threadId) => {
    const nextThreads = get().threads.map((t) =>
      t.id === threadId ? { ...t, pinned: !t.pinned } : t
    )
    set({ threads: nextThreads })
    persistThreads(nextThreads)
  },

  archiveThread: async (threadId) => {
    const state = get()
    const nextDrafts = { ...state.threadDrafts }
    if (nextDrafts[threadId]) {
      delete nextDrafts[threadId]
      set({ threadDrafts: nextDrafts })
      persistThreadDrafts(nextDrafts)
    }
    const remaining = state.threads.filter((t) => t.id !== threadId)
    if (remaining.length === 0) {
      await window.claudeDesktop.clearSession()
      const fresh: CodexThread = {
        id: `thread_${Date.now()}`,
        title: '新任务线程',
        workspaceDir: state.config?.workspaceDir || '',
        messages: [],
        sideChatMessages: [],
        sideChatUpdatedAt: undefined,
        sideChatExpired: false,
        isSideChatOpen: false,
        status: 'idle',
        pinned: false,
        updatedAt: Date.now(),
        toolCount: 0
      }
      set({
        threads: [fresh],
        activeThreadId: fresh.id,
        messages: [],
        sideChatMessages: [],
        isSideChatExpired: false,
        isSideChatOpen: false,
        isSideChatMode: false,
        pendingApproval: null
      })
      persistThreads([fresh])
      return
    }

    if (state.activeThreadId === threadId) {
      const nextActive = sanitizeThreadSideChat(remaining[0])
      const nextRemaining = remaining.map((t) => (t.id === nextActive.id ? nextActive : t))
      if (nextActive.workspaceDir && nextActive.workspaceDir !== state.config?.workspaceDir) {
        await get().switchProjectFolder(nextActive.workspaceDir)
      }
      await window.claudeDesktop.setSessionMessages(nextActive.messages)
      const nextSideOpen = Boolean(nextActive.isSideChatOpen)
      set({
        threads: nextRemaining,
        activeThreadId: nextActive.id,
        messages: nextActive.messages,
        sideChatMessages: nextActive.sideChatMessages || [],
        isSideChatExpired: Boolean(nextActive.sideChatExpired),
        isSideChatOpen: nextSideOpen,
        isSideChatMode: nextSideOpen,
        pendingApproval: null
      })
      persistThreads(nextRemaining)
    } else {
      set({ threads: remaining })
      persistThreads(remaining)
    }
  },

  branchThreadFromMessage: async (rawId: string) => {
    const state = get()
    const currentThread = state.threads.find((t) => t.id === state.activeThreadId)
    if (!currentThread) return

    const currentId = state.activeThreadId
    const currentSideOpen = state.isSideChatOpen
    const baseThreads = state.threads.map((t) =>
      t.id === currentId ? { ...t, isSideChatOpen: currentSideOpen } : t
    )

    const cleanId = rawId.replace(/^turn_/, '')
    let msgIdx = state.messages.findIndex((m) => m.id === cleanId || m.id === rawId)
    if (msgIdx === -1) {
      msgIdx = state.messages.findIndex((m) => rawId.includes(m.id) || m.id.includes(cleanId))
    }
    if (msgIdx === -1 && state.messages.length > 0) {
      msgIdx = state.messages.length - 1
    }
    if (msgIdx === -1) return

    // If target message is part of an assistant multi-turn, keep the entire assistant turn
    while (msgIdx + 1 < state.messages.length && state.messages[msgIdx + 1].role === 'assistant') {
      msgIdx++
    }

    const branchedMessages = state.messages.slice(0, msgIdx + 1)
    const newThreadId = `thread_branch_${Date.now()}`
    const baseTitle = currentThread.title.replace(/^分支:\s*/, '')
    const branchTitle = `分支: ${baseTitle}`

    const newThread: CodexThread = {
      id: newThreadId,
      title: branchTitle,
      workspaceDir: currentThread.workspaceDir,
      messages: branchedMessages,
      sideChatMessages: [],
      sideChatUpdatedAt: undefined,
      sideChatExpired: false,
      isSideChatOpen: false,
      status: 'idle',
      pinned: false,
      updatedAt: Date.now(),
      toolCount: branchedMessages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0)
    }

    const nextThreads = [newThread, ...baseThreads]
    // 1. Immediately switch store state so subsequent updates target the new branch thread
    set({
      threads: nextThreads,
      activeThreadId: newThread.id,
      messages: branchedMessages,
      sideChatMessages: [],
      isSideChatExpired: false,
      isSideChatOpen: false,
      isSideChatMode: false,
      pendingApproval: null,
      workbenchSubView: 'chat',
      toastNotification: {
        title: '已创建对话分支',
        body: `保留了此节点前共 ${branchedMessages.length} 条完整上下文`,
        timestamp: Date.now()
      }
    })
    persistWorkbenchSubView('chat')
    persistThreads(nextThreads)

    // 2. Sync branched messages to backend session
    await window.claudeDesktop.setSessionMessages(branchedMessages)
  },

  rollbackToMessage: async (messageId?: string) => {
    const state = get()
    if (state.messages.length === 0) return

    let targetIdx = -1
    if (messageId) {
      const cleanId = messageId.replace(/^turn_/, '')
      targetIdx = state.messages.findIndex(
        (m) =>
          m.id === messageId ||
          m.id === cleanId ||
          messageId.includes(m.id) ||
          m.id.includes(cleanId)
      )
    } else {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'user') {
          targetIdx = i
          break
        }
      }
    }

    if (targetIdx === -1) return
    const targetMsg = state.messages[targetIdx]
    const remainingMessages = state.messages.slice(0, targetIdx)
    const targetAttachments =
      Array.isArray(targetMsg.attachments) && targetMsg.attachments.length > 0
        ? targetMsg.attachments.map((att) => ({ ...att }))
        : []

    await window.claudeDesktop.setSessionMessages(remainingMessages)
    const nextThreads = state.threads.map((t) =>
      t.id === state.activeThreadId
        ? deriveThreadMeta(t, remainingMessages, false, false)
        : t
    )
    persistThreads(nextThreads)
    persistWorkbenchSubView('chat')
    set({
      threads: nextThreads,
      messages: remainingMessages,
      draftComposerText: targetMsg.content || '',
      draftComposerAttachments: targetAttachments,
      isBusy: false,
      busyStartedAt: null,
      pendingApproval: null,
      workbenchSubView: 'chat',
      toastNotification: {
        title: '已回退上一条输入',
        body:
          targetAttachments.length > 0
            ? `已恢复发送内容与 ${targetAttachments.length} 个附件至输入框，可直接修改重新发送`
            : '上一次发送的内容已恢复至编辑框，可直接修改重新发送',
        timestamp: Date.now()
      }
    })
  },

  setThreadDraft: (threadId, draft) => {
    if (!threadId) return
    const current = get().threadDrafts
    const hasContent = Boolean(
      (draft.text && draft.text.trim()) ||
      (draft.attachments && draft.attachments.length > 0)
    )
    let nextDrafts: Record<string, ThreadDraft>
    if (!hasContent) {
      if (!current[threadId]) return
      nextDrafts = { ...current }
      delete nextDrafts[threadId]
    } else {
      nextDrafts = {
        ...current,
        [threadId]: {
          text: draft.text || '',
          attachments: Array.isArray(draft.attachments) ? draft.attachments : []
        }
      }
    }
    set({ threadDrafts: nextDrafts })
    persistThreadDrafts(nextDrafts)
  },

  getThreadDraft: (threadId) => {
    return get().threadDrafts[threadId] || { text: '', attachments: [] }
  },

  toggleSkill: async (skillId) => {
    const skills = await window.claudeDesktop.toggleSkill(skillId)
    set({ skills })
  },

  installSkill: async (payload) => {
    const skills = await window.claudeDesktop.installSkill(payload)
    set({ skills })
  },

  deleteSkill: async (skillId) => {
    const skills = await window.claudeDesktop.deleteSkill(skillId)
    set({ skills })
  },

  toggleMcpServer: async (serverId) => {
    const mcpServers = await window.claudeDesktop.toggleMcpServer(serverId)
    set({ mcpServers })
  },

  upsertMcpServer: async (payload) => {
    const mcpServers = await window.claudeDesktop.upsertMcpServer(payload)
    set({ mcpServers })
  },

  deleteMcpServer: async (serverId) => {
    const mcpServers = await window.claudeDesktop.deleteMcpServer(serverId)
    set({ mcpServers })
  },

  probeMcpServer: async (serverId) => {
    const mcpServers = await window.claudeDesktop.probeMcpServer(serverId)
    set({ mcpServers })
  },

  launchExamplePromptInChat: async (promptText, autoSend = false) => {
    persistWorkbenchSubView('chat')
    set({
      activeMode: 'workbench',
      workbenchSubView: 'chat',
      draftComposerText: autoSend ? '' : promptText
    })
    if (autoSend) {
      await get().createNewThread()
      await get().sendMessage(promptText)
    }
  },

  sendMessage: async (text, attachments) => {
    if (attachments && attachments.length > 0) {
      await window.claudeDesktop.sendMessage({ text, attachments })
    } else {
      await window.claudeDesktop.sendMessage(text)
    }
  },

  abortGeneration: async () => {
    // Immediate optimistic update (0ms latency): stop thinking streaming & cancel busy state immediately
    set((state) => ({
      isBusy: false,
      busyStartedAt: null,
      pendingApproval: null,
      messages: state.messages.map((m) =>
        m.isThinkingStreaming || (!m.content && m.reasoningContent && !m.thinkingDurationMs)
          ? {
              ...m,
              isThinkingStreaming: false,
              thinkingDurationMs: m.thinkingDurationMs || Math.max(200, Date.now() - m.timestamp),
              interrupted: true
            }
          : m
      )
    }))
    try {
      await window.claudeDesktop.abortGeneration()
    } catch (e) {
      console.warn('Failed to invoke abortGeneration:', e)
    }
  },

  clearSession: async () => {
    await get().createNewThread()
  },

  resolveApproval: async (toolCallId, decision) => {
    set({ pendingApproval: null })
    await window.claudeDesktop.resolveToolApproval({ toolCallId, decision })
  },

  triggerCompact: async () => {
    await window.claudeDesktop.triggerCompact()
  },

  startSwarm: async (goal, useWorktree) => {
    await window.claudeDesktop.startSwarm({ goal, useWorktree })
  },

  mergeSwarmTask: async (taskId) => {
    const res = await window.claudeDesktop.mergeSwarmTask(taskId)
    await Promise.all([get().refreshFileTree(), get().refreshGitStatus()])
    return res.message
  },

  cleanupWorktrees: async () => {
    return await window.claudeDesktop.cleanupWorktrees()
  },

  triggerDream: async () => {
    await window.claudeDesktop.triggerDream()
  },

  saveMemoryMarkdown: async (content) => {
    await window.claudeDesktop.saveMemoryMd(content)
    set({ memoryMarkdown: content })
  },

  upsertMemoryNode: async (payload) => {
    const memoryNodes = await window.claudeDesktop.upsertMemoryNode(payload)
    const memoryState = await window.claudeDesktop.getMemoryState()
    set({ memoryNodes, memoryMarkdown: memoryState.memoryMarkdown })
  },

  deleteMemoryNode: async (nodeId) => {
    const memoryNodes = await window.claudeDesktop.deleteMemoryNode(nodeId)
    const memoryState = await window.claudeDesktop.getMemoryState()
    set({ memoryNodes, memoryMarkdown: memoryState.memoryMarkdown })
  },

  searchMemories: async (query) => {
    return await window.claudeDesktop.searchMemories(query)
  },

  toggleKairosRule: async (ruleId) => {
    const rules = await window.claudeDesktop.toggleKairosRule(ruleId)
    set({ kairosRules: rules })
  },

  addKairosRule: async (rule) => {
    const rules = await window.claudeDesktop.addKairosRule(rule)
    set({ kairosRules: rules })
  },

  runKairosRuleNow: async (ruleId) => {
    const rules = await window.claudeDesktop.runKairosRuleNow(ruleId)
    set({ kairosRules: rules })
  }
}))
