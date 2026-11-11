import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import {
  Plus,
  X,
  RotateCcw,
  Trash2,
  FolderOpen,
  Sparkles,
  Sun,
  Moon,
  Terminal as TerminalIcon,
  ScrollText,
  Square
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PtySessionInfo, StreamUpdatePayload } from '@shared/types'
import { maskSensitiveSecrets } from '@shared/secretMasker'

interface ClientPtyInstance {
  info: PtySessionInfo
  term: XTerm
  fitAddon: FitAddon
  containerEl: HTMLDivElement | null
  mounted: boolean
}

const DARK_TERMINAL_THEME: ITheme = {
  background: '#141417',
  foreground: '#ECECEF',
  cursor: '#D97757',
  cursorAccent: '#141417',
  selectionBackground: 'rgba(217, 119, 87, 0.32)',
  selectionForeground: '#FFFFFF',
  black: '#1E1E24',
  red: '#FF5F56',
  green: '#27C93F',
  yellow: '#FFBD2E',
  blue: '#409CFF',
  magenta: '#BF5AF2',
  cyan: '#5AC8FA',
  white: '#E5E5EA',
  brightBlack: '#636366',
  brightRed: '#FF6961',
  brightGreen: '#30D158',
  brightYellow: '#FFD60A',
  brightBlue: '#64D2FF',
  brightMagenta: '#DA8FFF',
  brightCyan: '#70D7FF',
  brightWhite: '#FFFFFF'
}

const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#FBFBFD',
  foreground: '#1D1D1F',
  cursor: '#D97757',
  cursorAccent: '#FBFBFD',
  selectionBackground: 'rgba(0, 113, 227, 0.22)',
  selectionForeground: '#1D1D1F',
  black: '#1D1D1F',
  red: '#D70015',
  green: '#177233',
  yellow: '#B25000',
  blue: '#0071E3',
  magenta: '#8944AB',
  cyan: '#0071A4',
  white: '#86868B',
  brightBlack: '#6E6E73',
  brightRed: '#FF3B30',
  brightGreen: '#28CD41',
  brightYellow: '#FF9500',
  brightBlue: '#007AFF',
  brightMagenta: '#AF52DE',
  brightCyan: '#32ADE6',
  brightWhite: '#1D1D1F'
}

const TERMINAL_THEME_STORAGE_KEY = 'codex_pty_terminal_theme_v1'

function getSessionTabLabel(session: PtySessionInfo, index: number): string {
  const shellLabel = session.shell || 'zsh'
  const rawTitle = session.title?.trim()
  const escapedShell = shellLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (rawTitle && !new RegExp(`^${escapedShell}\\s*#\\d+$`, 'i').test(rawTitle)) {
    return rawTitle
  }
  return `${shellLabel} #${index + 1}`
}

export const CodexTerminalPanel: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  const { config, terminalLogs, clearTerminalLogs, isInspectorResizing, inspectorWidth } =
    useAppStore()

  const [sessions, setSessions] = useState<PtySessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [subMode, setSubMode] = useState<'pty' | 'agent-logs'>('pty')
  const [bridgeMissingPty, setBridgeMissingPty] = useState<boolean>(false)
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_THEME_STORAGE_KEY)
      return saved ? saved === 'dark' : true
    } catch {
      return true
    }
  })

  const instancesRef = useRef<Map<string, ClientPtyInstance>>(new Map())
  const viewportHostRef = useRef<HTMLDivElement | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const sessionsRef = useRef<PtySessionInfo[]>([])
  const closingIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef<boolean>(false)
  const lastSyncedWorkspaceRef = useRef<string>('')

  activeSessionIdRef.current = activeSessionId
  sessionsRef.current = sessions

  const fitSession = useCallback((sessionId: string) => {
    const inst = instancesRef.current.get(sessionId)
    if (!inst || !inst.mounted || !inst.containerEl) return
    if (inst.containerEl.clientWidth < 20 || inst.containerEl.clientHeight < 20) return
    try {
      inst.fitAddon.fit()
      const cols = inst.term.cols
      const rows = inst.term.rows
      if (cols >= 10 && rows >= 2) {
        window.claudeDesktop?.resizePty?.({ id: sessionId, cols, rows })
      }
    } catch {
      // ignore layout transient errors
    }
  }, [])

  const createClientXterm = useCallback(
    (info: PtySessionInfo, dark: boolean): ClientPtyInstance => {
      const existing = instancesRef.current.get(info.id)
      if (existing) {
        existing.info = info
        return existing
      }

      const term = new XTerm({
        cursorBlink: true,
        cursorStyle: 'bar',
        cursorWidth: 2,
        fontFamily:
          '"SF Mono", "JetBrains Mono", "Menlo", "Monaco", "PingFang SC", ui-monospace, monospace',
        fontSize: 12,
        lineHeight: 1.28,
        letterSpacing: 0,
        allowProposedApi: true,
        scrollback: 5000,
        macOptionIsMeta: true,
        macOptionClickForcesSelection: true,
         convertEol: false,
        theme: dark ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
      })

      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon((_event, uri) => {
        window.claudeDesktop?.openInBrowser?.({ browserId: 'default', url: uri })
      })

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)

      // Handle Cmd+C copy when selection exists, Cmd+K clear
      term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
        if (ev.type !== 'keydown') return true
        const isMeta = ev.metaKey || ev.ctrlKey
        if (isMeta && ev.key.toLowerCase() === 'c' && term.hasSelection()) {
          const selected = term.getSelection()
          if (selected) {
            navigator.clipboard?.writeText(selected).catch(() => {})
            term.clearSelection()
            return false
          }
        }
        if (ev.metaKey && ev.key.toLowerCase() === 'k') {
          term.clear()
          return false
        }
        return true
      })

      term.onData((data) => {
        window.claudeDesktop?.writePty?.({ id: info.id, data })
      })

      const inst: ClientPtyInstance = {
        info,
        term,
        fitAddon,
        containerEl: null,
        mounted: false
      }

      if (info.replayBuffer) {
        term.write(info.replayBuffer)
      }

      instancesRef.current.set(info.id, inst)
      return inst
    },
    []
  )

  const spawnNewSession = useCallback(
    async (options?: { cwd?: string; initialCommand?: string; title?: string }) => {
      if (!window.claudeDesktop?.createPty) {
        setBridgeMissingPty(true)
        return null
      }
      setBridgeMissingPty(false)
      const cwd = options?.cwd || config?.workspaceDir || undefined
      const info = await window.claudeDesktop.createPty({
        cwd,
        cols: 88,
        rows: 26,
        title: options?.title,
        initialCommand: options?.initialCommand
      })
      createClientXterm(info, isDarkTheme)
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== info.id)
        return [...filtered, info]
      })
      setActiveSessionId(info.id)
      setSubMode('pty')
      setTimeout(() => {
        fitSession(info.id)
        instancesRef.current.get(info.id)?.term.focus()
      }, 60)
      return info
    },
    [config?.workspaceDir, createClientXterm, fitSession, isDarkTheme]
  )

  // Initialize or restore PTY sessions on mount
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const init = async (): Promise<void> => {
      try {
        const existingList = (await window.claudeDesktop?.listPty?.()) || []
        const alive = existingList.filter((s) => !s.exited)
        if (alive.length > 0) {
          for (const s of alive) {
            createClientXterm(s, isDarkTheme)
          }
          setSessions(alive)
          setActiveSessionId(alive[alive.length - 1].id)
          setTimeout(() => {
            const targetId = alive[alive.length - 1].id
            fitSession(targetId)
          }, 80)
        } else {
          await spawnNewSession({ cwd: config?.workspaceDir })
        }
      } catch {
        await spawnNewSession({ cwd: config?.workspaceDir })
      }
    }

    init()
  }, [config?.workspaceDir, createClientXterm, fitSession, isDarkTheme, spawnNewSession])

  // Subscribe to backend PTY stream events (pty_data / pty_exit)
  useEffect(() => {
    if (!window.claudeDesktop?.onStreamUpdate) return
    const unsub = window.claudeDesktop.onStreamUpdate((payload: StreamUpdatePayload) => {
      if (payload.type === 'pty_data' && payload.ptyData) {
        const { sessionId, data } = payload.ptyData
        const inst = instancesRef.current.get(sessionId)
        if (inst) {
          inst.term.write(data)
        }
      } else if (payload.type === 'pty_exit' && payload.ptyExit) {
        const { sessionId, exitCode } = payload.ptyExit
        const inst = instancesRef.current.get(sessionId)
        if (inst) {
          inst.info = { ...inst.info, exited: true, exitCode }
          inst.term.write(
            `\r\n\x1b[90m[进程已退出，退出码: ${exitCode ?? 0} · 点击上方「重启」可开启新会话]\x1b[0m\r\n`
          )
        }
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, exited: true, exitCode } : s))
        )
      }
    })
    return () => unsub()
  }, [])

  // Sync theme changes across all xterm instances
  useEffect(() => {
    try {
      localStorage.setItem(TERMINAL_THEME_STORAGE_KEY, isDarkTheme ? 'dark' : 'light')
    } catch {
      // ignore
    }
    const nextTheme = isDarkTheme ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
    for (const inst of instancesRef.current.values()) {
      inst.term.options.theme = nextTheme
    }
  }, [isDarkTheme])

  // Auto-sync workspace directory when user switches project folder in sidebar
  useEffect(() => {
    const ws = config?.workspaceDir
    if (!ws) return
    if (!lastSyncedWorkspaceRef.current) {
      lastSyncedWorkspaceRef.current = ws
      return
    }
    if (lastSyncedWorkspaceRef.current !== ws) {
      lastSyncedWorkspaceRef.current = ws
      const currentId = activeSessionIdRef.current
      if (currentId) {
        const escaped = ws.replace(/(["\\$`])/g, '\\$1')
        window.claudeDesktop?.writePty?.({
          id: currentId,
          data: `cd "${escaped}"\r`
        })
        setSessions((prev) =>
          prev.map((s) => (s.id === currentId ? { ...s, cwd: ws } : s))
        )
      }
    }
  }, [config?.workspaceDir])

  // Refit active terminal when visibility, active session, or inspector width changes
  useEffect(() => {
    if (!isVisible || subMode !== 'pty' || !activeSessionId) return
    const timer = setTimeout(() => {
      fitSession(activeSessionId)
      instancesRef.current.get(activeSessionId)?.term.focus()
    }, 40)
    return () => clearTimeout(timer)
  }, [isVisible, subMode, activeSessionId, inspectorWidth, isInspectorResizing, fitSession])

  // ResizeObserver on the terminal host container
  useEffect(() => {
    const el = viewportHostRef.current
    if (!el) return
    let rafId: number | null = null
    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (activeSessionIdRef.current) {
          fitSession(activeSessionIdRef.current)
        }
      })
    })
    ro.observe(el)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [fitSession])

  const handleCloseSession = async (sessionId: string, e?: React.MouseEvent): Promise<void> => {
    e?.stopPropagation()
    if (sessionsRef.current.length <= 1 || closingIdsRef.current.has(sessionId)) return
    const nonClosingRemaining = sessionsRef.current.filter(
      (s) => s.id !== sessionId && !closingIdsRef.current.has(s.id)
    )
    if (nonClosingRemaining.length === 0) return

    closingIdsRef.current.add(sessionId)
    try {
      await window.claudeDesktop?.killPty?.(sessionId)
      const inst = instancesRef.current.get(sessionId)
      if (inst) {
        try {
          inst.term.dispose()
        } catch {
          // ignore
        }
        instancesRef.current.delete(sessionId)
      }

      const remainingSnapshot = sessionsRef.current.filter((s) => s.id !== sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionIdRef.current === sessionId && remainingSnapshot.length > 0) {
        setActiveSessionId(remainingSnapshot[remainingSnapshot.length - 1].id)
      }
    } finally {
      closingIdsRef.current.delete(sessionId)
    }
  }

  const handleRestartActiveSession = async (): Promise<void> => {
    if (!activeSessionId) {
      await spawnNewSession({ cwd: config?.workspaceDir })
      return
    }
    const oldId = activeSessionId
    await window.claudeDesktop?.killPty?.(oldId)
    const inst = instancesRef.current.get(oldId)
    if (inst) {
      try {
        inst.term.dispose()
      } catch {
        // ignore
      }
      instancesRef.current.delete(oldId)
    }
    setSessions((prev) => prev.filter((s) => s.id !== oldId))
    await spawnNewSession({ cwd: config?.workspaceDir })
  }

  const handleLaunchClaudeCli = async (): Promise<void> => {
    setSubMode('pty')
    const current = sessions.find((s) => s.id === activeSessionId)
    if (!activeSessionId || !current || current.exited) {
      await spawnNewSession({
        cwd: config?.workspaceDir,
        initialCommand: 'claude',
        title: 'claude'
      })
      return
    }
    window.claudeDesktop?.writePty?.({ id: activeSessionId, data: 'claude\r' })
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, title: 'claude' } : s))
    )
    setTimeout(() => {
      fitSession(activeSessionId)
      instancesRef.current.get(activeSessionId)?.term.focus()
    }, 30)
  }

  const handleCdWorkspace = (): void => {
    if (!activeSessionId || !config?.workspaceDir) return
    const escaped = config.workspaceDir.replace(/(["\\$`])/g, '\\$1')
    window.claudeDesktop?.writePty?.({
      id: activeSessionId,
      data: `cd "${escaped}" && pwd\r`
    })
    instancesRef.current.get(activeSessionId)?.term.focus()
  }

  const handleSendCtrlC = (): void => {
    if (!activeSessionId) return
    window.claudeDesktop?.writePty?.({ id: activeSessionId, data: '\x03' })
    instancesRef.current.get(activeSessionId)?.term.focus()
  }

  const handleClearActiveTerminal = (): void => {
    if (subMode === 'agent-logs') {
      clearTerminalLogs()
      return
    }
    if (!activeSessionId) return
    const inst = instancesRef.current.get(activeSessionId)
    if (inst) {
      inst.term.clear()
      window.claudeDesktop?.writePty?.({ id: activeSessionId, data: '\x0c' })
      inst.term.focus()
    }
  }

  const workspaceName = config?.workspaceDir
    ? config.workspaceDir.split(/[/\\]/).filter(Boolean).pop() || config.workspaceDir
    : '当前工作区'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F9F9FB]">
      {/* Row 1: Codex Multi-Terminal Session Tabs & Mode Switcher */}
      <div className="px-2 py-1.5 bg-[#F2F2F7] border-b border-black/[0.06] flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 flex-1">
          {sessions.map((s, idx) => {
            const isSelected = subMode === 'pty' && s.id === activeSessionId
            return (
              <div
                key={s.id}
                onClick={() => {
                  setSubMode('pty')
                  setActiveSessionId(s.id)
                }}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono cursor-pointer transition-all shrink-0 ${
                  isSelected
                    ? 'bg-white text-[#1d1d1f] shadow-sm border border-black/[0.06] font-medium'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.04]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    s.exited ? 'bg-[#8e8e93]' : 'bg-[#34c759]'
                  }`}
                />
                <span className="truncate max-w-[92px]">{getSessionTabLabel(s, idx)}</span>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseSession(s.id, e)}
                    title="关闭此终端会话"
                    className="opacity-60 group-hover:opacity-100 hover:text-[#ff3b30] p-0.5 rounded transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => spawnNewSession({ cwd: config?.workspaceDir })}
            title="在当前项目文件夹下新建一个独立 PTY 终端会话"
            className="apple-press p-1 rounded-lg text-[#6e6e73] hover:text-[#0071e3] hover:bg-white/80 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Switch to AI Command Logs if needed */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSubMode(subMode === 'pty' ? 'agent-logs' : 'pty')}
            title={
              subMode === 'pty'
                ? '查看主对话 AI 自动执行的命令输出日志'
                : '返回真实交互式 PTY 终端'
            }
            className={`apple-press px-2 py-1 rounded-lg text-[10.5px] font-medium flex items-center gap-1 transition-colors ${
              subMode === 'agent-logs'
                ? 'bg-[#0071e3] text-white shadow-sm'
                : 'bg-black/[0.045] text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            {subMode === 'agent-logs' ? (
              <>
                <TerminalIcon className="w-3 h-3" />
                <span>返回终端</span>
              </>
            ) : (
              <>
                <ScrollText className="w-3 h-3" />
                <span>AI 日志 ({terminalLogs.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Codex Quick Actions Toolbar (Claude CLI Launcher + Workspace Sync + Controls) */}
      <div className="px-2.5 py-1 bg-[#F7F7FA] border-b border-black/[0.05] flex items-center justify-between gap-1.5 text-[10.5px]">
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={handleLaunchClaudeCli}
            title="在真实 PTY 终端中一键启动 Claude Code 交互式命令行（小机器人界面）"
            className="apple-press px-2 py-0.5 rounded-md bg-[#D97757]/12 hover:bg-[#D97757]/20 text-[#C45B38] font-medium flex items-center gap-1 shrink-0 border border-[#D97757]/20"
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>✳ 启动 Claude</span>
          </button>

          <button
            type="button"
            onClick={handleCdWorkspace}
            title={`点击切换到当前项目文件夹: ${config?.workspaceDir || ''}`}
            className="apple-press px-2 py-0.5 rounded-md bg-black/[0.04] hover:bg-black/[0.08] text-[#48484a] font-mono flex items-center gap-1 truncate max-w-[150px]"
          >
            <FolderOpen className="w-2.5 h-2.5 text-[#0071e3] shrink-0" />
            <span className="truncate">{workspaceName}</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {subMode === 'pty' && (
            <>
              <button
                type="button"
                onClick={handleSendCtrlC}
                title="发送 Ctrl+C (SIGINT) 中断当前运行中的终端程序"
                className="apple-press px-1.5 py-0.5 rounded hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#ff3b30] flex items-center gap-0.5"
              >
                <Square className="w-2.5 h-2.5" />
                <span>^C</span>
              </button>

              <button
                type="button"
                onClick={handleRestartActiveSession}
                title="重启当前 PTY 终端会话"
                className="apple-press p-1 rounded hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#1d1d1f]"
              >
                <RotateCcw className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => setIsDarkTheme((prev) => !prev)}
                title={isDarkTheme ? '切换为浅色终端主题' : '切换为深色终端主题'}
                className="apple-press p-1 rounded hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#1d1d1f]"
              >
                {isDarkTheme ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleClearActiveTerminal}
            title="清空当前终端屏幕"
            className="apple-press p-1 rounded hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#ff3b30]"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Terminal Viewport Area */}
      <div
        ref={viewportHostRef}
        className={`flex-1 relative overflow-hidden ${
          subMode === 'pty'
            ? isDarkTheme
              ? 'bg-[#141417]'
              : 'bg-[#FBFBFD]'
            : 'bg-[#F9F9FB]'
        }`}
      >
        {/* Real Interactive PTY Xterm Instances */}
        <div
          className={
            subMode === 'pty' ? 'w-full h-full relative overflow-hidden' : 'hidden'
          }
        >
          {bridgeMissingPty ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-2.5 text-[#86868b]">
              <TerminalIcon className="w-6 h-6 text-[#D97757]" />
              <div className="text-[12.5px] font-medium text-[#ECECEF]">
                真实 PTY 伪终端底层已就绪，需重启一次 Electron 主进程生效
              </div>
              <div className="text-[11px] text-[#8e8e93] max-w-[260px] leading-relaxed">
                因为新增了底层系统级 PTY 通道，请在启动本项目的终端中按 Ctrl+C 停止并重新执行{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/10 text-[#D97757] font-mono">
                  npm run dev
                </code>
              </div>
            </div>
          ) : (
            sessions.map((s) => {
              const isCurrent = s.id === activeSessionId
              return (
                <div
                  key={s.id}
                  ref={(el) => {
                    const inst = instancesRef.current.get(s.id)
                    if (el && inst) {
                      inst.containerEl = el
                      if (!inst.mounted) {
                        inst.term.open(el)
                        inst.mounted = true
                        setTimeout(() => fitSession(s.id), 30)
                      }
                    }
                  }}
                  onClick={() => {
                    instancesRef.current.get(s.id)?.term.focus()
                  }}
                  className={`codex-xterm-container w-full h-full px-2 py-1.5 ${
                    isCurrent ? 'block' : 'hidden'
                  }`}
                />
              )
            })
          )}
        </div>

        {/* AI Agent Execution Logs Sub-View */}
        {subMode === 'agent-logs' && (
          <div className="w-full h-full p-3.5 font-mono text-[11px] overflow-y-auto space-y-1 bg-[#F9F9FB]">
            {terminalLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#86868b] text-[12px] text-center px-6 gap-2">
                <span>当主对话 AI 调用 Bash 工具执行命令时，实时输出将在此记录</span>
                <button
                  type="button"
                  onClick={() => setSubMode('pty')}
                  className="mt-1 px-3 py-1 rounded-full bg-[#0071e3]/10 text-[#0071e3] text-[11px] font-sans font-medium"
                >
                  切回真实交互式 PTY 终端
                </button>
              </div>
            ) : (
              terminalLogs.map((item) => (
                <div
                  key={item.id}
                  className={`whitespace-pre-wrap break-all leading-relaxed ${
                    item.stream === 'stderr' ? 'text-[#C96A00]' : 'text-[#1d1d1f]'
                  }`}
                >
                  {maskSensitiveSecrets(item.text)}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
