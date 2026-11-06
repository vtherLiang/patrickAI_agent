import React, { useState, useRef, useEffect } from 'react'
import {
  Check,
  ChevronRight,
  Globe,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Sparkles,
  Layers,
  Radio,
  Cpu,
  Server
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AIProviderConfig, ProxyMode } from '@shared/types'

const getProviderIcon = (type?: AIProviderConfig['type'], name?: string) => {
  const n = (name || '').toLowerCase()
  if (type === 'deepseek' || n.includes('deepseek')) {
    return <span className="text-[14px]">⚡</span>
  }
  if (type === 'openai' || n.includes('openai') || n.includes('gpt')) {
    return <span className="text-[14px]">🧠</span>
  }
  if (type === 'gemini' || n.includes('gemini') || n.includes('google')) {
    return <span className="text-[14px]">♊</span>
  }
  if (type === 'relay' || n.includes('中转') || n.includes('oneapi') || n.includes('newapi')) {
    return <span className="text-[14px]">🌐</span>
  }
  if (type === 'siliconflow' || n.includes('silicon')) {
    return <span className="text-[14px]">🚀</span>
  }
  if (type === 'openrouter') {
    return <span className="text-[14px]">🔀</span>
  }
  if (type === 'ollama') {
    return <span className="text-[14px]">💻</span>
  }
  return <Server className="w-3.5 h-3.5 text-[#5856D6]" />
}

export const ModelSwitcherPopover: React.FC = () => {
  const {
    isModelSwitcherOpen,
    setModelSwitcherOpen,
    setSettingsOpen,
    config,
    switchProvider,
    switchModel,
    testProviderConnection
  } = useAppStore()

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { latency?: number; error?: string }>>({})
  const [customModelInput, setCustomModelInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  if (!isModelSwitcherOpen) return null

  const providers: AIProviderConfig[] = config?.providers || []
  const activeProviderId = config?.activeProviderId || providers[0]?.id
  const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0]

  const handleTestLatency = async (e: React.MouseEvent, p: AIProviderConfig) => {
    e.stopPropagation()
    setTestingId(p.id)
    try {
      const res = await testProviderConnection(p)
      setTestResults((prev) => ({
        ...prev,
        [p.id]: {
          latency: res.ok ? res.latencyMs : undefined,
          error: res.ok ? undefined : res.error
        }
      }))
    } finally {
      setTestingId(null)
    }
  }

  const handleSelectModel = async (model: string) => {
    await switchModel(model)
  }

  const handleAddCustomModel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customModelInput.trim()) return
    await switchModel(customModelInput.trim())
    setCustomModelInput('')
    setShowCustomInput(false)
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="animate-apple-modal absolute right-0 top-full mt-2.5 w-[390px] max-h-[82vh] flex flex-col rounded-2xl bg-white/95 backdrop-blur-2xl border border-black/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.18),0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden text-[13px] text-[#1d1d1f] z-50 origin-top-right text-left"
    >
      {/* 1. Header with Active Provider info */}
        <div className="px-4 py-3 bg-[#F5F5F7]/80 border-b border-black/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shadow-xs border border-black/[0.04]">
              {getProviderIcon(activeProvider?.type, activeProvider?.name)}
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-[13px] leading-tight">
                <span>{activeProvider?.name || '默认供应商'}</span>
                {activeProvider?.proxyMode === 'direct' ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-[#34C759]/10 text-[#28a745] font-medium border border-[#34C759]/20" title="国内直连: 即使系统开启 VPN 也不会被 DeepSeek 403 拦截">
                    ⚡ 直连免VPN
                  </span>
                ) : activeProvider?.proxyMode === 'proxy' ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-[#0071e3]/10 text-[#0071e3] font-medium border border-[#0071e3]/20" title="走本地代理 / VPN 访问 OpenAI 与 Gemini">
                    🌐 走代理
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-black/[0.05] text-[#86868b] font-medium">
                    ⚙️ 系统
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#86868b] truncate max-w-[200px] font-mono mt-0.5">
                {activeProvider?.baseUrl?.replace(/^https?:\/\//, '') || 'api.deepseek.com'}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setModelSwitcherOpen(false)
              setSettingsOpen(true)
            }}
            title="管理所有服务商与代理"
            className="apple-press p-1.5 rounded-lg hover:bg-black/[0.05] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Current Provider's Models Selection Chips */}
        <div className="p-3 bg-white border-b border-black/[0.05]">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#86868b] mb-2 px-1">
            <span>当前可用模型</span>
            <button
              onClick={() => setShowCustomInput(!showCustomInput)}
              className="text-[#0071e3] hover:underline"
            >
              {showCustomInput ? '取消' : '+ 自定义输入'}
            </button>
          </div>

          {showCustomInput && (
            <form onSubmit={handleAddCustomModel} className="mb-2 flex gap-1.5">
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="例如: claude-3-7-sonnet 或 gemini-2.5-pro"
                autoFocus
                className="flex-1 px-2.5 py-1 text-[12px] font-mono bg-[#F5F5F7] rounded-lg border border-black/[0.08] focus:outline-none focus:border-[#0071e3]"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-[11px] font-medium bg-[#1d1d1f] text-white rounded-lg apple-press"
              >
                使用
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-0.5">
            {(activeProvider?.availableModels || [config?.mainModel || 'deepseek-chat']).map((m) => {
              const isSelected = config?.mainModel === m
              return (
                <button
                  key={m}
                  onClick={() => handleSelectModel(m)}
                  className={`apple-press px-2.5 py-1 rounded-lg text-[12px] font-mono font-medium border transition-all ${
                    isSelected
                      ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-xs'
                      : 'bg-[#F5F5F7] hover:bg-[#EBEBF0] text-[#3a3a3c] border-black/[0.04]'
                  }`}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. CC-Switch All Providers List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[11px] font-medium text-[#86868b] px-2 py-1 flex items-center justify-between">
            <span>切换服务商 (CC-Switch)</span>
            <span className="text-[10px] text-[#86868b]">自动应用专属Key与分流</span>
          </div>

          {providers.map((p) => {
            const isActive = p.id === activeProviderId
            const isTesting = testingId === p.id
            const testResult = testResults[p.id]

            return (
              <div
                key={p.id}
                onClick={async () => {
                  await switchProvider(p.id)
                }}
                className={`apple-press group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer border transition-all ${
                  isActive
                    ? 'bg-[#0071e3]/8 border-[#0071e3]/20 text-[#1d1d1f]'
                    : 'hover:bg-[#F5F5F7] border-transparent text-[#3a3a3c]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#F5F5F7] group-hover:bg-white flex items-center justify-center border border-black/[0.04] shrink-0">
                    {getProviderIcon(p.type, p.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 leading-tight">
                      <span className="font-medium text-[12.5px] truncate">{p.name}</span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#86868b] font-mono truncate mt-0.5">
                      <span>{p.mainModel}</span>
                      {!p.apiKey && p.type !== 'ollama' && (
                        <span className="text-[9.5px] text-amber-600 bg-amber-500/10 px-1 rounded font-sans font-medium">
                          待填Key
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Network Proxy Badge */}
                  {p.proxyMode === 'direct' ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#34C759]/10 text-[#28a745]">
                      直连
                    </span>
                  ) : p.proxyMode === 'proxy' ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0071e3]/10 text-[#0071e3]">
                      代理
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/[0.04] text-[#86868b]">
                      系统
                    </span>
                  )}

                  {/* Ping Latency Button */}
                  <button
                    onClick={(e) => handleTestLatency(e, p)}
                    title="测试接口连通性与延迟"
                    disabled={isTesting}
                    className="p-1 rounded hover:bg-black/[0.06] text-[#86868b] hover:text-[#1d1d1f] text-[11px] font-mono flex items-center gap-1"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-[#0071e3]" />
                    ) : testResult?.latency ? (
                      <span className="text-[#34C759] font-medium">
                        {testResult.latency}ms
                      </span>
                    ) : testResult?.error ? (
                      <span className="text-[#FF3B30] text-[10px]">失败</span>
                    ) : p.lastLatencyMs ? (
                      <span className="text-[#86868b]">{p.lastLatencyMs}ms</span>
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                  </button>

                  {isActive ? (
                    <Check className="w-4 h-4 text-[#0071e3] shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[#c7c7cc] group-hover:text-[#86868b] shrink-0" />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 4. Footer shortcuts */}
        <div className="p-2.5 bg-[#F5F5F7]/80 border-t border-black/[0.06] flex items-center justify-between text-[11px]">
          <button
            onClick={() => {
              setModelSwitcherOpen(false)
              setSettingsOpen(true)
            }}
            className="apple-press flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-black/[0.06] text-[#0071e3] font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加中转站 / 供应商</span>
          </button>

          <button
            onClick={() => {
              setModelSwitcherOpen(false)
              setSettingsOpen(true)
            }}
            className="apple-press text-[#86868b] hover:text-[#1d1d1f] px-2 py-1"
          >
            🔑 填入 API Key 与设置 ➔
          </button>
        </div>
    </div>
  )
}
