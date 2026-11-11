import React, { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Terminal,
  FolderTree,
  GitCompareArrows,
  Search,
  RefreshCw,
  ArrowLeft,
  AtSign,
  Copy,
  Check,
  Globe,
  Eye
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { FileTreeNode, GitFileChange } from '@shared/types'
import { CodexBrowserPreview } from './CodexBrowserPreview'
import { CodexTerminalPanel } from './CodexTerminalPanel'

function filterTreeNodes(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  if (!query.trim()) return nodes
  const q = query.toLowerCase()
  const out: FileTreeNode[] = []
  for (const node of nodes) {
    if (node.isDirectory) {
      const filteredChildren = filterTreeNodes(node.children || [], query)
      if (node.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
        out.push({ ...node, children: filteredChildren })
      }
    } else if (
      node.name.toLowerCase().includes(q) ||
      node.relativePath.toLowerCase().includes(q)
    ) {
      out.push(node)
    }
  }
  return out
}

/**
 * Preserves the exact clean folder chevron + blue FileCode icon + soft rounded gray hover pill
 * from the user's screenshot (`media_1793591048728_68eb44fc.png`).
 */
const FileTreeRecursive: React.FC<{
  nodes: FileTreeNode[]
  forceExpand?: boolean
  onSelectFile: (path: string) => void
  onOpenFileInPreview: (absPath: string) => void
}> = ({ nodes, forceExpand = false, onSelectFile, onOpenFileInPreview }) => {
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({})

  return (
    <ul className="space-y-0.5 text-[12.5px]">
      {nodes.map((node) => {
        if (node.isDirectory) {
          const isOpen = forceExpand || Boolean(openDirs[node.path])
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() =>
                  setOpenDirs((prev) => ({ ...prev, [node.path]: !prev[node.path] }))
                }
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-black/[0.045] text-[#1d1d1f] text-left transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                )}
                <span className="truncate font-medium">{node.name}</span>
              </button>
              {isOpen && node.children && (
                <div className="pl-3 border-l border-black/[0.07] ml-3.5 mt-0.5">
                  <FileTreeRecursive
                    nodes={node.children}
                    forceExpand={forceExpand}
                    onSelectFile={onSelectFile}
                    onOpenFileInPreview={onOpenFileInPreview}
                  />
                </div>
              )}
            </li>
          )
        }

        const isMediaOrDoc = /\.(png|jpg|jpeg|jpj|webp|gif|svg|pdf|docx|doc|xlsx|xls|csv|tsv|html)$/i.test(
          node.name
        )

        return (
          <li key={node.path} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (isMediaOrDoc) {
                  onOpenFileInPreview(node.path)
                } else {
                  onSelectFile(node.relativePath)
                }
              }}
              className="flex-1 flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-black/[0.045] text-[#48484a] hover:text-[#1d1d1f] text-left transition-colors min-w-0"
            >
              <FileCode className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
              <span className="truncate font-mono text-[11.5px]">{node.name}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenFileInPreview(node.path)
              }}
              title="在侧边浏览区交互预览此文件"
              className="apple-press opacity-0 group-hover:opacity-100 p-1 mr-1 rounded-md hover:bg-black/[0.06] text-[#86868b] hover:text-[#0071e3] transition-opacity shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const STATUS_BADGE: Record<
  GitFileChange['status'],
  { code: string; cls: string }
> = {
  modified: { code: 'M', cls: 'bg-[#FF9500]/15 text-[#C96A00]' },
  added: { code: 'A', cls: 'bg-[#34C759]/15 text-[#177233]' },
  untracked: { code: 'U', cls: 'bg-[#0071e3]/12 text-[#0071e3]' },
  deleted: { code: 'D', cls: 'bg-[#FF3B30]/15 text-[#C41E16]' },
  renamed: { code: 'R', cls: 'bg-[#5856D6]/15 text-[#5856D6]' }
}

export const CodexRightInspector: React.FC = () => {
  const {
    isInspectorOpen,
    inspectorTab,
    setInspectorTab,
    inspectorWidth,
    setInspectorWidth,
    isInspectorResizing,
    setIsInspectorResizing,
    terminalLogs,
    fileTree,
    selectedFilePreview,
    gitStatus,
    selectedDiffPreview,
    previewFile,
    closeFilePreview,
    previewGitDiff,
    closeDiffPreview,
    refreshFileTree,
    refreshGitStatus,
    setDraftComposerText,
    setWorkbenchSubView,
    openFileInBrowserPreview
  } = useAppStore()

  const [fileFilter, setFileFilter] = useState('')
  const [copiedFile, setCopiedFile] = useState(false)

  const filteredTree = useMemo(
    () => filterTreeNodes(fileTree, fileFilter),
    [fileTree, fileFilter]
  )

  const tabIndex =
    inspectorTab === 'terminal' ? 0 : inspectorTab === 'files' ? 1 : inspectorTab === 'changes' ? 2 : 3

  const handleReferenceInComposer = (relPath: string, extraInstruction?: string): void => {
    setWorkbenchSubView('chat')
    setDraftComposerText(
      extraInstruction
        ? `${extraInstruction} \`${relPath}\``
        : `请阅读并分析文件 \`${relPath}\`：`
    )
  }

  const handleStartResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsInspectorResizing(true)

    const onMouseMove = (ev: MouseEvent): void => {
      ev.preventDefault()
      // Since the inspector is docked on the right side of the window,
      // its width is directly window.innerWidth - ev.clientX.
      // This guarantees the border stays 100% glued beneath the mouse cursor with zero drift!
      const minW = 300
      const maxW = Math.min(1000, Math.max(500, window.innerWidth - 300))
      const targetWidth = Math.min(maxW, Math.max(minW, window.innerWidth - ev.clientX))
      setInspectorWidth(targetWidth)
    }

    const onMouseUp = (): void => {
      setIsInspectorResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <aside
      style={{
        width: isInspectorOpen ? `${inspectorWidth}px` : '0px'
      }}
      className={`border-l border-black/[0.07] bg-[#FBFBFD] flex flex-col overflow-hidden relative select-none ${
        isInspectorResizing
          ? 'transition-none'
          : 'transition-[width,opacity] duration-200 ease-apple-spring'
      } ${isInspectorOpen ? 'opacity-100' : 'opacity-0 border-l-0'}`}
    >
      {/* Fullscreen Transparent Overlay to prevent Webview/iFrame/Text from intercepting drag */}
      {isInspectorResizing && (
        <div
          className="fixed inset-0 z-[9999] cursor-col-resize select-none bg-transparent"
          style={{ cursor: 'col-resize' }}
        />
      )}

      {/* Draggable Resize Handle */}
      {isInspectorOpen && (
        <div
          onMouseDown={handleStartResize}
          className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-40 group flex items-center justify-center select-none"
          title="按住左右拖拽调整侧边检视器宽度"
        >
          <div
            className={`w-[2px] h-full transition-colors ${
              isInspectorResizing ? 'bg-[#0071e3]' : 'bg-transparent group-hover:bg-[#0071e3]/60'
            }`}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Top Segmented Apple Pill Header (4 Tabs: 终端 / 项目文件 / 变更 / 浏览) */}
        <div className="p-2.5 border-b border-black/[0.06]">
          <div className="relative grid grid-cols-4 p-0.5 rounded-full bg-[#EFEFF4] border border-black/[0.05]">
            <div
              className="apple-pill-slider absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/4)] rounded-full bg-white shadow-sm pointer-events-none"
              style={{
                transform: `translate3d(${tabIndex * 100}%, 0, 0)`
              }}
            />

            <button
              type="button"
              onClick={() => setInspectorTab('terminal')}
              className={`relative z-10 py-1 text-[10.5px] font-medium rounded-full flex items-center justify-center gap-1 transition-colors ${
                inspectorTab === 'terminal'
                  ? 'text-[#1d1d1f]'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Terminal className="w-3 h-3" />
              <span className="truncate">终端 ({terminalLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setInspectorTab('files')}
              className={`relative z-10 py-1 text-[10.5px] font-medium rounded-full flex items-center justify-center gap-1 transition-colors ${
                inspectorTab === 'files'
                  ? 'text-[#1d1d1f]'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <FolderTree className="w-3 h-3" />
              <span className="truncate">项目文件</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInspectorTab('changes')
                refreshGitStatus()
              }}
              className={`relative z-10 py-1 text-[10.5px] font-medium rounded-full flex items-center justify-center gap-1 transition-colors ${
                inspectorTab === 'changes'
                  ? 'text-[#1d1d1f]'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <GitCompareArrows className="w-3 h-3" />
              <span className="truncate">变更 ({gitStatus.changes.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setInspectorTab('preview')}
              className={`relative z-10 py-1 text-[10.5px] font-medium rounded-full flex items-center justify-center gap-1 transition-colors ${
                inspectorTab === 'preview'
                  ? 'text-[#1d1d1f]'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span className="truncate">浏览</span>
            </button>
          </div>
        </div>

        {/* TAB 1: REAL INTERACTIVE CODEX PTY TERMINAL (Kept mounted across tab switches so running TUI sessions like `claude` stay alive) */}
        <div
          className={
            inspectorTab === 'terminal'
              ? 'flex-1 flex flex-col overflow-hidden'
              : 'hidden'
          }
        >
          <CodexTerminalPanel isVisible={isInspectorOpen && inspectorTab === 'terminal'} />
        </div>

        {/* TAB 2: PROJECT FILES (Screenshot Clean Tree + Codex Code Viewer with Line Numbers & @Reference) */}
        {inspectorTab === 'files' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedFilePreview ? (
              <div className="flex-1 flex flex-col overflow-hidden bg-white animate-apple-view">
                {/* Breadcrumb & Quick Actions Bar */}
                <div className="px-3 py-2 bg-[#F5F5F7] border-b border-black/[0.06] flex items-center justify-between gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={closeFilePreview}
                    className="apple-press inline-flex items-center gap-1 text-[#0071e3] font-medium shrink-0"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>返回</span>
                  </button>

                  <span
                    className="font-mono text-[#1d1d1f] truncate flex-1 text-center"
                    title={selectedFilePreview.path}
                  >
                    {selectedFilePreview.path}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openFileInBrowserPreview(selectedFilePreview.path)}
                      title="在侧边浏览区交互预览此文件"
                      className="apple-press p-1 rounded-md hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#0071e3]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReferenceInComposer(selectedFilePreview.path)}
                      title="引用此文件到对话输入框"
                      className="apple-press p-1 rounded-md hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#0071e3]"
                    >
                      <AtSign className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedFilePreview.content)
                        setCopiedFile(true)
                        setTimeout(() => setCopiedFile(false), 1500)
                      }}
                      title="复制文件内容"
                      className="apple-press p-1 rounded-md hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#1d1d1f]"
                    >
                      {copiedFile ? (
                        <Check className="w-3.5 h-3.5 text-[#34C759]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Line-Numbered Codex Code Reader */}
                <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.65] py-2.5">
                  {selectedFilePreview.content.split('\n').map((line, i) => (
                    <div
                      key={i}
                      className="flex hover:bg-[#F5F5F7]/80 px-2"
                    >
                      <span className="w-9 pr-2.5 text-right text-[#aeaeb2] select-none shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-[#2c2c2e] whitespace-pre">{line || ' '}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Subtle Search & Refresh Bar */}
                <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className="w-3 h-3 text-[#86868b] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={fileFilter}
                      onChange={(e) => setFileFilter(e.target.value)}
                      placeholder="筛选项目文件..."
                      className="w-full pl-7 pr-2.5 py-1 rounded-lg bg-black/[0.035] focus:bg-white border border-transparent focus:border-black/[0.1] text-[11.5px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={refreshFileTree}
                    title="刷新目录树"
                    className="apple-press p-1.5 rounded-lg hover:bg-black/[0.05] text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex-1 p-2.5 overflow-y-auto">
                  <FileTreeRecursive
                    nodes={filteredTree}
                    forceExpand={Boolean(fileFilter.trim())}
                    onSelectFile={previewFile}
                    onOpenFileInPreview={openFileInBrowserPreview}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: CODEX GIT DIFF / REVIEW BROWSER */}
        {inspectorTab === 'changes' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedDiffPreview ? (
              <div className="flex-1 flex flex-col overflow-hidden bg-white animate-apple-view">
                <div className="px-3 py-2 bg-[#F5F5F7] border-b border-black/[0.06] flex items-center justify-between gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={closeDiffPreview}
                    className="apple-press inline-flex items-center gap-1 text-[#0071e3] font-medium shrink-0"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>变更列表</span>
                  </button>

                  <span className="font-mono text-[#1d1d1f] truncate flex-1 text-center">
                    {selectedDiffPreview.path}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handleReferenceInComposer(
                        selectedDiffPreview.path,
                        '请帮我 Code Review 以下文件的未提交 Git Diff 变更并检查潜在边界风险：'
                      )
                    }
                    className="apple-press px-2 py-0.5 rounded-md bg-[#0071e3]/10 text-[#0071e3] font-medium shrink-0"
                  >
                    AI 审查
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-2.5 font-mono text-[11px] leading-[1.6] bg-[#FBFBFD]">
                  {selectedDiffPreview.diff.split('\n').map((line, idx) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++')
                    const isDel = line.startsWith('-') && !line.startsWith('---')
                    const isHunk = line.startsWith('@@')
                    const cls = isAdd
                      ? 'bg-[#34C759]/14 text-[#177233]'
                      : isDel
                        ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                        : isHunk
                          ? 'bg-[#0071e3]/10 text-[#0071e3] my-1'
                          : 'text-[#6e6e73]'
                    return (
                      <div key={idx} className={`px-2 py-0.5 rounded-sm whitespace-pre ${cls}`}>
                        {line || ' '}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="px-3.5 py-2 border-b border-black/[0.05] flex items-center justify-between text-[11px] text-[#6e6e73]">
                  <span className="font-mono">
                    {gitStatus.isRepo ? `branch: ${gitStatus.branch}` : '本地非 Git 目录'}
                  </span>
                  <button
                    type="button"
                    onClick={refreshGitStatus}
                    className="apple-press inline-flex items-center gap-1 text-[#0071e3] font-medium"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>刷新</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
                  {!gitStatus.isRepo ? (
                    <div className="h-full flex items-center justify-center text-center px-6 text-[12px] text-[#86868b]">
                      当前文件夹尚未初始化 Git 仓库（可在终端执行 git init 开启变更追踪）
                    </div>
                  ) : gitStatus.changes.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center px-6 text-[12px] text-[#86868b]">
                      工作区干净，暂无未提交代码变更
                    </div>
                  ) : (
                    gitStatus.changes.map((chg) => {
                      const badge = STATUS_BADGE[chg.status]
                      return (
                        <button
                          key={chg.path}
                          type="button"
                          onClick={() => previewGitDiff(chg.path)}
                          className="apple-press w-full px-2.5 py-2 rounded-xl hover:bg-black/[0.045] flex items-center justify-between gap-2 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center shrink-0 ${badge.cls}`}
                            >
                              {badge.code}
                            </span>
                            <span className="font-mono text-[11.5px] text-[#1d1d1f] truncate">
                              {chg.path}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-[10.5px] shrink-0">
                            {chg.additions > 0 && (
                              <span className="text-[#177233]">+{chg.additions}</span>
                            )}
                            {chg.deletions > 0 && (
                              <span className="text-[#C41E16]">-{chg.deletions}</span>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 4: CODEX INTERACTIVE BROWSER & DOCUMENT PREVIEW */}
        {inspectorTab === 'preview' && <CodexBrowserPreview />}
      </div>
    </aside>
  )
}
