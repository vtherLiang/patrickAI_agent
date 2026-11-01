import React, { useState, useEffect, useRef } from 'react'
import { Command, Send, GitBranch, Sparkles, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const QuickLauncher: React.FC = () => {
  const {
    isQuickLauncherOpen,
    setQuickLauncherOpen,
    setActiveMode,
    sendMessage,
    startSwarm,
    triggerDream
  } = useAppStore()

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isQuickLauncherOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isQuickLauncherOpen])

  if (!isQuickLauncherOpen) return null

  const handleDispatchWorkbench = async (): Promise<void> => {
    if (!query.trim()) return
    const q = query.trim()
    setQuery('')
    setQuickLauncherOpen(false)
    setActiveMode('workbench')
    await sendMessage(q)
  }

  const handleDispatchSwarm = async (): Promise<void> => {
    if (!query.trim()) return
    const q = query.trim()
    setQuery('')
    setQuickLauncherOpen(false)
    setActiveMode('coordinator')
    await startSwarm(q, true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-28">
      <div className="w-full max-w-2xl rounded-2xl bg-[#14171c] border border-[#d97757]/50 shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-[#282e39]">
          <Command className="w-5 h-5 text-[#d97757]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey) {
                handleDispatchWorkbench()
              } else if (e.key === 'Enter' && e.metaKey) {
                handleDispatchSwarm()
              } else if (e.key === 'Escape') {
                setQuickLauncherOpen(false)
              }
            }}
            placeholder="KAIROS 快捷指令框 (⌥ + Space 随时呼出)：输入任务按 Enter 交由工作台，⌘+Enter 启动多 Agent 集群..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={() => setQuickLauncherOpen(false)}
            className="p-1 rounded-lg hover:bg-[#252a35] text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-[#0d0f12] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDispatchWorkbench}
              className="px-3 py-1.5 rounded-lg bg-[#1b1f27] hover:bg-[#d97757] hover:text-white border border-[#282e39] flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>发送至工作台 (Enter)</span>
            </button>
            <button
              onClick={handleDispatchSwarm}
              className="px-3 py-1.5 rounded-lg bg-[#1b1f27] hover:bg-amber-600 hover:text-white border border-[#282e39] flex items-center gap-1.5 transition"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>派发给 Coordinator 集群 (⌘+Enter)</span>
            </button>
            <button
              onClick={async () => {
                setQuickLauncherOpen(false)
                setActiveMode('kairos')
                await triggerDream()
              }}
              className="px-3 py-1.5 rounded-lg bg-[#1b1f27] hover:bg-indigo-600 hover:text-white border border-[#282e39] flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>立即执行 Dream 记忆提炼</span>
            </button>
          </div>
          <span className="font-mono text-[11px]">ESC 关闭</span>
        </div>
      </div>
    </div>
  )
}
