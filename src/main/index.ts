import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  nativeImage,
  globalShortcut
} from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile } from 'child_process'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  AIProviderConfig,
  AppConfig,
  ChatAttachment,
  ExportDocumentPayload,
  ExportDocumentResult,
  FileTreeNode,
  InstalledBrowserInfo,
  KairosTriggerRule,
  McpServerItem,
  MemoryLayer,
  SaveKnowledgePdfPayload,
  ImportKnowledgeDocPayload,
  SendMessagePayload,
  StreamUpdatePayload
} from '@shared/types'
import { ConfigStore, MODEL_PRESETS } from './store/ConfigStore'
import { maskSensitiveSecrets } from '@shared/secretMasker'
import { OpenAICompatibleClient, OpenAIMessagePayload } from './llm/OpenAIClient'
import { ToolRegistry } from './tools/ToolRegistry'
import { CompactPipeline } from './context/CompactPipeline'
import { QueryEngine } from './engine/QueryEngine'
import { SystemPromptBuilder } from './engine/SystemPromptBuilder'
import { WorktreeManager } from './coordinator/WorktreeManager'
import { SwarmCoordinator } from './coordinator/SwarmCoordinator'
import { DreamEngine } from './daemon/DreamEngine'
import { KairosWatcher } from './daemon/KairosWatcher'
import { SkillManager, InstallSkillInput } from './skills/SkillManager'
import { McpManager } from './mcp/McpManager'
import { HierarchicalMemoryEngine } from './memory/HierarchicalMemoryEngine'
import { GitInspector } from './git/GitInspector'
import { AttachmentParser } from './files/AttachmentParser'
import { DocumentExporter, sanitizeDocFileName } from './files/DocumentExporter'
import {
  KnowledgeBaseManager,
  resolveDefaultAppSupportBase
} from './files/KnowledgeBaseManager'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const defaultWorkspace = process.cwd()
const configStore = new ConfigStore(defaultWorkspace)
const llmClient = new OpenAICompatibleClient()
const toolRegistry = new ToolRegistry()
const compactPipeline = new CompactPipeline(llmClient)
const worktreeManager = new WorktreeManager()

function broadcastToRenderer(payload: StreamUpdatePayload): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.STREAM_UPDATE, payload)
  }
}

const skillManager = new SkillManager(configStore.getAppDataDir(), broadcastToRenderer)
const mcpManager = new McpManager(configStore.getAppDataDir(), broadcastToRenderer)
const memoryEngine = new HierarchicalMemoryEngine(configStore, llmClient, broadcastToRenderer)
const preferredKbBase = (() => {
  try {
    return app.isPackaged
      ? app.getPath('userData')
      : path.join(app.getPath('appData'), 'Claude Code Studio')
  } catch {
    return resolveDefaultAppSupportBase()
  }
})()
const knowledgeBaseManager = new KnowledgeBaseManager(
  preferredKbBase,
  configStore.getAppDataDir(),
  broadcastToRenderer
)

const swarmCoordinator = new SwarmCoordinator(
  configStore,
  llmClient,
  toolRegistry,
  worktreeManager,
  broadcastToRenderer
)

const queryEngine = new QueryEngine(
  configStore,
  llmClient,
  toolRegistry,
  compactPipeline,
  broadcastToRenderer,
  async (goal: string) => {
    const cfg = configStore.getConfig()
    return await swarmCoordinator.startSwarm(goal, cfg.enableWorktreeIsolation)
  },
  skillManager,
  mcpManager,
  memoryEngine
)

const dreamEngine = new DreamEngine(configStore, llmClient, memoryEngine, broadcastToRenderer)
const kairosWatcher = new KairosWatcher(configStore, toolRegistry, broadcastToRenderer)

function buildFileTree(rootDir: string, currentDir = rootDir, depth = 0): FileTreeNode[] {
  if (depth > 3) return []
  const ignored = new Set(['.git', 'node_modules', 'dist', 'out'])
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((e) => !ignored.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })
    .slice(0, 80)
    .map((entry) => {
      const fullPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(rootDir, fullPath)
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: fullPath,
          relativePath,
          isDirectory: true,
          children: buildFileTree(rootDir, fullPath, depth + 1)
        }
      }
      return {
        name: entry.name,
        path: fullPath,
        relativePath,
        isDirectory: false
      }
    })
}

function getResourcePath(fileName: string): string {
  const devPath = path.resolve(__dirname, '../../resources', fileName)
  if (fs.existsSync(devPath)) return devPath
  return path.join(process.resourcesPath, fileName)
}

function createWindow(): void {
  const appIconPath = getResourcePath('icon.png')

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webviewTag: true
    }
  })

  if (process.platform === 'darwin' && fs.existsSync(appIconPath)) {
    app.dock?.setIcon(nativeImage.createFromPath(appIconPath))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Prevent accidental trackpad swipe/gesture navigation in SPA
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) {
      if (!url.startsWith(devUrl)) {
        event.preventDefault()
      }
    } else {
      if (!url.startsWith('file://')) {
        event.preventDefault()
      }
    }
  })

  // Guard against hardware/mouse back-forward commands resetting view
  mainWindow.on('app-command', (e, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      e.preventDefault()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function setupTrayAndShortcuts(): void {
  const trayIconPath = getResourcePath('trayIcon.png')
  const icon = fs.existsSync(trayIconPath)
    ? nativeImage.createFromPath(trayIconPath)
    : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle(' ClaudeCode')
  tray.setToolTip('Claude Code Studio (Codex Workbench + Swarm + L1-L5 AutoDream)')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主工作台 (Workbench)',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: '呼出快捷指令框 (Alt + Space)',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send(IPC_CHANNELS.OPEN_QUICK_LAUNCHER)
      }
    },
    { type: 'separator' },
    {
      label: '✨ 立即执行 AutoDream 深度整合',
      click: () => {
        dreamEngine.runDreamCycle(queryEngine.getMessages(), 'manual').catch(console.error)
      }
    },
    { type: 'separator' },
    {
      label: '彻底退出 Claude Code Studio',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send(IPC_CHANNELS.OPEN_QUICK_LAUNCHER)
  })
}

function getInstalledBrowsers(): InstalledBrowserInfo[] {
  const browserDefs = [
    { id: 'default', name: '系统默认浏览器', isDefault: true, available: true, iconName: 'globe' },
    {
      id: 'chrome',
      name: 'Google Chrome',
      iconName: 'chrome',
      paths: [
        '/Applications/Google Chrome.app',
        path.join(os.homedir(), 'Applications/Google Chrome.app')
      ]
    },
    {
      id: 'safari',
      name: 'Safari',
      iconName: 'safari',
      paths: [
        '/Applications/Safari.app',
        '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app',
        '/System/Applications/Safari.app'
      ]
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      iconName: 'edge',
      paths: [
        '/Applications/Microsoft Edge.app',
        path.join(os.homedir(), 'Applications/Microsoft Edge.app')
      ]
    },
    {
      id: 'arc',
      name: 'Arc',
      iconName: 'arc',
      paths: [
        '/Applications/Arc.app',
        path.join(os.homedir(), 'Applications/Arc.app')
      ]
    },
    {
      id: 'firefox',
      name: 'Firefox',
      iconName: 'firefox',
      paths: [
        '/Applications/Firefox.app',
        path.join(os.homedir(), 'Applications/Firefox.app')
      ]
    },
    {
      id: 'brave',
      name: 'Brave Browser',
      iconName: 'brave',
      paths: [
        '/Applications/Brave Browser.app',
        path.join(os.homedir(), 'Applications/Brave Browser.app')
      ]
    },
    {
      id: 'opera',
      name: 'Opera',
      iconName: 'opera',
      paths: [
        '/Applications/Opera.app',
        path.join(os.homedir(), 'Applications/Opera.app')
      ]
    },
    {
      id: 'vivaldi',
      name: 'Vivaldi',
      iconName: 'vivaldi',
      paths: [
        '/Applications/Vivaldi.app',
        path.join(os.homedir(), 'Applications/Vivaldi.app')
      ]
    },
    {
      id: 'orion',
      name: 'Orion',
      iconName: 'orion',
      paths: [
        '/Applications/Orion.app',
        path.join(os.homedir(), 'Applications/Orion.app')
      ]
    }
  ]

  const results: InstalledBrowserInfo[] = []
  const foundNames = new Set<string>()

  for (const b of browserDefs) {
    if (b.isDefault) {
      results.push({
        id: b.id,
        name: b.name,
        isDefault: true,
        available: true,
        iconName: b.iconName
      })
      continue
    }
    if (b.paths) {
      for (const p of b.paths) {
        if (fs.existsSync(p)) {
          results.push({
            id: b.id,
            name: b.name,
            appPath: p,
            available: true,
            iconName: b.iconName
          })
          foundNames.add(b.name.toLowerCase())
          break
        }
      }
    }
  }

  // Scan /Applications for any other custom browser apps on macOS
  if (process.platform === 'darwin') {
    try {
      const appDirs = ['/Applications', path.join(os.homedir(), 'Applications')]
      for (const d of appDirs) {
        if (!fs.existsSync(d)) continue
        const files = fs.readdirSync(d)
        for (const f of files) {
          if (f.endsWith('.app')) {
            const base = f.replace(/\.app$/, '')
            const low = base.toLowerCase()
            if (
              (low.includes('browser') || low.includes('chrome') || low.includes('webkit')) &&
              !foundNames.has(low)
            ) {
              results.push({
                id: `custom_${base.toLowerCase().replace(/\s+/g, '_')}`,
                name: base,
                appPath: path.join(d, f),
                available: true,
                iconName: 'globe'
              })
              foundNames.add(low)
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return results
}

function openUrlInBrowser(payload: { browserId: string; url: string; appPath?: string }): { ok: boolean } {
  const { browserId, url, appPath } = payload
  if (!url) return { ok: false }

  if (browserId === 'default' || !appPath) {
    shell.openExternal(url)
    return { ok: true }
  }

  if (process.platform === 'darwin') {
    execFile('open', ['-a', appPath, url], (err) => {
      if (err) {
        console.warn(`open -a ${appPath} failed, falling back to shell.openExternal:`, err)
        shell.openExternal(url)
      }
    })
    return { ok: true }
  }

  shell.openExternal(url)
  return { ok: true }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => ({
    config: configStore.getConfig(),
    presets: MODEL_PRESETS
  }))

  ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG, (_e, partial: Partial<AppConfig>) => {
    const updated = configStore.updateConfig(partial)
    if (partial.workspaceDir) {
      memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
    }
    return updated
  })

  ipcMain.handle(
    IPC_CHANNELS.SWITCH_PROVIDER,
    (_e, payload: { providerId: string; model?: string }) => {
      const updated = configStore.switchProvider(payload.providerId, payload.model)
      return updated
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.TEST_PROVIDER_CONNECTION,
    async (_e, provider: AIProviderConfig) => {
      const cfg = configStore.getConfig()
      const result = await llmClient.testConnection({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.mainModel,
        proxyMode: provider.proxyMode,
        customProxyUrl: provider.customProxyUrl,
        globalProxyUrl: cfg.globalProxyUrl,
        customHeaders: provider.customHeaders
      })
      const updatedProviders = (cfg.providers || []).map((p) =>
        p.id === provider.id
          ? {
              ...p,
              lastLatencyMs: result.latencyMs,
              lastTestedAt: Date.now(),
              lastTestStatus: (result.ok ? 'success' : 'error') as 'success' | 'error',
              lastTestError: result.error
            }
          : p
      )
      configStore.updateConfig({ providers: updatedProviders })
      return result
    }
  )

  // Select or Add Project Folder via native macOS Directory Dialog
  const pickDirectoryAndActivate = async (): Promise<AppConfig | null> => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const chosen = res.filePaths[0]
    const updated = configStore.addOrSwitchProject(chosen)
    memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
    broadcastToRenderer({
      type: 'projects_updated',
      projects: updated.projects
    })
    return updated
  }

  ipcMain.handle(IPC_CHANNELS.SELECT_WORKSPACE, pickDirectoryAndActivate)
  ipcMain.handle(IPC_CHANNELS.ADD_PROJECT_FOLDER, pickDirectoryAndActivate)

  ipcMain.handle(IPC_CHANNELS.SWITCH_PROJECT_FOLDER, (_e, dirPath: string) => {
    const updated = configStore.addOrSwitchProject(dirPath)
    memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.REMOVE_PROJECT_FOLDER, (_e, dirPath: string) => {
    const updated = configStore.removeProject(dirPath)
    memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.GET_FILE_TREE, () => {
    const cfg = configStore.getConfig()
    return buildFileTree(cfg.workspaceDir)
  })

  ipcMain.handle(IPC_CHANNELS.READ_WORKSPACE_FILE, (_e, filePath: string) => {
    try {
      const cfg = configStore.getConfig()
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(cfg.workspaceDir, filePath)
      if (!fs.existsSync(fullPath)) return '文件不存在'
      return fs.readFileSync(fullPath, 'utf-8').slice(0, 30000)
    } catch (err) {
      return `读取失败: ${(err as Error).message}`
    }
  })

  // Codex Right-Side Inspector: Git Changes / Diff & Quick Terminal
  ipcMain.handle(IPC_CHANNELS.GET_GIT_STATUS, () => {
    const cfg = configStore.getConfig()
    return GitInspector.getStatusSummary(cfg.workspaceDir)
  })

  ipcMain.handle(IPC_CHANNELS.GET_GIT_DIFF, (_e, relPath: string) => {
    const cfg = configStore.getConfig()
    return GitInspector.getFileDiff(cfg.workspaceDir, relPath)
  })

  ipcMain.handle(IPC_CHANNELS.RUN_QUICK_TERMINAL, async (_e, cmd: string) => {
    const cfg = configStore.getConfig()
    const bashTool = toolRegistry.getTool('run_bash')!
    const callId = `quick_${Date.now()}`
    broadcastToRenderer({
      type: 'terminal_output',
      terminalLine: { commandId: callId, text: `$ ${maskSensitiveSecrets(cmd)}\n`, stream: 'stdout' }
    })
    return await bashTool.execute(
      { command: cmd },
      {
        workspaceDir: cfg.workspaceDir,
        onTerminalOutput: (commandId, text, stream) => {
          broadcastToRenderer({
            type: 'terminal_output',
            terminalLine: { commandId, text: maskSensitiveSecrets(text), stream }
          })
        }
      },
      callId
    )
  })

  // Codex Left Sidebar: Skills Hub
  ipcMain.handle(IPC_CHANNELS.GET_SKILLS, () => skillManager.listSkills())
  ipcMain.handle(IPC_CHANNELS.TOGGLE_SKILL, (_e, skillId: string) =>
    skillManager.toggleSkill(skillId)
  )
  ipcMain.handle(IPC_CHANNELS.INSTALL_SKILL, async (_e, input: InstallSkillInput) => {
    await skillManager.installSkill(input)
    return skillManager.listSkills()
  })
  ipcMain.handle(IPC_CHANNELS.DELETE_SKILL, (_e, skillId: string) =>
    skillManager.deleteSkill(skillId)
  )

  // Codex Left Sidebar: MCP Hub
  ipcMain.handle(IPC_CHANNELS.GET_MCP_SERVERS, () => mcpManager.listServers())
  ipcMain.handle(IPC_CHANNELS.TOGGLE_MCP_SERVER, (_e, serverId: string) =>
    mcpManager.toggleServer(serverId)
  )
  ipcMain.handle(
    IPC_CHANNELS.UPSERT_MCP_SERVER,
    (_e, input: Partial<McpServerItem> & { name: string }) => {
      mcpManager.upsertServer(input)
      return mcpManager.listServers()
    }
  )
  ipcMain.handle(IPC_CHANNELS.DELETE_MCP_SERVER, (_e, serverId: string) =>
    mcpManager.deleteServer(serverId)
  )
  ipcMain.handle(IPC_CHANNELS.PROBE_MCP_SERVER, async (_e, serverId: string) => {
    const cfg = configStore.getConfig()
    await mcpManager.probeServer(serverId, cfg.workspaceDir)
    return mcpManager.listServers()
  })

  // Multi-Format File Attachments (PNG / JPG / JPJ / WEBP / PDF / DOCX / TXT / Code)
  ipcMain.handle(IPC_CHANNELS.PICK_ATTACHMENTS, async () => {
    if (!mainWindow) return []
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择要附加的图像或文档 (支持 PNG, JPG/JPJ, PDF, DOCX, 文本与代码)',
      properties: ['openFile', 'multiSelections'],
      filters: AttachmentParser.DIALOG_FILTERS
    })
    if (res.canceled || res.filePaths.length === 0) return []
    return res.filePaths
      .map((p) => AttachmentParser.parseFile(p))
      .filter((item): item is ChatAttachment => item !== null)
  })

  ipcMain.handle(IPC_CHANNELS.PARSE_ATTACHMENT_PATHS, (_e, paths: string[]) => {
    if (!Array.isArray(paths)) return []
    return paths
      .map((p) => AttachmentParser.parseFile(p))
      .filter((item): item is ChatAttachment => item !== null)
  })

  ipcMain.handle(
    IPC_CHANNELS.PARSE_DATA_ATTACHMENT,
    (_e, payload: { name: string; mimeType?: string; dataBase64: string }) => {
      return AttachmentParser.parseDataPayload(payload)
    }
  )

  // Direction A: QueryEngine & Chat
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_STATE, () => ({
    messages: queryEngine.getMessages(),
    tokenStats: queryEngine.getTokenStats()
  }))

  ipcMain.handle(
    IPC_CHANNELS.SEND_MESSAGE,
    async (_e, input: string | SendMessagePayload) => {
      await queryEngine.sendUserMessage(input)
      return { ok: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.ABORT_GENERATION, () => {
    queryEngine.abort()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.CLEAR_SESSION, () => {
    queryEngine.clearSession()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.SET_SESSION_MESSAGES, (_e, msgs) => {
    queryEngine.setMessages(msgs)
    return { ok: true }
  })

  ipcMain.handle(
    IPC_CHANNELS.RESOLVE_TOOL_APPROVAL,
    (
      _e,
      payload: {
        toolCallId: string
        decision: 'approve_once' | 'approve_session' | 'reject'
      }
    ) => {
      queryEngine.resolveApproval(payload.toolCallId, payload.decision)
      return { ok: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.TRIGGER_COMPACT, async () => {
    const summary = await queryEngine.triggerManualCompact()
    return { ok: true, summary }
  })

  // Codex Ephemeral Side Chat Handlers
  let sideChatAbortController: AbortController | null = null

  ipcMain.handle(
    IPC_CHANNELS.SEND_SIDE_CHAT_MESSAGE,
    async (
      _e,
      payload: {
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
        contextHint?: string
        mainConversationMessages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
      }
    ) => {
      const cfg = configStore.getConfig()
      if (!cfg.apiKey && !cfg.baseUrl.includes('11434')) {
        return {
          content: '【侧边临时会话演示】请在右上角设置中配置 API Key。此侧边会话独立保存，绝不干扰主任务对话。',
          reasoningContent: ''
        }
      }

      sideChatAbortController = new AbortController()

      let mainContextBlock = ''
      if (payload.mainConversationMessages && payload.mainConversationMessages.length > 0) {
        const formattedTurns = payload.mainConversationMessages
          .map((m) => {
            const roleName = m.role === 'user' ? '用户 (主会话)' : '主助手 (主会话)'
            const text = (m.content || '').trim()
            const cappedText =
              text.length > 3500 ? text.slice(0, 3500) + '... (内容较长，已保留核心)' : text
            return `[${roleName}]:\n${cappedText}`
          })
          .join('\n\n')

        mainContextBlock = [
          '==================================================',
          '【主任务对话完整上下文 (Main Task Conversation History)】',
          '以下是用户与主 AI 在主任务窗口中正在进行的真实对话记录。',
          '【非常重要】：用户在当前侧边临时对话中的提问（包括但不限于“现在呢”、“怎么做”、“把刚才的链接整理一下”、“刚才说的代码怎么改”等追问或代词），通常直接承接或指涉以下主任务内容！',
          '你必须充分结合以下主对话内容和上下文背景来准确理解用户的真实意图，直接给出针对性解答，切勿回答“我没有收到上下文”或要求用户重复提供主对话中已有的信息。',
          '--------------------------------------------------',
          formattedTurns,
          '=================================================='
        ].join('\n')
      }

      const systemPrompt = [
        '你是集成在 OpenAI Codex 风格工作台内的【侧边临时助手 (Codex Ephemeral Side Chat)】。',
        '【核心职责与行为准则】：',
        '1. 【上下文感知与承接】：你完全共享当前主任务对话的上下文（见下方【主任务对话完整上下文】）。当用户提出承接性提问（如“现在呢”、“把刚才那个链接发我”、“怎么推进”等），请直接基于主对话内容进行深入解答。',
        '2. 【双重记忆无缝融合】：你同时拥有主任务上下文和当前侧边临时会话的历史记录，能够综合两者进行连贯解答。',
        '3. 【临时独立性保障】：你在此处产生的任何回复仅展示在侧边临时窗口，独立保留，绝对不会写入主任务的对话历史与 Git 仓库，确保主任务主线干净纯粹。',
        '4. 【回答风格】：直接切入重点，给出通俗易懂的大白话、清晰、可落地的专业解答、代码片段或步骤拆解。',
        payload.contextHint ? `\n【当前工作区/环境信息】:\n${payload.contextHint}` : '',
        mainContextBlock ? `\n${mainContextBlock}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')

      const openAIMsgs: OpenAIMessagePayload[] = [
        { role: 'system', content: systemPrompt },
        ...payload.messages.map((m) => ({ role: m.role, content: m.content }))
      ]

      try {
        const res = await llmClient.streamChatCompletion({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.mainModel || 'deepseek-reasoner',
          messages: openAIMsgs,
          signal: sideChatAbortController.signal,
          proxyMode: cfg.proxyMode,
          proxyUrl: cfg.customProxyUrl,
          globalProxyUrl: cfg.globalProxyUrl,
          onDelta: (delta) => {
            broadcastToRenderer({
              type: 'side_chat_delta',
              contentDelta: delta.content || '',
              reasoningDelta: delta.reasoning || '',
              sideChatDelta: {
                content: delta.content || '',
                reasoning: delta.reasoning || ''
              }
            })
          }
        })
        return { content: res.content, reasoningContent: res.reasoningContent }
      } catch (err: any) {
        return {
          content: `侧边临时会话请求失败: ${err.message || String(err)}`,
          reasoningContent: ''
        }
      } finally {
        sideChatAbortController = null
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.ABORT_SIDE_CHAT, () => {
    sideChatAbortController?.abort()
    sideChatAbortController = null
    return { ok: true }
  })

  // Direction B: Swarm Coordinator
  ipcMain.handle(IPC_CHANNELS.GET_SWARM_STATE, () => {
    return swarmCoordinator.getState()
  })

  ipcMain.handle(
    IPC_CHANNELS.START_SWARM,
    async (_e, payload: { goal: string; useWorktree: boolean }) => {
      const synthesis = await swarmCoordinator.startSwarm(payload.goal, payload.useWorktree)
      return { ok: true, synthesis }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MERGE_SWARM_TASK, (_e, taskId: string) => {
    return swarmCoordinator.mergeTaskWorktree(taskId)
  })

  ipcMain.handle(IPC_CHANNELS.CLEANUP_WORKTREES, () => {
    return swarmCoordinator.cleanupWorktrees()
  })

  // Direction C: KAIROS & L1-L5 Hierarchical Memory Engine
  ipcMain.handle(IPC_CHANNELS.GET_MEMORY_STATE, () => {
    const cfg = configStore.getConfig()
    memoryEngine.ensureWorkspaceLoaded(cfg.workspaceDir)
    return {
      memoryMarkdown: SystemPromptBuilder.readMemoryMarkdown(cfg.workspaceDir),
      memoryNodes: memoryEngine.getNodes(),
      dreamLogs: configStore.getDreamLogs(),
      kairosRules: configStore.getKairosRules()
    }
  })

  ipcMain.handle(IPC_CHANNELS.TRIGGER_DREAM, async () => {
    return await dreamEngine.runDreamCycle(queryEngine.getMessages(), 'manual')
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_MEMORY_MD, (_e, content: string) => {
    const cfg = configStore.getConfig()
    SystemPromptBuilder.writeMemoryMarkdown(cfg.workspaceDir, content)
    return { ok: true }
  })

  ipcMain.handle(
    IPC_CHANNELS.UPSERT_MEMORY_NODE,
    (
      _e,
      payload: {
        id?: string
        layer: MemoryLayer
        title: string
        content: string
        keywords?: string[]
        tags?: string[]
        importance?: number
      }
    ) => {
      memoryEngine.upsertOrEvolveNode({ ...payload, source: 'manual' }, false)
      return memoryEngine.getNodes()
    }
  )

  ipcMain.handle(IPC_CHANNELS.DELETE_MEMORY_NODE, (_e, nodeId: string) => {
    return memoryEngine.deleteNode(nodeId)
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_MEMORIES, (_e, query: string) => {
    return memoryEngine.retrieveForQuery(query, { topK: 6, recordAccess: false })
  })

  ipcMain.handle(IPC_CHANNELS.TOGGLE_KAIROS_RULE, (_e, ruleId: string) => {
    const rules = configStore.getKairosRules().map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    )
    configStore.updateKairosRules(rules)
    kairosWatcher.syncSchedules()
    return rules
  })

  ipcMain.handle(
    IPC_CHANNELS.ADD_KAIROS_RULE,
    (_e, rule: Omit<KairosTriggerRule, 'id' | 'enabled'>) => {
      const newRule: KairosTriggerRule = {
        ...rule,
        id: `rule_${Date.now()}`,
        enabled: true
      }
      const rules = [newRule, ...configStore.getKairosRules()]
      configStore.updateKairosRules(rules)
      kairosWatcher.syncSchedules()
      return rules
    }
  )

  ipcMain.handle(IPC_CHANNELS.RUN_KAIROS_RULE_NOW, async (_e, ruleId: string) => {
    await kairosWatcher.executeRule(ruleId)
    return configStore.getKairosRules()
  })

  // AI Doc Editor Multi-Format Export (Word .doc / .docx / .pdf)
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_DOCUMENT,
    async (_e, payload: ExportDocumentPayload): Promise<ExportDocumentResult> => {
      try {
        const safeName = sanitizeDocFileName(payload.title, '排版文档')
        const ext = payload.format
        const filterName =
          ext === 'pdf'
            ? 'PDF 文档 (*.pdf)'
            : ext === 'docx'
              ? 'Word OpenXML 文档 (*.docx)'
              : 'Word 97-2004 文档 (*.doc)'
        const downloadsDir = (() => {
          try {
            return app.getPath('downloads')
          } catch {
            return configStore.getConfig().workspaceDir
          }
        })()
        const defaultPath = path.join(downloadsDir, `${safeName}.${ext}`)

        if (mainWindow && !mainWindow.isDestroyed()) {
          const saveRes = await dialog.showSaveDialog(mainWindow, {
            title: `导出为 ${ext.toUpperCase()} 文档`,
            defaultPath,
            filters: [{ name: filterName, extensions: [ext] }]
          })
          if (saveRes.canceled || !saveRes.filePath) {
            return { ok: false, canceled: true }
          }
          const { buffer } = await DocumentExporter.exportToBuffer(payload, BrowserWindow)
          fs.writeFileSync(saveRes.filePath, buffer)
          return {
            ok: true,
            filePath: saveRes.filePath,
            fileName: path.basename(saveRes.filePath)
          }
        }

        const { buffer, mimeType } = await DocumentExporter.exportToBuffer(payload, BrowserWindow)
        return {
          ok: true,
          fileName: `${safeName}.${ext}`,
          dataBase64: buffer.toString('base64'),
          mimeType
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) }
      }
    }
  )

  // Knowledge Base Archive Storage (知识库文档存储 - PDF, TEX, 图片, Word)
  ipcMain.handle(
    IPC_CHANNELS.SAVE_TO_KNOWLEDGE_BASE,
    async (_e, payload: SaveKnowledgePdfPayload) => {
      return await knowledgeBaseManager.savePdfDocument(payload, BrowserWindow)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_TO_KNOWLEDGE_BASE,
    async (_e, payload: ImportKnowledgeDocPayload) => {
      return await knowledgeBaseManager.importAttachment(payload)
    }
  )

  ipcMain.handle(IPC_CHANNELS.LIST_KNOWLEDGE_DOCS, () => {
    return knowledgeBaseManager.getState()
  })

  ipcMain.handle(IPC_CHANNELS.READ_KNOWLEDGE_DOC_PDF, (_e, docId: string) => {
    return knowledgeBaseManager.readDocBase64(docId)
  })

  ipcMain.handle(IPC_CHANNELS.DELETE_KNOWLEDGE_DOC, (_e, docId: string) => {
    return knowledgeBaseManager.deleteDoc(docId)
  })

  ipcMain.handle(
    IPC_CHANNELS.OPEN_KNOWLEDGE_DOC,
    async (_e, payload: { docId: string; revealInFolder?: boolean }) => {
      const doc = knowledgeBaseManager.getDocById(payload.docId)
      if (!doc || !fs.existsSync(doc.filePath)) {
        return { ok: false }
      }
      if (payload.revealInFolder) {
        shell.showItemInFolder(doc.filePath)
      } else {
        await shell.openPath(doc.filePath)
      }
      return { ok: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.OPEN_KNOWLEDGE_FOLDER, async () => {
    const dir = knowledgeBaseManager.ensureStorageDir()
    await shell.openPath(dir)
    return { ok: true, storageDir: dir }
  })

  // Codex-Style Browser & Multi-Document Preview Hub
  ipcMain.handle(IPC_CHANNELS.LIST_INSTALLED_BROWSERS, () => {
    return getInstalledBrowsers()
  })

  ipcMain.handle(
    IPC_CHANNELS.OPEN_IN_BROWSER,
    (_e, payload: { browserId: string; url: string; appPath?: string }) => {
      return openUrlInBrowser(payload)
    }
  )

  ipcMain.handle(IPC_CHANNELS.OPEN_PATH_IN_APP, async (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false }
    await shell.openPath(filePath)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERT_DOCX_TO_HTML, (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, html: '' }
    const html = AttachmentParser.convertDocxToHtml(filePath)
    return { ok: Boolean(html), html }
  })

  ipcMain.handle(IPC_CHANNELS.PARSE_EXCEL_DATA, (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, sheets: [], totalRows: 0, totalCols: 0 }
    }
    const res = AttachmentParser.parseExcelSpreadsheet(filePath)
    return { ok: true, ...res }
  })

  ipcMain.handle(IPC_CHANNELS.READ_FILE_AS_DATA_URL, (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return null
    try {
      const buf = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      let mime = 'application/octet-stream'
      if (ext === '.pdf') mime = 'application/pdf'
      else if (ext === '.png') mime = 'image/png'
      else if (ext === '.jpg' || ext === '.jpeg' || ext === '.jpj') mime = 'image/jpeg'
      else if (ext === '.webp') mime = 'image/webp'
      else if (ext === '.svg') mime = 'image/svg+xml'
      else if (ext === '.gif') mime = 'image/gif'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
}

// Disable Chromium overscroll history navigation (two-finger horizontal swipe back on macOS)
app.commandLine.appendSwitch('disable-features', 'TouchpadOverscrollHistoryNavigation')

app.whenReady().then(() => {
  const cfg = configStore.getConfig()
  memoryEngine.ensureWorkspaceLoaded(cfg.workspaceDir)

  registerIpcHandlers()
  createWindow()
  setupTrayAndShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  kairosWatcher.stopAll()
  globalShortcut.unregisterAll()
})
