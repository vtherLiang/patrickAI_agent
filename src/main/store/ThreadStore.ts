import fs from 'fs'
import os from 'os'
import path from 'path'

export interface StoredThreadRecord {
  id: string
  title: string
  workspaceDir: string
  messages: unknown[]
  sideChatMessages?: unknown[]
  sideChatUpdatedAt?: number
  sideChatExpired?: boolean
  isSideChatOpen?: boolean
  status: 'idle' | 'running' | 'waiting_approval' | 'completed'
  pinned: boolean
  updatedAt: number
  toolCount: number
}

/**
 * Persistent disk-backed storage for Codex conversation threads.
 * Stored in `~/.patrick-ai-agent/threads.json` so conversations survive
 * across Vite dev port shifts (5173/5174), Electron `file://` packaged builds,
 * preview mode, and standalone web mode (unlike Origin-bound `localStorage`).
 */
export class ThreadStore {
  private storageDir: string
  private filePath: string

  constructor(baseDir?: string) {
    this.storageDir = baseDir || path.join(os.homedir(), '.patrick-ai-agent')
    this.filePath = path.join(this.storageDir, 'threads.json')
    this.ensureDir()
  }

  private ensureDir(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
    } catch {
      // ignore
    }
  }

  loadThreads(): StoredThreadRecord[] {
    try {
      if (!fs.existsSync(this.filePath)) return []
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      if (!raw.trim()) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is StoredThreadRecord =>
            Boolean(item && typeof item === 'object' && typeof item.id === 'string')
        )
      }
    } catch (err) {
      console.error('Failed to load threads from disk:', err)
    }
    return []
  }

  saveThreads(threads: StoredThreadRecord[]): boolean {
    if (!Array.isArray(threads)) return false
    this.ensureDir()
    const sliced = threads.slice(0, 80)
    const tmpPath = `${this.filePath}.tmp`
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(sliced), 'utf-8')
      fs.renameSync(tmpPath, this.filePath)
      return true
    } catch (err) {
      console.error('Failed to save threads to disk:', err)
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      } catch {
        // ignore
      }
      return false
    }
  }
}
