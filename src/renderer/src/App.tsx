import React, { useEffect } from 'react'
import { TerminalSquare, Network, Moon, Bell, X } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { TopStatusBar } from './components/TopStatusBar'
import { WorkbenchView } from './components/WorkbenchView'
import { CoordinatorView } from './components/CoordinatorView'
import { KairosView } from './components/KairosView'
import { QuickLauncher } from './components/QuickLauncher'
import { SettingsModal } from './components/SettingsModal'

export const App: React.FC = () => {
  const {
    activeMode,
    setActiveMode,
    initialize,
    swarmState,
    dreamLogs,
    toastNotification,
    clearToast
  } = useAppStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  const runningSwarmTasks =
    swarmState?.tasks.filter((t) => t.status === 'running').length || 0

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0d0f12] text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <TopStatusBar />

      {/* Main Content with Left Mode Switcher Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Rail (A + B + C Mode Switcher) */}
        <aside className="w-56 bg-[#14171c] border-r border-[#282e39] p-3 flex flex-col justify-between select-none">
          <div className="space-y-1.5">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">
              三合一核心工作模式
            </div>

            <button
              onClick={() => setActiveMode('workbench')}
              className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-xs font-medium transition ${
                activeMode === 'workbench'
                  ? 'bg-[#d97757] text-white shadow'
                  : 'text-slate-400 hover:bg-[#1b1f27] hover:text-slate-200'
              }`}
            >
              <TerminalSquare className="w-4 h-4 shrink-0" />
              <div className="text-left">
                <div>方向 A：编程工作台</div>
                <div className="text-[10px] opacity-75">QueryEngine + Diff 审批</div>
              </div>
            </button>

            <button
              onClick={() => setActiveMode('coordinator')}
              className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition ${
                activeMode === 'coordinator'
                  ? 'bg-[#d97757] text-white shadow'
                  : 'text-slate-400 hover:bg-[#1b1f27] hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Network className="w-4 h-4 shrink-0" />
                <div className="text-left">
                  <div>方向 B：指挥官看板</div>
                  <div className="text-[10px] opacity-75">DAG 编排 + Git Worktree</div>
                </div>
              </div>
              {runningSwarmTasks > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400 text-black font-bold animate-pulse">
                  {runningSwarmTasks}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveMode('kairos')}
              className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition ${
                activeMode === 'kairos'
                  ? 'bg-[#d97757] text-white shadow'
                  : 'text-slate-400 hover:bg-[#1b1f27] hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Moon className="w-4 h-4 shrink-0" />
                <div className="text-left">
                  <div>方向 C：KAIROS 中心</div>
                  <div className="text-[10px] opacity-75">Dream 记忆 + 守护巡检</div>
                </div>
              </div>
              {dreamLogs.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-500/30 text-indigo-200 font-mono">
                  {dreamLogs.length}
                </span>
              )}
            </button>
          </div>

          {/* Architecture Telemetry Footer */}
          <div className="p-3 rounded-xl bg-[#0d0f12] border border-[#282e39] space-y-1.5 text-[11px] text-slate-400">
            <div className="font-semibold text-slate-200 flex items-center justify-between">
              <span>架构内核状态</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div>• 工具集: 6 核心沙箱工具</div>
            <div>• 压缩层: Micro + Auto + Dream</div>
            <div>• 托盘守护: 已挂载 Mac 菜单栏</div>
          </div>
        </aside>

        {/* Active Mode Viewport */}
        {activeMode === 'workbench' && <WorkbenchView />}
        {activeMode === 'coordinator' && <CoordinatorView />}
        {activeMode === 'kairos' && <KairosView />}
      </div>

      {/* Toast Notification for KAIROS / Dream Events */}
      {toastNotification && (
        <div className="fixed bottom-5 right-5 z-40 max-w-md rounded-xl bg-[#14171c] border border-indigo-500/50 p-4 shadow-2xl flex items-start gap-3">
          <Bell className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-slate-100 mb-0.5">
              {toastNotification.title}
            </div>
            <div className="text-slate-300 leading-relaxed">{toastNotification.body}</div>
          </div>
          <button
            onClick={clearToast}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overlays */}
      <QuickLauncher />
      <SettingsModal />
    </div>
  )
}

export default App
