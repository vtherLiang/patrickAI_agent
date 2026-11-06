import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import {
  AIProviderConfig,
  AppConfig,
  DreamLogEntry,
  KairosTriggerRule,
  ModelProviderPreset,
  WorkspaceProject
} from '@shared/types'

export const DEFAULT_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'provider_deepseek',
    name: 'DeepSeek 官方',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    mainModel: 'deepseek-reasoner',
    fastModel: 'deepseek-chat',
    availableModels: ['deepseek-reasoner', 'deepseek-chat'],
    defaultContextTokens: 128000,
    proxyMode: 'direct' // ⚡ 默认直连！使用 VPN 时不走代理，解决地区拦截 403
  },
  {
    id: 'provider_openai',
    name: 'OpenAI 官方',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    mainModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1', 'gpt-4-turbo'],
    defaultContextTokens: 200000,
    proxyMode: 'proxy' // 🌐 走代理/VPN
  },
  {
    id: 'provider_gemini',
    name: 'Google Gemini 官方',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY || '',
    mainModel: 'gemini-2.5-pro',
    fastModel: 'gemini-2.5-flash',
    availableModels: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ],
    defaultContextTokens: 1000000,
    proxyMode: 'proxy' // 🌐 走代理/VPN
  },
  {
    id: 'provider_relay',
    name: '通用中转站 (OneAPI / NewAPI)',
    type: 'relay',
    baseUrl: 'https://api.openai-proxy.org/v1',
    apiKey: '',
    mainModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    availableModels: [
      'gpt-4o',
      'gpt-4o-mini',
      'gemini-2.5-pro',
      'deepseek-reasoner',
      'claude-3-7-sonnet',
      'o3-mini'
    ],
    defaultContextTokens: 200000,
    proxyMode: 'system' // ⚙️ 跟随系统
  },
  {
    id: 'provider_siliconflow',
    name: 'SiliconFlow 硅基流动',
    type: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: process.env.SILICONFLOW_API_KEY || '',
    mainModel: 'Pro/deepseek-ai/DeepSeek-V3',
    fastModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    availableModels: [
      'Pro/deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-Coder-32B-Instruct'
    ],
    defaultContextTokens: 128000,
    proxyMode: 'direct'
  },
  {
    id: 'provider_openrouter',
    name: 'OpenRouter 聚合',
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    mainModel: 'anthropic/claude-3.7-sonnet',
    fastModel: 'openai/gpt-4o-mini',
    availableModels: [
      'anthropic/claude-3.7-sonnet',
      'google/gemini-2.5-pro',
      'openai/gpt-4o',
      'deepseek/deepseek-r1'
    ],
    defaultContextTokens: 200000,
    proxyMode: 'proxy'
  },
  {
    id: 'provider_ollama',
    name: '本地 Ollama (免Key)',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    mainModel: 'qwen2.5-coder:14b',
    fastModel: 'qwen2.5-coder:7b',
    availableModels: ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'deepseek-r1:14b', 'llama3.3:70b'],
    defaultContextTokens: 128000,
    proxyMode: 'direct'
  }
]

export const MODEL_PRESETS: ModelProviderPreset[] = DEFAULT_PROVIDERS.map((p) => ({
  id: p.id.replace('provider_', ''),
  name: p.name,
  baseUrl: p.baseUrl,
  mainModel: p.mainModel,
  fastModel: p.fastModel,
  defaultContextTokens: p.defaultContextTokens,
  proxyMode: p.proxyMode,
  type: p.type
}))

export function detectGitBranch(dirPath: string): string {
  try {
    if (!fs.existsSync(dirPath)) return 'local'
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dirPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500
    }).trim()
    return branch || 'main'
  } catch {
    return 'local'
  }
}

export class ConfigStore {
  private appDir: string
  private configPath: string
  private config: AppConfig
  private dreamLogs: DreamLogEntry[] = []
  private kairosRules: KairosTriggerRule[] = []

  constructor(defaultWorkspace: string) {
    this.appDir = path.join(defaultWorkspace, '.claude-desktop')
    if (!fs.existsSync(this.appDir)) {
      fs.mkdirSync(this.appDir, { recursive: true })
    }
    this.configPath = path.join(this.appDir, 'config.json')

    const initialProject: WorkspaceProject = {
      id: `proj_${Buffer.from(defaultWorkspace).toString('base64url').slice(0, 12)}`,
      name: path.basename(defaultWorkspace) || defaultWorkspace,
      path: defaultWorkspace,
      gitBranch: detectGitBranch(defaultWorkspace),
      addedAt: Date.now()
    }

    const defaultConfig: AppConfig = {
      workspaceDir: defaultWorkspace,
      projects: [initialProject],
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
      mainModel: 'deepseek-chat',
      fastModel: 'deepseek-chat',
      maxContextTokens: 200000,
      autoCompactThreshold: 0.85,
      permissionMode: 'default',
      autoApproveReadOnly: true,
      autoApproveWriteInSession: false,
      enableWorktreeIsolation: true,
      enableDreamOnIdle: true,
      idleDreamMinutes: 15,
      autoMemoryCrystallize: true
    }

    this.kairosRules = [
      {
        id: 'rule-git-audit',
        name: 'Git 工作区健康度与未提交风险巡检',
        type: 'interval',
        patternOrMinutes: '30',
        promptInstruction:
          '检查当前项目的 git status 与最近改动，排查是否有遗留调试代码、硬编码密钥或未完成 TODO。',
        enabled: false
      },
      {
        id: 'rule-ts-watch',
        name: '核心源码变更规范守护',
        type: 'file_watch',
        patternOrMinutes: 'src/**/*.ts',
        promptInstruction:
          '快速审查最近修改的 TypeScript 文件是否符合项目 MEMORY.md 中的架构约定。',
        enabled: false
      }
    ]

    if (fs.existsSync(this.configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
        this.config = { ...defaultConfig, ...(raw.config || {}) }
        if (this.config.autoMemoryCrystallize === undefined) {
          this.config.autoMemoryCrystallize = true
        }
        // Auto-upgrade legacy 64K default context window to provider optimal capacity (128K for DeepSeek API ceiling, 200K Claude Code standard)
        if (!this.config.maxContextTokens || this.config.maxContextTokens <= 64000) {
          this.config.maxContextTokens = this.config.baseUrl?.includes('deepseek.com')
            ? 128000
            : 200000
        }
        if (!this.config.autoCompactThreshold || this.config.autoCompactThreshold <= 0.78) {
          this.config.autoCompactThreshold = 0.85
        }
        if (Array.isArray(raw.dreamLogs)) this.dreamLogs = raw.dreamLogs
        if (Array.isArray(raw.kairosRules)) this.kairosRules = raw.kairosRules
      } catch {
        this.config = defaultConfig
      }
    } else {
      this.config = defaultConfig
    }

    // Initialize or migrate CC-Switch multi-provider configurations
    if (!Array.isArray(this.config.providers) || this.config.providers.length === 0) {
      this.config.providers = DEFAULT_PROVIDERS.map((p) => ({ ...p }))
    }

    // Ensure user's existing key is retained in the matching provider
    if (this.config.apiKey) {
      const match =
        this.config.providers.find((p) => p.baseUrl === this.config.baseUrl) ||
        this.config.providers[0]
      if (match && !match.apiKey) {
        match.apiKey = this.config.apiKey
      }
    }

    if (!this.config.activeProviderId) {
      const match = this.config.providers.find((p) => p.baseUrl === this.config.baseUrl)
      this.config.activeProviderId = match ? match.id : 'provider_deepseek'
    }

    const activeProvider = this.config.providers.find((p) => p.id === this.config.activeProviderId)
    if (activeProvider) {
      this.config.proxyMode = activeProvider.proxyMode || 'system'
      this.config.customProxyUrl = activeProvider.customProxyUrl
    }

    this.ensureActiveWorkspaceInProjects()
    this.save()
  }

  getAppDataDir(): string {
    return this.appDir
  }

  private ensureActiveWorkspaceInProjects(): void {
    const list = Array.isArray(this.config.projects) ? [...this.config.projects] : []
    const activeDir = this.config.workspaceDir
    if (activeDir && !list.some((p) => p.path === activeDir)) {
      list.unshift({
        id: `proj_${Buffer.from(activeDir).toString('base64url').slice(0, 12)}`,
        name: path.basename(activeDir) || activeDir,
        path: activeDir,
        gitBranch: detectGitBranch(activeDir),
        addedAt: Date.now()
      })
    }
    // Refresh live git branch names
    this.config.projects = list.map((p) => ({
      ...p,
      name: path.basename(p.path) || p.name,
      gitBranch: detectGitBranch(p.path)
    }))
  }

  getConfig(): AppConfig {
    return {
      ...this.config,
      projects: (this.config.projects || []).map((p) => ({ ...p }))
    }
  }

  updateConfig(partial: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...partial }
    // If activeProviderId or providers were updated, keep active fields synchronized
    if (partial.providers && Array.isArray(partial.providers)) {
      const active = partial.providers.find((p) => p.id === (partial.activeProviderId || this.config.activeProviderId))
      if (active) {
        this.config.baseUrl = active.baseUrl
        this.config.apiKey = active.apiKey
        this.config.mainModel = active.mainModel
        this.config.fastModel = active.fastModel || active.mainModel
        this.config.proxyMode = active.proxyMode || 'system'
        this.config.customProxyUrl = active.customProxyUrl
        this.config.maxContextTokens = active.defaultContextTokens || 200000
      }
    }
    this.ensureActiveWorkspaceInProjects()
    this.save()
    return this.getConfig()
  }

  switchProvider(providerId: string, model?: string): AppConfig {
    const list = this.config.providers || []
    const target = list.find((p) => p.id === providerId)
    if (!target) return this.getConfig()

    this.config.activeProviderId = target.id
    this.config.baseUrl = target.baseUrl
    this.config.apiKey = target.apiKey
    this.config.mainModel = model || target.mainModel
    this.config.fastModel = target.fastModel || target.mainModel
    this.config.maxContextTokens = target.defaultContextTokens || 200000
    this.config.proxyMode = target.proxyMode || 'system'
    this.config.customProxyUrl = target.customProxyUrl

    if (model) {
      target.mainModel = model
    }
    this.save()
    return this.getConfig()
  }

  switchModel(model: string): AppConfig {
    this.config.mainModel = model
    const activeId = this.config.activeProviderId
    if (activeId && Array.isArray(this.config.providers)) {
      const active = this.config.providers.find((p) => p.id === activeId)
      if (active) {
        active.mainModel = model
        if (!active.availableModels.includes(model)) {
          active.availableModels.push(model)
        }
      }
    }
    this.save()
    return this.getConfig()
  }

  upsertProvider(provider: AIProviderConfig): AppConfig {
    const list = this.config.providers || []
    const idx = list.findIndex((p) => p.id === provider.id)
    if (idx >= 0) {
      list[idx] = { ...provider }
    } else {
      list.push({ ...provider })
    }
    this.config.providers = list

    if (this.config.activeProviderId === provider.id) {
      this.config.baseUrl = provider.baseUrl
      this.config.apiKey = provider.apiKey
      this.config.mainModel = provider.mainModel
      this.config.fastModel = provider.fastModel || provider.mainModel
      this.config.maxContextTokens = provider.defaultContextTokens || 200000
      this.config.proxyMode = provider.proxyMode || 'system'
      this.config.customProxyUrl = provider.customProxyUrl
    }
    this.save()
    return this.getConfig()
  }

  deleteProvider(providerId: string): AppConfig {
    const list = (this.config.providers || []).filter((p) => p.id !== providerId)
    if (list.length === 0) return this.getConfig()
    this.config.providers = list
    if (this.config.activeProviderId === providerId) {
      this.switchProvider(list[0].id)
    } else {
      this.save()
    }
    return this.getConfig()
  }

  addOrSwitchProject(dirPath: string): AppConfig {
    const resolved = path.resolve(dirPath)
    const list = Array.isArray(this.config.projects) ? [...this.config.projects] : []
    const existing = list.find((p) => p.path === resolved)
    if (!existing) {
      list.push({
        id: `proj_${Buffer.from(resolved).toString('base64url').slice(0, 12)}_${Date.now().toString(36)}`,
        name: path.basename(resolved) || resolved,
        path: resolved,
        gitBranch: detectGitBranch(resolved),
        addedAt: Date.now()
      })
    } else {
      existing.gitBranch = detectGitBranch(resolved)
    }
    this.config.workspaceDir = resolved
    this.config.projects = list
    this.save()
    return this.getConfig()
  }

  removeProject(dirPath: string): AppConfig {
    const list = (this.config.projects || []).filter((p) => p.path !== dirPath)
    if (list.length === 0) {
      // Always retain at least one project
      return this.getConfig()
    }
    this.config.projects = list
    if (this.config.workspaceDir === dirPath) {
      this.config.workspaceDir = list[0].path
    }
    this.save()
    return this.getConfig()
  }

  getDreamLogs(): DreamLogEntry[] {
    return [...this.dreamLogs]
  }

  addDreamLog(entry: DreamLogEntry): void {
    this.dreamLogs = [entry, ...this.dreamLogs].slice(0, 50)
    this.save()
  }

  getKairosRules(): KairosTriggerRule[] {
    return [...this.kairosRules]
  }

  updateKairosRules(rules: KairosTriggerRule[]): void {
    this.kairosRules = rules
    this.save()
  }

  private save(): void {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(
          {
            config: this.config,
            dreamLogs: this.dreamLogs,
            kairosRules: this.kairosRules
          },
          null,
          2
        ),
        'utf-8'
      )
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }
}
