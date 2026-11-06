import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { GitFileChange, GitStatusSummary } from '@shared/types'

export class GitInspector {
  static getStatusSummary(workspaceDir: string): GitStatusSummary {
    try {
      if (!fs.existsSync(workspaceDir)) {
        return { branch: 'local', isRepo: false, changes: [] }
      }
      const isInside = execSync('git rev-parse --is-inside-work-tree', {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000
      }).trim()
      if (isInside !== 'true') {
        return { branch: 'local', isRepo: false, changes: [] }
      }

      let branch = 'main'
      try {
        branch =
          execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: workspaceDir,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 1500
          }).trim() || 'HEAD'
      } catch {
        branch = 'HEAD (unborn)'
      }

      // Parse numstat for additions/deletions
      const numstatMap = new Map<string, { add: number; del: number }>()
      try {
        const numstat = execSync('git diff HEAD --numstat 2>/dev/null || git diff --numstat', {
          cwd: workspaceDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 2500
        })
        for (const line of numstat.split('\n')) {
          const parts = line.trim().split('\t')
          if (parts.length >= 3) {
            const add = Number(parts[0]) || 0
            const del = Number(parts[1]) || 0
            const file = parts.slice(2).join('\t')
            numstatMap.set(file, { add, del })
          }
        }
      } catch {
        // ignore
      }

      const porcelain = execSync('git status --porcelain -uall', {
        cwd: workspaceDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000
      })

      const changes: GitFileChange[] = []
      for (const rawLine of porcelain.split('\n')) {
        if (!rawLine || rawLine.length < 3) continue
        const x = rawLine[0]
        const y = rawLine[1]
        const filePath = rawLine.slice(3).trim().replace(/^"|"$/g, '')
        if (!filePath || filePath.startsWith('.claude-desktop/')) continue

        let status: GitFileChange['status'] = 'modified'
        if (x === '?' || y === '?') status = 'untracked'
        else if (x === 'A' || y === 'A') status = 'added'
        else if (x === 'D' || y === 'D') status = 'deleted'
        else if (x === 'R' || y === 'R') status = 'renamed'

        let stat = numstatMap.get(filePath)
        if (!stat && status === 'untracked') {
          try {
            const full = path.join(workspaceDir, filePath)
            const s = fs.statSync(full)
            if (s.isFile() && s.size < 200_000) {
              const lines = fs.readFileSync(full, 'utf-8').split('\n').length
              stat = { add: lines, del: 0 }
            }
          } catch {
            // ignore
          }
        }

        changes.push({
          path: filePath,
          status,
          additions: stat?.add ?? 0,
          deletions: stat?.del ?? 0,
          staged: x !== ' ' && x !== '?'
        })
      }

      return {
        branch,
        isRepo: true,
        changes: changes.slice(0, 60)
      }
    } catch {
      return { branch: 'local', isRepo: false, changes: [] }
    }
  }

  static getFileDiff(workspaceDir: string, relativePath: string): string {
    try {
      const fullPath = path.resolve(workspaceDir, relativePath)
      let diffOut = ''
      try {
        diffOut = execSync(
          `git diff HEAD -- "${relativePath}" 2>/dev/null || git diff -- "${relativePath}"`,
          {
            cwd: workspaceDir,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3000
          }
        )
      } catch {
        diffOut = ''
      }

      if (diffOut.trim().length > 0) {
        return diffOut.slice(0, 24000)
      }

      // Untracked or newly created file: format as unified diff `+` lines
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 16000)
        const lines = content.split('\n')
        return [
          `--- /dev/null`,
          `+++ b/${relativePath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((l) => `+${l}`)
        ].join('\n')
      }

      return '(无可用差异内容)'
    } catch (err) {
      return `读取 Diff 失败: ${(err as Error).message}`
    }
  }
}
