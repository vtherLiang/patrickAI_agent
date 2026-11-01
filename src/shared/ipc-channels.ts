export const IPC_CHANNELS = {
  // Config & Workspace
  GET_CONFIG: 'config:get',
  UPDATE_CONFIG: 'config:update',
  SELECT_WORKSPACE: 'workspace:select',
  GET_FILE_TREE: 'workspace:file-tree',
  READ_WORKSPACE_FILE: 'workspace:read-file',

  // Direction A: QueryEngine & Chat
  SEND_MESSAGE: 'agent:send-message',
  ABORT_GENERATION: 'agent:abort',
  CLEAR_SESSION: 'agent:clear-session',
  GET_SESSION_STATE: 'agent:get-state',
  RESOLVE_TOOL_APPROVAL: 'agent:resolve-approval',
  TRIGGER_COMPACT: 'agent:trigger-compact',

  // Direction B: Coordinator Swarm & Worktree
  START_SWARM: 'swarm:start',
  GET_SWARM_STATE: 'swarm:get-state',
  MERGE_SWARM_TASK: 'swarm:merge-task',
  CLEANUP_WORKTREES: 'swarm:cleanup-worktrees',

  // Direction C: KAIROS & Dream Engine
  TRIGGER_DREAM: 'kairos:trigger-dream',
  GET_MEMORY_STATE: 'kairos:get-memory',
  SAVE_MEMORY_MD: 'kairos:save-memory-md',
  TOGGLE_KAIROS_RULE: 'kairos:toggle-rule',
  ADD_KAIROS_RULE: 'kairos:add-rule',
  RUN_KAIROS_RULE_NOW: 'kairos:run-rule-now',

  // Renderer event stream
  STREAM_UPDATE: 'agent:stream-update',
  OPEN_QUICK_LAUNCHER: 'ui:open-quick-launcher'
} as const
