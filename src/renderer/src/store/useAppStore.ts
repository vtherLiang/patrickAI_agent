import { create } from 'zustand'
import {
  AppConfig,
  AppMode,
  ChatMessage,
  DreamLogEntry,
  FileTreeNode,
  KairosTriggerRule,
  ModelProviderPreset,
  SwarmRunState,
  TokenUsageStats,
  ToolCallItem
} from '@shared/types'

interface TerminalLogLine {
  id: string
  commandId: string
  text: string
  stream: 'stdout' | 'stderr'
  timestamp: number
}

interface AppState {
  activeMode: AppMode
  config: AppConfig | null
  presets: ModelProviderPreset[]
  messages: ChatMessage[]
  isBusy: boolean
  pendingApproval: ToolCallItem | null
  tokenStats: TokenUsageStats
  terminalLogs: TerminalLogLine[]
  fileTree: FileTreeNode[]
  selectedFilePreview: { path: string; content: string } | null

  // Direction B
  swarmState: SwarmRunState | null

  // Direction C
  memoryMarkdown: string
  dreamLogs: DreamLogEntry[]
  kairosRules: KairosTriggerRule[]
  toastNotification: { title: string; body: string; timestamp: number } | null

  // Modals
  isSettingsOpen: boolean
  isQuickLauncherOpen: boolean

  // Actions
  setActiveMode: (mode: AppMode) => void
  setSettingsOpen: (open: boolean) => void
  setQuickLauncherOpen: (open: boolean) => void
  clearToast: () => void
  initialize: () => Promise<void>
  refreshFileTree: () => Promise<void>
  previewFile: (filePath: string) => Promise<void>
  closeFilePreview: () => void
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>
  selectWorkspace: () => Promise<void>

  // Direction A Actions
  sendMessage: (text: string) => Promise<void>
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
  toggleKairosRule: (ruleId: string) => Promise<void>
  addKairosRule: (rule: Omit<KairosTriggerRule, 'id' | 'enabled'>) => Promise<void>
  runKairosRuleNow: (ruleId: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  activeMode: 'workbench',
  config: null,
  presets: [],
  messages: [],
  isBusy: false,
  pendingApproval: null,
  tokenStats: {
    currentTokens: 0,
    maxTokens: 64000,
    usageRatio: 0,
    microCompactedCount: 0,
    autoCompactedCount: 0,
    totalSavedTokens: 0
  },
  terminalLogs: [],
  fileTree: [],
  selectedFilePreview: null,
  swarmState: null,
  memoryMarkdown: '',
  dreamLogs: [],
  kairosRules: [],
  toastNotification: null,
  isSettingsOpen: false,
  isQuickLauncherOpen: false,

  setActiveMode: (mode) => set({ activeMode: mode }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setQuickLauncherOpen: (open) => set({ isQuickLauncherOpen: open }),
  clearToast: () => set({ toastNotification: null }),

  initialize: async () => {
    const [{ config, presets }, sessionState, swarmState, memoryState, fileTree] =
      await Promise.all([
        window.claudeDesktop.getConfig(),
        window.claudeDesktop.getSessionState(),
        window.claudeDesktop.getSwarmState(),
        window.claudeDesktop.getMemoryState(),
        window.claudeDesktop.getFileTree()
      ])

    set({
      config,
      presets,
      messages: sessionState.messages,
      tokenStats: sessionState.tokenStats,
      swarmState,
      memoryMarkdown: memoryState.memoryMarkdown,
      dreamLogs: memoryState.dreamLogs,
      kairosRules: memoryState.kairosRules,
      fileTree
    })

    window.claudeDesktop.onStreamUpdate((payload) => {
      if (payload.type === 'messages_updated') {
        set((state) => ({
          messages: payload.messages || state.messages,
          tokenStats: payload.tokenStats || state.tokenStats
        }))
        get().refreshFileTree()
      } else if (payload.type === 'streaming_delta' && payload.streamingMessageId) {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === payload.streamingMessageId
              ? {
                  ...m,
                  content: m.content + (payload.contentDelta || ''),
                  reasoningContent:
                    (m.reasoningContent || '') + (payload.reasoningDelta || '') || undefined
                }
              : m
          )
        }))
      } else if (payload.type === 'tool_approval_required') {
        set({ pendingApproval: payload.pendingApproval || null })
      } else if (payload.type === 'terminal_output' && payload.terminalLine) {
        set((state) => ({
          terminalLogs: [
            ...state.terminalLogs.slice(-200),
            {
              id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              commandId: payload.terminalLine!.commandId,
              text: payload.terminalLine!.text,
              stream: payload.terminalLine!.stream,
              timestamp: Date.now()
            }
          ]
        }))
      } else if (payload.type === 'token_stats' && payload.tokenStats) {
        set({ tokenStats: payload.tokenStats })
      } else if (payload.type === 'swarm_updated' && payload.swarmState) {
        set({ swarmState: payload.swarmState })
      } else if (payload.type === 'dream_updated') {
        set((state) => ({
          dreamLogs: payload.dreamLogs || state.dreamLogs,
          memoryMarkdown: payload.memoryMarkdown ?? state.memoryMarkdown,
          toastNotification: payload.notification || state.toastNotification
        }))
      } else if (payload.type === 'kairos_notification' && payload.notification) {
        set({ toastNotification: payload.notification })
      } else if (payload.type === 'agent_status') {
        set({ isBusy: Boolean(payload.isBusy) })
      }
    })

    window.claudeDesktop.onOpenQuickLauncher(() => {
      set({ isQuickLauncherOpen: true })
    })
  },

  refreshFileTree: async () => {
    const fileTree = await window.claudeDesktop.getFileTree()
    set({ fileTree })
  },

  previewFile: async (filePath) => {
    const content = await window.claudeDesktop.readWorkspaceFile(filePath)
    set({ selectedFilePreview: { path: filePath, content } })
  },

  closeFilePreview: () => set({ selectedFilePreview: null }),

  updateConfig: async (partial) => {
    const updated = await window.claudeDesktop.updateConfig(partial)
    set({ config: updated })
  },

  selectWorkspace: async () => {
    const updated = await window.claudeDesktop.selectWorkspace()
    if (updated) {
      const [fileTree, memoryState] = await Promise.all([
        window.claudeDesktop.getFileTree(),
        window.claudeDesktop.getMemoryState()
      ])
      set({
        config: updated,
        fileTree,
        memoryMarkdown: memoryState.memoryMarkdown
      })
    }
  },

  sendMessage: async (text) => {
    await window.claudeDesktop.sendMessage(text)
  },

  abortGeneration: async () => {
    await window.claudeDesktop.abortGeneration()
    set({ isBusy: false, pendingApproval: null })
  },

  clearSession: async () => {
    await window.claudeDesktop.clearSession()
    set({ pendingApproval: null, terminalLogs: [] })
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
    await get().refreshFileTree()
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
