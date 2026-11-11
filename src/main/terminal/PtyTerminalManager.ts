import fs from 'fs'
import os from 'os'
import path from 'path'
import { ChildProcess, spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { Writable } from 'stream'
import { PtySessionInfo, StreamUpdatePayload } from '@shared/types'

interface ManagedPtySession {
  info: PtySessionInfo
  process: ChildProcess
  controlPipe: Writable | null
  decoder: StringDecoder
  replayBuffer: string
}

const MAX_REPLAY_CHARS = 96 * 1024

const PYTHON_PTY_BRIDGE_SCRIPT = `
import pty, os, sys, select, subprocess, fcntl, termios, struct, signal, json, errno

cols = max(10, int(os.environ.get("PATRICK_PTY_COLS", "80")))
rows = max(2, int(os.environ.get("PATRICK_PTY_ROWS", "24")))
shell_bin = os.environ.get("PATRICK_PTY_SHELL", "/bin/zsh")
shell_args_raw = os.environ.get("PATRICK_PTY_SHELL_ARGS", '["-il"]')
try:
    shell_args = json.loads(shell_args_raw)
except Exception:
    shell_args = ["-il"]

master, slave = pty.openpty()
try:
    ws = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, ws)
except Exception:
    pass

def setup_ctty():
    os.setsid()
    try:
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)
    except Exception:
        pass

child_env = os.environ.copy()
for k in ["PATRICK_PTY_COLS", "PATRICK_PTY_ROWS", "PATRICK_PTY_SHELL", "PATRICK_PTY_SHELL_ARGS", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ATTACH_CONSOLE"]:
    child_env.pop(k, None)

proc = subprocess.Popen(
    [shell_bin] + shell_args,
    stdin=slave,
    stdout=slave,
    stderr=slave,
    cwd=os.getcwd(),
    env=child_env,
    close_fds=True,
    preexec_fn=setup_ctty
)
os.close(slave)

def cleanup_proc(*_args):
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGHUP)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass
    sys.exit(0)

signal.signal(signal.SIGTERM, cleanup_proc)
signal.signal(signal.SIGINT, cleanup_proc)

ctrl_buf = b""
fds = [master, 0, 3]

while True:
    try:
        r, _, _ = select.select(fds, [], [], 0.25)
    except select.error as e:
        if e.args and e.args[0] == errno.EINTR:
            continue
        break
    except ValueError:
        break

    if master in r:
        try:
            data = os.read(master, 32768)
            if not data:
                break
            os.write(1, data)
        except OSError:
            break

    if 0 in r:
        try:
            data = os.read(0, 32768)
            if not data:
                fds.remove(0)
            else:
                os.write(master, data)
        except OSError:
            if 0 in fds:
                fds.remove(0)

    if 3 in r:
        try:
            chunk = os.read(3, 4096)
            if not chunk:
                fds.remove(3)
            else:
                ctrl_buf += chunk
                while b"\\n" in ctrl_buf:
                    line, ctrl_buf = ctrl_buf.split(b"\\n", 1)
                    if not line.strip():
                        continue
                    try:
                        msg = json.loads(line.decode("utf-8", errors="ignore"))
                        mtype = msg.get("type")
                        if mtype == "resize":
                            nr = max(2, int(msg.get("rows", 24)))
                            nc = max(10, int(msg.get("cols", 80)))
                            ws = struct.pack("HHHH", nr, nc, 0, 0)
                            fcntl.ioctl(master, termios.TIOCSWINSZ, ws)
                            try:
                                os.killpg(os.getpgid(proc.pid), signal.SIGWINCH)
                            except OSError:
                                pass
                        elif mtype == "kill":
                            cleanup_proc()
                    except Exception:
                        pass
        except OSError:
            if 3 in fds:
                fds.remove(3)

    if proc.poll() is not None:
        # Drain any remaining bytes on master fd
        while True:
            try:
                rr, _, _ = select.select([master], [], [], 0.02)
                if not rr:
                    break
                rem = os.read(master, 32768)
                if not rem:
                    break
                os.write(1, rem)
            except OSError:
                break
        break

try:
    os.close(master)
except OSError:
    pass

ret = proc.poll()
sys.exit(ret if ret is not None else 0)
`

function resolvePython3Binary(): string | null {
  if (process.platform === 'win32') return null
  const candidates = [
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/bin/python3'
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function resolveInteractiveShell(): { shell: string; args: string[]; label: string } {
  if (process.platform === 'win32') {
    return {
      shell: 'powershell.exe',
      args: ['-NoLogo', '-NoExit'],
      label: 'powershell'
    }
  }

  const envShell = process.env.SHELL
  if (envShell && fs.existsSync(envShell)) {
    return {
      shell: envShell,
      args: ['-il'],
      label: path.basename(envShell)
    }
  }

  if (fs.existsSync('/bin/zsh')) {
    return {
      shell: '/bin/zsh',
      args: ['-il'],
      label: 'zsh'
    }
  }

  if (fs.existsSync('/bin/bash')) {
    return {
      shell: '/bin/bash',
      args: ['-il'],
      label: 'bash'
    }
  }

  return {
    shell: '/bin/sh',
    args: ['-i'],
    label: 'sh'
  }
}

function buildEnrichedPath(): string {
  const home = os.homedir()
  const extraDirs: string[] = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, 'go', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, 'Library', 'pnpm')
  ]

  // Check NVM node versions so `node`, `npm`, `claude` installed under nvm are always in PATH
  const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node')
  try {
    if (fs.existsSync(nvmVersionsDir)) {
      const versions = fs.readdirSync(nvmVersionsDir).sort()
      const latest = versions[versions.length - 1]
      if (latest) {
        extraDirs.unshift(path.join(nvmVersionsDir, latest, 'bin'))
      }
    }
  } catch {
    // ignore
  }

  const currentParts = (process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin').split(path.delimiter)
  const merged = new Set<string>([...extraDirs, ...currentParts])
  return Array.from(merged).filter(Boolean).join(path.delimiter)
}

export class PtyTerminalManager {
  private sessions = new Map<string, ManagedPtySession>()
  private counter = 0

  constructor(private broadcast: (payload: StreamUpdatePayload) => void) {}

  createSession(options?: {
    id?: string
    title?: string
    cwd?: string
    cols?: number
    rows?: number
    initialCommand?: string
  }): PtySessionInfo {
    const existingId = options?.id
    if (existingId && this.sessions.has(existingId)) {
      const existing = this.sessions.get(existingId)!
      if (!existing.info.exited) {
        return {
          ...existing.info,
          replayBuffer: existing.replayBuffer
        }
      }
      this.sessions.delete(existingId)
    }

    this.counter += 1
    const sessionId = existingId || `pty_${Date.now()}_${this.counter}`
    const cols = Math.max(10, Math.floor(options?.cols || 88))
    const rows = Math.max(2, Math.floor(options?.rows || 26))

    let targetCwd = options?.cwd?.trim() || process.cwd()
    try {
      if (!fs.existsSync(targetCwd) || !fs.statSync(targetCwd).isDirectory()) {
        targetCwd = os.homedir()
      }
    } catch {
      targetCwd = os.homedir()
    }

    const { shell, args, label } = resolveInteractiveShell()
    const title = options?.title || `${label} #${this.counter}`

    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v
    }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ATTACH_CONSOLE

    env.PATH = buildEnrichedPath()
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    env.TERM_PROGRAM = 'ClaudeCodeStudio'
    env.LANG = env.LANG || 'zh_CN.UTF-8'

    const python3Bin = resolvePython3Binary()
    let child: ChildProcess
    let controlPipe: Writable | null = null

    if (python3Bin) {
      child = spawn(python3Bin, ['-u', '-c', PYTHON_PTY_BRIDGE_SCRIPT], {
        cwd: targetCwd,
        env: {
          ...env,
          PATRICK_PTY_COLS: String(cols),
          PATRICK_PTY_ROWS: String(rows),
          PATRICK_PTY_SHELL: shell,
          PATRICK_PTY_SHELL_ARGS: JSON.stringify(args)
        },
        stdio: ['pipe', 'pipe', 'pipe', 'pipe']
      })
      controlPipe = (child.stdio[3] as Writable) || null
    } else if (process.platform !== 'win32' && fs.existsSync('/usr/bin/script')) {
      child = spawn('/usr/bin/script', ['-q', '/dev/null', shell, ...args], {
        cwd: targetCwd,
        env
      })
    } else {
      child = spawn(shell, args, {
        cwd: targetCwd,
        env
      })
    }

    const info: PtySessionInfo = {
      id: sessionId,
      title,
      cwd: targetCwd,
      shell: label,
      pid: child.pid,
      cols,
      rows,
      createdAt: Date.now(),
      exited: false,
      exitCode: null
    }

    const managed: ManagedPtySession = {
      info,
      process: child,
      controlPipe,
      decoder: new StringDecoder('utf-8'),
      replayBuffer: ''
    }

    this.sessions.set(sessionId, managed)

    const handleChunk = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : managed.decoder.write(chunk)
      if (!text) return
      managed.replayBuffer += text
      if (managed.replayBuffer.length > MAX_REPLAY_CHARS) {
        managed.replayBuffer = managed.replayBuffer.slice(-MAX_REPLAY_CHARS)
      }
      this.broadcast({
        type: 'pty_data',
        ptyData: {
          sessionId,
          data: text
        }
      })
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', handleChunk)

    child.on('close', (code) => {
      const rem = managed.decoder.end()
      if (rem) {
        managed.replayBuffer += rem
        this.broadcast({
          type: 'pty_data',
          ptyData: {
            sessionId,
            data: rem
          }
        })
      }
      managed.info.exited = true
      managed.info.exitCode = code
      this.broadcast({
        type: 'pty_exit',
        ptyExit: {
          sessionId,
          exitCode: code
        }
      })
    })

    child.on('error', (err) => {
      const errMsg = `\r\n\x1b[31m[终端进程启动异常: ${err.message}]\x1b[0m\r\n`
      managed.replayBuffer += errMsg
      this.broadcast({
        type: 'pty_data',
        ptyData: {
          sessionId,
          data: errMsg
        }
      })
    })

    if (options?.initialCommand) {
      setTimeout(() => {
        this.write(sessionId, `${options.initialCommand}\r`)
      }, 250)
    }

    return {
      ...info,
      replayBuffer: managed.replayBuffer
    }
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.exited || !session.process.stdin?.writable) {
      return false
    }
    try {
      session.process.stdin.write(data)
      return true
    } catch {
      return false
    }
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.exited) return false
    const safeCols = Math.max(10, Math.floor(cols || 80))
    const safeRows = Math.max(2, Math.floor(rows || 24))
    session.info.cols = safeCols
    session.info.rows = safeRows

    if (session.controlPipe && session.controlPipe.writable) {
      try {
        session.controlPipe.write(
          JSON.stringify({ type: 'resize', cols: safeCols, rows: safeRows }) + '\n'
        )
        return true
      } catch {
        return false
      }
    }
    return false
  }

  kill(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    this.sessions.delete(sessionId)
    try {
      if (session.controlPipe && session.controlPipe.writable) {
        session.controlPipe.write(JSON.stringify({ type: 'kill' }) + '\n')
      }
      session.process.kill('SIGTERM')
    } catch {
      // ignore
    }
    return true
  }

  listSessions(): PtySessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      ...s.info,
      replayBuffer: s.replayBuffer
    }))
  }

  disposeAll(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.kill(id)
    }
  }
}
