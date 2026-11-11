export type AppMode = 'workbench' | 'coordinator' | 'kairos' | 'doc-editor'

export type WorkbenchSubView = 'chat' | 'skills' | 'mcp' | 'knowledge-base'

export type DocPresetType = 'clean' | 'wechat' | 'formal' | 'compact'
export type NaturalizeLevel = 'faithful' | 'balanced' | 'deep'
export type DocExportFormat = 'doc' | 'docx' | 'pdf'

export interface ExportDocumentPayload {
  title: string
  markdown: string
  htmlBody: string
  preset: DocPresetType
  format: DocExportFormat
}

export interface ExportDocumentResult {
  ok: boolean
  canceled?: boolean
  filePath?: string
  fileName?: string
  dataBase64?: string
  mimeType?: string
  error?: string
}

export interface SaveKnowledgePdfPayload {
  title: string
  markdown: string
  htmlBody: string
  preset: DocPresetType
  naturalizeLevel: NaturalizeLevel
}

export type KnowledgeDocKind = 'pdf' | 'tex' | 'image' | 'word' | 'other'

export interface ImportKnowledgeDocPayload {
  name: string
  filePath?: string
  previewDataUrl?: string
  dataBase64?: string
  extractedText?: string
  ext?: string
  kind?: string
}

export interface ReadKnowledgeDocResult {
  base64: string
  fileName: string
  filePath: string
  kind?: KnowledgeDocKind
  mimeType?: string
  text?: string
  html?: string
}

export interface KnowledgeDocItem {
  id: string
  title: string
  fileName: string
  filePath: string
  sizeBytes: number
  kind?: KnowledgeDocKind
  preset?: DocPresetType
  naturalizeLevel?: NaturalizeLevel
  charCount?: number
  summarySnippet?: string
  createdAt: number
}

export interface KnowledgeBaseState {
  storageDir: string
  docs: KnowledgeDocItem[]
}

export type AgentPermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export type ProxyMode = 'system' | 'direct' | 'proxy'

export interface AIProviderConfig {
  id: string
  name: string
  type:
    | 'deepseek'
    | 'openai'
    | 'gemini'
    | 'relay'
    | 'siliconflow'
    | 'openrouter'
    | 'ollama'
    | 'custom'
  baseUrl: string
  apiKey: string
  mainModel: string
  fastModel: string
  availableModels: string[]
  defaultContextTokens: number
  proxyMode: ProxyMode // 'direct': 国内直连(不走VPN防封), 'proxy': 走代理(7890/1087等VPN), 'system': 跟随系统
  customProxyUrl?: string // 自定义代理，如 http://127.0.0.1:7890
  customHeaders?: Record<string, string>
  enabled?: boolean
  lastLatencyMs?: number
  lastTestedAt?: number
  lastTestStatus?: 'success' | 'error'
  lastTestError?: string
}

export interface TestProviderResult {
  ok: boolean
  latencyMs?: number
  error?: string
  modelCount?: number
}

export interface ModelProviderPreset {
  id: string
  name: string
  baseUrl: string
  mainModel: string
  fastModel: string
  defaultContextTokens?: number
  proxyMode?: ProxyMode
  type?: AIProviderConfig['type']
}

export interface WorkspaceProject {
  id: string
  name: string
  path: string
  gitBranch?: string
  addedAt: number
}

export interface AppConfig {
  workspaceDir: string
  projects?: WorkspaceProject[]
  baseUrl: string
  apiKey: string
  mainModel: string
  fastModel: string
  maxContextTokens: number
  autoCompactThreshold: number // 0.0 - 1.0, e.g. 0.8
  permissionMode: AgentPermissionMode
  autoApproveReadOnly: boolean
  autoApproveWriteInSession: boolean
  enableWorktreeIsolation: boolean
  enableDreamOnIdle: boolean
  idleDreamMinutes: number
  autoMemoryCrystallize: boolean
  activeProviderId?: string
  providers?: AIProviderConfig[]
  globalProxyUrl?: string
  proxyMode?: ProxyMode
  customProxyUrl?: string
}

export type ToolPermissionLevel = 'readonly' | 'write' | 'execute'

export interface ToolCallItem {
  id: string
  name: string
  argumentsJson: string
  status: 'pending_approval' | 'running' | 'completed' | 'rejected' | 'error'
  permissionLevel: ToolPermissionLevel
  description?: string
  diffPreview?: {
    filePath: string
    oldContent: string
    newContent: string
    unifiedDiff: string
    isNewFile?: boolean
    totalLines?: number
  }
  commandPreview?: string
  resultOutput?: string
  isMicroCompacted?: boolean
  startedAt?: number
  completedAt?: number
}

// ============================================================================
// Frontier L1-L5 Hierarchical Cognitive Memory Types
// (Claude Code `memdir` + `AutoDream` + MemGPT + A-MEM + HippoRAG + MemoryBank)
// ============================================================================
export type MemoryLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export interface MemoryNode {
  id: string
  layer: MemoryLayer
  title: string
  content: string
  keywords: string[]
  tags: string[]
  links: string[] // A-MEM Zettelkasten associative links to related MemoryNode IDs
  importance: number // 0.0 - 1.0
  confidence: number // 0.0 - 1.0
  accessCount: number
  source: 'auto_turn' | 'dream' | 'manual' | 'seed'
  createdAt: number
  updatedAt: number
  lastRecalledAt?: number
}

export interface RecalledMemoryItem {
  id: string
  layer: MemoryLayer
  title: string
  content: string
  score: number // 0.0 - 1.0 hybrid relevance score
  matchReason: string // e.g. "核心理念常驻" | "关键词+联想命中"
}

export interface ChatAttachment {
  id: string
  name: string
  ext: string
  kind: 'image' | 'pdf' | 'docx' | 'excel' | 'text'
  mimeType: string
  sizeBytes: number
  filePath?: string
  previewDataUrl?: string
  extractedText?: string
  summaryMeta?: string
  isCompacted?: boolean
  offloadedPath?: string
  omitImageFromContext?: boolean
  excelData?: {
    sheets: Array<{
      name: string
      rows: string[][]
    }>
    totalRows: number
    totalCols: number
  }
}

export type InspectorTab = 'terminal' | 'files' | 'changes' | 'preview'

export type BrowserPreviewType = 'web' | 'pdf' | 'docx' | 'excel' | 'image' | 'text'

export interface InstalledBrowserInfo {
  id: string
  name: string
  appPath?: string
  isDefault?: boolean
  available: boolean
  iconName?: string
}

export interface BrowserPreviewItem {
  id: string
  type: BrowserPreviewType
  title: string
  url?: string
  filePath?: string
  fileName?: string
  dataUrl?: string
  htmlContent?: string
  excelData?: {
    sheets: Array<{
      name: string
      rows: string[][]
    }>
    totalRows: number
    totalCols: number
  }
  rawText?: string
  meta?: string
  attachment?: ChatAttachment
}

export interface SendMessagePayload {
  text: string
  attachments?: ChatAttachment[]
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  attachments?: ChatAttachment[]
  reasoningContent?: string
  isThinkingStreaming?: boolean
  thinkingDurationMs?: number
  interrupted?: boolean
  toolCalls?: ToolCallItem[]
  toolCallId?: string
  toolName?: string
  timestamp: number
  isCompactedSummary?: boolean
  offloadedPath?: string
  isPrunedBranch?: boolean
  estimatedTokens?: number
  recalledMemories?: RecalledMemoryItem[]
  crystallizedMemories?: Array<{
    id: string
    layer: MemoryLayer
    title: string
    content: string
    isEvolved?: boolean
  }>
}

export interface TokenUsageStats {
  currentTokens: number
  maxTokens: number
  usageRatio: number
  microCompactedCount: number
  autoCompactedCount: number
  totalSavedTokens: number
}

// ============================================================================
// Codex Skills Hub Types (Modeled after mohitmishra786/low-level-dev-skills)
// ============================================================================
export interface SkillUsageExample {
  title: string
  prompt: string
  expectedBehavior: string
}

export interface AgentSkillItem {
  id: string
  name: string
  category: 'security' | 'low-level' | 'architecture' | 'workflow' | 'testing' | 'custom'
  enabled: boolean
  installedBy: 'agent' | 'github' | 'builtin' | 'user'
  sourceUrl?: string
  installedAt: number
  triggers: string[]
  summary: string
  explanation: string
  capabilities: string[]
  usageExamples: SkillUsageExample[]
  rawMarkdown: string
  filePath: string
}

// ============================================================================
// Codex MCP Servers Hub Types
// ============================================================================
export interface McpToolDescriptor {
  name: string
  description: string
  inputExample?: string
}

export interface McpUsageExample {
  title: string
  prompt: string
}

export interface McpServerItem {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled: boolean
  status: 'connected' | 'ready' | 'disabled' | 'error'
  installedBy: 'agent' | 'preset' | 'user'
  category: string
  summary: string
  explanation: string
  tools: McpToolDescriptor[]
  usageExamples: McpUsageExample[]
  lastCheckedAt?: number
  errorMessage?: string
}

// ============================================================================
// Codex Right-Side Inspector Git Changes / Diff Review Types
// ============================================================================
export interface GitFileChange {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
  additions: number
  deletions: number
  staged: boolean
}

export interface GitStatusSummary {
  branch: string
  isRepo: boolean
  changes: GitFileChange[]
}

// Direction B: Coordinator & Swarm Types
export type SubAgentRole = 'researcher' | 'architect' | 'coder' | 'tester' | 'reviewer'

export type SwarmTaskStatus = 'queued' | 'waiting_deps' | 'running' | 'completed' | 'failed' | 'merged'

export interface SwarmTaskNode {
  id: string
  title: string
  description: string
  role: SubAgentRole
  dependencies: string[]
  status: SwarmTaskStatus
  worktreePath?: string
  branchName?: string
  logs: string[]
  summaryOutput?: string
  modifiedFiles: string[]
  tokenUsed: number
  startedAt?: number
  completedAt?: number
}

export interface SwarmRunState {
  id: string
  goal: string
  status: 'idle' | 'planning' | 'running' | 'completed' | 'failed'
  useWorktree: boolean
  tasks: SwarmTaskNode[]
  finalSynthesis?: string
  createdAt: number
}

// Direction C: KAIROS & Dream Engine Types
export interface DreamLogEntry {
  id: string
  timestamp: number
  trigger: 'manual' | 'auto_turn' | 'idle' | 'session_end' | 'scheduled'
  extractedRules: string[]
  summary: string
  tokensSaved: number
  layersTouched?: MemoryLayer[]
}

export interface KairosTriggerRule {
  id: string
  name: string
  type: 'interval' | 'file_watch' | 'git_commit'
  patternOrMinutes: string
  promptInstruction: string
  enabled: boolean
  lastTriggeredAt?: number
  lastResult?: string
}

export interface FileTreeNode {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

export interface PtySessionInfo {
  id: string
  title: string
  cwd: string
  shell: string
  pid?: number
  cols: number
  rows: number
  createdAt: number
  exited?: boolean
  exitCode?: number | null
  replayBuffer?: string
}

export interface StreamUpdatePayload {
  type:
    | 'messages_updated'
    | 'streaming_delta'
    | 'tool_approval_required'
    | 'terminal_output'
    | 'pty_data'
    | 'pty_exit'
    | 'token_stats'
    | 'swarm_updated'
    | 'dream_updated'
    | 'skills_updated'
    | 'mcp_updated'
    | 'projects_updated'
    | 'kairos_notification'
    | 'agent_status'
    | 'side_chat_delta'
    | 'knowledge_docs_updated'
  messages?: ChatMessage[]
  streamingMessageId?: string
  contentDelta?: string
  reasoningDelta?: string
  sideChatDelta?: { content?: string; reasoning?: string }
  pendingApproval?: ToolCallItem
  terminalLine?: { commandId: string; text: string; stream: 'stdout' | 'stderr' }
  ptyData?: { sessionId: string; data: string }
  ptyExit?: { sessionId: string; exitCode: number | null }
  tokenStats?: TokenUsageStats
  swarmState?: SwarmRunState
  dreamLogs?: DreamLogEntry[]
  memoryMarkdown?: string
  memoryNodes?: MemoryNode[]
  skills?: AgentSkillItem[]
  mcpServers?: McpServerItem[]
  knowledgeDocs?: KnowledgeDocItem[]
  projects?: WorkspaceProject[]
  notification?: { title: string; body: string; timestamp: number }
  isBusy?: boolean
}
