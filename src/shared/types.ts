export type AppMode = 'workbench' | 'coordinator' | 'kairos'

export interface ModelProviderPreset {
  id: string
  name: string
  baseUrl: string
  mainModel: string
  fastModel: string
}

export interface AppConfig {
  workspaceDir: string
  baseUrl: string
  apiKey: string
  mainModel: string
  fastModel: string
  maxContextTokens: number
  autoCompactThreshold: number // 0.0 - 1.0, e.g. 0.8
  autoApproveReadOnly: boolean
  autoApproveWriteInSession: boolean
  enableWorktreeIsolation: boolean
  enableDreamOnIdle: boolean
  idleDreamMinutes: number
}

export type ToolPermissionLevel = 'readonly' | 'write' | 'execute'

export interface ToolCallItem {
  id: string
  name: string
  argumentsJson: string
  status: 'pending_approval' | 'running' | 'completed' | 'rejected' | 'error'
  permissionLevel: ToolPermissionLevel
  diffPreview?: {
    filePath: string
    oldContent: string
    newContent: string
    unifiedDiff: string
  }
  commandPreview?: string
  resultOutput?: string
  isMicroCompacted?: boolean
  startedAt?: number
  completedAt?: number
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoningContent?: string
  toolCalls?: ToolCallItem[]
  toolCallId?: string
  toolName?: string
  timestamp: number
  isCompactedSummary?: boolean
  estimatedTokens?: number
}

export interface TokenUsageStats {
  currentTokens: number
  maxTokens: number
  usageRatio: number
  microCompactedCount: number
  autoCompactedCount: number
  totalSavedTokens: number
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
  trigger: 'manual' | 'idle' | 'session_end' | 'scheduled'
  extractedRules: string[]
  summary: string
  tokensSaved: number
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

export interface StreamUpdatePayload {
  type:
    | 'messages_updated'
    | 'streaming_delta'
    | 'tool_approval_required'
    | 'terminal_output'
    | 'token_stats'
    | 'swarm_updated'
    | 'dream_updated'
    | 'kairos_notification'
    | 'agent_status'
  messages?: ChatMessage[]
  streamingMessageId?: string
  contentDelta?: string
  reasoningDelta?: string
  pendingApproval?: ToolCallItem
  terminalLine?: { commandId: string; text: string; stream: 'stdout' | 'stderr' }
  tokenStats?: TokenUsageStats
  swarmState?: SwarmRunState
  dreamLogs?: DreamLogEntry[]
  memoryMarkdown?: string
  notification?: { title: string; body: string; timestamp: number }
  isBusy?: boolean
}
