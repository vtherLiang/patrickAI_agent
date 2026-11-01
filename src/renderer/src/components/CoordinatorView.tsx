import React, { useState } from 'react'
import {
  GitBranch,
  Play,
  GitMerge,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Cpu,
  FileDiff,
  Network
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { SwarmTaskNode } from '@shared/types'

const roleColorMap: Record<SwarmTaskNode['role'], string> = {
  researcher: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  architect: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  coder: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  tester: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  reviewer: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
}

export const CoordinatorView: React.FC = () => {
  const { swarmState, startSwarm, mergeSwarmTask, cleanupWorktrees } = useAppStore()
  const [goalInput, setGoalInput] = useState(
    '为当前项目设计并实现一套可扩展的 MCP 插件加载器模块，同时补齐类型校验与单元测试'
  )
  const [useWorktree, setUseWorktree] = useState(true)
  const [statusToast, setStatusToast] = useState<string | null>(null)

  const isRunning = swarmState?.status === 'planning' || swarmState?.status === 'running'

  const handleLaunch = async (): Promise<void> => {
    if (!goalInput.trim() || isRunning) return
    setStatusToast(null)
    await startSwarm(goalInput.trim(), useWorktree)
  }

  const handleMerge = async (taskId: string): Promise<void> => {
    const msg = await mergeSwarmTask(taskId)
    setStatusToast(msg)
  }

  const handleCleanup = async (): Promise<void> => {
    const msg = await cleanupWorktrees()
    setStatusToast(msg)
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 bg-[#0d0f12] space-y-6">
      {/* Header & Goal Dispatcher */}
      <div className="rounded-2xl bg-[#14171c] border border-[#282e39] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#d97757]/15 border border-[#d97757]/30 flex items-center justify-center">
              <Network className="w-5 h-5 text-[#d97757]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                方向 B：Coordinator 多智能体并发指挥中心 (Swarm & Git Worktree)
              </h2>
              <p className="text-xs text-slate-400">
                复刻自 <code className="text-amber-300">src/coordinator/</code>
                ：自动将复杂目标拆解为拓扑依赖 DAG，派生多个 Sub-Agent 在独立 Git Worktree 分支并行推进。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none bg-[#1b1f27] px-3 py-1.5 rounded-lg border border-[#282e39]">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={(e) => setUseWorktree(e.target.checked)}
                className="accent-[#d97757]"
              />
              <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
              <span>启用 Git Worktree 物理隔离</span>
            </label>

            <button
              onClick={handleCleanup}
              className="px-3 py-1.5 rounded-lg bg-[#1b1f27] hover:bg-rose-950/40 border border-[#282e39] text-xs text-slate-300 hover:text-rose-300 flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清理 Worktree</span>
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="输入需要多智能体协同拆解的宏大研发目标..."
            className="flex-1 rounded-xl bg-[#0d0f12] border border-[#282e39] focus:border-[#d97757] focus:outline-none px-4 py-2.5 text-sm text-slate-100"
          />
          <button
            onClick={handleLaunch}
            disabled={isRunning}
            className="px-5 py-2.5 rounded-xl bg-[#d97757] hover:bg-[#e58869] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition shadow"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>集群并发调度中...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>拆解 DAG 并启动集群</span>
              </>
            )}
          </button>
        </div>

        {statusToast && (
          <div className="mt-3 px-3.5 py-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
            {statusToast}
          </div>
        )}
      </div>

      {/* DAG Task Cards Grid */}
      {swarmState && swarmState.tasks.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {swarmState.tasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-xl bg-[#14171c] border p-4 flex flex-col justify-between transition ${
                  task.status === 'running'
                    ? 'border-[#d97757] shadow-[0_0_20px_rgba(217,119,87,0.12)]'
                    : 'border-[#282e39]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          roleColorMap[task.role]
                        }`}
                      >
                        {task.role}
                      </span>
                      <span className="font-mono text-xs text-slate-400">#{task.id}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      {task.status === 'running' && (
                        <span className="flex items-center gap-1 text-amber-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          并行执行中
                        </span>
                      )}
                      {(task.status === 'queued' || task.status === 'waiting_deps') && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          等待前置依赖
                        </span>
                      )}
                      {task.status === 'completed' && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          已完成
                        </span>
                      )}
                      {task.status === 'merged' && (
                        <span className="flex items-center gap-1 text-sky-400">
                          <GitMerge className="w-3.5 h-3.5" />
                          已合并主分支
                        </span>
                      )}
                      {task.status === 'failed' && (
                        <span className="flex items-center gap-1 text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          失败
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100 mb-1">{task.title}</h3>
                  <p className="text-xs text-slate-400 mb-3">{task.description}</p>

                  {/* Dependencies & Git Worktree Badge */}
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-[#1b1f27] text-slate-400 border border-[#282e39]">
                      依赖: {task.dependencies.length > 0 ? task.dependencies.join(', ') : '无 (Root)'}
                    </span>
                    {task.branchName && (
                      <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        {task.branchName}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-[#1b1f27] text-slate-400 border border-[#282e39] flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      {task.tokenUsed} tok
                    </span>
                  </div>

                  {/* Live Sub-agent Logs */}
                  <div className="rounded-lg bg-[#0d0f12] border border-[#282e39] p-2.5 font-mono text-[11px] text-slate-300 space-y-1 max-h-28 overflow-y-auto mb-3">
                    {task.logs.map((log, i) => (
                      <div key={i} className="truncate">
                        • {log}
                      </div>
                    ))}
                  </div>

                  {task.summaryOutput && (
                    <div className="rounded-lg bg-[#1b1f27]/70 border border-[#282e39] p-2.5 text-xs text-slate-200 mb-3 whitespace-pre-wrap">
                      {task.summaryOutput}
                    </div>
                  )}
                </div>

                {/* Footer Actions (Modified files & 1-Click Worktree Merge) */}
                <div className="flex items-center justify-between pt-2 border-t border-[#282e39]">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <FileDiff className="w-3.5 h-3.5 text-slate-500" />
                    变更文件: {task.modifiedFiles.length} 个
                  </span>

                  {task.branchName && task.status === 'completed' && (
                    <button
                      onClick={() => handleMerge(task.id)}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>一键 Merge 回主分支</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Final Synthesis Report */}
          {swarmState.finalSynthesis && (
            <div className="rounded-2xl bg-[#14171c] border border-emerald-500/40 p-5">
              <div className="text-sm font-semibold text-emerald-300 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Coordinator 最终汇总报告</span>
              </div>
              <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {swarmState.finalSynthesis}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 rounded-2xl bg-[#14171c]/50 border border-dashed border-[#282e39] flex flex-col items-center justify-center p-12 text-center">
          <Network className="w-10 h-10 text-slate-600 mb-3" />
          <p className="text-sm text-slate-300 font-medium mb-1">
            尚未启动多智能体 DAG 任务流
          </p>
          <p className="text-xs text-slate-500 max-w-md">
            在上方输入目标并点击「拆解 DAG 并启动集群」，系统将自动创建 Researcher、Coder、Tester、Reviewer
            四个子智能体节点并行协作。
          </p>
        </div>
      )}
    </div>
  )
}
