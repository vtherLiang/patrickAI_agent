import http from 'http'
import fs from 'fs'
import path from 'path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  AppConfig,
  ChatAttachment,
  FileTreeNode,
  KairosTriggerRule,
  SendMessagePayload,
  StreamUpdatePayload
} from '../shared/types'
import { ConfigStore, MODEL_PRESETS } from './store/ConfigStore'
import { maskSensitiveSecrets } from '../shared/secretMasker'
import { OpenAICompatibleClient } from './llm/OpenAIClient'
import { ToolRegistry } from './tools/ToolRegistry'
import { CompactPipeline } from './context/CompactPipeline'
import { QueryEngine } from './engine/QueryEngine'
import { SystemPromptBuilder } from './engine/SystemPromptBuilder'
import { WorktreeManager } from './coordinator/WorktreeManager'
import { SwarmCoordinator } from './coordinator/SwarmCoordinator'
import { DreamEngine } from './daemon/DreamEngine'
import { SkillManager } from './skills/SkillManager'
import { McpManager } from './mcp/McpManager'
import { HierarchicalMemoryEngine } from './memory/HierarchicalMemoryEngine'
import { GitInspector } from './git/GitInspector'
import { AttachmentParser } from './files/AttachmentParser'
import { DocumentExporter, sanitizeDocFileName } from './files/DocumentExporter'
import {
  KnowledgeBaseManager,
  resolveDefaultAppSupportBase
} from './files/KnowledgeBaseManager'
import { execFile } from 'child_process'

const PORT = Number(process.env.PORT) || 3721
const defaultWorkspace = process.cwd()
const configStore = new ConfigStore(defaultWorkspace)
const llmClient = new OpenAICompatibleClient()
const toolRegistry = new ToolRegistry()
const compactPipeline = new CompactPipeline(llmClient)
const worktreeManager = new WorktreeManager()

const sseClients = new Set<http.ServerResponse>()

function broadcastToRenderer(payload: StreamUpdatePayload): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const res of sseClients) {
    res.write(data)
  }
}

const skillManager = new SkillManager(configStore.getAppDataDir(), broadcastToRenderer)
const mcpManager = new McpManager(configStore.getAppDataDir(), broadcastToRenderer)
const memoryEngine = new HierarchicalMemoryEngine(configStore, llmClient, broadcastToRenderer)
const knowledgeBaseManager = new KnowledgeBaseManager(
  resolveDefaultAppSupportBase(),
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

let sideChatAbortController: AbortController | null = null

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

async function handleRpc(channel: string, arg: any): Promise<any> {
  switch (channel) {
    case IPC_CHANNELS.GET_CONFIG:
      return { config: configStore.getConfig(), presets: MODEL_PRESETS }
    case IPC_CHANNELS.UPDATE_CONFIG:
      return configStore.updateConfig(arg as Partial<AppConfig>)
    case IPC_CHANNELS.SWITCH_PROVIDER:
      return configStore.switchProvider(arg.providerId, arg.model)
    case IPC_CHANNELS.TEST_PROVIDER_CONNECTION: {
      const cfg = configStore.getConfig()
      const result = await llmClient.testConnection({
        baseUrl: arg.baseUrl,
        apiKey: arg.apiKey,
        model: arg.mainModel,
        proxyMode: arg.proxyMode,
        customProxyUrl: arg.customProxyUrl,
        globalProxyUrl: cfg.globalProxyUrl,
        customHeaders: arg.customHeaders
      })
      const updatedProviders = (cfg.providers || []).map((p: any) =>
        p.id === arg.id
          ? {
              ...p,
              lastLatencyMs: result.latencyMs,
              lastTestedAt: Date.now(),
              lastTestStatus: result.ok ? 'success' : 'error',
              lastTestError: result.error
            }
          : p
      )
      configStore.updateConfig({ providers: updatedProviders })
      return result
    }
    case IPC_CHANNELS.SELECT_WORKSPACE:
    case IPC_CHANNELS.ADD_PROJECT_FOLDER:
      if (typeof arg === 'string' && arg.trim()) {
        const updated = configStore.addOrSwitchProject(arg.trim())
        memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
        return updated
      }
      return configStore.getConfig()
    case IPC_CHANNELS.SWITCH_PROJECT_FOLDER: {
      const updated = configStore.addOrSwitchProject(String(arg))
      memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
      return updated
    }
    case IPC_CHANNELS.REMOVE_PROJECT_FOLDER: {
      const updated = configStore.removeProject(String(arg))
      memoryEngine.ensureWorkspaceLoaded(updated.workspaceDir)
      return updated
    }
    case IPC_CHANNELS.GET_FILE_TREE:
      return buildFileTree(configStore.getConfig().workspaceDir)
    case IPC_CHANNELS.READ_WORKSPACE_FILE: {
      const cfg = configStore.getConfig()
      const fullPath = path.isAbsolute(String(arg))
        ? String(arg)
        : path.resolve(cfg.workspaceDir, String(arg))
      if (!fs.existsSync(fullPath)) return '文件不存在'
      return fs.readFileSync(fullPath, 'utf-8').slice(0, 30000)
    }
    case IPC_CHANNELS.GET_GIT_STATUS:
      return GitInspector.getStatusSummary(configStore.getConfig().workspaceDir)
    case IPC_CHANNELS.GET_GIT_DIFF:
      return GitInspector.getFileDiff(configStore.getConfig().workspaceDir, String(arg))
    case IPC_CHANNELS.RUN_QUICK_TERMINAL: {
      const cfg = configStore.getConfig()
      const bashTool = toolRegistry.getTool('run_bash')!
      const callId = `quick_${Date.now()}`
      broadcastToRenderer({
        type: 'terminal_output',
        terminalLine: { commandId: callId, text: `$ ${maskSensitiveSecrets(String(arg))}\n`, stream: 'stdout' }
      })
      return await bashTool.execute(
        { command: String(arg) },
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
    }
    case IPC_CHANNELS.GET_SKILLS:
      return skillManager.listSkills()
    case IPC_CHANNELS.TOGGLE_SKILL:
      return skillManager.toggleSkill(String(arg))
    case IPC_CHANNELS.INSTALL_SKILL:
      await skillManager.installSkill(arg)
      return skillManager.listSkills()
    case IPC_CHANNELS.DELETE_SKILL:
      return skillManager.deleteSkill(String(arg))
    case IPC_CHANNELS.GET_MCP_SERVERS:
      return mcpManager.listServers()
    case IPC_CHANNELS.TOGGLE_MCP_SERVER:
      return mcpManager.toggleServer(String(arg))
    case IPC_CHANNELS.UPSERT_MCP_SERVER:
      mcpManager.upsertServer(arg)
      return mcpManager.listServers()
    case IPC_CHANNELS.DELETE_MCP_SERVER:
      return mcpManager.deleteServer(String(arg))
    case IPC_CHANNELS.PROBE_MCP_SERVER:
      await mcpManager.probeServer(String(arg), configStore.getConfig().workspaceDir)
      return mcpManager.listServers()
    case IPC_CHANNELS.PICK_ATTACHMENTS:
      return []
    case IPC_CHANNELS.PARSE_ATTACHMENT_PATHS:
      return Array.isArray(arg)
        ? arg
            .map((p: string) => AttachmentParser.parseFile(p))
            .filter((item): item is ChatAttachment => item !== null)
        : []
    case IPC_CHANNELS.PARSE_DATA_ATTACHMENT:
      return AttachmentParser.parseDataPayload(arg)
    case IPC_CHANNELS.GET_SESSION_STATE:
      return {
        messages: queryEngine.getMessages(),
        tokenStats: queryEngine.getTokenStats()
      }
    case IPC_CHANNELS.SEND_MESSAGE:
      queryEngine
        .sendUserMessage(
          typeof arg === 'object' && arg !== null ? (arg as SendMessagePayload) : String(arg)
        )
        .catch(console.error)
      return { ok: true }
    case IPC_CHANNELS.ABORT_GENERATION:
      queryEngine.abort()
      return { ok: true }
    case IPC_CHANNELS.CLEAR_SESSION:
      queryEngine.clearSession()
      return { ok: true }
    case IPC_CHANNELS.SET_SESSION_MESSAGES:
      queryEngine.setMessages(arg)
      return { ok: true }
    case IPC_CHANNELS.RESOLVE_TOOL_APPROVAL:
      queryEngine.resolveApproval(arg.toolCallId, arg.decision)
      return { ok: true }
    case IPC_CHANNELS.TRIGGER_COMPACT: {
      const summary = await queryEngine.triggerManualCompact()
      return { ok: true, summary }
    }
    case IPC_CHANNELS.GET_SWARM_STATE:
      return swarmCoordinator.getState()
    case IPC_CHANNELS.START_SWARM: {
      swarmCoordinator.startSwarm(arg.goal, arg.useWorktree).catch(console.error)
      return { ok: true, synthesis: '' }
    }
    case IPC_CHANNELS.MERGE_SWARM_TASK:
      return swarmCoordinator.mergeTaskWorktree(String(arg))
    case IPC_CHANNELS.CLEANUP_WORKTREES:
      return swarmCoordinator.cleanupWorktrees()
    case IPC_CHANNELS.GET_MEMORY_STATE: {
      const cfg = configStore.getConfig()
      memoryEngine.ensureWorkspaceLoaded(cfg.workspaceDir)
      return {
        memoryMarkdown: SystemPromptBuilder.readMemoryMarkdown(cfg.workspaceDir),
        memoryNodes: memoryEngine.getNodes(),
        dreamLogs: configStore.getDreamLogs(),
        kairosRules: configStore.getKairosRules()
      }
    }
    case IPC_CHANNELS.TRIGGER_DREAM:
      return await dreamEngine.runDreamCycle(queryEngine.getMessages(), 'manual')
    case IPC_CHANNELS.SAVE_MEMORY_MD: {
      const cfg = configStore.getConfig()
      SystemPromptBuilder.writeMemoryMarkdown(cfg.workspaceDir, String(arg))
      return { ok: true }
    }
    case IPC_CHANNELS.UPSERT_MEMORY_NODE:
      memoryEngine.upsertOrEvolveNode({ ...arg, source: 'manual' }, false)
      return memoryEngine.getNodes()
    case IPC_CHANNELS.DELETE_MEMORY_NODE:
      return memoryEngine.deleteNode(String(arg))
    case IPC_CHANNELS.SEARCH_MEMORIES:
      return memoryEngine.retrieveForQuery(String(arg), { topK: 6, recordAccess: false })
    case IPC_CHANNELS.TOGGLE_KAIROS_RULE: {
      const rules = configStore.getKairosRules().map((r) =>
        r.id === String(arg) ? { ...r, enabled: !r.enabled } : r
      )
      configStore.updateKairosRules(rules)
      return rules
    }
    case IPC_CHANNELS.ADD_KAIROS_RULE: {
      const newRule: KairosTriggerRule = {
        ...arg,
        id: `rule_${Date.now()}`,
        enabled: true
      }
      const rules = [newRule, ...configStore.getKairosRules()]
      configStore.updateKairosRules(rules)
      return rules
    }
    case IPC_CHANNELS.RUN_KAIROS_RULE_NOW: {
      const rules = configStore.getKairosRules()
      const rule = rules.find((r) => r.id === String(arg))
      if (rule) {
        const cfg = configStore.getConfig()
        const bashTool = toolRegistry.getTool('run_bash')!
        const statusOut = await bashTool.execute(
          { command: 'git status -s 2>/dev/null || ls -la | head -n 12' },
          { workspaceDir: cfg.workspaceDir },
          `kairos_${Date.now()}`
        )
        rule.lastTriggeredAt = Date.now()
        rule.lastResult = `[${new Date().toLocaleTimeString()} 巡检完成] -> ${statusOut.split('\n').slice(0, 4).join(' | ').slice(0, 180)}`
        configStore.updateKairosRules(rules)
        broadcastToRenderer({
          type: 'kairos_notification',
          notification: {
            title: `🛡️ KAIROS 守护巡检: ${rule.name}`,
            body: rule.lastResult,
            timestamp: Date.now()
          }
        })
      }
      return rules
    }
    case IPC_CHANNELS.EXPORT_DOCUMENT: {
      const safeName = sanitizeDocFileName(arg?.title, '排版文档')
      const { buffer, ext, mimeType } = await DocumentExporter.exportToBuffer(arg)
      return {
        ok: true,
        fileName: `${safeName}.${ext}`,
        dataBase64: buffer.toString('base64'),
        mimeType
      }
    }
    case IPC_CHANNELS.SAVE_TO_KNOWLEDGE_BASE:
      return await knowledgeBaseManager.savePdfDocument(arg)
    case IPC_CHANNELS.IMPORT_TO_KNOWLEDGE_BASE:
      return await knowledgeBaseManager.importAttachment(arg)
    case IPC_CHANNELS.LIST_KNOWLEDGE_DOCS:
      return knowledgeBaseManager.getState()
    case IPC_CHANNELS.READ_KNOWLEDGE_DOC_PDF:
      return knowledgeBaseManager.readDocBase64(String(arg))
    case IPC_CHANNELS.DELETE_KNOWLEDGE_DOC:
      return knowledgeBaseManager.deleteDoc(String(arg))
    case IPC_CHANNELS.OPEN_KNOWLEDGE_DOC: {
      const doc = knowledgeBaseManager.getDocById(String(arg?.docId || arg))
      if (!doc || !fs.existsSync(doc.filePath)) return { ok: false }
      if (process.platform === 'darwin') {
        execFile('open', arg?.revealInFolder ? ['-R', doc.filePath] : [doc.filePath])
      }
      return { ok: true }
    }
    case IPC_CHANNELS.OPEN_KNOWLEDGE_FOLDER: {
      const dir = knowledgeBaseManager.ensureStorageDir()
      if (process.platform === 'darwin') {
        execFile('open', [dir])
      }
      return { ok: true, storageDir: dir }
    }
    case IPC_CHANNELS.SEND_SIDE_CHAT_MESSAGE: {
      const cfg = configStore.getConfig()
      if (!cfg.apiKey && !cfg.baseUrl.includes('11434')) {
        return {
          content: '【侧边临时会话演示】请在右上角设置中配置 API Key。此侧边会话独立保存，绝不干扰主任务对话。',
          reasoningContent: ''
        }
      }
      sideChatAbortController = new AbortController()

      let mainContextBlock = ''
      if (arg?.mainConversationMessages && arg.mainConversationMessages.length > 0) {
        const formattedTurns = arg.mainConversationMessages
          .map((m: any) => {
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
        arg?.contextHint ? `\n【当前工作区/环境信息】:\n${arg.contextHint}` : '',
        mainContextBlock ? `\n${mainContextBlock}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')

      const openAIMsgs = [
        { role: 'system', content: systemPrompt },
        ...(arg?.messages || []).map((m: any) => ({ role: m.role, content: m.content }))
      ]

      try {
        const res = await llmClient.streamChatCompletion({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.mainModel || 'deepseek-reasoner',
          messages: openAIMsgs as any,
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
    case IPC_CHANNELS.ABORT_SIDE_CHAT:
      sideChatAbortController?.abort()
      sideChatAbortController = null
      return { ok: true }
    default:
      return null
  }
}

const rendererDist = path.resolve(process.cwd(), 'out/renderer')

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.write(':\n\n')
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }

  if (url.pathname === '/api/rpc' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      try {
        const { channel, arg } = JSON.parse(body || '{}')
        const result = await handleRpc(channel, arg)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ result }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: (err as Error).message }))
      }
    })
    return
  }

  let filePath = path.join(rendererDist, url.pathname === '/' ? 'index.html' : url.pathname)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(rendererDist, 'index.html')
  }

  const ext = path.extname(filePath)
  const mimeMap: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
  }
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

const cfg = configStore.getConfig()
memoryEngine.ensureWorkspaceLoaded(cfg.workspaceDir)

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Code Studio Standalone Server running at http://127.0.0.1:${PORT}`)
})
