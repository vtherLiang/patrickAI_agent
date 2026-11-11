export const IPC_CHANNELS = {
  // Config & Multi-Project Workspaces & CC-Switch Providers
  GET_CONFIG: 'config:get',
  UPDATE_CONFIG: 'config:update',
  SWITCH_PROVIDER: 'config:switch-provider',
  TEST_PROVIDER_CONNECTION: 'config:test-provider',
  SELECT_WORKSPACE: 'workspace:select',
  ADD_PROJECT_FOLDER: 'workspace:add-project',
  SWITCH_PROJECT_FOLDER: 'workspace:switch-project',
  REMOVE_PROJECT_FOLDER: 'workspace:remove-project',
  GET_FILE_TREE: 'workspace:file-tree',
  READ_WORKSPACE_FILE: 'workspace:read-file',
  GET_GIT_STATUS: 'workspace:git-status',
  GET_GIT_DIFF: 'workspace:git-diff',
  RUN_QUICK_TERMINAL: 'workspace:quick-terminal',
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_LIST: 'pty:list',
  THREADS_LOAD: 'threads:load',
  THREADS_SAVE: 'threads:save',
  PICK_ATTACHMENTS: 'attachments:pick',
  PARSE_ATTACHMENT_PATHS: 'attachments:parse-paths',
  PARSE_DATA_ATTACHMENT: 'attachments:parse-data',

  // Codex Skills Hub
  GET_SKILLS: 'skills:list',
  TOGGLE_SKILL: 'skills:toggle',
  INSTALL_SKILL: 'skills:install',
  DELETE_SKILL: 'skills:delete',

  // Codex MCP Hub
  GET_MCP_SERVERS: 'mcp:list',
  TOGGLE_MCP_SERVER: 'mcp:toggle',
  UPSERT_MCP_SERVER: 'mcp:upsert',
  DELETE_MCP_SERVER: 'mcp:delete',
  PROBE_MCP_SERVER: 'mcp:probe',

  // Direction A: QueryEngine & Chat
  SEND_MESSAGE: 'agent:send-message',
  ABORT_GENERATION: 'agent:abort',
  CLEAR_SESSION: 'agent:clear-session',
  SET_SESSION_MESSAGES: 'agent:set-messages',
  GET_SESSION_STATE: 'agent:get-state',
  RESOLVE_TOOL_APPROVAL: 'agent:resolve-approval',
  TRIGGER_COMPACT: 'agent:trigger-compact',

  // Direction B: Coordinator Swarm & Worktree
  START_SWARM: 'swarm:start',
  GET_SWARM_STATE: 'swarm:get-state',
  MERGE_SWARM_TASK: 'swarm:merge-task',
  CLEANUP_WORKTREES: 'swarm:cleanup-worktrees',

  // Direction C: KAIROS & L1-L5 Hierarchical Memory Engine
  TRIGGER_DREAM: 'kairos:trigger-dream',
  GET_MEMORY_STATE: 'kairos:get-memory',
  SAVE_MEMORY_MD: 'kairos:save-memory-md',
  UPSERT_MEMORY_NODE: 'memory:upsert-node',
  DELETE_MEMORY_NODE: 'memory:delete-node',
  SEARCH_MEMORIES: 'memory:search',
  TOGGLE_KAIROS_RULE: 'kairos:toggle-rule',
  ADD_KAIROS_RULE: 'kairos:add-rule',
  RUN_KAIROS_RULE_NOW: 'kairos:run-rule-now',

  // Codex Ephemeral Side Chat Scratchpad
  SEND_SIDE_CHAT_MESSAGE: 'side-chat:send-message',
  ABORT_SIDE_CHAT: 'side-chat:abort',

  // AI Doc Editor Export & Knowledge Base Multi-Format Storage
  EXPORT_DOCUMENT: 'doc:export-file',
  SAVE_TO_KNOWLEDGE_BASE: 'kb:save-pdf',
  IMPORT_TO_KNOWLEDGE_BASE: 'kb:import-file',
  LIST_KNOWLEDGE_DOCS: 'kb:list',
  READ_KNOWLEDGE_DOC_PDF: 'kb:read-pdf',
  DELETE_KNOWLEDGE_DOC: 'kb:delete',
  OPEN_KNOWLEDGE_DOC: 'kb:open-doc',
  OPEN_KNOWLEDGE_FOLDER: 'kb:open-folder',

  // Browser & Document Preview Hub (Codex-inspired)
  LIST_INSTALLED_BROWSERS: 'browser:list-installed',
  OPEN_IN_BROWSER: 'browser:open-url',
  OPEN_PATH_IN_APP: 'preview:open-in-app',
  CONVERT_DOCX_TO_HTML: 'preview:convert-docx',
  PARSE_EXCEL_DATA: 'preview:parse-excel',
  READ_FILE_AS_DATA_URL: 'preview:read-data-url',

  // Renderer event stream
  STREAM_UPDATE: 'agent:stream-update',
  OPEN_QUICK_LAUNCHER: 'ui:open-quick-launcher'
} as const
