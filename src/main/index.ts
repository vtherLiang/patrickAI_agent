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
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  AppConfig,
  FileTreeNode,
  KairosTriggerRule,
  StreamUpdatePayload
} from '@shared/types'
import { ConfigStore, MODEL_PRESETS } from './store/ConfigStore'
import { OpenAICompatibleClient } from './llm/OpenAIClient'
import { ToolRegistry } from './tools/ToolRegistry'
import { CompactPipeline } from './context/CompactPipeline'
import { QueryEngine } from './engine/QueryEngine'
import { SystemPromptBuilder } from './engine/SystemPromptBuilder'
import { WorktreeManager } from './coordinator/WorktreeManager'
import { SwarmCoordinator } from './coordinator/SwarmCoordinator'
import { DreamEngine } from './daemon/DreamEngine'
import { KairosWatcher } from './daemon/KairosWatcher'

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
  }
)

const dreamEngine = new DreamEngine(configStore, llmClient, broadcastToRenderer)
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
    .slice(0, 60)
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0f12',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Keep KAIROS daemon running in background when user closes window
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function setupTrayAndShortcuts(): void {
  // Create a clean template icon for macOS status bar
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('⚡ClaudeCode')
  tray.setToolTip('Claude Code Desktop (A+B+C Runtime & KAIROS Daemon)')

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
      label: '✨ 立即执行 Dream 记忆提炼',
      click: () => {
        dreamEngine.runDreamCycle(queryEngine.getMessages(), 'manual').catch(console.error)
      }
    },
    { type: 'separator' },
    {
      label: '彻底退出 Claude Code Desktop',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  // Global shortcut: Option/Alt + Space to summon Quick Launcher
  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send(IPC_CHANNELS.OPEN_QUICK_LAUNCHER)
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => ({
    config: configStore.getConfig(),
    presets: MODEL_PRESETS
  }))

  ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG, (_e, partial: Partial<AppConfig>) => {
    return configStore.updateConfig(partial)
  })

  ipcMain.handle(IPC_CHANNELS.SELECT_WORKSPACE, async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const chosen = res.filePaths[0]
    const updated = configStore.updateConfig({ workspaceDir: chosen })
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
      return fs.readFileSync(fullPath, 'utf-8').slice(0, 20000)
    } catch (err) {
      return `读取失败: ${(err as Error).message}`
    }
  })

  // Direction A: QueryEngine & Chat
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_STATE, () => ({
    messages: queryEngine.getMessages(),
    tokenStats: queryEngine.getTokenStats()
  }))

  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_e, text: string) => {
    await queryEngine.sendUserMessage(text)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.ABORT_GENERATION, () => {
    queryEngine.abort()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.CLEAR_SESSION, () => {
    queryEngine.clearSession()
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

  // Direction C: KAIROS & Dream Engine
  ipcMain.handle(IPC_CHANNELS.GET_MEMORY_STATE, () => {
    const cfg = configStore.getConfig()
    return {
      memoryMarkdown: SystemPromptBuilder.readMemoryMarkdown(cfg.workspaceDir),
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
}

app.whenReady().then(() => {
  // Ensure initial MEMORY.md exists in workspace
  const cfg = configStore.getConfig()
  if (!fs.existsSync(SystemPromptBuilder.getMemoryFilePath(cfg.workspaceDir))) {
    SystemPromptBuilder.writeMemoryMarkdown(
      cfg.workspaceDir,
      SystemPromptBuilder.readMemoryMarkdown(cfg.workspaceDir)
    )
  }

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
