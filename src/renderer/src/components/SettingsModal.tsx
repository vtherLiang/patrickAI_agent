import React, { useState, useEffect } from 'react'
import {
  X,
  Plus,
  Trash2,
  Check,
  Zap,
  Globe,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  Clipboard,
  Shield,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AIProviderConfig, ProxyMode } from '@shared/types'

const TEMPLATES: Array<{
  name: string
  type: AIProviderConfig['type']
  baseUrl: string
  mainModel: string
  fastModel: string
  availableModels: string[]
  proxyMode: ProxyMode
  defaultContextTokens: number
  desc: string
}> = [
  {
    name: '通用中转站 (OneAPI / NewAPI)',
    type: 'relay',
    baseUrl: 'https://api.openai-proxy.org/v1',
    mainModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gemini-2.5-pro', 'deepseek-reasoner', 'claude-3-7-sonnet', 'o3-mini'],
    proxyMode: 'system',
    defaultContextTokens: 200000,
    desc: '推荐各类第三方中转站 (如 micuapi 等)，跟随系统网络'
  },
  {
    name: 'DeepSeek 官方',
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    mainModel: 'deepseek-reasoner',
    fastModel: 'deepseek-chat',
    availableModels: ['deepseek-reasoner', 'deepseek-chat'],
    proxyMode: 'direct',
    defaultContextTokens: 128000,
    desc: '国内直连 (开启VPN时不走代理，防403地区拦截)'
  },
  {
    name: 'OpenAI 官方',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    mainModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1', 'gpt-4-turbo'],
    proxyMode: 'proxy',
    defaultContextTokens: 200000,
    desc: '走代理 / VPN (自动适配 7890/1087 本地代理端口)'
  },
  {
    name: 'Google Gemini 官方',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    mainModel: 'gemini-2.5-pro',
    fastModel: 'gemini-2.5-flash',
    availableModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    proxyMode: 'proxy',
    defaultContextTokens: 1000000,
    desc: '官方OpenAI兼容端点 · 走代理 / VPN'
  },
  {
    name: 'SiliconFlow 硅基流动',
    type: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    mainModel: 'Pro/deepseek-ai/DeepSeek-V3',
    fastModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    availableModels: ['Pro/deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-Coder-32B-Instruct'],
    proxyMode: 'direct',
    defaultContextTokens: 128000,
    desc: '国内优质大模型推理加速平台 · 直连'
  },
  {
    name: 'OpenRouter 聚合平台',
    type: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    mainModel: 'anthropic/claude-3.7-sonnet',
    fastModel: 'openai/gpt-4o-mini',
    availableModels: ['anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro', 'openai/gpt-4o', 'deepseek/deepseek-r1'],
    proxyMode: 'proxy',
    defaultContextTokens: 200000,
    desc: '全球模型聚合路由 · 走代理 / VPN'
  },
  {
    name: '本地 Ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    mainModel: 'qwen2.5-coder:14b',
    fastModel: 'qwen2.5-coder:7b',
    availableModels: ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'deepseek-r1:14b'],
    proxyMode: 'direct',
    defaultContextTokens: 128000,
    desc: '本地离线运行 · 无需API Key'
  }
]

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    config,
    updateConfig,
    switchProvider,
    upsertProvider,
    deleteProvider,
    testProviderConnection
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<'providers' | 'general'>('providers')
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<{ ok?: boolean; latency?: number; error?: string } | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  // Current editing provider state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<AIProviderConfig['type']>('custom')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formMainModel, setFormMainModel] = useState('')
  const [formFastModel, setFormFastModel] = useState('')
  const [formModels, setFormModels] = useState<string[]>([])
  const [formProxyMode, setFormProxyMode] = useState<ProxyMode>('system')
  const [formCustomProxy, setFormCustomProxy] = useState('')
  const [formContextTokens, setFormContextTokens] = useState(200000)
  const [newModelInput, setNewModelInput] = useState('')

  // General settings state
  const [autoApproveWrite, setAutoApproveWrite] = useState(false)
  const [globalProxyUrl, setGlobalProxyUrl] = useState('http://127.0.0.1:7890')

  const providers: AIProviderConfig[] = config?.providers || []
  const activeProviderId = config?.activeProviderId || providers[0]?.id

  useEffect(() => {
    if (config) {
      setAutoApproveWrite(config.autoApproveWriteInSession)
      setGlobalProxyUrl(config.globalProxyUrl || 'http://127.0.0.1:7890')
      if (!selectedProviderId && providers.length > 0) {
        loadProviderIntoForm(providers.find((p) => p.id === activeProviderId) || providers[0])
      }
    }
  }, [config, isSettingsOpen])

  const loadProviderIntoForm = (p: AIProviderConfig) => {
    setSelectedProviderId(p.id)
    setFormName(p.name)
    setFormType(p.type)
    setFormBaseUrl(p.baseUrl)
    setFormApiKey(p.apiKey || '')
    setFormMainModel(p.mainModel)
    setFormFastModel(p.fastModel || p.mainModel)
    setFormModels(p.availableModels || [p.mainModel])
    setFormProxyMode(p.proxyMode || 'system')
    setFormCustomProxy(p.customProxyUrl || '')
    setFormContextTokens(p.defaultContextTokens || 200000)
    setTestStatus(null)
  }

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setFormName(tpl.name)
    setFormType(tpl.type)
    setFormBaseUrl(tpl.baseUrl)
    setFormMainModel(tpl.mainModel)
    setFormFastModel(tpl.fastModel)
    setFormModels(tpl.availableModels)
    setFormProxyMode(tpl.proxyMode)
    setFormContextTokens(tpl.defaultContextTokens)
    setTestStatus(null)
  }

  const handleAddNewProvider = () => {
    const newId = `provider_custom_${Date.now()}`
    const newProvider: AIProviderConfig = {
      id: newId,
      name: '我的中转站 (OneAPI / NewAPI)',
      type: 'relay',
      baseUrl: 'https://api.openai-proxy.org/v1',
      apiKey: '',
      mainModel: 'gpt-4o',
      fastModel: 'gpt-4o-mini',
      availableModels: ['gpt-4o', 'gpt-4o-mini', 'gemini-2.5-pro', 'deepseek-reasoner'],
      defaultContextTokens: 200000,
      proxyMode: 'system'
    }
    loadProviderIntoForm(newProvider)
  }

  const handlePasteApiKey = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setFormApiKey(text.trim())
        setCopiedKey(true)
        setTimeout(() => setCopiedKey(false), 2000)
      }
    } catch {
      // ignore
    }
  }

  const handleAutoAppendV1 = () => {
    let clean = formBaseUrl.trim().replace(/\/+$/, '')
    if (!clean.endsWith('/v1')) {
      clean += '/v1'
      setFormBaseUrl(clean)
    }
  }

  const handleSaveCurrentProvider = async () => {
    if (!formName.trim() || !formBaseUrl.trim()) return

    const providerObj: AIProviderConfig = {
      id: selectedProviderId || `provider_${Date.now()}`,
      name: formName.trim(),
      type: formType,
      baseUrl: formBaseUrl.trim(),
      apiKey: formApiKey.trim(),
      mainModel: formMainModel.trim() || 'deepseek-chat',
      fastModel: formFastModel.trim() || formMainModel.trim() || 'deepseek-chat',
      availableModels: formModels.length > 0 ? formModels : [formMainModel.trim()],
      defaultContextTokens: Number(formContextTokens) || 200000,
      proxyMode: formProxyMode,
      customProxyUrl: formCustomProxy.trim() || undefined
    }

    await upsertProvider(providerObj)
    setSelectedProviderId(providerObj.id)
  }

  const handleSaveAllAndClose = async () => {
    await handleSaveCurrentProvider()
    await updateConfig({
      autoApproveWriteInSession: autoApproveWrite,
      globalProxyUrl: globalProxyUrl.trim()
    })
    setSettingsOpen(false)
  }

  const handleTestConnection = async () => {
    if (!formApiKey.trim() && formType !== 'ollama') {
      setTestStatus({
        ok: false,
        error: '⚠️ 请先在下方「API 密钥 (Token)」输入框粘贴您的 API Key / 中转令牌'
      })
      return
    }

    const currentTestProvider: AIProviderConfig = {
      id: selectedProviderId,
      name: formName,
      type: formType,
      baseUrl: formBaseUrl.trim(),
      apiKey: formApiKey.trim(),
      mainModel: formMainModel.trim(),
      fastModel: formFastModel.trim(),
      availableModels: formModels,
      defaultContextTokens: formContextTokens,
      proxyMode: formProxyMode,
      customProxyUrl: formCustomProxy.trim() || undefined
    }

    setTestingId(selectedProviderId)
    setTestStatus(null)
    try {
      const res = await testProviderConnection(currentTestProvider)
      setTestStatus({
        ok: res.ok,
        latency: res.latencyMs,
        error: res.error
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleAddModelChip = () => {
    const clean = newModelInput.trim()
    if (!clean) return
    if (!formModels.includes(clean)) {
      setFormModels([...formModels, clean])
    }
    setNewModelInput('')
  }

  const handleRemoveModelChip = (modelToRemove: string) => {
    if (formModels.length <= 1) return
    setFormModels(formModels.filter((m) => m !== modelToRemove))
    if (formMainModel === modelToRemove) {
      setFormMainModel(formModels.find((m) => m !== modelToRemove) || 'deepseek-chat')
    }
  }

  if (!isSettingsOpen) return null

  const baseUrlMissingV1 =
    formBaseUrl.trim() &&
    !formBaseUrl.includes('/v1') &&
    !formBaseUrl.includes('googleapis.com') &&
    !formBaseUrl.includes(':11434')

  return (
    <div
      onClick={() => setSettingsOpen(false)}
      className="animate-apple-backdrop fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-apple-modal w-full max-w-4xl h-[84vh] rounded-[22px] bg-white border border-black/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden text-[13px] text-[#1d1d1f]"
      >
        {/* Minimalist Top Header (Zero Clutter, No Purple Icon, Pure Clean macOS Design) */}
        <div className="h-12 px-5 border-b border-black/[0.06] flex items-center justify-between bg-[#F7F7F8] shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13.5px] text-[#1d1d1f]">
              模型与服务商设置
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex bg-[#E5E5EA] p-0.5 rounded-lg text-[12px] font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('providers')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'providers'
                    ? 'bg-white text-[#1d1d1f] shadow-xs'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                供应商管理
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`px-3 py-1 rounded-md transition-all ${
                  activeTab === 'general'
                    ? 'bg-white text-[#1d1d1f] shadow-xs'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                网络与偏好
              </button>
            </div>

            <button
              onClick={() => setSettingsOpen(false)}
              className="apple-press w-7 h-7 rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] flex items-center justify-center text-[#6e6e73] hover:text-[#1d1d1f]"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {activeTab === 'providers' ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Providers List */}
            <div className="w-[240px] border-r border-black/[0.06] bg-[#FBFBFC] flex flex-col shrink-0">
              <div className="p-3 border-b border-black/[0.05] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                  已配置渠道 ({providers.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddNewProvider}
                  className="apple-press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0071e3] text-white text-[11px] font-medium hover:bg-[#0077ED] shadow-xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>添加中转</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {providers.map((p) => {
                  const isSelected = p.id === selectedProviderId
                  const isCurrentActive = p.id === activeProviderId
                  const hasKey = Boolean(p.apiKey && p.apiKey.trim())

                  return (
                    <div
                      key={p.id}
                      onClick={() => loadProviderIntoForm(p)}
                      className={`apple-press px-3 py-2.5 rounded-xl cursor-pointer border transition-all ${
                        isSelected
                          ? 'bg-white border-black/[0.12] shadow-xs text-[#1d1d1f]'
                          : 'hover:bg-white/60 border-transparent text-[#3a3a3c]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 font-medium text-[13px] truncate">
                          <span>{p.name}</span>
                          {isCurrentActive && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#34C759]/15 text-[#28a745] font-semibold">
                              使用中
                            </span>
                          )}
                        </div>
                        {p.proxyMode === 'direct' ? (
                          <span className="text-[10px] text-[#28a745] font-medium px-1 bg-[#34C759]/10 rounded">
                            直连
                          </span>
                        ) : p.proxyMode === 'proxy' ? (
                          <span className="text-[10px] text-[#0071e3] font-medium px-1 bg-[#0071e3]/10 rounded">
                            代理
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#86868b] font-medium px-1 bg-black/[0.04] rounded">
                            系统
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#86868b] font-mono">
                        <span className="truncate max-w-[110px]">{p.mainModel}</span>
                        {hasKey ? (
                          <span className="text-[#34C759] text-[10px] flex items-center gap-0.5">
                            <Key className="w-2.5 h-2.5" /> 已配Key
                          </span>
                        ) : p.type === 'ollama' ? (
                          <span className="text-[#86868b] text-[10px]">免Key</span>
                        ) : (
                          <span className="text-amber-500 text-[10px] bg-amber-500/10 px-1 rounded font-medium">
                            待填Key
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-3 border-t border-black/[0.05] bg-[#F5F5F7] text-[11px] text-[#86868b] leading-relaxed">
                💡 <span className="font-medium text-[#1d1d1f]">分流说明</span>: 中转站选「跟随系统」；DeepSeek 选「国内直连」可解决 VPN 403 地区拦截；海外模型选「走代理」。
              </div>
            </div>

            {/* Right Column: Clean, Minimalist & Zero-Overlap Form */}
            <div className="flex-1 flex flex-col overflow-y-auto p-6 bg-white space-y-5">
              {/* 1. Quick Presets Bar */}
              <div className="shrink-0 w-full">
                <div className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-2">
                  快速套用官方 / 中转模板 (一键预填端点与常用模型)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className={`apple-press px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors ${
                        tpl.type === 'relay'
                          ? 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/20 hover:bg-[#0071e3]/15'
                          : 'bg-[#F5F5F7] hover:bg-[#EBEBF0] border-black/[0.06] text-[#1d1d1f]'
                      }`}
                      title={tpl.desc}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Unified All-in-One Settings Card (No Overlap, Completely Stable) */}
              <div className="shrink-0 w-full rounded-2xl bg-[#FBFBFC] border border-black/[0.08] divide-y divide-black/[0.06] overflow-hidden">
                {/* Row 1: Name */}
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="shrink-0 w-28">
                    <span className="text-[#1d1d1f] font-medium text-[13px]">渠道名称</span>
                    <span className="text-[10px] text-[#86868b] block">标识该渠道</span>
                  </div>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例如: 我的中转站 或 DeepSeek 官方"
                    className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-black/[0.08] text-right font-medium text-[12.5px] text-[#1d1d1f] focus:outline-none focus:border-[#0071e3] placeholder-[#aeaeb2]"
                  />
                </div>

                {/* Row 2: Base URL */}
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="shrink-0 w-28">
                    <span className="text-[#1d1d1f] font-medium text-[13px]">接口地址</span>
                    <span className="text-[10px] text-[#86868b] block">Base URL 端点</span>
                  </div>
                  <div className="flex-1 flex items-center justify-end gap-2">
                    <input
                      type="text"
                      value={formBaseUrl}
                      onChange={(e) => setFormBaseUrl(e.target.value)}
                      placeholder="例如: https://www.micuapi.ai/v1"
                      className="w-full bg-white px-3 py-1.5 rounded-lg border border-black/[0.08] font-mono text-[12px] text-[#1d1d1f] text-right focus:outline-none focus:border-[#0071e3] placeholder-[#aeaeb2]"
                    />
                    {baseUrlMissingV1 && (
                      <button
                        type="button"
                        onClick={handleAutoAppendV1}
                        className="shrink-0 px-2 py-1 rounded-md bg-[#0071e3]/10 hover:bg-[#0071e3]/20 text-[#0071e3] text-[11px] font-medium apple-press"
                        title="点击自动补齐 /v1"
                      >
                        + 补全 /v1
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 3: API Key (Super Prominent, Crystal Clear, Cannot Be Missed) */}
                <div className="px-4 py-3.5 bg-amber-500/[0.06] flex items-center justify-between gap-4 border-l-4 border-l-amber-500">
                  <div className="shrink-0 w-28">
                    <span className="text-[#1d1d1f] font-semibold text-[13px] flex items-center gap-1.5 text-amber-950">
                      <Key className="w-4 h-4 text-amber-600" />
                      <span>API 密钥</span>
                    </span>
                    <span className="text-[10px] text-amber-800/80 block">填入中转令牌(Token)</span>
                  </div>

                  <div className="flex-1 flex items-center justify-end gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      placeholder="在此粘贴中转站 API Key (如 sk-...)"
                      className="w-full bg-white px-3 py-1.5 rounded-lg border border-amber-500/40 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-mono text-[12px] text-[#1d1d1f] text-right placeholder-[#aeaeb2] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1.5 rounded-lg bg-white border border-black/[0.08] text-[#86868b] hover:text-[#1d1d1f] shrink-0"
                      title={showApiKey ? '隐藏密钥' : '显示密钥'}
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handlePasteApiKey}
                      className="apple-press px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-[11.5px] shrink-0 flex items-center gap-1"
                      title="从系统剪贴板一键粘贴"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>{copiedKey ? '已粘贴!' : '粘贴'}</span>
                    </button>
                  </div>
                </div>

                {/* Row 4: Primary Model */}
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="shrink-0 w-28">
                    <span className="text-[#1d1d1f] font-medium text-[13px]">默认主模型</span>
                    <span className="text-[10px] text-[#86868b] block">核心代码与问答</span>
                  </div>
                  <input
                    type="text"
                    value={formMainModel}
                    onChange={(e) => setFormMainModel(e.target.value)}
                    placeholder="gpt-4o 或 deepseek-reasoner 或 gpt-5.6 terra"
                    className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-black/[0.08] font-mono text-[12px] text-[#1d1d1f] text-right focus:outline-none focus:border-[#0071e3] placeholder-[#aeaeb2]"
                  />
                </div>

                {/* Row 5: Fast Model */}
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="shrink-0 w-28">
                    <span className="text-[#1d1d1f] font-medium text-[13px]">轻量辅助模型</span>
                    <span className="text-[10px] text-[#86868b] block">速查、总结、压缩</span>
                  </div>
                  <input
                    type="text"
                    value={formFastModel}
                    onChange={(e) => setFormFastModel(e.target.value)}
                    placeholder="gpt-4o-mini 或 deepseek-chat"
                    className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-black/[0.08] font-mono text-[12px] text-[#1d1d1f] text-right focus:outline-none focus:border-[#0071e3] placeholder-[#aeaeb2]"
                  />
                </div>

                {/* Row 6: Models Chips Selector */}
                <div className="p-4 space-y-2 bg-white">
                  <div className="text-[11px] text-[#86868b]">
                    快捷模型列表 (可在顶部胶囊一键选择，点击切换默认模型)：
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {formModels.map((m) => (
                      <span
                        key={m}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11.5px] font-mono transition-all ${
                          formMainModel === m
                            ? 'bg-[#0071e3]/10 border-[#0071e3]/30 text-[#0071e3] font-bold'
                            : 'bg-[#F7F7F8] border-black/[0.08] text-[#1d1d1f]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setFormMainModel(m)}
                          className="hover:underline"
                          title="设为默认主模型"
                        >
                          {m} {formMainModel === m && '★'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveModelChip(m)}
                          className="text-[#86868b] hover:text-[#FF3B30] p-0.5"
                          title="移除"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newModelInput}
                        onChange={(e) => setNewModelInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddModelChip()
                          }
                        }}
                        placeholder="+ 新增模型名 (回车添加)"
                        className="px-2.5 py-1 rounded-lg bg-[#F7F7F8] border border-black/[0.08] text-[11px] font-mono text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:border-[#0071e3] w-44"
                      />
                      <button
                        type="button"
                        onClick={handleAddModelChip}
                        className="apple-press px-2 py-1 rounded-lg bg-[#E5E5EA] text-[11px] text-[#1d1d1f] hover:bg-[#D1D1D6]"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Network Proxy Strategy: The Core VPN Feature */}
              <div className="shrink-0 w-full space-y-2">
                <div className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                  网络与代理分流 (解决开启 VPN 时 DeepSeek 与海外模型共存)
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {/* Direct */}
                  <div
                    onClick={() => setFormProxyMode('direct')}
                    className={`apple-press p-3.5 rounded-2xl cursor-pointer border flex flex-col justify-between transition-all ${
                      formProxyMode === 'direct'
                        ? 'bg-[#34C759]/8 border-[#34C759] shadow-xs'
                        : 'bg-[#FBFBFC] hover:bg-[#F5F5F7] border-black/[0.06]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[13px] text-[#28a745] flex items-center gap-1">
                          ⚡ 国内直连
                        </span>
                        {formProxyMode === 'direct' && <Check className="w-4 h-4 text-[#28a745]" />}
                      </div>
                      <div className="text-[11px] text-[#6e6e73] leading-relaxed">
                        强制绕过所有代理与VPN，直连国内服务器。
                      </div>
                    </div>
                    <div className="mt-2 text-[10.5px] text-[#28a745] font-medium bg-[#34C759]/15 px-1.5 py-0.5 rounded w-fit">
                      推荐 DeepSeek / 硅基流动
                    </div>
                  </div>

                  {/* Proxy */}
                  <div
                    onClick={() => setFormProxyMode('proxy')}
                    className={`apple-press p-3.5 rounded-2xl cursor-pointer border flex flex-col justify-between transition-all ${
                      formProxyMode === 'proxy'
                        ? 'bg-[#0071e3]/8 border-[#0071e3] shadow-xs'
                        : 'bg-[#FBFBFC] hover:bg-[#F5F5F7] border-black/[0.06]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[13px] text-[#0071e3] flex items-center gap-1">
                          🌐 走代理 / VPN
                        </span>
                        {formProxyMode === 'proxy' && <Check className="w-4 h-4 text-[#0071e3]" />}
                      </div>
                      <div className="text-[11px] text-[#6e6e73] leading-relaxed">
                        通过本机代理 (7890/1087) 或系统 VPN 转发请求。
                      </div>
                    </div>
                    <div className="mt-2 text-[10.5px] text-[#0071e3] font-medium bg-[#0071e3]/15 px-1.5 py-0.5 rounded w-fit">
                      推荐 OpenAI / Gemini
                    </div>
                  </div>

                  {/* System */}
                  <div
                    onClick={() => setFormProxyMode('system')}
                    className={`apple-press p-3.5 rounded-2xl cursor-pointer border flex flex-col justify-between transition-all ${
                      formProxyMode === 'system'
                        ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-xs'
                        : 'bg-[#FBFBFC] hover:bg-[#F5F5F7] border-black/[0.06] text-[#1d1d1f]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[13px] flex items-center gap-1">
                          ⚙️ 跟随系统
                        </span>
                        {formProxyMode === 'system' && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <div className={`text-[11px] leading-relaxed ${formProxyMode === 'system' ? 'text-white/80' : 'text-[#6e6e73]'}`}>
                        遵循系统默认环境变量与客户端原生路由。
                      </div>
                    </div>
                    <div className={`mt-2 text-[10.5px] font-medium px-1.5 py-0.5 rounded w-fit ${
                      formProxyMode === 'system'
                        ? 'bg-white/20 text-white'
                        : 'bg-black/[0.06] text-[#86868b]'
                    }`}>
                      推荐 通用中转站
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Bottom Actions: Ping test & Save */}
              <div className="shrink-0 w-full p-3.5 rounded-xl bg-[#FBFBFC] border border-black/[0.06] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingId !== null}
                    className="apple-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F5F5F7] border border-black/[0.08] text-[12px] font-semibold text-[#1d1d1f] shadow-xs"
                  >
                    {testingId ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0071e3]" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-[#FF9500]" />
                    )}
                    <span>{testingId ? '测试连通中…' : '测试连通性 (Ping)'}</span>
                  </button>

                  {testStatus?.ok && (
                    <span className="text-[12px] text-[#34C759] font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>连接成功 ({testStatus.latency}ms)</span>
                    </span>
                  )}
                  {testStatus?.error && (
                    <span className="text-[11.5px] text-[#FF3B30] truncate max-w-sm font-mono" title={testStatus.error}>
                      {testStatus.error}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {providers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteProvider(selectedProviderId)}
                      className="apple-press text-[#FF3B30] hover:bg-[#FF3B30]/10 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                    >
                      删除该渠道
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      await handleSaveCurrentProvider()
                      await switchProvider(selectedProviderId)
                    }}
                    className={`apple-press px-4 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                      selectedProviderId === activeProviderId
                        ? 'bg-[#34C759]/15 border-[#34C759]/30 text-[#28a745]'
                        : 'bg-[#0071e3] hover:bg-[#0077ED] border-[#0071e3] text-white shadow-xs'
                    }`}
                  >
                    {selectedProviderId === activeProviderId ? '当前激活中' : '设为当前激活'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* General Settings Tab */
          <div className="flex-1 p-6 space-y-5 overflow-y-auto">
            <div className="rounded-2xl bg-[#FBFBFC] border border-black/[0.06] divide-y divide-black/[0.06] overflow-hidden">
              <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[#1d1d1f] font-medium">全局代理默认地址</div>
                  <div className="text-[11px] text-[#86868b]">
                    当服务商选择「走代理」且未单独指定端口时使用的本地代理
                  </div>
                </div>
                <input
                  type="text"
                  value={globalProxyUrl}
                  onChange={(e) => setGlobalProxyUrl(e.target.value)}
                  placeholder="http://127.0.0.1:7890"
                  className="w-48 bg-white border border-black/[0.08] rounded-lg px-2.5 py-1 text-right font-mono text-[12px] text-[#1d1d1f] focus:outline-none"
                />
              </div>

              <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[#1d1d1f] font-medium">自动批准代码写入与安全沙箱执行</div>
                  <div className="text-[11px] text-[#86868b]">开启后无需每次手动点击「批准修改」即可生效</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoApproveWrite}
                  data-checked={autoApproveWrite}
                  onClick={() => setAutoApproveWrite((v) => !v)}
                  className="apple-switch"
                >
                  <span className="apple-switch-thumb" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Bottom Footer */}
        <div className="h-12 px-5 bg-[#F7F7F8] border-t border-black/[0.06] flex items-center justify-between shrink-0">
          <div className="text-[11.5px] text-[#86868b]">
            当前生效: <span className="font-semibold text-[#1d1d1f]">{config?.mainModel || 'deepseek-chat'}</span>
            {' · '}
            {config?.proxyMode === 'direct' ? (
              <span className="text-[#28a745] font-medium">国内直连</span>
            ) : config?.proxyMode === 'proxy' ? (
              <span className="text-[#0071e3] font-medium">走代理/VPN</span>
            ) : (
              <span className="text-[#1d1d1f] font-medium">跟随系统网络</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(false)}
              className="apple-press px-3.5 py-1.5 rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] text-[12px] font-medium text-[#1d1d1f]"
            >
              取消
            </button>
            <button
              onClick={handleSaveAllAndClose}
              className="apple-press px-4 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0077ED] text-[12px] font-semibold text-white shadow-xs"
            >
              保存并完成
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
