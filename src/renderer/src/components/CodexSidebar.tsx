import React, { useState, useEffect } from 'react'
import {
  Plus,
  Search,
  FolderGit2,
  FolderPlus,
  Pin,
  X,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitFork,
  AlertCircle,
  CheckCircle2,
  Circle,
  Blocks,
  Cpu,
  BookOpen
} from 'lucide-react'
import { useAppStore, CodexThread } from '../store/useAppStore'
import { WorkspaceProject } from '@shared/types'
import { ClaudeAsteriskGlyph } from './ClaudeActivityElements'

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 60) return '刚刚'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  return `${Math.floor(diffHr / 24)}d`
}

const ThreadRow: React.FC<{
  thread: CodexThread
  isActive: boolean
  hasDraft?: boolean
  projectBadge?: string
  onSelect: () => void
  onPin: () => void
  onArchive: () => void
}> = ({ thread, isActive, hasDraft, projectBadge, onSelect, onPin, onArchive }) => {
  return (
    <div
      onClick={onSelect}
      className={`group relative px-3 py-2.5 rounded-[18px] cursor-pointer flex items-start gap-2.5 transition-all duration-200 ease-out ${
        isActive
          ? 'apple-glass-bubble text-[#1d1d1f]'
          : 'hover:bg-white/60 hover:border-white/80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.03)] text-[#3a3a3c] border border-transparent'
      }`}
    >
      {/* Thread Lifecycle Status Icon */}
      <div className="mt-0.5 shrink-0">
        {thread.status === 'running' ? (
          <ClaudeAsteriskGlyph active className="text-[12px]" />
        ) : thread.status === 'waiting_approval' ? (
          <AlertCircle className="w-3.5 h-3.5 text-[#FF9500]" />
        ) : thread.status === 'completed' ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
        ) : (
          <Circle className="w-3.5 h-3.5 text-[#aeaeb2]" />
        )}
      </div>

      {/* Title & Metadata */}
      <div className="flex-1 min-w-0 relative z-10">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[12.5px] font-medium truncate leading-snug text-[#1d1d1f] tracking-tight">
            {thread.title}
          </span>
          <div className="relative flex items-center justify-end shrink-0 min-w-[36px] h-4">
            <span className="text-[10.5px] text-[#86868b] font-mono transition-opacity duration-150 group-hover:opacity-0 pointer-events-none">
              {formatRelativeTime(thread.updatedAt)}
            </span>
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            >
              <button
                type="button"
                onClick={onPin}
                title={thread.pinned ? '取消置顶' : '置顶线程'}
                className={`p-1 rounded-md hover:bg-black/[0.08] transition-colors ${
                  thread.pinned ? 'text-[#0071e3]' : 'text-[#86868b]'
                }`}
              >
                <Pin className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={onArchive}
                title="归档移除"
                className="p-1 rounded-md hover:bg-black/[0.08] text-[#86868b] hover:text-[#FF3B30] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-[#86868b] truncate">
          {hasDraft && !isActive && (
            <span className="px-1.5 py-0.2 rounded bg-[#0071e3]/12 text-[#0071e3] font-medium flex items-center gap-0.5 shrink-0">
              <span>草稿</span>
            </span>
          )}
          {(thread.title.startsWith('分支: ') || thread.id.includes('branch')) && (
            <span className="px-1.5 py-0.2 rounded bg-[#0071e3]/12 text-[#0071e3] font-medium flex items-center gap-0.5 shrink-0">
              <GitFork className="w-2.5 h-2.5" />
              <span>分支</span>
            </span>
          )}
          {projectBadge && (
            <span className="px-1.5 py-0.2 rounded bg-black/[0.05] text-[#6e6e73] truncate max-w-[90px]">
              {projectBadge}
            </span>
          )}
          {thread.status === 'waiting_approval' && (
            <span className="px-1.5 py-0.2 rounded bg-[#FF9500]/15 text-[#C96A00] font-medium">
              待审批
            </span>
          )}
          {thread.status === 'running' && (
            <span className="text-[#D97757] font-medium">执行中</span>
          )}
          {thread.toolCount > 0 && <span className="font-mono">{thread.toolCount} tools</span>}
          {thread.messages.length === 0 && !hasDraft && <span>新会话</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Full OpenAI Codex Desktop Left Sidebar Replica for Feature A:
 * - New Thread (`⌘N`) + Add Folder Project (`⌘O`)
 * - Integrated `Skills` & `MCP` Hub Navigation Pages (shows agent-mounted & GitHub-mounted extensions)
 * - Active / Needs Attention Supervision Drawer
 * - Pinned Threads
 * - Multi-Folder Workspace Projects Tree (collapsible per folder, branch badge, per-folder `+` thread creation)
 */
export const CodexSidebar: React.FC = () => {
  const {
    config,
    workbenchSubView,
    setWorkbenchSubView,
    threads,
    activeThreadId,
    threadDrafts,
    isLeftSidebarOpen,
    swarmState,
    skills,
    mcpServers,
    knowledgeDocs,
    createNewThread,
    switchThread,
    togglePinThread,
    archiveThread,
    addProjectFolder,
    switchProjectFolder,
    removeProjectFolder,
    setActiveMode
  } = useAppStore()

  const [filterQuery, setFilterQuery] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [projectToDelete, setProjectToDelete] = useState<WorkspaceProject | null>(null)

  useEffect(() => {
    if (!projectToDelete) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setProjectToDelete(null)
      } else if (e.key === 'Enter') {
        const path = projectToDelete.path
        setProjectToDelete(null)
        removeProjectFolder(path)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [projectToDelete, removeProjectFolder])

  const projects: WorkspaceProject[] =
    config?.projects && config.projects.length > 0
      ? config.projects
      : config?.workspaceDir
        ? [
            {
              id: 'proj_default',
              name: config.workspaceDir.split('/').filter(Boolean).pop() || config.workspaceDir,
              path: config.workspaceDir,
              gitBranch: 'main',
              addedAt: Date.now()
            }
          ]
        : Array.from(
            new Set(threads.map((t) => t.workspaceDir).filter((dir): dir is string => Boolean(dir)))
          ).map((dir, idx) => ({
            id: `proj_cached_${idx}`,
            name: dir.split('/').filter(Boolean).pop() || dir,
            path: dir,
            gitBranch: 'main',
            addedAt: Date.now()
          }))

  const filtered = threads.filter((t) =>
    filterQuery.trim()
      ? t.title.toLowerCase().includes(filterQuery.trim().toLowerCase()) ||
        t.workspaceDir.toLowerCase().includes(filterQuery.trim().toLowerCase())
      : true
  )

  const activeAttentionThreads = filtered.filter(
    (t) => t.status === 'running' || t.status === 'waiting_approval'
  )
  const runningSwarmTasks =
    swarmState?.tasks.filter((t) => t.status === 'running').length || 0

  const pinnedThreads = filtered.filter(
    (t) => t.pinned && t.status !== 'running' && t.status !== 'waiting_approval'
  )

  const enabledSkillsCount = skills.filter((s) => s.enabled).length
  const agentMountedSkillsCount = skills.filter((s) => s.installedBy === 'agent').length
  const enabledMcpCount = mcpServers.filter((m) => m.enabled).length

  const toggleFolderCollapse = (folderPath: string): void => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }))
  }

  return (
    <>
      <aside
        className={`bg-[#F5F5F7] border-r border-black/[0.07] flex flex-col select-none transition-all duration-500 ease-apple-spring overflow-hidden ${
          isLeftSidebarOpen ? 'w-[266px] opacity-100' : 'w-0 opacity-0 border-r-0'
        }`}
      >
      <div className="w-[266px] flex-1 flex flex-col overflow-hidden">
        {/* 1. Top Codex Actions: New Thread + Add Project Folder + Search */}
        <div className="p-3 space-y-2 border-b border-black/[0.05]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => createNewThread()}
              className="apple-press flex-1 py-2 px-3 rounded-xl bg-white hover:bg-white/90 border border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-[12.5px] font-semibold text-[#1d1d1f] flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-[#0071e3]" />
                <span>新建线程</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#86868b] bg-[#F5F5F7] px-1.5 py-0.5 rounded">
                ⌘N
              </kbd>
            </button>

            <button
              type="button"
              onClick={addProjectFolder}
              title="添加文件夹项目到侧边栏 (⌘O)"
              className="apple-press p-2 rounded-xl bg-white hover:bg-white/90 border border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-[#1d1d1f] hover:text-[#0071e3] transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索线程或项目..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-black/[0.045] focus:bg-white border border-transparent focus:border-black/[0.1] text-[12px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none transition-all"
            />
          </div>

          {/* 2. Codex Extensions Menu: Skills & MCP Hub Navigation */}
          <div className="pt-1 space-y-1">
            <button
              type="button"
              onClick={() =>
                setWorkbenchSubView(workbenchSubView === 'skills' ? 'chat' : 'skills')
              }
              className={`apple-press w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[12.5px] font-medium transition-all duration-200 ${
                workbenchSubView === 'skills'
                  ? 'apple-glass-bubble text-[#1d1d1f]'
                  : 'text-[#3a3a3c] hover:bg-black/[0.04] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <Blocks
                  className={`w-3.5 h-3.5 ${
                    workbenchSubView === 'skills' ? 'text-[#D97757]' : 'text-[#6e6e73]'
                  }`}
                />
                <span>Skills 技能库</span>
                {agentMountedSkillsCount > 0 && (
                  <span
                    title={`包含 ${agentMountedSkillsCount} 个对话装载的 Skill`}
                    className="w-1.5 h-1.5 rounded-full bg-[#D97757]"
                  />
                )}
              </span>
              <span className="text-[10.5px] font-mono px-1.5 py-0.2 rounded-full bg-black/[0.05] text-[#6e6e73]">
                {enabledSkillsCount}/{skills.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setWorkbenchSubView(workbenchSubView === 'mcp' ? 'chat' : 'mcp')}
              className={`apple-press w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[12.5px] font-medium transition-all duration-200 ${
                workbenchSubView === 'mcp'
                  ? 'apple-glass-bubble text-[#1d1d1f]'
                  : 'text-[#3a3a3c] hover:bg-black/[0.04] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <Cpu
                  className={`w-3.5 h-3.5 ${
                    workbenchSubView === 'mcp' ? 'text-[#0071e3]' : 'text-[#6e6e73]'
                  }`}
                />
                <span>MCP 服务</span>
              </span>
              <span className="text-[10.5px] font-mono px-1.5 py-0.2 rounded-full bg-[#34C759]/12 text-[#177233]">
                {enabledMcpCount} active
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setWorkbenchSubView(
                  workbenchSubView === 'knowledge-base' ? 'chat' : 'knowledge-base'
                )
              }
              className={`apple-press w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[12.5px] font-medium transition-all duration-200 ${
                workbenchSubView === 'knowledge-base'
                  ? 'apple-glass-bubble text-[#1d1d1f]'
                  : 'text-[#3a3a3c] hover:bg-black/[0.04] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <BookOpen
                  className={`w-3.5 h-3.5 ${
                    workbenchSubView === 'knowledge-base' ? 'text-[#5856D6]' : 'text-[#6e6e73]'
                  }`}
                />
                <span>知识库文档</span>
              </span>
              <span className="text-[10.5px] font-mono px-1.5 py-0.2 rounded-full bg-[#5856D6]/12 text-[#5856D6]">
                {knowledgeDocs.length} 份
              </span>
            </button>
          </div>
        </div>

        {/* 3. Scrollable Codex Supervision & Multi-Project Folders Tree */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
          {/* Active / Needs Attention Supervision Drawer */}
          {(activeAttentionThreads.length > 0 || runningSwarmTasks > 0) && (
            <div className="space-y-1">
              <div className="px-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-[#86868b]">
                <span>进行中 · 待处理</span>
                <span className="px-1.5 py-0.2 rounded-full bg-[#D97757]/15 text-[#D97757] font-mono">
                  {activeAttentionThreads.length + (runningSwarmTasks > 0 ? 1 : 0)}
                </span>
              </div>

              {activeAttentionThreads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  isActive={workbenchSubView === 'chat' && t.id === activeThreadId}
                  hasDraft={Boolean(
                    threadDrafts[t.id]?.text ||
                    (threadDrafts[t.id]?.attachments && threadDrafts[t.id].attachments.length > 0)
                  )}
                  projectBadge={
                    projects.length > 1
                      ? t.workspaceDir.split('/').filter(Boolean).pop()
                      : undefined
                  }
                  onSelect={() => switchThread(t.id)}
                  onPin={() => togglePinThread(t.id)}
                  onArchive={() => archiveThread(t.id)}
                />
              ))}

              {runningSwarmTasks > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveMode('coordinator')}
                  className="apple-press w-full px-2.5 py-2 rounded-xl bg-[#34C759]/10 border border-[#34C759]/25 text-left flex items-center justify-between text-[12px]"
                >
                  <span className="flex items-center gap-2 font-medium text-[#177233]">
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Swarm 集群并行中</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#177233]">
                    {runningSwarmTasks} active
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Pinned Threads */}
          {pinnedThreads.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#86868b]">
                置顶线程
              </div>
              {pinnedThreads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  isActive={workbenchSubView === 'chat' && t.id === activeThreadId}
                  hasDraft={Boolean(
                    threadDrafts[t.id]?.text ||
                    (threadDrafts[t.id]?.attachments && threadDrafts[t.id].attachments.length > 0)
                  )}
                  projectBadge={
                    projects.length > 1
                      ? t.workspaceDir.split('/').filter(Boolean).pop()
                      : undefined
                  }
                  onSelect={() => switchThread(t.id)}
                  onPin={() => togglePinThread(t.id)}
                  onArchive={() => archiveThread(t.id)}
                />
              ))}
            </div>
          )}

          {/* Codex Multi-Folder Workspace Projects Section */}
          <div className="space-y-2">
            <div className="px-2 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#86868b]">
                项目文件夹 ({projects.length})
              </span>
              <button
                type="button"
                onClick={addProjectFolder}
                className="apple-press inline-flex items-center gap-1 text-[11px] font-medium text-[#0071e3] hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>添加项目</span>
              </button>
            </div>

            {projects.map((proj) => {
              const isCurrentWorkspace = config?.workspaceDir === proj.path
              const isCollapsed = Boolean(collapsedProjects[proj.path])
              const folderThreads = filtered.filter(
                (t) =>
                  !t.pinned &&
                  t.status !== 'running' &&
                  t.status !== 'waiting_approval' &&
                  (t.workspaceDir === proj.path ||
                    (!t.workspaceDir && proj.path === config?.workspaceDir))
              )

              return (
                <div key={proj.path} className="space-y-0.5">
                  {/* Folder Header Row (Zero Jitter: Stable Width Layout, Pure Color Transition) */}
                  <div
                    className={`group px-2 py-1.5 rounded-xl flex items-center justify-between transition-colors duration-150 ease-out cursor-pointer ${
                      isCurrentWorkspace
                        ? 'bg-black/[0.05] text-[#1d1d1f]'
                        : 'text-[#6e6e73] hover:bg-black/[0.035] hover:text-[#1d1d1f]'
                    }`}
                    onClick={() => {
                      if (!isCurrentWorkspace) {
                        switchProjectFolder(proj.path)
                      } else {
                        toggleFolderCollapse(proj.path)
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFolderCollapse(proj.path)
                        }}
                        className="p-0.5 rounded hover:bg-black/[0.06] shrink-0 transition-colors"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3 h-3 text-[#86868b]" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-[#86868b]" />
                        )}
                      </button>
                      <FolderGit2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isCurrentWorkspace ? 'text-[#0071e3]' : 'text-[#86868b]'
                        }`}
                      />
                      <span className="text-[12px] font-semibold truncate" title={proj.path}>
                        {proj.name}
                      </span>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => createNewThread(proj.path)}
                        title={`在 ${proj.name} 下新建对话线程`}
                        className="w-6 h-6 rounded-md hover:bg-black/[0.08] flex items-center justify-center text-[#86868b] hover:text-[#0071e3] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setProjectToDelete(proj)}
                          title="从侧边栏移除该项目文件夹"
                          className="w-6 h-6 rounded-md hover:bg-black/[0.08] opacity-0 group-hover:opacity-100 flex items-center justify-center text-[#86868b] hover:text-[#FF3B30] transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Nested Threads inside this Project Folder */}
                  {!isCollapsed && (
                    <div className="pl-2.5 ml-2.5 border-l border-black/[0.07] space-y-0.5 pt-0.5">
                      {folderThreads.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => createNewThread(proj.path)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] text-[#86868b] hover:text-[#0071e3] hover:bg-black/[0.03] transition-colors flex items-center gap-1.5"
                        >
                          <Plus className="w-3 h-3" />
                          <span>在此文件夹启动首个线程</span>
                        </button>
                      ) : (
                        folderThreads.map((t) => (
                          <ThreadRow
                            key={t.id}
                            thread={t}
                            isActive={workbenchSubView === 'chat' && t.id === activeThreadId}
                            hasDraft={Boolean(
                              threadDrafts[t.id]?.text ||
                              (threadDrafts[t.id]?.attachments && threadDrafts[t.id].attachments.length > 0)
                            )}
                            onSelect={() => switchThread(t.id)}
                            onPin={() => togglePinThread(t.id)}
                            onArchive={() => archiveThread(t.id)}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Active Workspace Footer */}
        <div className="p-2.5 border-t border-black/[0.06] bg-[#EFEFF4]/60">
          <button
            type="button"
            onClick={addProjectFolder}
            title={`当前工作区: ${config?.workspaceDir || ''}\n点击添加或切换项目文件夹`}
            className="apple-press w-full px-2.5 py-1.5 rounded-xl hover:bg-black/[0.05] flex items-center justify-between text-[11.5px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
          >
            <span className="truncate font-mono">{config?.workspaceDir || '选择本地仓库'}</span>
            <span className="text-[10.5px] text-[#0071e3] font-medium shrink-0 ml-2">+文件夹</span>
          </button>
        </div>
      </div>
    </aside>

    {/* 移除项目二次确认弹窗 */}
    {projectToDelete && (
      <div
        onClick={() => setProjectToDelete(null)}
        className="animate-apple-backdrop fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-apple-modal w-full max-w-[320px] rounded-[22px] bg-white border border-black/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.16),0_4px_16px_rgba(0,0,0,0.06)] p-6 flex flex-col items-center text-center select-none"
        >
          {/* Title */}
          <h3 className="text-[16px] font-semibold text-[#1d1d1f] tracking-tight mb-2.5">
            移除项目文件夹？
          </h3>

          {/* Description */}
          <p className="text-[13px] text-[#3a3a3c] leading-snug mb-2">
            确定要从侧边栏移除项目{' '}
            <span className="font-semibold text-[#1d1d1f]">“{projectToDelete.name}”</span>{' '}
            吗？
          </p>

          {/* Reassurance Notice */}
          <p className="text-[11.5px] text-[#86868b] leading-relaxed mb-6">
            此操作仅从侧边栏中移除，不会删除磁盘上的本地文件。
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setProjectToDelete(null)}
              className="apple-press flex-1 py-2 px-3 rounded-xl bg-[#E5E5EA] hover:bg-[#dcdce0] text-[#1d1d1f] text-[13px] font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={async () => {
                const path = projectToDelete.path
                setProjectToDelete(null)
                await removeProjectFolder(path)
              }}
              className="apple-press flex-1 py-2 px-3 rounded-xl bg-[#FF3B30] hover:bg-[#E0342B] text-white text-[13px] font-medium shadow-[0_2px_8px_rgba(255,59,48,0.25)] transition-all"
            >
              确认移除
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
