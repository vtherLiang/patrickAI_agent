import React, { useState, useRef, useEffect } from 'react'
import {
  Folder,
  ChevronDown,
  Sparkles,
  RotateCcw,
  PanelRight,
  PanelLeft,
  SlidersHorizontal,
  MessageSquare,
  Zap,
  Globe
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AppMode } from '@shared/types'
import { ModelSwitcherPopover } from './ModelSwitcherPopover'

const MODES: { id: AppMode; label: string }[] = [
  { id: 'workbench', label: '工作台' },
  { id: 'coordinator', label: '多智能体' },
  { id: 'kairos', label: '记忆守护' },
  { id: 'doc-editor', label: '文本排版' }
]

export const TopStatusBar: React.FC = () => {
  const {
    activeMode,
    setActiveMode,
    workbenchSubView,
    config,
    tokenStats,
    swarmState,
    terminalLogs,
    messages,
    isInspectorOpen,
    toggleInspector,
    isSideChatOpen,
    toggleSideChat,
    sideChatMessages,
    isLeftSidebarOpen,
    toggleLeftSidebar,
    selectWorkspace,
    triggerCompact,
    clearSession,
    setSettingsOpen,
    isModelSwitcherOpen,
    setModelSwitcherOpen
  } = useAppStore()

  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const modelSwitcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setContextMenuOpen(false)
      }
      if (modelSwitcherRef.current && !modelSwitcherRef.current.contains(e.target as Node)) {
        setModelSwitcherOpen(false)
      }
    }
    if (contextMenuOpen || isModelSwitcherOpen) {
      window.addEventListener('mousedown', handleClickOutside)
    }
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenuOpen, isModelSwitcherOpen, setModelSwitcherOpen])

  const activeIndex = Math.max(
    0,
    MODES.findIndex((m) => m.id === activeMode)
  )

  const workspaceName = config?.workspaceDir
    ? config.workspaceDir.split('/').filter(Boolean).pop() || config.workspaceDir
    : '选择项目'

  const usagePct = Math.round(tokenStats.usageRatio * 100)
  const ringRadius = 6
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - Math.min(1, Math.max(0.05, tokenStats.usageRatio)))
  const ringStroke =
    usagePct > 80 ? '#FF3B30' : usagePct > 55 ? '#FF9500' : '#34C759'

  const runningSwarmCount =
    swarmState?.tasks.filter((t) => t.status === 'running').length || 0

  return (
    <header className="h-[52px] px-4 flex items-center justify-between select-none drag-region relative z-30 border-b border-black/[0.07] bg-white/85 backdrop-blur-2xl">
      {/* Left: macOS Traffic Lights Clearance + Codex Sidebar Toggle + Minimal Workspace Pill */}
      <div className="flex items-center gap-2 pl-[72px] no-drag min-w-[230px]">
        {activeMode === 'workbench' && (
          <button
            onClick={toggleLeftSidebar}
            title={isLeftSidebarOpen ? '收起任务侧边栏' : '展开 Codex 任务侧边栏'}
            className={`apple-press p-1.5 rounded-full border transition-colors ${
              isLeftSidebarOpen
                ? 'bg-black/[0.07] border-black/[0.08] text-[#1d1d1f]'
                : 'bg-black/[0.03] hover:bg-black/[0.06] border-black/[0.06] text-[#6e6e73]'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={selectWorkspace}
          title={`切换工作区目录\n当前路径: ${config?.workspaceDir || ''}`}
          className="apple-press group flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/[0.035] hover:bg-black/[0.065] border border-black/[0.06] text-[12px] font-medium text-[#1d1d1f]"
        >
          <Folder className="w-3.5 h-3.5 text-[#0071e3] transition-transform duration-300 group-hover:scale-105" />
          <span className="max-w-[140px] truncate">{workspaceName}</span>
          <ChevronDown className="w-3 h-3 text-[#86868b]" />
        </button>
      </div>

      {/* Center: Apple Spring-Animated Sliding Segmented Control */}
      <nav
        aria-label="主模式切换"
        className="no-drag relative flex items-center p-1 rounded-full bg-[#F2F2F7] border border-black/[0.06]"
      >
        <div
          className="apple-pill-slider absolute top-1 bottom-1 left-1 w-[92px] rounded-full bg-white shadow-[0_1px_5px_rgba(0,0,0,0.10),0_0_1px_rgba(0,0,0,0.06)] pointer-events-none"
          style={{
            transform: `translate3d(${activeIndex * 92}px, 0, 0)`
          }}
        />

        {MODES.map((mode) => {
          const isActive = activeMode === mode.id
          return (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={`relative z-10 w-[92px] py-1 text-[12px] font-medium rounded-full transition-colors duration-200 flex items-center justify-center gap-1.5 ${
                isActive ? 'text-[#1d1d1f]' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <span>{mode.label}</span>
              {mode.id === 'coordinator' && runningSwarmCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Right: Preserved Capsule Trio ([ (ring) 0% ]  [ (dot) model (sliders) ]  [ (inspector) ]) */}
      <div className="flex items-center justify-end gap-2 no-drag min-w-[230px]">
        {/* 1. Context Activity Ring Capsule */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setContextMenuOpen((v) => !v)}
            title="上下文容量与会话管理"
            className="apple-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.07] text-[11px] font-medium text-[#1d1d1f]"
          >
            <svg className="w-3.5 h-3.5 -rotate-90" viewBox="0 0 16 16">
              <circle
                cx="8"
                cy="8"
                r={ringRadius}
                fill="none"
                stroke="rgba(0,0,0,0.10)"
                strokeWidth="2"
              />
              <circle
                cx="8"
                cy="8"
                r={ringRadius}
                fill="none"
                stroke={ringStroke}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-all duration-500"
              />
            </svg>
            <span className="font-mono text-[11px]">{usagePct}%</span>
          </button>

          {contextMenuOpen && (
            <div className="animate-apple-modal absolute right-0 mt-2.5 w-72 rounded-2xl apple-glass-Heavy p-4 z-50 origin-top-right">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-[#1d1d1f]">上下文记忆容量</span>
                <span className="text-[11px] font-mono text-[#6e6e73]">
                  {tokenStats.currentTokens.toLocaleString()} /{' '}
                  {tokenStats.maxTokens >= 1000000
                    ? `${(tokenStats.maxTokens / 1000000).toFixed(tokenStats.maxTokens % 1000000 === 0 ? 0 : 1)}M`
                    : `${(tokenStats.maxTokens / 1000).toFixed(0)}K`}
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-black/[0.07] overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(3, usagePct)}%`,
                    backgroundColor: ringStroke
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#6e6e73] pb-3 mb-3 border-b border-black/[0.07]">
                <span>已自动折叠 {tokenStats.microCompactedCount} 次</span>
                <span className="text-[#177233] font-medium">
                  省 ~{tokenStats.totalSavedTokens.toLocaleString()} tok
                </span>
              </div>

              <div className="space-y-1.5">
                <button
                  onClick={async () => {
                    setContextMenuOpen(false)
                    await triggerCompact()
                  }}
                  className="apple-press w-full px-3 py-2 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] text-[12px] font-medium text-[#1d1d1f] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#D97757]" />
                    立即浓缩上下文
                  </span>
                  <span className="text-[10px] text-[#86868b] font-mono">Compact</span>
                </button>

                {messages.length > 0 && (
                  <button
                    onClick={async () => {
                      setContextMenuOpen(false)
                      await clearSession()
                    }}
                    className="apple-press w-full px-3 py-2 rounded-xl hover:bg-[#FF3B30]/10 text-[12px] font-medium text-[#FF3B30] flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>新建空白线程</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Model & Provider Switcher Capsule (CC-Switch Style) */}
        <div className="relative" ref={modelSwitcherRef}>
          <button
            onClick={() => setModelSwitcherOpen(!isModelSwitcherOpen)}
            title="切换 AI 供应商与模型 (CC-Switch)"
            className={`apple-press relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] transition-colors ${
              isModelSwitcherOpen
                ? 'bg-[#E5E5EA] border-black/[0.15] text-[#1d1d1f]'
                : 'bg-[#F5F5F7] hover:bg-[#EBEBF0] border-black/[0.07] text-[#1d1d1f]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                config?.apiKey ? 'bg-[#34C759]' : 'bg-[#FF9500]'
              }`}
            />
            {config?.proxyMode === 'direct' && (
              <span className="text-[10px] text-[#28a745] font-bold" title="国内直连 (免VPN拦截)">
                ⚡
              </span>
            )}
            {config?.proxyMode === 'proxy' && (
              <span className="text-[10px] text-[#0071e3] font-bold" title="走代理 / VPN">
                🌐
              </span>
            )}
            <span className="max-w-[130px] truncate font-medium">
              {config?.mainModel || 'deepseek-chat'}
            </span>
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#6e6e73] shrink-0" />
          </button>

          {/* CC-Switch Instant Dropdown Anchored Directly Below Button */}
          <ModelSwitcherPopover />
        </div>

        {/* 3. Codex Ephemeral Side Chat Toggle */}
        {activeMode === 'workbench' && workbenchSubView === 'chat' && (
          <button
            onClick={toggleSideChat}
            title={
              isSideChatOpen
                ? '收起侧边临时对话'
                : '打开侧边临时对话'
            }
            className={`apple-press relative p-1.5 rounded-full border transition-colors ${
              isSideChatOpen
                ? 'bg-[#5856D6] border-[#5856D6] text-white shadow-sm'
                : 'bg-[#F5F5F7] hover:bg-[#EBEBF0] border-black/[0.07] text-[#3a3a3c]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {sideChatMessages.length > 0 && !isSideChatOpen && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#5856D6]" />
            )}
          </button>
        )}

        {/* 4. Right Inspector Drawer Toggle Circle */}
        {activeMode === 'workbench' && (
          <button
            onClick={toggleInspector}
            title={isInspectorOpen ? '收起侧边检视器' : '展开终端与文件检视器'}
            className={`apple-press relative p-1.5 rounded-full border transition-colors ${
              isInspectorOpen
                ? 'bg-[#1d1d1f] border-[#1d1d1f] text-white'
                : 'bg-[#F5F5F7] hover:bg-[#EBEBF0] border-black/[0.07] text-[#3a3a3c]'
            }`}
          >
            <PanelRight className="w-4 h-4" />
            {!isInspectorOpen && terminalLogs.length > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#0071e3]" />
            )}
          </button>
        )}
      </div>
    </header>
  )
}
