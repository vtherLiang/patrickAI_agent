import React, { useState, useEffect } from 'react'
import { X, Check, Cpu, Key, Globe, Sliders } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, config, presets, updateConfig } = useAppStore()

  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [mainModel, setMainModel] = useState('')
  const [fastModel, setFastModel] = useState('')
  const [maxContextTokens, setMaxContextTokens] = useState(64000)
  const [autoApproveWriteInSession, setAutoApproveWriteInSession] = useState(false)

  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl)
      setApiKey(config.apiKey)
      setMainModel(config.mainModel)
      setFastModel(config.fastModel)
      setMaxContextTokens(config.maxContextTokens)
      setAutoApproveWriteInSession(config.autoApproveWriteInSession)
    }
  }, [config, isSettingsOpen])

  if (!isSettingsOpen || !config) return null

  const applyPreset = (presetId: string): void => {
    const found = presets.find((p) => p.id === presetId)
    if (!found) return
    setBaseUrl(found.baseUrl)
    setMainModel(found.mainModel)
    setFastModel(found.fastModel)
  }

  const handleSave = async (): Promise<void> => {
    await updateConfig({
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      mainModel: mainModel.trim(),
      fastModel: fastModel.trim(),
      maxContextTokens: Number(maxContextTokens) || 64000,
      autoApproveWriteInSession
    })
    setSettingsOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl bg-[#14171c] border border-[#282e39] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#282e39] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#d97757]" />
            <h2 className="text-base font-semibold text-slate-100">
              OpenAI 兼容模型接口与安全沙箱设置
            </h2>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded-lg hover:bg-[#252a35] text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              一键填入常用服务商预设 (100% OpenAI 兼容格式)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-3 py-2 rounded-xl border text-left text-xs transition ${
                    baseUrl === p.baseUrl
                      ? 'bg-[#d97757]/15 border-[#d97757] text-amber-200'
                      : 'bg-[#0d0f12] border-[#282e39] text-slate-300 hover:bg-[#1b1f27]'
                  }`}
                >
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">{p.mainModel}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>API Base URL</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com/v1"
              className="w-full rounded-xl bg-[#0d0f12] border border-[#282e39] focus:border-[#d97757] focus:outline-none px-3.5 py-2 text-xs font-mono text-slate-100"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <span>API Key (保存在本地 ~/.claude-code-desktop/config.json)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl bg-[#0d0f12] border border-[#282e39] focus:border-[#d97757] focus:outline-none px-3.5 py-2 text-xs font-mono text-slate-100"
            />
          </div>

          {/* Main Model & Fast Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                主推理模型 (QueryEngine 主循环)
              </label>
              <input
                type="text"
                value={mainModel}
                onChange={(e) => setMainModel(e.target.value)}
                placeholder="deepseek-chat"
                className="w-full rounded-xl bg-[#0d0f12] border border-[#282e39] px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                轻量/快速模型 (Sub-Agent / Compact / Dream)
              </label>
              <input
                type="text"
                value={fastModel}
                onChange={(e) => setFastModel(e.target.value)}
                placeholder="deepseek-chat"
                className="w-full rounded-xl bg-[#0d0f12] border border-[#282e39] px-3 py-2 text-xs font-mono text-slate-100"
              />
            </div>
          </div>

          {/* Context & Permission Options */}
          <div className="pt-2 border-t border-[#282e39] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>上下文窗口最大 Token 上限 (触发 AutoCompact 水位基准)</span>
              </span>
              <input
                type="number"
                value={maxContextTokens}
                onChange={(e) => setMaxContextTokens(Number(e.target.value))}
                className="w-28 rounded-lg bg-[#0d0f12] border border-[#282e39] px-2.5 py-1 text-xs font-mono text-slate-100 text-right"
              />
            </div>

            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>自动批准文件写入与 Bash 命令（跳过可视化 Diff 手动确认）</span>
              <input
                type="checkbox"
                checked={autoApproveWriteInSession}
                onChange={(e) => setAutoApproveWriteInSession(e.target.checked)}
                className="accent-[#d97757] w-4 h-4"
              />
            </label>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-[#0d0f12] border-t border-[#282e39] flex justify-end gap-2.5">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 rounded-xl bg-[#1b1f27] hover:bg-[#252a35] text-xs text-slate-300"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-[#d97757] hover:bg-[#e58869] text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>保存并生效</span>
          </button>
        </div>
      </div>
    </div>
  )
}
