import React from 'react'
import {
  FolderOpen,
  Settings,
  Sparkles,
  Layers,
  Command,
  Cpu,
  ShieldCheck
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const TopStatusBar: React.FC = () => {
  const {
    config,
    tokenStats,
    selectWorkspace,
    triggerCompact,
    setSettingsOpen,
    setQuickLauncherOpen
  } = useAppStore()

  const usagePct = Math.round(tokenStats.usageRatio * 100)
  const barColor =
    usagePct > 80 ? 'bg-red-500' : usagePct > 55 ? 'bg-amber-400' : 'bg-[#d97757]'

  return (
    <header className="h-12 bg-[#14171c] border-b border-[#282e39] px-4 flex items-center justify-between select-none drag-region">
      {/* Left: macOS traffic lights spacing + Workspace selector */}
      <div className="flex items-center gap-3 pl-16 no-drag">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d97757] shadow-[0_0_8px_#d97757]" />
          <span className="font-semibold text-sm tracking-tight text-slate-100">
            Claude Code Studio
          </span>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#d97757]/15 text-[#d97757] border border-[#d97757]/30">
            v2.1.88 Clean-Room
          </span>
        </div>

        <div className="h-4 w-[1px] bg-[#282e39] mx-1" />

        <button
          onClick={selectWorkspace}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1b1f27] hover:bg-[#252a35] border border-[#282e39] text-xs text-slate-300 transition"
          title="点击切换本地项目工作区目录"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#d97757]" />
          <span className="max-w-[240px] truncate font-mono">
            {config?.workspaceDir || '选择工作区'}
          </span>
        </button>
      </div>

      {/* Center: Layer 1 & Layer 2 Context Compaction Pipeline Gauge */}
      <div className="flex items-center gap-3 no-drag">
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#1b1f27] border border-[#282e39]">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-slate-400">Context 水位</span>
              <span className="font-mono text-slate-200">
                {tokenStats.currentTokens.toLocaleString()} /{' '}
                {(tokenStats.maxTokens / 1000).toFixed(0)}k ({usagePct}%)
              </span>
            </div>
            <div className="w-36 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
              <div
                className={`h-full ${barColor} transition-all duration-300`}
                style={{ width: `${Math.max(3, usagePct)}%` }}
              />
            </div>
          </div>

          <div className="text-[10px] text-slate-400 border-l border-[#282e39] pl-2.5 leading-tight">
            <div>Micro 折叠: {tokenStats.microCompactedCount} 次</div>
            <div className="text-emerald-400">
              已省: ~{tokenStats.totalSavedTokens.toLocaleString()} tok
            </div>
          </div>

          <button
            onClick={triggerCompact}
            className="px-2 py-1 rounded bg-[#252a35] hover:bg-[#d97757] hover:text-white text-[11px] text-slate-300 transition flex items-center gap-1"
            title="立即执行 MicroCompact + AutoCompact 上下文浓缩"
          >
            <Sparkles className="w-3 h-3" />
            <span>Compact</span>
          </button>
        </div>
      </div>

      {/* Right: Active OpenAI Model & Quick Actions */}
      <div className="flex items-center gap-2 no-drag">
        <button
          onClick={() => setQuickLauncherOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1b1f27] hover:bg-[#252a35] border border-[#282e39] text-xs text-slate-300 transition"
          title="呼出快捷指令条 (快捷键 Option + Space)"
        >
          <Command className="w-3.5 h-3.5 text-slate-400" />
          <span>快捷唤起</span>
          <kbd className="text-[10px] px-1 bg-slate-800 rounded text-slate-400">⌥Space</kbd>
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#1b1f27] hover:bg-[#252a35] border border-[#282e39] text-xs transition"
        >
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-slate-200 max-w-[140px] truncate">
            {config?.mainModel || 'deepseek-chat'}
          </span>
          {config?.apiKey ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title="API Key 已配置" />
          ) : (
            <span
              className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
              title="点击配置 OpenAI 兼容 API Key"
            >
              演示模式
            </span>
          )}
          <Settings className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    </header>
  )
}
