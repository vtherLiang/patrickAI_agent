import React, { useState, useEffect, useRef } from 'react'
import { Search, ArrowUp, GitBranch, Sparkles } from 'lucide-react'
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
      setTimeout(() => inputRef.current?.focus(), 40)
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
    <div
      onClick={() => setQuickLauncherOpen(false)}
      className="animate-apple-backdrop fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-start justify-center pt-28 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-apple-modal w-full max-w-xl rounded-[24px] apple-glass-Heavy overflow-hidden"
      >
        <div className="px-5 py-4 flex items-center gap-3.5">
          <Search className="w-5 h-5 text-[#86868b] shrink-0" />
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
            placeholder="快速指派任务或搜索指令..."
            className="flex-1 bg-transparent text-[16px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none tracking-tight"
          />
          {query.trim() && (
            <button
              onClick={handleDispatchWorkbench}
              className="apple-press w-7 h-7 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center shrink-0"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>

        <div className="px-5 py-2.5 bg-[#F5F5F7]/80 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-[#6e6e73]">
          <div className="flex items-center gap-3">
            <button
              onClick={handleDispatchSwarm}
              disabled={!query.trim()}
              className="apple-press disabled:opacity-40 hover:text-[#1d1d1f] flex items-center gap-1 transition-colors"
            >
              <GitBranch className="w-3 h-3 text-[#28CD41]" />
              <span>集群并行</span>
              <kbd className="font-mono text-[#86868b] ml-0.5">⌘↵</kbd>
            </button>

            <span className="text-black/15">|</span>

            <button
              onClick={async () => {
                setQuickLauncherOpen(false)
                setActiveMode('kairos')
                await triggerDream()
              }}
              className="apple-press hover:text-[#1d1d1f] flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-[#5856D6]" />
              <span>立即提炼记忆</span>
            </button>
          </div>

          <span className="font-mono text-[10px] text-[#86868b]">ESC 关闭</span>
        </div>
      </div>
    </div>
  )
}
