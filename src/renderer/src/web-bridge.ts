import { IPC_CHANNELS } from '@shared/ipc-channels'
import { StreamUpdatePayload } from '@shared/types'
import { ClaudeDesktopBridge } from '../../preload/index'

const API_ORIGIN = 'http://127.0.0.1:3721'

async function invokeRpc<T>(channel: string, arg?: unknown): Promise<T> {
  const res = await fetch(`${API_ORIGIN}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, arg })
  })
  const data = await res.json()
  return data.result as T
}

export function ensureDesktopBridge(): void {
  if (typeof window !== 'undefined' && !window.claudeDesktop) {
    const bridge: ClaudeDesktopBridge = {
      getConfig: () => invokeRpc(IPC_CHANNELS.GET_CONFIG),
      updateConfig: (partial) => invokeRpc(IPC_CHANNELS.UPDATE_CONFIG, partial),
      switchProvider: (payload) => invokeRpc(IPC_CHANNELS.SWITCH_PROVIDER, payload),
      testProviderConnection: (provider) => invokeRpc(IPC_CHANNELS.TEST_PROVIDER_CONNECTION, provider),
      selectWorkspace: () => invokeRpc(IPC_CHANNELS.SELECT_WORKSPACE),
      addProjectFolder: () => invokeRpc(IPC_CHANNELS.ADD_PROJECT_FOLDER),
      switchProjectFolder: (dirPath) => invokeRpc(IPC_CHANNELS.SWITCH_PROJECT_FOLDER, dirPath),
      removeProjectFolder: (dirPath) => invokeRpc(IPC_CHANNELS.REMOVE_PROJECT_FOLDER, dirPath),
      getFileTree: () => invokeRpc(IPC_CHANNELS.GET_FILE_TREE),
      readWorkspaceFile: (filePath) => invokeRpc(IPC_CHANNELS.READ_WORKSPACE_FILE, filePath),
      getGitStatus: () => invokeRpc(IPC_CHANNELS.GET_GIT_STATUS),
      getGitDiff: (relativePath) => invokeRpc(IPC_CHANNELS.GET_GIT_DIFF, relativePath),
      runQuickTerminal: (command) => invokeRpc(IPC_CHANNELS.RUN_QUICK_TERMINAL, command),
      pickAttachments: () => invokeRpc(IPC_CHANNELS.PICK_ATTACHMENTS),
      parseAttachmentPaths: (paths) => invokeRpc(IPC_CHANNELS.PARSE_ATTACHMENT_PATHS, paths),
      parseDataAttachment: (payload) => invokeRpc(IPC_CHANNELS.PARSE_DATA_ATTACHMENT, payload),

      getSkills: () => invokeRpc(IPC_CHANNELS.GET_SKILLS),
      toggleSkill: (skillId) => invokeRpc(IPC_CHANNELS.TOGGLE_SKILL, skillId),
      installSkill: (payload) => invokeRpc(IPC_CHANNELS.INSTALL_SKILL, payload),
      deleteSkill: (skillId) => invokeRpc(IPC_CHANNELS.DELETE_SKILL, skillId),

      getMcpServers: () => invokeRpc(IPC_CHANNELS.GET_MCP_SERVERS),
      toggleMcpServer: (serverId) => invokeRpc(IPC_CHANNELS.TOGGLE_MCP_SERVER, serverId),
      upsertMcpServer: (payload) => invokeRpc(IPC_CHANNELS.UPSERT_MCP_SERVER, payload),
      deleteMcpServer: (serverId) => invokeRpc(IPC_CHANNELS.DELETE_MCP_SERVER, serverId),
      probeMcpServer: (serverId) => invokeRpc(IPC_CHANNELS.PROBE_MCP_SERVER, serverId),

      getSessionState: () => invokeRpc(IPC_CHANNELS.GET_SESSION_STATE),
      sendMessage: (input) => invokeRpc(IPC_CHANNELS.SEND_MESSAGE, input),
      abortGeneration: () => invokeRpc(IPC_CHANNELS.ABORT_GENERATION),
      clearSession: () => invokeRpc(IPC_CHANNELS.CLEAR_SESSION),
      setSessionMessages: (messages) => invokeRpc(IPC_CHANNELS.SET_SESSION_MESSAGES, messages),
      resolveToolApproval: (payload) => invokeRpc(IPC_CHANNELS.RESOLVE_TOOL_APPROVAL, payload),
      triggerCompact: () => invokeRpc(IPC_CHANNELS.TRIGGER_COMPACT),

      getSwarmState: () => invokeRpc(IPC_CHANNELS.GET_SWARM_STATE),
      startSwarm: (payload) => invokeRpc(IPC_CHANNELS.START_SWARM, payload),
      mergeSwarmTask: (taskId) => invokeRpc(IPC_CHANNELS.MERGE_SWARM_TASK, taskId),
      cleanupWorktrees: () => invokeRpc(IPC_CHANNELS.CLEANUP_WORKTREES),

      getMemoryState: () => invokeRpc(IPC_CHANNELS.GET_MEMORY_STATE),
      triggerDream: () => invokeRpc(IPC_CHANNELS.TRIGGER_DREAM),
      saveMemoryMd: (content) => invokeRpc(IPC_CHANNELS.SAVE_MEMORY_MD, content),
      upsertMemoryNode: (payload) => invokeRpc(IPC_CHANNELS.UPSERT_MEMORY_NODE, payload),
      deleteMemoryNode: (nodeId) => invokeRpc(IPC_CHANNELS.DELETE_MEMORY_NODE, nodeId),
      searchMemories: (query) => invokeRpc(IPC_CHANNELS.SEARCH_MEMORIES, query),
      toggleKairosRule: (ruleId) => invokeRpc(IPC_CHANNELS.TOGGLE_KAIROS_RULE, ruleId),
      addKairosRule: (rule) => invokeRpc(IPC_CHANNELS.ADD_KAIROS_RULE, rule),
      runKairosRuleNow: (ruleId) => invokeRpc(IPC_CHANNELS.RUN_KAIROS_RULE_NOW, ruleId),

      sendSideChatMessage: (payload) =>
        invokeRpc(IPC_CHANNELS.SEND_SIDE_CHAT_MESSAGE, payload),
      abortSideChat: () => invokeRpc(IPC_CHANNELS.ABORT_SIDE_CHAT),

      exportDocument: (payload) => invokeRpc(IPC_CHANNELS.EXPORT_DOCUMENT, payload),
      saveToKnowledgeBase: (payload) => invokeRpc(IPC_CHANNELS.SAVE_TO_KNOWLEDGE_BASE, payload),
      importToKnowledgeBase: (payload) =>
        invokeRpc(IPC_CHANNELS.IMPORT_TO_KNOWLEDGE_BASE, payload),
      listKnowledgeDocs: () => invokeRpc(IPC_CHANNELS.LIST_KNOWLEDGE_DOCS),
      readKnowledgeDocPdf: (docId) => invokeRpc(IPC_CHANNELS.READ_KNOWLEDGE_DOC_PDF, docId),
      deleteKnowledgeDoc: (docId) => invokeRpc(IPC_CHANNELS.DELETE_KNOWLEDGE_DOC, docId),
      openKnowledgeDoc: (payload) => invokeRpc(IPC_CHANNELS.OPEN_KNOWLEDGE_DOC, payload),
      openKnowledgeFolder: () => invokeRpc(IPC_CHANNELS.OPEN_KNOWLEDGE_FOLDER),

      listInstalledBrowsers: () => invokeRpc(IPC_CHANNELS.LIST_INSTALLED_BROWSERS),
      openInBrowser: (payload) => invokeRpc(IPC_CHANNELS.OPEN_IN_BROWSER, payload),
      openPathInApp: (filePath) => invokeRpc(IPC_CHANNELS.OPEN_PATH_IN_APP, filePath),
      convertDocxToHtml: (filePath) => invokeRpc(IPC_CHANNELS.CONVERT_DOCX_TO_HTML, filePath),
      parseExcelData: (filePath) => invokeRpc(IPC_CHANNELS.PARSE_EXCEL_DATA, filePath),
      readFileAsDataUrl: (filePath) => invokeRpc(IPC_CHANNELS.READ_FILE_AS_DATA_URL, filePath),

      onStreamUpdate: (callback) => {
        const es = new EventSource(`${API_ORIGIN}/api/stream`)
        es.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data) as StreamUpdatePayload
            callback(payload)
          } catch {
            // ignore
          }
        }
        return () => es.close()
      },
      onOpenQuickLauncher: (callback) => {
        const handler = (e: KeyboardEvent): void => {
          if (e.altKey && e.code === 'Space') {
            e.preventDefault()
            callback()
          }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }
    }

    window.claudeDesktop = bridge
  }
}
