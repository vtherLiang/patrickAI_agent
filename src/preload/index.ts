import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  AppConfig,
  ChatMessage,
  DreamLogEntry,
  FileTreeNode,
  KairosTriggerRule,
  ModelProviderPreset,
  StreamUpdatePayload,
  SwarmRunState,
  TokenUsageStats
} from '@shared/types'

export interface ClaudeDesktopBridge {
  getConfig: () => Promise<{ config: AppConfig; presets: ModelProviderPreset[] }>
  updateConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
  selectWorkspace: () => Promise<AppConfig | null>
  getFileTree: () => Promise<FileTreeNode[]>
  readWorkspaceFile: (filePath: string) => Promise<string>

  // Direction A: Workbench & QueryEngine
  getSessionState: () => Promise<{ messages: ChatMessage[]; tokenStats: TokenUsageStats }>
  sendMessage: (text: string) => Promise<{ ok: boolean }>
  abortGeneration: () => Promise<{ ok: boolean }>
  clearSession: () => Promise<{ ok: boolean }>
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

  // Direction C: KAIROS & Dream Engine
  getMemoryState: () => Promise<{
    memoryMarkdown: string
    dreamLogs: DreamLogEntry[]
    kairosRules: KairosTriggerRule[]
  }>
  triggerDream: () => Promise<DreamLogEntry>
  saveMemoryMd: (content: string) => Promise<{ ok: boolean }>
  toggleKairosRule: (ruleId: string) => Promise<KairosTriggerRule[]>
  addKairosRule: (
    rule: Omit<KairosTriggerRule, 'id' | 'enabled'>
  ) => Promise<KairosTriggerRule[]>
  runKairosRuleNow: (ruleId: string) => Promise<KairosTriggerRule[]>

  // Event Subscriptions
  onStreamUpdate: (callback: (payload: StreamUpdatePayload) => void) => () => void
  onOpenQuickLauncher: (callback: () => void) => () => void
}

const api: ClaudeDesktopBridge = {
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),
  updateConfig: (partial) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CONFIG, partial),
  selectWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_WORKSPACE),
  getFileTree: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FILE_TREE),
  readWorkspaceFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.READ_WORKSPACE_FILE, filePath),

  getSessionState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_STATE),
  sendMessage: (text) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, text),
  abortGeneration: () => ipcRenderer.invoke(IPC_CHANNELS.ABORT_GENERATION),
  clearSession: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_SESSION),
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
  toggleKairosRule: (ruleId) => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_KAIROS_RULE, ruleId),
  addKairosRule: (rule) => ipcRenderer.invoke(IPC_CHANNELS.ADD_KAIROS_RULE, rule),
  runKairosRuleNow: (ruleId) => ipcRenderer.invoke(IPC_CHANNELS.RUN_KAIROS_RULE_NOW, ruleId),

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
