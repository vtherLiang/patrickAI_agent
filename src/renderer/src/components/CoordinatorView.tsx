import React, { useState } from 'react'
import {
  GitBranch,
  ArrowUp,
  GitMerge,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ChevronDown,
  Sparkles
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { SwarmTaskNode } from '@shared/types'
import { ClaudeAsteriskGlyph } from './ClaudeActivityElements'

const roleAccentMap: Record<SwarmTaskNode['role'], { label: string; badge: string }> = {
  researcher: { label: '勘探 Researcher', badge: 'text-[#0071e3] bg-[#0071e3]/10' },
  architect: { label: '架构 Architect', badge: 'text-[#5856D6] bg-[#5856D6]/10' },
  coder: { label: '编码 Coder', badge: 'text-[#C45533] bg-[#D97757]/12' },
  tester: { label: '测试 Tester', badge: 'text-[#177233] bg-[#34C759]/12' },
  reviewer: { label: '审查 Reviewer', badge: 'text-[#C96A00] bg-[#FF9500]/12' }
}

export const CoordinatorView: React.FC = () => {
  const { swarmState, startSwarm, mergeSwarmTask, cleanupWorktrees } = useAppStore()
  const [goalInput, setGoalInput] = useState(
    '设计并实现一套可扩展的 MCP 插件加载器模块，同时补齐类型校验与回归验证'
  )
  const [useWorktree, setUseWorktree] = useState(true)
  const [statusToast, setStatusToast] = useState<string | null>(null)

  const isRunning = swarmState?.status === 'planning' || swarmState?.status === 'running'
  const hasWorktrees = Boolean(swarmState?.tasks.some((t) => Boolean(t.branchName)))

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
    <div className="flex-1 overflow-y-auto px-6 py-10 bg-[#FBFBFD]">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Apple.com Editorial Header */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F2F7] border border-black/[0.06] text-[11px] font-medium text-[#3a3a3c] mb-4">
            <GitBranch className="w-3 h-3 text-[#28CD41]" />
            <span>Coordinator 多智能体并发编排</span>
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight apple-hero-text mb-2">
            多路并进，井然有序。
          </h1>
          <p className="text-[14px] text-[#6e6e73] leading-relaxed">
            自动将复杂工程拆解为拓扑依赖图（DAG），每个子智能体在独立的 Git Worktree 分支并行推进，零冲突一键合并。
          </p>
        </div>

        {/* Unified Floating Daylight Command Bar */}
        <div className="max-w-3xl mx-auto">
          <div className="apple-glass rounded-full p-2 pl-5 flex items-center gap-3 focus-within:border-black/[0.18] transition-colors">
            <input
              type="text"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLaunch()
              }}
              placeholder="输入跨模块研发目标..."
              className="flex-1 bg-transparent text-[14px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none min-w-0"
            />

            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-black/[0.08] shrink-0">
              <span className="text-[12px] text-[#6e6e73]">分支隔离</span>
              <button
                type="button"
                role="switch"
                aria-checked={useWorktree}
                data-checked={useWorktree}
                onClick={() => setUseWorktree((v) => !v)}
                className="apple-switch"
                title="为并行编码的子智能体自动创建独立 Git Worktree"
              >
                <span className="apple-switch-thumb" />
              </button>
            </div>

            <button
              onClick={handleLaunch}
              disabled={isRunning || !goalInput.trim()}
              className="apple-press px-4 py-2 rounded-full bg-[#1d1d1f] text-white disabled:opacity-35 text-[12px] font-semibold flex items-center gap-1.5 shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.16)]"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>调度中</span>
                </>
              ) : (
                <>
                  <span>启动集群</span>
                  <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                </>
              )}
            </button>
          </div>

          {(statusToast || hasWorktrees) && (
            <div className="flex items-center justify-between px-4 pt-3 text-[12px]">
              <span className="text-[#177233] font-medium">{statusToast || ''}</span>
              {hasWorktrees && !isRunning && (
                <button
                  onClick={handleCleanup}
                  className="apple-press text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
                >
                  清理所有临时 Worktree 分支
                </button>
              )}
            </div>
          )}
        </div>

        {/* Apple White Bento Grid for DAG Tasks */}
        {swarmState && swarmState.tasks.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {swarmState.tasks.map((task) => {
                const roleMeta = roleAccentMap[task.role]
                return (
                  <div
                    key={task.id}
                    className={`apple-bento rounded-3xl p-6 flex flex-col justify-between ${
                      task.status === 'running'
                        ? 'border-[#D97757]/40 shadow-[0_8px_28px_rgba(217,119,87,0.10)]'
                        : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${roleMeta.badge}`}
                        >
                          {roleMeta.label}
                        </span>

                        <div className="text-[12px] font-medium">
                          {task.status === 'running' && (
                            <span className="flex items-center gap-1 claude-shimmer-text font-mono">
                              <ClaudeAsteriskGlyph active />
                              <span>执行中</span>
                            </span>
                          )}
                          {(task.status === 'queued' || task.status === 'waiting_deps') && (
                            <span className="flex items-center gap-1.5 text-[#86868b]">
                              <Clock className="w-3.5 h-3.5" />
                              等待前置节点
                            </span>
                          )}
                          {task.status === 'completed' && (
                            <span className="flex items-center gap-1.5 text-[#177233]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              就绪
                            </span>
                          )}
                          {task.status === 'merged' && (
                            <span className="flex items-center gap-1.5 text-[#5856D6]">
                              <GitMerge className="w-3.5 h-3.5" />
                              已合并
                            </span>
                          )}
                          {task.status === 'failed' && (
                            <span className="flex items-center gap-1.5 text-[#FF3B30]">
                              <AlertCircle className="w-3.5 h-3.5" />
                              异常
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-[16px] font-semibold text-[#1d1d1f] tracking-tight mb-1.5">
                        {task.title}
                      </h3>
                      <p className="text-[13px] text-[#6e6e73] leading-relaxed mb-4">
                        {task.description}
                      </p>

                      {task.summaryOutput && (
                        <div className="rounded-2xl bg-[#F5F5F7] border border-black/[0.05] p-3.5 text-[12.5px] text-[#1d1d1f] leading-relaxed mb-4 whitespace-pre-wrap">
                          {task.summaryOutput}
                        </div>
                      )}

                      <details className="group mb-3">
                        <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[11px] text-[#86868b] hover:text-[#1d1d1f] select-none transition-colors">
                          <span>⎿ 执行轨迹 ({task.logs.length})</span>
                          {task.tokenUsed > 0 && <span>· {task.tokenUsed} tok</span>}
                          <ChevronDown className="w-3 h-3 transition-transform duration-300 group-open:rotate-180" />
                        </summary>
                        <div className="mt-2 rounded-2xl bg-[#F5F5F7] border border-black/[0.05] p-3 font-mono text-[11px] text-[#6e6e73] space-y-1 max-h-28 overflow-y-auto">
                          {task.logs.map((log, i) => (
                            <div key={i} className="truncate">
                              {log}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-black/[0.06] text-[11px] text-[#86868b]">
                      <span className="font-mono truncate max-w-[200px]">
                        {task.branchName
                          ? task.branchName
                          : task.dependencies.length > 0
                            ? `依赖: ${task.dependencies.join(', ')}`
                            : '根节点 Root'}
                      </span>

                      {task.branchName && task.status === 'completed' ? (
                        <button
                          onClick={() => handleMerge(task.id)}
                          className="apple-press px-3.5 py-1.5 rounded-full bg-[#34C759] hover:bg-[#2DB84E] text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-[0_2px_10px_rgba(52,199,89,0.28)]"
                        >
                          <GitMerge className="w-3 h-3" />
                          <span>合并分支</span>
                        </button>
                      ) : (
                        <span>
                          {task.modifiedFiles.length > 0
                            ? `${task.modifiedFiles.length} 个文件变更`
                            : '只读分析'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {swarmState.finalSynthesis && (
              <div className="animate-apple-view apple-bento rounded-3xl p-6 border-[#34C759]/30">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#177233] mb-2.5">
                  <Sparkles className="w-4 h-4" />
                  <span>集群协同总结报告</span>
                </div>
                <div className="text-[13.5px] text-[#1d1d1f] whitespace-pre-wrap leading-relaxed">
                  {swarmState.finalSynthesis}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
