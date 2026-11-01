import fs from 'fs'
import path from 'path'
import os from 'os'
import { AppConfig, DreamLogEntry, KairosTriggerRule, ModelProviderPreset } from '@shared/types'

export const MODEL_PRESETS: ModelProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 官方 (OpenAI 兼容)',
    baseUrl: 'https://api.deepseek.com/v1',
    mainModel: 'deepseek-reasoner',
    fastModel: 'deepseek-chat'
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow 硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    mainModel: 'Pro/deepseek-ai/DeepSeek-V3',
    fastModel: 'Qwen/Qwen2.5-Coder-32B-Instruct'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Claude / GPT / Gemini)',
    baseUrl: 'https://openrouter.ai/api/v1',
    mainModel: 'anthropic/claude-3.7-sonnet',
    fastModel: 'openai/gpt-4o-mini'
  },
  {
    id: 'openai',
    name: 'OpenAI / 通用中转 API',
    baseUrl: 'https://api.openai.com/v1',
    mainModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini'
  },
  {
    id: 'ollama',
    name: '本地 Ollama (无需 Key)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    mainModel: 'qwen2.5-coder:14b',
    fastModel: 'qwen2.5-coder:7b'
  }
]

export class ConfigStore {
  private configPath: string
  private config: AppConfig
  private dreamLogs: DreamLogEntry[] = []
  private kairosRules: KairosTriggerRule[] = []

  constructor(defaultWorkspace: string) {
    const appDir = path.join(os.homedir(), '.claude-code-desktop')
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true })
    }
    this.configPath = path.join(appDir, 'config.json')

    const defaultConfig: AppConfig = {
      workspaceDir: defaultWorkspace,
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
      mainModel: 'deepseek-chat',
      fastModel: 'deepseek-chat',
      maxContextTokens: 64000,
      autoCompactThreshold: 0.78,
      autoApproveReadOnly: true,
      autoApproveWriteInSession: false,
      enableWorktreeIsolation: true,
      enableDreamOnIdle: true,
      idleDreamMinutes: 15
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
        if (Array.isArray(raw.dreamLogs)) this.dreamLogs = raw.dreamLogs
        if (Array.isArray(raw.kairosRules)) this.kairosRules = raw.kairosRules
      } catch {
        this.config = defaultConfig
      }
    } else {
      this.config = defaultConfig
      this.save()
    }
  }

  getConfig(): AppConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...partial }
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
