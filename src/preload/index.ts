import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  AgentSkillItem,
  AIProviderConfig,
  AppConfig,
  ChatAttachment,
  ChatMessage,
  DreamLogEntry,
  ExportDocumentPayload,
  ExportDocumentResult,
  FileTreeNode,
  GitStatusSummary,
  InstalledBrowserInfo,
  ImportKnowledgeDocPayload,
  KairosTriggerRule,
  KnowledgeBaseState,
  KnowledgeDocItem,
  McpServerItem,
  MemoryLayer,
  MemoryNode,
  ModelProviderPreset,
  PtySessionInfo,
  ReadKnowledgeDocResult,
  RecalledMemoryItem,
  SaveKnowledgePdfPayload,
  SendMessagePayload,
  SkillUsageExample,
  StreamUpdatePayload,
  SwarmRunState,
  TestProviderResult,
  TokenUsageStats
} from '@shared/types'

export interface InstallSkillPayload {
  id?: string
  name?: string
  category?: AgentSkillItem['category']
  sourceUrl?: string
  installedBy?: AgentSkillItem['installedBy']
  triggers?: string[]
  summary?: string
  explanation?: string
  capabilities?: string[]
  usageExamples?: SkillUsageExample[]
  rawMarkdown?: string
}

export interface ClaudeDesktopBridge {
  getConfig: () => Promise<{ config: AppConfig; presets: ModelProviderPreset[] }>
  updateConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
  switchProvider: (payload: { providerId: string; model?: string }) => Promise<AppConfig>
  testProviderConnection: (provider: AIProviderConfig) => Promise<TestProviderResult>
  selectWorkspace: () => Promise<AppConfig | null>
  addProjectFolder: () => Promise<AppConfig | null>
  switchProjectFolder: (dirPath: string) => Promise<AppConfig>
  removeProjectFolder: (dirPath: string) => Promise<AppConfig>
  getFileTree: () => Promise<FileTreeNode[]>
  readWorkspaceFile: (filePath: string) => Promise<string>
  getGitStatus: () => Promise<GitStatusSummary>
  getGitDiff: (relativePath: string) => Promise<string>
  runQuickTerminal: (command: string) => Promise<string>
  createPty: (options?: {
    id?: string
    title?: string
    cwd?: string
    cols?: number
    rows?: number
    initialCommand?: string
  }) => Promise<PtySessionInfo>
  writePty: (payload: { id: string; data: string }) => Promise<boolean>
  resizePty: (payload: { id: string; cols: number; rows: number }) => Promise<boolean>
  killPty: (id: string) => Promise<boolean>
  listPty: () => Promise<PtySessionInfo[]>
  loadThreads: () => Promise<unknown[]>
  saveThreads: (threads: unknown[]) => Promise<boolean>
  pickAttachments: () => Promise<ChatAttachment[]>
  parseAttachmentPaths: (paths: string[]) => Promise<ChatAttachment[]>
  parseDataAttachment: (payload: {
    name: string
    mimeType?: string
    dataBase64: string
  }) => Promise<ChatAttachment | null>
  getPathForFile?: (file: File) => string

  // Codex Skills Hub
  getSkills: () => Promise<AgentSkillItem[]>
  toggleSkill: (skillId: string) => Promise<AgentSkillItem[]>
  installSkill: (payload: InstallSkillPayload) => Promise<AgentSkillItem[]>
  deleteSkill: (skillId: string) => Promise<AgentSkillItem[]>

  // Codex MCP Hub
  getMcpServers: () => Promise<McpServerItem[]>
  toggleMcpServer: (serverId: string) => Promise<McpServerItem[]>
  upsertMcpServer: (
    payload: Partial<McpServerItem> & { name: string }
  ) => Promise<McpServerItem[]>
  deleteMcpServer: (serverId: string) => Promise<McpServerItem[]>
  probeMcpServer: (serverId: string) => Promise<McpServerItem[]>

  // Direction A: Workbench & QueryEngine
  getSessionState: () => Promise<{ messages: ChatMessage[]; tokenStats: TokenUsageStats }>
  sendMessage: (input: string | SendMessagePayload) => Promise<{ ok: boolean }>
  abortGeneration: () => Promise<{ ok: boolean }>
  clearSession: () => Promise<{ ok: boolean }>
  setSessionMessages: (messages: ChatMessage[]) => Promise<{ ok: boolean }>
  resolveToolApproval: (payload: {
    toolCallId: string
    decision: 'approve_once' | 'approve_session' | 'reject'
  }) => Promise<{ ok: boolean }>
  triggerCompact: () => Promise<{ ok: boolean; summary: string }>

  // Direction B: Coordinator Swarm
  getSwarmState: () => Promise<SwarmRunState>
  startSwarm: (payload: {
    goal: string
    useWorktree: boolean
  }) => Promise<{ ok: boolean; synthesis: string }>
  mergeSwarmTask: (taskId: string) => Promise<{ ok: boolean; message: string }>
  cleanupWorktrees: () => Promise<string>

  // Direction C: KAIROS & L1-L5 Hierarchical Memory Engine
  getMemoryState: () => Promise<{
    memoryMarkdown: string
    memoryNodes: MemoryNode[]
    dreamLogs: DreamLogEntry[]
    kairosRules: KairosTriggerRule[]
  }>
  triggerDream: () => Promise<DreamLogEntry>
  saveMemoryMd: (content: string) => Promise<{ ok: boolean }>
  upsertMemoryNode: (payload: {
    id?: string
    layer: MemoryLayer
    title: string
    content: string
    keywords?: string[]
    tags?: string[]
    importance?: number
  }) => Promise<MemoryNode[]>
  deleteMemoryNode: (nodeId: string) => Promise<MemoryNode[]>
  searchMemories: (query: string) => Promise<RecalledMemoryItem[]>
  toggleKairosRule: (ruleId: string) => Promise<KairosTriggerRule[]>
  addKairosRule: (
    rule: Omit<KairosTriggerRule, 'id' | 'enabled'>
  ) => Promise<KairosTriggerRule[]>
  runKairosRuleNow: (ruleId: string) => Promise<KairosTriggerRule[]>

  // Codex Ephemeral Side Chat
  sendSideChatMessage: (payload: {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    contextHint?: string
    mainConversationMessages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  }) => Promise<{ content: string; reasoningContent: string }>
  abortSideChat: () => Promise<{ ok: boolean }>

  // AI Doc Editor Export & Knowledge Base Multi-Format Storage
  exportDocument: (payload: ExportDocumentPayload) => Promise<ExportDocumentResult>
  saveToKnowledgeBase: (
    payload: SaveKnowledgePdfPayload
  ) => Promise<{ item: KnowledgeDocItem; state: KnowledgeBaseState }>
  importToKnowledgeBase: (
    payload: ImportKnowledgeDocPayload
  ) => Promise<{ item: KnowledgeDocItem; state: KnowledgeBaseState }>
  listKnowledgeDocs: () => Promise<KnowledgeBaseState>
  readKnowledgeDocPdf: (
    docId: string
  ) => Promise<ReadKnowledgeDocResult | null>
  deleteKnowledgeDoc: (docId: string) => Promise<KnowledgeBaseState>
  openKnowledgeDoc: (payload: {
    docId: string
    revealInFolder?: boolean
  }) => Promise<{ ok: boolean }>
  openKnowledgeFolder: () => Promise<{ ok: boolean; storageDir: string }>

  // Codex-Style Browser & Multi-Document Preview Hub
  listInstalledBrowsers: () => Promise<InstalledBrowserInfo[]>
  openInBrowser: (payload: {
    browserId: string
    url: string
    appPath?: string
  }) => Promise<{ ok: boolean }>
  openPathInApp: (filePath: string) => Promise<{ ok: boolean }>
  convertDocxToHtml: (filePath: string) => Promise<{ ok: boolean; html: string }>
  parseExcelData: (filePath: string) => Promise<{
    ok: boolean
    sheets: Array<{ name: string; rows: string[][] }>
    totalRows: number
    totalCols: number
  }>
  readFileAsDataUrl: (filePath: string) => Promise<string | null>

  // Event Subscriptions
  onStreamUpdate: (callback: (payload: StreamUpdatePayload) => void) => () => void
  onOpenQuickLauncher: (callback: () => void) => () => void
}

const api: ClaudeDesktopBridge = {
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),
  updateConfig: (partial) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CONFIG, partial),
  switchProvider: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SWITCH_PROVIDER, payload),
  testProviderConnection: (provider) =>
    ipcRenderer.invoke(IPC_CHANNELS.TEST_PROVIDER_CONNECTION, provider),
  selectWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_WORKSPACE),
  addProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.ADD_PROJECT_FOLDER),
  switchProjectFolder: (dirPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SWITCH_PROJECT_FOLDER, dirPath),
  removeProjectFolder: (dirPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_PROJECT_FOLDER, dirPath),
  getFileTree: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_TREE),
  readWorkspaceFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.READ_WORKSPACE_FILE, filePath),
  getGitStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_GIT_STATUS),
  getGitDiff: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.GET_GIT_DIFF, relativePath),
  runQuickTerminal: (command) => ipcRenderer.invoke(IPC_CHANNELS.RUN_QUICK_TERMINAL, command),
  createPty: (options) => ipcRenderer.invoke(IPC_CHANNELS.PTY_CREATE, options),
  writePty: (payload) => ipcRenderer.invoke(IPC_CHANNELS.PTY_WRITE, payload),
  resizePty: (payload) => ipcRenderer.invoke(IPC_CHANNELS.PTY_RESIZE, payload),
  killPty: (id) => ipcRenderer.invoke(IPC_CHANNELS.PTY_KILL, id),
  listPty: () => ipcRenderer.invoke(IPC_CHANNELS.PTY_LIST),
  loadThreads: () => ipcRenderer.invoke(IPC_CHANNELS.THREADS_LOAD),
  saveThreads: (threads) => ipcRenderer.invoke(IPC_CHANNELS.THREADS_SAVE, threads),
  pickAttachments: () => ipcRenderer.invoke(IPC_CHANNELS.PICK_ATTACHMENTS),
  parseAttachmentPaths: (paths) => ipcRenderer.invoke(IPC_CHANNELS.PARSE_ATTACHMENT_PATHS, paths),
  parseDataAttachment: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.PARSE_DATA_ATTACHMENT, payload),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  getSkills: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SKILLS),
  toggleSkill: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_SKILL, skillId),
  installSkill: (payload) => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_SKILL, payload),
  deleteSkill: (skillId) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_SKILL, skillId),

  getMcpServers: () => ipcRenderer.invoke(IPC_CHANNELS.GET_MCP_SERVERS),
  toggleMcpServer: (serverId) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_MCP_SERVER, serverId),
  upsertMcpServer: (payload) => ipcRenderer.invoke(IPC_CHANNELS.UPSERT_MCP_SERVER, payload),
  deleteMcpServer: (serverId) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_MCP_SERVER, serverId),
  probeMcpServer: (serverId) => ipcRenderer.invoke(IPC_CHANNELS.PROBE_MCP_SERVER, serverId),

  getSessionState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_STATE),
  sendMessage: (input) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, input),
  abortGeneration: () => ipcRenderer.invoke(IPC_CHANNELS.ABORT_GENERATION),
  clearSession: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_SESSION),
  setSessionMessages: (messages) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SESSION_MESSAGES, messages),
  resolveToolApproval: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.RESOLVE_TOOL_APPROVAL, payload),
  triggerCompact: () => ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_COMPACT),

  getSwarmState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SWARM_STATE),
  startSwarm: (payload) => ipcRenderer.invoke(IPC_CHANNELS.START_SWARM, payload),
  mergeSwarmTask: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.MERGE_SWARM_TASK, taskId),
  cleanupWorktrees: () => ipcRenderer.invoke(IPC_CHANNELS.CLEANUP_WORKTREES),

  getMemoryState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_MEMORY_STATE),
  triggerDream: () => ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_DREAM),
  saveMemoryMd: (content) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_MEMORY_MD, content),
  upsertMemoryNode: (payload) => ipcRenderer.invoke(IPC_CHANNELS.UPSERT_MEMORY_NODE, payload),
  deleteMemoryNode: (nodeId) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_MEMORY_NODE, nodeId),
  searchMemories: (query) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_MEMORIES, query),
  toggleKairosRule: (ruleId) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_KAIROS_RULE, ruleId),
  addKairosRule: (rule) => ipcRenderer.invoke(IPC_CHANNELS.ADD_KAIROS_RULE, rule),
  runKairosRuleNow: (ruleId) => ipcRenderer.invoke(IPC_CHANNELS.RUN_KAIROS_RULE_NOW, ruleId),

  sendSideChatMessage: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEND_SIDE_CHAT_MESSAGE, payload),
  abortSideChat: () => ipcRenderer.invoke(IPC_CHANNELS.ABORT_SIDE_CHAT),

  exportDocument: (payload) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DOCUMENT, payload),
  saveToKnowledgeBase: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_TO_KNOWLEDGE_BASE, payload),
  importToKnowledgeBase: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_TO_KNOWLEDGE_BASE, payload),
  listKnowledgeDocs: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_KNOWLEDGE_DOCS),
  readKnowledgeDocPdf: (docId) =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_KNOWLEDGE_DOC_PDF, docId),
  deleteKnowledgeDoc: (docId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_KNOWLEDGE_DOC, docId),
  openKnowledgeDoc: (payload) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_KNOWLEDGE_DOC, payload),
  openKnowledgeFolder: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_KNOWLEDGE_FOLDER),

  listInstalledBrowsers: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_INSTALLED_BROWSERS),
  openInBrowser: (payload) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_IN_BROWSER, payload),
  openPathInApp: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH_IN_APP, filePath),
  convertDocxToHtml: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.CONVERT_DOCX_TO_HTML, filePath),
  parseExcelData: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.PARSE_EXCEL_DATA, filePath),
  readFileAsDataUrl: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_AS_DATA_URL, filePath),

  onStreamUpdate: (callback) => {
    const handler = (_e: unknown, payload: StreamUpdatePayload): void => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.STREAM_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_UPDATE, handler)
  },
  onOpenQuickLauncher: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC_CHANNELS.OPEN_QUICK_LAUNCHER, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OPEN_QUICK_LAUNCHER, handler)
  }
}

contextBridge.exposeInMainWorld('claudeDesktop', api)
