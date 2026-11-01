import React, { useState, useRef, useEffect } from 'react'
import {
  Send,
  Square,
  Trash2,
  Terminal,
  FolderTree,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  FileCode,
  Sparkles,
  Wrench,
  GitBranch,
  BrainCircuit
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { FileTreeNode, ToolCallItem } from '@shared/types'

const FileTreeRecursive: React.FC<{
  nodes: FileTreeNode[]
  onSelectFile: (path: string) => void
}> = ({ nodes, onSelectFile }) => {
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({})

  const toggleDir = (path: string): void => {
    setOpenDirs((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  return (
    <ul className="space-y-0.5 text-xs font-mono">
      {nodes.map((node) => {
        if (node.isDirectory) {
          const isOpen = Boolean(openDirs[node.path])
          return (
            <li key={node.path}>
              <button
                onClick={() => toggleDir(node.path)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#252a35] text-slate-300 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className="truncate text-amber-200/90">{node.name}/</span>
              </button>
              {isOpen && node.children && (
                <div className="pl-3 border-l border-[#282e39] ml-2.5 mt-0.5">
                  <FileTreeRecursive nodes={node.children} onSelectFile={onSelectFile} />
                </div>
              )}
            </li>
          )
        }
        return (
          <li key={node.path}>
            <button
              onClick={() => onSelectFile(node.relativePath)}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#252a35] text-slate-400 hover:text-slate-100 text-left"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const ToolCallCard: React.FC<{ toolCall: ToolCallItem }> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false)

  const statusBadge = {
    pending_approval: (
      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
        等待权限审批
      </span>
    ),
    running: (
      <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 animate-pulse">
        执行中...
      </span>
    ),
    completed: (
      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        已完成
      </span>
    ),
    rejected: (
      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
        已拒绝
      </span>
    ),
    error: (
      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
        错误
      </span>
    )
  }[toolCall.status]

  return (
    <div className="mt-2 rounded-lg bg-[#14171c] border border-[#282e39] overflow-hidden text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#1b1f27] transition"
      >
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-[#d97757]" />
          <span className="font-mono font-semibold text-slate-200">{toolCall.name}</span>
          <span className="text-slate-500 font-mono truncate max-w-[320px]">
            {toolCall.argumentsJson}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>
      </div>

      {toolCall.diffPreview && (
        <div className="border-t border-[#282e39] bg-[#0d0f12] p-2.5 font-mono text-[11px] overflow-x-auto max-h-56">
          <div className="text-slate-400 mb-1">
            Diff 预览: <span className="text-amber-300">{toolCall.diffPreview.filePath}</span>
          </div>
          {toolCall.diffPreview.unifiedDiff.split('\n').map((line, idx) => {
            const cls = line.startsWith('+ ')
              ? 'bg-emerald-950/60 text-emerald-300'
              : line.startsWith('- ')
                ? 'bg-rose-950/60 text-rose-300'
                : 'text-slate-400'
            return (
              <div key={idx} className={`px-1.5 whitespace-pre ${cls}`}>
                {line}
              </div>
            )
          })}
        </div>
      )}

      {expanded && toolCall.resultOutput && (
        <div className="border-t border-[#282e39] bg-[#0d0f12] p-2.5 font-mono text-[11px] text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
          {toolCall.resultOutput}
        </div>
      )}
    </div>
  )
}

export const WorkbenchView: React.FC = () => {
  const {
    messages,
    isBusy,
    pendingApproval,
    terminalLogs,
    fileTree,
    selectedFilePreview,
    sendMessage,
    abortGeneration,
    clearSession,
    resolveApproval,
    previewFile,
    closeFilePreview,
    setActiveMode,
    startSwarm
  } = useAppStore()

  const [input, setInput] = useState('')
  const [rightTab, setRightTab] = useState<'terminal' | 'files'>('terminal')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingApproval])

  const handleSend = async (): Promise<void> => {
    if (!input.trim() || isBusy) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  const quickPrompts = [
    '扫描当前工作区架构并总结核心模块职责',
    '检查项目的 package.json 与 TypeScript 配置是否规范',
    '演示修改或新建一个示例工具函数，让我体验可视化 Diff 审批卡片'
  ]

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left / Main Column: ReAct Streaming Conversation & Diff Permission Gate */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d0f12]">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-[#d97757]/15 border border-[#d97757]/30 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-[#d97757]" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">
                方向 A：Claude Code 原生编程工作台 (QueryEngine)
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                内置复刻自源码的 <code className="text-amber-300">ToolRegistry</code>（精准块替换{' '}
                <code className="text-amber-300">edit_file</code>、实时流式{' '}
                <code className="text-amber-300">run_bash</code>、全文检索{' '}
                <code className="text-amber-300">search_files</code>）与三层上下文压缩管线。
              </p>

              <div className="grid grid-cols-1 gap-2.5 w-full">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(p)}
                    className="p-3 rounded-xl bg-[#14171c] hover:bg-[#1b1f27] border border-[#282e39] hover:border-[#d97757]/50 text-left text-xs text-slate-300 transition flex items-center justify-between group"
                  >
                    <span>{p}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#d97757] transition" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages
              .filter((m) => m.role !== 'tool')
              .map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl p-4 border ${
                    msg.role === 'user'
                      ? 'bg-[#1b1f27] border-[#282e39] ml-10'
                      : msg.isCompactedSummary
                        ? 'bg-amber-950/20 border-amber-500/30'
                        : 'bg-[#14171c] border-[#282e39] mr-6'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {msg.role === 'user'
                        ? 'You'
                        : msg.isCompactedSummary
                          ? '⚡ AutoCompact 上下文摘要检查点'
                          : 'Claude Code Engine'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Reasoning Chain (DeepSeek / Thinking Model Support) */}
                  {msg.reasoningContent && (
                    <details
                      open
                      className="mb-3 rounded-lg bg-[#0d0f12] border border-[#282e39] p-2.5 text-xs text-slate-400"
                    >
                      <summary className="cursor-pointer font-mono text-[11px] text-amber-300/90 flex items-center gap-1.5 select-none">
                        <BrainCircuit className="w-3.5 h-3.5" />
                        <span>思考链推理过程 (Reasoning Chain)</span>
                      </summary>
                      <div className="mt-2 pl-2 border-l-2 border-amber-500/30 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                        {msg.reasoningContent}
                      </div>
                    </details>
                  )}

                  {/* Message Content */}
                  {msg.content && (
                    <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  )}

                  {/* Tool Calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.toolCalls.map((tc) => (
                        <ToolCallCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}
                </div>
              ))
          )}

          {/* Active Permission Gate Banner */}
          {pendingApproval && (
            <div className="rounded-xl bg-amber-950/30 border-2 border-amber-500/60 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <span>权限安全闸门 (PermissionGate)：请求执行 {pendingApproval.name}</span>
                </div>
                <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">
                  级别: {pendingApproval.permissionLevel}
                </span>
              </div>

              {pendingApproval.commandPreview && (
                <div className="my-2 p-2.5 rounded bg-[#0d0f12] border border-[#282e39] font-mono text-xs text-emerald-300">
                  $ {pendingApproval.commandPreview}
                </div>
              )}

              {pendingApproval.diffPreview && (
                <div className="my-2 p-2.5 rounded bg-[#0d0f12] border border-[#282e39] font-mono text-[11px] max-h-48 overflow-y-auto">
                  <div className="text-slate-400 mb-1">
                    目标文件: {pendingApproval.diffPreview.filePath}
                  </div>
                  {pendingApproval.diffPreview.unifiedDiff.split('\n').map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith('+ ')
                          ? 'text-emerald-300 bg-emerald-950/40'
                          : line.startsWith('- ')
                            ? 'text-rose-300 bg-rose-950/40'
                            : 'text-slate-400'
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2.5 mt-3">
                <button
                  onClick={() => resolveApproval(pendingApproval.id, 'approve_once')}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>允许本次执行</span>
                </button>
                <button
                  onClick={() => resolveApproval(pendingApproval.id, 'approve_session')}
                  className="px-3.5 py-1.5 rounded-lg bg-[#252a35] hover:bg-slate-700 text-slate-200 text-xs font-medium border border-[#282e39] transition"
                >
                  本会话总是允许写入/命令
                </button>
                <button
                  onClick={() => resolveApproval(pendingApproval.id, 'reject')}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 text-xs font-medium flex items-center gap-1.5 transition ml-auto"
                >
                  <XCircle className="w-4 h-4" />
                  <span>拒绝执行</span>
                </button>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Composer */}
        <div className="p-4 bg-[#14171c] border-t border-[#282e39]">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="输入开发指令（Enter 发送，Shift+Enter 换行）... 支持调用 read_file / edit_file / run_bash / delegate_to_swarm"
              rows={3}
              className="flex-1 rounded-xl bg-[#0d0f12] border border-[#282e39] focus:border-[#d97757] focus:outline-none p-3 text-sm text-slate-100 placeholder-slate-500 resize-none"
            />
            <div className="flex flex-col gap-2">
              {isBusy ? (
                <button
                  onClick={abortGeneration}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>停止</span>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  className="px-4 py-2.5 rounded-xl bg-[#d97757] hover:bg-[#e58869] text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送</span>
                </button>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (!input.trim()) return
                    const goal = input.trim()
                    setInput('')
                    setActiveMode('coordinator')
                    startSwarm(goal, true)
                  }}
                  title="将当前输入框需求直接派发给方向 B Coordinator 多智能体集群并行执行"
                  className="px-2.5 py-1.5 rounded-lg bg-[#1b1f27] hover:bg-[#252a35] border border-[#282e39] text-[11px] text-amber-300 flex items-center gap-1 transition"
                >
                  <GitBranch className="w-3 h-3" />
                  <span>转 Swarm</span>
                </button>
                <button
                  onClick={clearSession}
                  title="清空当前对话上下文"
                  className="p-1.5 rounded-lg bg-[#1b1f27] hover:bg-rose-950/50 border border-[#282e39] text-slate-400 hover:text-rose-300 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Terminal Stream & Project File Tree */}
      <div className="w-96 bg-[#14171c] border-l border-[#282e39] flex flex-col">
        <div className="flex border-b border-[#282e39]">
          <button
            onClick={() => setRightTab('terminal')}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition ${
              rightTab === 'terminal'
                ? 'border-[#d97757] text-slate-100 bg-[#1b1f27]/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>实时终端流 ({terminalLogs.length})</span>
          </button>
          <button
            onClick={() => setRightTab('files')}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition ${
              rightTab === 'files'
                ? 'border-[#d97757] text-slate-100 bg-[#1b1f27]/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>项目文件树</span>
          </button>
        </div>

        {rightTab === 'terminal' ? (
          <div className="flex-1 bg-[#090b0d] p-3 font-mono text-[11px] overflow-y-auto space-y-1">
            {terminalLogs.length === 0 ? (
              <div className="text-slate-500 text-xs py-8 text-center">
                当 Agent 调用 <code className="text-slate-400">run_bash</code> 时，实时 stdout / stderr
                将在此处滚动输出。
              </div>
            ) : (
              terminalLogs.map((item) => (
                <div
                  key={item.id}
                  className={`whitespace-pre-wrap break-all ${
                    item.stream === 'stderr' ? 'text-amber-300' : 'text-emerald-300/90'
                  }`}
                >
                  {item.text}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedFilePreview ? (
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0d0f12]">
                <div className="px-3 py-2 bg-[#1b1f27] border-b border-[#282e39] flex items-center justify-between text-xs">
                  <span className="font-mono text-amber-300 truncate">
                    {selectedFilePreview.path}
                  </span>
                  <button
                    onClick={closeFilePreview}
                    className="text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 rounded bg-slate-800"
                  >
                    返回列表
                  </button>
                </div>
                <pre className="flex-1 p-3 font-mono text-[11px] text-slate-300 overflow-auto whitespace-pre">
                  {selectedFilePreview.content}
                </pre>
              </div>
            ) : (
              <div className="flex-1 p-2.5 overflow-y-auto">
                <FileTreeRecursive nodes={fileTree} onSelectFile={previewFile} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
