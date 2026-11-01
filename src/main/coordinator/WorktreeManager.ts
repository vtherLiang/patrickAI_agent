import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

/**
 * Manages isolated Git Worktrees for concurrent Sub-Agents in Direction B (Coordinator mode),
 * preventing file write conflicts when multiple agents code in parallel.
 */
export class WorktreeManager {
  private envWithHomebrew = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
  }

  isGitRepository(workspaceDir: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: workspaceDir,
        env: this.envWithHomebrew,
        stdio: 'ignore'
      })
      return true
    } catch {
      return false
    }
  }

  ensureGitInitialized(workspaceDir: string): boolean {
    if (this.isGitRepository(workspaceDir)) return true
    try {
      execSync('git init && git add -A && git commit -m "chore: initial snapshot for worktree" --allow-empty', {
        cwd: workspaceDir,
        env: this.envWithHomebrew,
        stdio: 'ignore'
      })
      return true
    } catch {
      return false
    }
  }

  createTaskWorktree(
    workspaceDir: string,
    taskId: string
  ): { worktreePath: string; branchName: string } | null {
    if (!this.isGitRepository(workspaceDir)) {
      return null
    }

    const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, '-')
    const branchName = `swarm/${safeId}-${Date.now().toString().slice(-4)}`
    const worktreesRoot = path.join(workspaceDir, '.claude-desktop', 'worktrees')
    const worktreePath = path.join(worktreesRoot, safeId)

    try {
      if (!fs.existsSync(worktreesRoot)) {
        fs.mkdirSync(worktreesRoot, { recursive: true })
      }
      if (fs.existsSync(worktreePath)) {
        execSync(`git worktree remove --force "${worktreePath}"`, {
          cwd: workspaceDir,
          env: this.envWithHomebrew,
          stdio: 'ignore'
        })
      }

      execSync(`git worktree add -b "${branchName}" "${worktreePath}" HEAD`, {
        cwd: workspaceDir,
        env: this.envWithHomebrew,
        stdio: 'ignore'
      })

      return { worktreePath, branchName }
    } catch {
      return null
    }
  }

  getModifiedFiles(targetDir: string): string[] {
    try {
      const out = execSync('git status --porcelain', {
        cwd: targetDir,
        env: this.envWithHomebrew,
        encoding: 'utf-8'
      })
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.slice(3).trim())
    } catch {
      return []
    }
  }

  mergeWorktreeBranch(
    workspaceDir: string,
    worktreePath: string,
    branchName: string,
    taskTitle: string
  ): { ok: boolean; message: string } {
    try {
      // Commit any uncommitted changes inside the worktree first
      if (fs.existsSync(worktreePath)) {
        execSync('git add -A', { cwd: worktreePath, env: this.envWithHomebrew, stdio: 'ignore' })
        try {
          execSync(`git commit -m "feat(swarm): ${taskTitle.replace(/"/g, "'")}"`, {
            cwd: worktreePath,
            env: this.envWithHomebrew,
            stdio: 'ignore'
          })
        } catch {
          // No new changes to commit
        }
      }

      execSync(`git merge --no-ff "${branchName}" -m "Merge swarm branch ${branchName}: ${taskTitle.replace(/"/g, "'")}"`, {
        cwd: workspaceDir,
        env: this.envWithHomebrew,
        stdio: 'pipe'
      })

      return { ok: true, message: `已成功将分支 ${branchName} 合并回主工作区！` }
    } catch (err) {
      return {
        ok: false,
        message: `合并分支 ${branchName} 时发生冲突或提示: ${(err as Error).message}`
      }
    }
  }

  cleanupAllWorktrees(workspaceDir: string): string {
    const worktreesRoot = path.join(workspaceDir, '.claude-desktop', 'worktrees')
    if (!fs.existsSync(worktreesRoot)) {
      return '当前没有需要清理的 Git Worktree 目录。'
    }
    try {
      execSync('git worktree prune', {
        cwd: workspaceDir,
        env: this.envWithHomebrew,
        stdio: 'ignore'
      })
      fs.rmSync(worktreesRoot, { recursive: true, force: true })
      execSync('git worktree prune', {
        cwd: workspaceDir,
        env: this.envWithHomebrew,
        stdio: 'ignore'
      })
      return '已清理所有临时 Git Worktree 隔离目录。'
    } catch (err) {
      return `清理完成 (附带提示: ${(err as Error).message})`
    }
  }
}
