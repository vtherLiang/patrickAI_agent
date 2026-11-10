import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { AgentSkillItem, SkillUsageExample, ToolCallItem, ToolPermissionLevel } from '@shared/types'
import { maskSensitiveSecrets } from '@shared/secretMasker'
import { OpenAIToolSchema } from '../llm/OpenAIClient'
import { SkillManager } from '../skills/SkillManager'
import { McpManager } from '../mcp/McpManager'
import { AttachmentParser } from '../files/AttachmentParser'

export interface ToolExecutionContext {
  workspaceDir: string
  onTerminalOutput?: (commandId: string, text: string, stream: 'stdout' | 'stderr') => void
  onDelegateSwarm?: (goal: string) => Promise<string>
  skillManager?: SkillManager
  mcpManager?: McpManager
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
  execute: (
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
    callId: string
  ) => Promise<string>
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

/**
 * SWE-agent ACI (Agent-Computer Interface) Instant Syntax & Structural Linter:
 * Performs zero-latency post-edit structural verification on source files (.json, .ts, .tsx, .js, .jsx, .py)
 * so syntax errors or unbalanced delimiters are immediately surfaced to the agent for self-correction.
 */
export function runAciSyntaxLinter(
  filePath: string,
  content: string
): { ok: boolean; diagnostics: string[] } {
  const ext = path.extname(filePath).toLowerCase()
  const diagnostics: string[] = []

  if (ext === '.json') {
    try {
      JSON.parse(content)
    } catch (err) {
      diagnostics.push(`JSON 语法解析失败: ${(err as Error).message}`)
    }
    return { ok: diagnostics.length === 0, diagnostics }
  }

  // Check for accidental unresolved git conflict markers in code files
  if (['.ts', '.tsx', '.js', '.jsx', '.py', '.css', '.html'].includes(ext)) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (/^(<<<<<<<|=======|>>>>>>>)(\s|$)/.test(lines[i])) {
        diagnostics.push(`第 ${i + 1} 行检测到未解决的 Git 冲突标记: ${lines[i].slice(0, 30)}`)
      }
    }
  }

  // Fast lexical bracket/brace balance check for TS/JS family
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    const stack: Array<{ char: string; line: number }> = []
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
    const closingToOpening: Record<string, string> = { '}': '{', ')': '(', ']': '[' }

    let inSingle = false
    let inDouble = false
    let inTemplate = false
    let inLineComment = false
    let inBlockComment = false
    let lineNum = 1

    for (let i = 0; i < content.length; i++) {
      const ch = content[i]
      const next = content[i + 1]

      if (ch === '\n') {
        lineNum++
        inLineComment = false
        continue
      }

      if (inLineComment) continue
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          i++
        }
        continue
      }

      if (!inSingle && !inDouble && !inTemplate) {
        if (ch === '/' && next === '/') {
          inLineComment = true
          i++
          continue
        }
        if (ch === '/' && next === '*') {
          inBlockComment = true
          i++
          continue
        }
      }

      if (ch === '\\' && (inSingle || inDouble || inTemplate)) {
        i++
        continue
      }

      if (!inDouble && !inTemplate && ch === "'") {
        inSingle = !inSingle
        continue
      }
      if (!inSingle && !inTemplate && ch === '"') {
        inDouble = !inDouble
        continue
      }
      if (!inSingle && !inDouble && ch === '`') {
        inTemplate = !inTemplate
        continue
      }

      if (inSingle || inDouble || inTemplate) continue

      if (pairs[ch]) {
        stack.push({ char: ch, line: lineNum })
      } else if (closingToOpening[ch]) {
        const expectedOpen = closingToOpening[ch]
        const last = stack.pop()
        if (!last) {
          diagnostics.push(`第 ${lineNum} 行存在多余的闭合符号 '${ch}'（无匹配的 '${expectedOpen}'）`)
          break
        } else if (last.char !== expectedOpen) {
          diagnostics.push(
            `第 ${lineNum} 行闭合符号 '${ch}' 与第 ${last.line} 行的 '${last.char}' 不匹配`
          )
          break
        }
      }
    }

    if (diagnostics.length === 0 && stack.length > 0) {
      const unclosed = stack[stack.length - 1]
      diagnostics.push(`第 ${unclosed.line} 行开启的符号 '${unclosed.char}' 直到文件末尾仍未闭合`)
    }
  }

  return { ok: diagnostics.length === 0, diagnostics }
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
        '读取工作区或指定绝对路径下的文件内容（支持代码源码、文本、Markdown 以及 PDF、Word、Excel 等各类文档，已集成智能解析，带行号返回）。支持指定起始行 start_line 和结束行 end_line。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '相对或绝对文件路径' },
          start_line: { type: 'number', description: '起始行号（从 1 开始，可选）' },
          end_line: { type: 'number', description: '结束行号（可选）' },
          description: {
            type: 'string',
            description: '简短一句话中文总结读取目的（如：查看 Electron 打包配置、精读 PDF 论文等，可选）'
          }
        },
        required: ['file_path']
      },
      execute: async (args, ctx) => {
        const rawPath = String(args.file_path || '').trim()
        const filePath = resolveSafePath(ctx.workspaceDir, rawPath)
        if (!fs.existsSync(filePath)) {
          return `Error: 文件不存在 -> ${filePath}`
        }
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          const items = fs.readdirSync(filePath)
          return `目录 ${filePath} 包含项:\n${items.join('\n')}`
        }

        const ext = path.extname(filePath).toLowerCase()
        let content = ''

        // Rich documents (PDF, Word, Excel, CSV, etc.) - automatically extracted via native AttachmentParser
        if (['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv'].includes(ext)) {
          const parsed = AttachmentParser.parseFile(filePath)
          if (parsed && parsed.extractedText) {
            content = parsed.extractedText
          } else {
            return `Error: 无法从文档中提取有效文本 (${filePath})，可能属于纯加密或不可读文件。`
          }
        } else {
          content = fs.readFileSync(filePath, 'utf-8')
        }

        const safeContent = maskSensitiveSecrets(content)
        const lines = safeContent.split('\n')
        const start = Math.max(1, Number(args.start_line) || 1)
        const end = Math.min(
          lines.length,
          Number(args.end_line) || Math.min(lines.length, start + 350)
        )
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
          },
          description: {
            type: 'string',
            description: '简短一句话中文总结检索目的（可选）'
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
                      const safeSnippet = maskSensitiveSecrets(line.trim()).slice(0, 140)
                      matches.push(`${relPath}:${idx + 1}: ${safeSnippet}`)
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
          new_string: { type: 'string', description: '替换后的新文本块' },
          description: {
            type: 'string',
            description: '简短一句话中文总结本次修改的内容（如：补充多智能体并行说明）'
          }
        },
        required: ['file_path', 'old_string', 'new_string']
      },
      preparePreview: (args) => {
        const relPath = String(args.file_path || '')
        const oldStr = String(args.old_string || '')
        const newStr = String(args.new_string || '')
        return {
          diffPreview: {
            filePath: relPath,
            oldContent: oldStr,
            newContent: newStr,
            unifiedDiff: createSimpleUnifiedDiff(relPath, oldStr, newStr),
            isNewFile: false,
            totalLines: newStr.split('\n').length
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
        const lintRes = runAciSyntaxLinter(filePath, updated)
        if (!lintRes.ok) {
          return `Warning [SWE-agent ACI Linter 语法预检告警]: 文件 ${args.file_path} 已写入，但检测到结构或语法异常:\n- ${lintRes.diagnostics.join('\n- ')}\n请立即调用 edit_file 修复上述语法/括号闭合问题！`
        }
        return `Success: 已成功更新文件 ${args.file_path} (SWE-agent ACI 语法校验通过)`
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
          content: { type: 'string', description: '要写入的完整文件内容' },
          description: {
            type: 'string',
            description: '简短一句话中文总结写入文件的核心内容（如：生成封装可行性评估报告）'
          }
        },
        required: ['file_path', 'content']
      },
      preparePreview: (args, workspaceDir) => {
        const relPath = String(args.file_path || '')
        const fullPath = resolveSafePath(workspaceDir, relPath)
        const existed = fs.existsSync(fullPath)
        const oldContent = existed ? fs.readFileSync(fullPath, 'utf-8') : ''
        const newContent = String(args.content || '')
        const totalLines = newContent ? newContent.split('\n').length : 0
        return {
          diffPreview: {
            filePath: relPath,
            oldContent: oldContent.slice(0, 4000),
            newContent: newContent.slice(0, 12000),
            unifiedDiff: createSimpleUnifiedDiff(
              relPath,
              oldContent.slice(0, 2000),
              newContent.slice(0, 2000)
            ),
            isNewFile: !existed,
            totalLines
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
        const lintRes = runAciSyntaxLinter(filePath, content)
        if (!lintRes.ok) {
          return `Warning [SWE-agent ACI Linter 语法预检告警]: 文件 ${args.file_path} (${content.split('\n').length} 行) 已写入，但检测到结构或语法异常:\n- ${lintRes.diagnostics.join('\n- ')}\n请立即调用 edit_file 修复上述语法/括号闭合问题！`
        }
        return `Success: 已成功写入文件 ${args.file_path} (${content.split('\n').length} 行，SWE-agent ACI 语法校验通过)`
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
          command: { type: 'string', description: '要执行的 Shell 命令行' },
          description: {
            type: 'string',
            description:
              '用简短清晰的一句话（5~15字中文）总结该命令在干什么，例如："检查项目目录结构与打包配置" 或 "运行 TypeScript 类型检查"'
          }
        },
        required: ['command']
      },
      preparePreview: (args) => ({
        commandPreview: maskSensitiveSecrets(String(args.command || ''))
      }),
      execute: async (args, ctx, callId) => {
        const cmd = String(args.command || '')
        return new Promise<string>((resolve) => {
          const isWin = process.platform === 'win32'
          const shellBin = isWin
            ? 'powershell.exe'
            : fs.existsSync('/bin/zsh')
              ? '/bin/zsh'
              : '/bin/sh'
          const shellArgs = isWin ? ['-NoProfile', '-Command', cmd] : ['-c', cmd]
          const child = spawn(shellBin, shellArgs, {
            cwd: ctx.workspaceDir,
            env: {
              ...process.env,
              PATH: isWin
                ? process.env.PATH || ''
                : `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
            }
          })

          let output = ''
          const timeout = setTimeout(() => {
            child.kill('SIGTERM')
            output += '\n[Timeout: 命令执行超过 30 秒已自动终止]'
          }, 30000)

          child.on('error', (err) => {
            clearTimeout(timeout)
            resolve(`Command: ${maskSensitiveSecrets(cmd)}\nError: ${err.message}`)
          })

          const stdoutDecoder = new StringDecoder('utf-8')
          const stderrDecoder = new StringDecoder('utf-8')

          child.stdout.on('data', (chunk: Buffer) => {
            const raw = typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk)
            const sanitized = maskSensitiveSecrets(raw)
            output += sanitized
            ctx.onTerminalOutput?.(callId, sanitized, 'stdout')
          })

          child.stderr.on('data', (chunk: Buffer) => {
            const raw = typeof chunk === 'string' ? chunk : stderrDecoder.write(chunk)
            const sanitized = maskSensitiveSecrets(raw)
            output += sanitized
            ctx.onTerminalOutput?.(callId, sanitized, 'stderr')
          })

          child.on('close', (code) => {
            clearTimeout(timeout)
            const remainingOut = stdoutDecoder.end()
            if (remainingOut) output += maskSensitiveSecrets(remainingOut)
            const remainingErr = stderrDecoder.end()
            if (remainingErr) output += maskSensitiveSecrets(remainingErr)

            const sanitizedOutput = maskSensitiveSecrets(output)
            const truncated =
              sanitizedOutput.length > 6000
                ? sanitizedOutput.slice(0, 3000) + '\n...[中间输出已省略]...\n' + sanitizedOutput.slice(-3000)
                : sanitizedOutput
            resolve(
              `Command: ${maskSensitiveSecrets(cmd)}\nExit Code: ${code}\nOutput:\n${truncated || '(无输出)'}`
            )
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

    // 7. install_skill (Agent-Driven Skill Mounting into Codex Skills Hub!)
    this.register({
      name: 'install_skill',
      description:
        '当用户在对话中要求安装、导入或创建某个 Skill 技能（如传入 GitHub SKILL.md 仓库链接，或指定领域能力需求）时调用此工具。装载完成后会立即同步到左侧边栏「Skills」功能页展示详细解释与使用示例。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill 展示名称（例如 Rust FFI Security Audit）' },
          id: { type: 'string', description: '英文短横线唯一标识 slug（例如 rust-ffi-audit）' },
          category: {
            type: 'string',
            enum: ['security', 'low-level', 'architecture', 'workflow', 'testing', 'custom'],
            description: '技能所属分类'
          },
          source_url: {
            type: 'string',
            description: '可选：GitHub Skill 链接（如 https://github.com/.../skills/...）'
          },
          summary: { type: 'string', description: '一句话核心定位摘要' },
          explanation: {
            type: 'string',
            description: '详细的技能原理、适用场景与执行方法论解释（供用户在 Skills 页面阅读）'
          },
          capabilities: {
            type: 'array',
            items: { type: 'string' },
            description: '核心能力条目列表（3-5 条）'
          },
          triggers: {
            type: 'array',
            items: { type: 'string' },
            description: '自动激活关键词列表'
          },
          usage_examples: {
            type: 'array',
            description: '使用示例列表（供用户在 Skills 页面查看并一键试跑）',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                prompt: { type: 'string' },
                expectedBehavior: { type: 'string' }
              },
              required: ['title', 'prompt', 'expectedBehavior']
            }
          }
        },
        required: ['name']
      },
      execute: async (args, ctx) => {
        if (!ctx.skillManager) return 'Error: SkillManager 未初始化'
        const saved = await ctx.skillManager.installSkill({
          id: args.id ? String(args.id) : undefined,
          name: args.name ? String(args.name) : undefined,
          category: (args.category as AgentSkillItem['category']) || 'custom',
          sourceUrl: args.source_url ? String(args.source_url) : undefined,
          installedBy: 'agent',
          summary: args.summary ? String(args.summary) : undefined,
          explanation: args.explanation ? String(args.explanation) : undefined,
          capabilities: Array.isArray(args.capabilities)
            ? args.capabilities.map(String)
            : undefined,
          triggers: Array.isArray(args.triggers) ? args.triggers.map(String) : undefined,
          usageExamples: Array.isArray(args.usage_examples)
            ? (args.usage_examples as SkillUsageExample[])
            : undefined
        })
        return `Success: 已成功装载 Skill [${saved.name}] (id: ${saved.id}) 到本地 ${saved.filePath}，包含 ${saved.usageExamples.length} 个使用示例。用户现在点击左侧边栏「Skills」即可查看完整解释与一键运行示例。`
      }
    })

    // 8. list_skills (Inspect Mounted Skills)
    this.register({
      name: 'list_skills',
      description: '查看当前工作台已装载的所有 Skills 列表、启用状态与触发关键词。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      execute: async (_args, ctx) => {
        if (!ctx.skillManager) return 'SkillManager 未初始化'
        const list = ctx.skillManager.listSkills()
        return list
          .map(
            (s) =>
              `- [${s.enabled ? '已启用' : '已停用'}] ${s.name} (${s.id}) | 分类: ${s.category} | 来源: ${s.installedBy} | 摘要: ${s.summary}`
          )
          .join('\n')
      }
    })

    // 9. install_mcp_server (Agent-Driven MCP Mounting into Codex MCP Hub!)
    this.register({
      name: 'install_mcp_server',
      description:
        '当用户在对话中要求挂载或配置某个 MCP (Model Context Protocol) 服务时调用此工具。挂载后会立即出现在左侧边栏「MCP」功能页。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'MCP 服务名称' },
          transport: { type: 'string', enum: ['stdio', 'sse', 'http'], description: '传输协议' },
          command: { type: 'string', description: 'stdio 启动命令（如 npx 或 uvx）' },
          args: { type: 'array', items: { type: 'string' }, description: '命令参数数组' },
          url: { type: 'string', description: 'HTTP/SSE 端点地址（可选）' },
          category: { type: 'string', description: '分类标签' },
          summary: { type: 'string', description: '一句话摘要' },
          explanation: { type: 'string', description: '服务原理与挂载用途详细说明' },
          tools: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['name', 'description']
            }
          }
        },
        required: ['name']
      },
      execute: async (args, ctx) => {
        if (!ctx.mcpManager) return 'Error: McpManager 未初始化'
        const srv = ctx.mcpManager.upsertServer({
          name: String(args.name),
          transport: (args.transport as 'stdio' | 'sse' | 'http') || 'stdio',
          command: args.command ? String(args.command) : 'npx',
          args: Array.isArray(args.args) ? args.args.map(String) : [],
          url: args.url ? String(args.url) : undefined,
          installedBy: 'agent',
          category: args.category ? String(args.category) : '对话装载扩展',
          summary: args.summary ? String(args.summary) : undefined,
          explanation: args.explanation ? String(args.explanation) : undefined,
          tools: Array.isArray(args.tools) ? (args.tools as any) : undefined
        })
        return `Success: 已成功挂载 MCP 服务 [${srv.name}] (${srv.id})，协议: ${srv.transport}。用户可在左侧边栏「MCP」页面查看详情与调用示例。`
      }
    })

    // 10. call_mcp_tool (Invoke Any Mounted MCP Server Tool)
    this.register({
      name: 'call_mcp_tool',
      description: '调用已挂载的 MCP 服务所暴露的工具（如 git_recent_commits、inspect_binary_headers、workspace_loc_stats 等）。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          server_id: { type: 'string', description: '目标 MCP 服务 ID（如 git-forensics-mcp）' },
          tool_name: { type: 'string', description: '工具函数名称' },
          arguments_json: {
            type: 'string',
            description: '传递给该 MCP 工具的 JSON 参数字符串，例如 {"limit": 5}'
          }
        },
        required: ['server_id', 'tool_name']
      },
      execute: async (args, ctx) => {
        if (!ctx.mcpManager) return 'Error: McpManager 未初始化'
        let parsed: Record<string, unknown> = {}
        try {
          parsed = args.arguments_json ? JSON.parse(String(args.arguments_json)) : {}
        } catch {
          parsed = {}
        }
        return await ctx.mcpManager.executeMcpTool(
          String(args.server_id),
          String(args.tool_name),
          parsed,
          ctx.workspaceDir
        )
      }
    })

    // 11. inspect_code_symbols (SWE-agent & AutoCodeRover AST-level Symbol Outline & Definition Probe)
    this.register({
      name: 'inspect_code_symbols',
      description:
        '【SWE-agent ACI 代码符号探针】快速提取指定源码文件中的所有类(class)、接口(interface)、类型(type)、函数(function/method)的符号大纲与精确行号，或直接定位特定 symbol_name 的定义代码块（无需通读整篇大文件）。',
      permissionLevel: 'readonly',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: '目标源码文件相对或绝对路径' },
          symbol_name: {
            type: 'string',
            description: '要精准定位的类名、函数名或接口名称（可选；若不填则返回全文件符号大纲）'
          },
          description: {
            type: 'string',
            description: '简短一句话中文总结探查意图（如：提取 QueryEngine 核心方法大纲）'
          }
        },
        required: ['file_path']
      },
      execute: async (args, ctx) => {
        const filePath = resolveSafePath(ctx.workspaceDir, String(args.file_path || ''))
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          return `Error: 源码文件不存在 -> ${filePath}`
        }

        const raw = fs.readFileSync(filePath, 'utf-8')
        const lines = raw.split('\n')
        const targetSymbol = args.symbol_name ? String(args.symbol_name).trim() : ''

        const symbolRegex =
          /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(class|interface|type|enum|function|const|let)\s+([A-Za-z0-9_$]+)|^\s*(?:public|private|protected|static|async|\s)*([A-Za-z0-9_$]+)\s*\([^;]*\)\s*(?::\s*[^{]+)?\{/

        const symbols: Array<{ kind: string; name: string; line: number; signature: string }> = []
        const reserved = new Set(['if', 'for', 'while', 'switch', 'catch', 'constructor', 'return'])

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const m = line.match(symbolRegex)
          if (m) {
            const kind = m[1] || 'method'
            const name = m[2] || m[3]
            if (name && !reserved.has(name)) {
              symbols.push({
                kind,
                name,
                line: i + 1,
                signature: maskSensitiveSecrets(line.trim()).slice(0, 110)
              })
            }
          }
        }

        if (targetSymbol) {
          const hit = symbols.find(
            (s) => s.name === targetSymbol || s.name.toLowerCase() === targetSymbol.toLowerCase()
          )
          if (!hit) {
            return `未在 ${args.file_path} 中找到符号 "${targetSymbol}"。该文件可用符号 (${symbols.length}):\n${symbols
              .slice(0, 40)
              .map((s) => `  L${s.line} [${s.kind}] ${s.name}`)
              .join('\n')}`
          }
          const start = Math.max(1, hit.line - 2)
          const end = Math.min(lines.length, hit.line + 75)
          const snippet = lines
            .slice(start - 1, end)
            .map((l, idx) => `${String(start + idx).padStart(4, ' ')} | ${maskSensitiveSecrets(l)}`)
            .join('\n')
          return `[ACI Symbol Probe] ${args.file_path} -> ${hit.kind} ${hit.name} (Lines ${start}-${end} of ${lines.length}):\n${snippet}`
        }

        if (symbols.length === 0) {
          return `File ${args.file_path} (${lines.length} lines): 未检出标准类/函数符号声明，建议调用 read_file 查看。`
        }

        return `[ACI Symbol Outline] ${args.file_path} (共 ${lines.length} 行, 检出 ${symbols.length} 个符号):\n${symbols
          .slice(0, 120)
          .map((s) => `  L${String(s.line).padEnd(4, ' ')} | [${s.kind}] ${s.name} -> ${s.signature}`)
          .join('\n')}`
      }
    })
  }
}
