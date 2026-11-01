import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { ToolCallItem, ToolPermissionLevel } from '@shared/types'
import { OpenAIToolSchema } from '../llm/OpenAIClient'

export interface ToolExecutionContext {
  workspaceDir: string
  onTerminalOutput?: (commandId: string, text: string, stream: 'stdout' | 'stderr') => void
  onDelegateSwarm?: (goal: string) => Promise<string>
}

export interface RegisteredTool {
  name: string
  description: string
  permissionLevel: ToolPermissionLevel
  parameters: Record<string, unknown>
  preparePreview?: (
    args: Record<string, unknown>,
    workspaceDir: string
  ) => {
    diffPreview?: ToolCallItem['diffPreview']
    commandPreview?: string
  }
  execute: (args: Record<string, unknown>, ctx: ToolExecutionContext, callId: string) => Promise<string>
}

function createSimpleUnifiedDiff(filePath: string, oldStr: string, newStr: string): string {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const header = `--- a/${filePath}\n+++ b/${filePath}\n`
  const maxLines = Math.max(oldLines.length, newLines.length)
  const diffLines: string[] = []

  for (let i = 0; i < maxLines; i++) {
    const o = oldLines[i]
    const n = newLines[i]
    if (o === n) {
      if (o !== undefined) diffLines.push(`  ${o}`)
    } else {
      if (o !== undefined) diffLines.push(`- ${o}`)
      if (n !== undefined) diffLines.push(`+ ${n}`)
    }
  }
  return header + diffLines.slice(0, 120).join('\n')
}

function resolveSafePath(workspaceDir: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) return targetPath
  return path.resolve(workspaceDir, targetPath)
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  constructor() {
    this.registerBuiltinTools()
  }

  register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  getOpenAIToolSchemas(): OpenAIToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))
  }

  private registerBuiltinTools(): void {
    // 1. read_file (FileReadTool)
    this.register({
      name: 'read_file',
      description:
        '读取工作区内的文件内容（带行号返回）。支持指定起始行 start_line 和结束行 end_line。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '相对或绝对文件路径' },
          start_line: { type: 'number', description: '起始行号（从 1 开始，可选）' },
          end_line: { type: 'number', description: '结束行号（可选）' }
        },
        required: ['file_path']
      },
      execute: async (args, ctx) => {
        const filePath = resolveSafePath(ctx.workspaceDir, String(args.file_path || ''))
        if (!fs.existsSync(filePath)) {
          return `Error: 文件不存在 -> ${filePath}`
        }
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          const items = fs.readdirSync(filePath)
          return `目录 ${filePath} 包含项:\n${items.join('\n')}`
        }
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        const start = Math.max(1, Number(args.start_line) || 1)
        const end = Math.min(lines.length, Number(args.end_line) || Math.min(lines.length, start + 250))
        const numbered = lines
          .slice(start - 1, end)
          .map((line, idx) => `${String(start + idx).padStart(4, ' ')} | ${line}`)
          .join('\n')
        return `File: ${args.file_path} (Lines ${start}-${end} of ${lines.length})\n${numbered}`
      }
    })

    // 2. search_files (Glob + Grep Tool)
    this.register({
      name: 'search_files',
      description:
        '在工作区中高速检索文件列表或搜索包含指定关键词/正则的代码行（类似 Glob + Ripgrep）。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '要搜索的文本关键词或正则表达式（若为空则仅列出项目文件结构）'
          },
          file_pattern: {
            type: 'string',
            description: '文件后缀或名称过滤，例如 .ts 或 .tsx（可选）'
          }
        },
        required: []
      },
      execute: async (args, ctx) => {
        const query = args.query ? String(args.query) : ''
        const filePattern = args.file_pattern ? String(args.file_pattern) : ''
        const matches: string[] = []
        const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'out', '.claude-desktop'])

        const walk = (dir: string): void => {
          if (matches.length >= 80) return
          let entries: fs.Dirent[] = []
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
          } catch {
            return
          }
          for (const entry of entries) {
            if (matches.length >= 80) break
            if (ignoredDirs.has(entry.name)) continue
            const fullPath = path.join(dir, entry.name)
            const relPath = path.relative(ctx.workspaceDir, fullPath)

            if (entry.isDirectory()) {
              walk(fullPath)
            } else {
              if (filePattern && !relPath.includes(filePattern)) continue
              if (!query) {
                matches.push(relPath)
              } else {
                try {
                  const text = fs.readFileSync(fullPath, 'utf-8')
                  const lines = text.split('\n')
                  lines.forEach((line, idx) => {
                    if (matches.length < 80 && line.includes(query)) {
                      matches.push(`${relPath}:${idx + 1}: ${line.trim().slice(0, 140)}`)
                    }
                  })
                } catch {
                  // skip binary
                }
              }
            }
          }
        }

        walk(ctx.workspaceDir)
        if (matches.length === 0) {
          return '未找到匹配的文件或代码行。'
        }
        return `找到 ${matches.length} 条结果:\n${matches.join('\n')}`
      }
    })

    // 3. edit_file (FileEditTool with exact block replacement & Diff Preview)
    this.register({
      name: 'edit_file',
      description:
        '精准替换文件中的指定代码片段（复刻 Claude Code 的 old_string -> new_string 机制），执行前会在桌面端弹出可视化 Diff 审批。',
      permissionLevel: 'write',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '目标文件路径' },
          old_string: { type: 'string', description: '原文件中需要被替换的精确文本块' },
          new_string: { type: 'string', description: '替换后的新文本块' }
        },
        required: ['file_path', 'old_string', 'new_string']
      },
      preparePreview: (args, workspaceDir) => {
        const relPath = String(args.file_path || '')
        const oldStr = String(args.old_string || '')
        const newStr = String(args.new_string || '')
        return {
          diffPreview: {
            filePath: relPath,
            oldContent: oldStr,
            newContent: newStr,
            unifiedDiff: createSimpleUnifiedDiff(relPath, oldStr, newStr)
          }
        }
      },
      execute: async (args, ctx) => {
        const filePath = resolveSafePath(ctx.workspaceDir, String(args.file_path || ''))
        const oldStr = String(args.old_string || '')
        const newStr = String(args.new_string || '')

        if (!fs.existsSync(filePath)) {
          return `Error: 目标文件不存在 -> ${filePath}`
        }
        const content = fs.readFileSync(filePath, 'utf-8')
        if (!content.includes(oldStr)) {
          return `Error: 在文件 ${args.file_path} 中未找到完全匹配的 old_string，请先调用 read_file 确认最新内容。`
        }
        const updated = content.replace(oldStr, newStr)
        fs.writeFileSync(filePath, updated, 'utf-8')
        return `Success: 已成功更新文件 ${args.file_path}`
      }
    })

    // 4. write_file (FileWriteTool with Diff Preview)
    this.register({
      name: 'write_file',
      description: '新建文件或覆写完整文件内容，执行前会在桌面端生成可视化 Diff 供用户审批。',
      permissionLevel: 'write',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '目标文件路径' },
          content: { type: 'string', description: '要写入的完整文件内容' }
        },
        required: ['file_path', 'content']
      },
      preparePreview: (args, workspaceDir) => {
        const relPath = String(args.file_path || '')
        const fullPath = resolveSafePath(workspaceDir, relPath)
        const oldContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : ''
        const newContent = String(args.content || '')
        return {
          diffPreview: {
            filePath: relPath,
            oldContent: oldContent.slice(0, 2000),
            newContent: newContent.slice(0, 2000),
            unifiedDiff: createSimpleUnifiedDiff(
              relPath,
              oldContent.slice(0, 2000),
              newContent.slice(0, 2000)
            )
          }
        }
      },
      execute: async (args, ctx) => {
        const filePath = resolveSafePath(ctx.workspaceDir, String(args.file_path || ''))
        const content = String(args.content || '')
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, content, 'utf-8')
        return `Success: 已成功写入文件 ${args.file_path} (${content.split('\n').length} 行)`
      }
    })

    // 5. run_bash (BashTool with streaming terminal output)
    this.register({
      name: 'run_bash',
      description:
        '在项目工作区目录下执行 Shell / Bash 命令（如运行测试、构建、git 操作等），实时将输出推送到工作台终端面板。',
      permissionLevel: 'execute',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 Shell 命令行' }
        },
        required: ['command']
      },
      preparePreview: (args) => ({
        commandPreview: String(args.command || '')
      }),
      execute: async (args, ctx, callId) => {
        const cmd = String(args.command || '')
        return new Promise<string>((resolve) => {
          const child = spawn('/bin/zsh', ['-c', cmd], {
            cwd: ctx.workspaceDir,
            env: {
              ...process.env,
              PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
            }
          })

          let output = ''
          const timeout = setTimeout(() => {
            child.kill('SIGTERM')
            output += '\n[Timeout: 命令执行超过 30 秒已自动终止]'
          }, 30000)

          child.stdout.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            output += text
            ctx.onTerminalOutput?.(callId, text, 'stdout')
          })

          child.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            output += text
            ctx.onTerminalOutput?.(callId, text, 'stderr')
          })

          child.on('close', (code) => {
            clearTimeout(timeout)
            const truncated =
              output.length > 6000
                ? output.slice(0, 3000) + '\n...[中间输出已省略]...\n' + output.slice(-3000)
                : output
            resolve(`Command: ${cmd}\nExit Code: ${code}\nOutput:\n${truncated || '(无输出)'}`)
          })

          child.on('error', (err) => {
            clearTimeout(timeout)
            resolve(`Command Error: ${err.message}`)
          })
        })
      }
    })

    // 6. delegate_to_swarm (Direction B Coordinator Trigger Tool)
    this.register({
      name: 'delegate_to_swarm',
      description:
        '当遇到跨模块或复杂大任务时，调用此工具将任务移交给 Coordinator 多智能体集群（DAG 拆解 + Git Worktree 并行执行）。',
      permissionLevel: 'execute',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: '需要多智能体并行完成的完整目标描述' }
        },
        required: ['goal']
      },
      preparePreview: (args) => ({
        commandPreview: `[启动 Coordinator 多智能体集群] 目标: ${String(args.goal || '')}`
      }),
      execute: async (args, ctx) => {
        const goal = String(args.goal || '')
        if (!ctx.onDelegateSwarm) {
          return '当前环境未挂载 SwarmCoordinator。'
        }
        return await ctx.onDelegateSwarm(goal)
      }
    })
  }
}
