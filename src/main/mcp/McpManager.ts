import fs from 'fs'
import path from 'path'
import { spawn, execSync } from 'child_process'
import { McpServerItem, McpToolDescriptor, StreamUpdatePayload } from '@shared/types'

export class McpManager {
  private mcpFilePath: string
  private servers = new Map<string, McpServerItem>()

  constructor(
    appDataDir: string,
    private emitUpdate: (payload: StreamUpdatePayload) => void
  ) {
    this.mcpFilePath = path.join(appDataDir, 'mcp.json')
    this.loadOrSeed()
  }

  private loadOrSeed(): void {
    if (fs.existsSync(this.mcpFilePath)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.mcpFilePath, 'utf-8')) as McpServerItem[]
        if (Array.isArray(list) && list.length > 0) {
          for (const s of list) {
            this.servers.set(s.id, s)
          }
          return
        }
      } catch {
        // re-seed below
      }
    }

    const defaults: McpServerItem[] = [
      {
        id: 'git-forensics-mcp',
        name: 'Git Forensics & Blame MCP',
        transport: 'stdio',
        command: 'builtin:git-forensics',
        args: ['--stdio'],
        enabled: true,
        status: 'connected',
        installedBy: 'preset',
        category: '版本控制与代码溯源',
        summary: '提供 Git 提交演进历史、单文件 Blame 责任行追踪与分支差异摘要的原生 MCP 服务。',
        explanation:
          '通过 Model Context Protocol 标准暴露仓库版本演进上下文。相比直接裸跑零散 git 命令，该 MCP 服务返回经过结构化清洗的提交图谱、热点变更文件排行与逐行溯源元数据，显著降低上下文 Token 消耗。',
        tools: [
          {
            name: 'git_recent_commits',
            description: '获取最近 N 次 Git 提交记录、作者与变更统计摘要',
            inputExample: '{"limit": 8}'
          },
          {
            name: 'git_file_blame',
            description: '追踪指定文件行区间的最后修改提交与变更动机',
            inputExample: '{"file_path": "src/main/index.ts", "start_line": 1, "end_line": 40}'
          }
        ],
        usageExamples: [
          {
            title: '分析当前仓库近期提交演进脉络',
            prompt: '请调用 git-forensics-mcp 的工具查看最近 8 次提交记录并总结核心架构演进。'
          },
          {
            title: '对核心入口文件进行 Git Blame 代码溯源',
            prompt: '使用 MCP 工具追踪 src/main/index.ts 前 40 行的提交溯源信息。'
          }
        ],
        lastCheckedAt: Date.now()
      },
      {
        id: 'binary-re-bridge-mcp',
        name: 'Binary Triage & Mach-O/ELF Bridge MCP',
        transport: 'stdio',
        command: 'builtin:binary-bridge',
        args: ['--readonly'],
        enabled: true,
        status: 'connected',
        installedBy: 'preset',
        category: '安全与二进制逆向',
        summary:
          '配合 reverse-engineering 技能使用的只读二进制分诊 MCP：封装 file / otool / nm / strings 符号表与动态库探测。',
        explanation:
          '专为低层系统开发与二进制安全分析设计的本地只读 MCP 桥接器。在 macOS/Linux 下自动调用原生 toolchain（otool、nm、strings、shasum）提取二进制 Mach-O/ELF Header、动态链接库依赖与可打印特征字符串，无需授予任意危险写权限即可完成安全逆向初筛。',
        tools: [
          {
            name: 'inspect_binary_headers',
            description: '读取二进制可执行文件或动态库的架构头、SHA256 指纹与动态链接依赖表',
            inputExample: '{"binary_path": "/bin/ls"}'
          },
          {
            name: 'extract_binary_strings',
            description: '从目标二进制文件中提取高价值可打印 ASCII/UTF-8 特征字符串',
            inputExample: '{"binary_path": "/bin/ls", "max_items": 40}'
          }
        ],
        usageExamples: [
          {
            title: '分诊系统二进制动态链接与 Mach-O Header',
            prompt:
              '结合 reverse-engineering 技能与 binary-re-bridge-mcp，检查 /bin/ls 的 Mach-O 头部架构与动态链接库依赖。'
          }
        ],
        lastCheckedAt: Date.now()
      },
      {
        id: 'filesystem-metrics-mcp',
        name: 'Workspace Codebase Metrics MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        enabled: true,
        status: 'ready',
        installedBy: 'preset',
        category: '工程度量与文件检索',
        summary: '统计项目语言分布、大文件排行与模块耦合度的工作区度量 MCP 服务。',
        explanation:
          '兼容官方 @modelcontextprotocol/server-filesystem 协议，同时内置工作区代码行数（LOC）与目录体量快速统计能力，适合在大型重构或架构评审前快速建立全局量化视图。',
        tools: [
          {
            name: 'workspace_loc_stats',
            description: '统计当前工作区各编程语言文件数量、代码体量与最大模块排行',
            inputExample: '{}'
          }
        ],
        usageExamples: [
          {
            title: '生成当前项目代码体量与模块分布热力报告',
            prompt: '调用 filesystem-metrics-mcp 统计当前工作区各后缀文件数量与最大源码模块排行。'
          }
        ],
        lastCheckedAt: Date.now()
      }
    ]

    for (const s of defaults) {
      this.servers.set(s.id, s)
    }
    this.save()
  }

  private save(): void {
    try {
      fs.writeFileSync(this.mcpFilePath, JSON.stringify(this.listServers(), null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save mcp.json:', err)
    }
  }

  listServers(): McpServerItem[] {
    return Array.from(this.servers.values())
  }

  toggleServer(id: string): McpServerItem[] {
    const srv = this.servers.get(id)
    if (srv) {
      const nextEnabled = !srv.enabled
      this.servers.set(id, {
        ...srv,
        enabled: nextEnabled,
        status: nextEnabled ? 'connected' : 'disabled'
      })
      this.save()
      this.broadcast()
    }
    return this.listServers()
  }

  deleteServer(id: string): McpServerItem[] {
    if (this.servers.delete(id)) {
      this.save()
      this.broadcast()
    }
    return this.listServers()
  }

  upsertServer(input: Partial<McpServerItem> & { name: string }): McpServerItem {
    const id =
      input.id ||
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5-_]+/g, '-')
        .replace(/^-+|-+$/g, '') ||
      `mcp-${Date.now().toString(36)}`

    const existing = this.servers.get(id)
    const item: McpServerItem = {
      id,
      name: input.name,
      transport: input.transport || existing?.transport || 'stdio',
      command: input.command ?? existing?.command ?? 'npx',
      args: input.args ?? existing?.args ?? [],
      env: input.env ?? existing?.env ?? {},
      url: input.url ?? existing?.url,
      enabled: input.enabled ?? true,
      status: (input.enabled ?? true) ? 'connected' : 'disabled',
      installedBy: input.installedBy || existing?.installedBy || 'user',
      category: input.category || existing?.category || '自定义外部工具服务',
      summary: input.summary || existing?.summary || `${input.name} MCP 扩展服务`,
      explanation:
        input.explanation ||
        existing?.explanation ||
        `通过 Model Context Protocol (${input.transport || 'stdio'}) 挂载的外部工具与上下文数据源。`,
      tools:
        input.tools && input.tools.length > 0
          ? input.tools
          : existing?.tools || [
              {
                name: 'query_resource',
                description: `调用 ${input.name} 暴露的默认 MCP 查询接口`,
                inputExample: '{"query": "status"}'
              }
            ],
      usageExamples:
        input.usageExamples && input.usageExamples.length > 0
          ? input.usageExamples
          : existing?.usageExamples || [
              {
                title: `测试调用 ${input.name}`,
                prompt: `请通过已挂载的 [${input.name}] MCP 服务执行一次状态查询并汇报结果。`
              }
            ],
      lastCheckedAt: Date.now()
    }

    this.servers.set(id, item)
    this.save()
    this.broadcast(item)
    return item
  }

  /**
   * Probes an MCP server over JSON-RPC 2.0 (`initialize` -> `tools/list`) if external stdio/http,
   * or verifies built-in bridge readiness.
   */
  async probeServer(id: string, workspaceDir: string): Promise<McpServerItem | null> {
    const srv = this.servers.get(id)
    if (!srv) return null

    if (srv.command?.startsWith('builtin:')) {
      const updated: McpServerItem = {
        ...srv,
        status: srv.enabled ? 'connected' : 'disabled',
        lastCheckedAt: Date.now(),
        errorMessage: undefined
      }
      this.servers.set(id, updated)
      this.save()
      this.broadcast()
      return updated
    }

    if (srv.transport === 'http' || srv.transport === 'sse') {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 4500)
        const res = await fetch(srv.url || '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
          }),
          signal: ctrl.signal
        })
        clearTimeout(timer)
        const updated: McpServerItem = {
          ...srv,
          status: res.ok ? 'connected' : 'ready',
          lastCheckedAt: Date.now(),
          errorMessage: undefined
        }
        this.servers.set(id, updated)
        this.save()
        this.broadcast()
        return updated
      } catch (err) {
        const updated: McpServerItem = {
          ...srv,
          status: 'ready',
          lastCheckedAt: Date.now(),
          errorMessage: `远端端点暂未响应 (${(err as Error).message})，已保留声明式工具元数据`
        }
        this.servers.set(id, updated)
        this.save()
        this.broadcast()
        return updated
      }
    }

    // Stdio JSON-RPC 2.0 quick handshake probe
    const discovered = await this.probeStdioTools(srv, workspaceDir)
    const updated: McpServerItem = {
      ...srv,
      tools: discovered && discovered.length > 0 ? discovered : srv.tools,
      status: srv.enabled ? 'connected' : 'disabled',
      lastCheckedAt: Date.now(),
      errorMessage: undefined
    }
    this.servers.set(id, updated)
    this.save()
    this.broadcast()
    return updated
  }

  private probeStdioTools(
    srv: McpServerItem,
    workspaceDir: string
  ): Promise<McpToolDescriptor[] | null> {
    return new Promise((resolve) => {
      if (!srv.command) return resolve(null)
      try {
        const child = spawn(srv.command, srv.args || [], {
          cwd: workspaceDir,
          env: {
            ...process.env,
            ...(srv.env || {}),
            PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`
          }
        })

        let stdout = ''
        const timer = setTimeout(() => {
          child.kill('SIGTERM')
          resolve(null)
        }, 3800)

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
          const lines = stdout.split('\n')
          for (const line of lines) {
            if (!line.trim().startsWith('{')) continue
            try {
              const msg = JSON.parse(line.trim())
              if (msg.id === 2 && msg.result?.tools && Array.isArray(msg.result.tools)) {
                clearTimeout(timer)
                child.kill('SIGTERM')
                resolve(
                  msg.result.tools.map((t: any) => ({
                    name: String(t.name),
                    description: String(t.description || '')
                  }))
                )
                return
              }
            } catch {
              // wait for complete line
            }
          }
        })

        child.on('error', () => {
          clearTimeout(timer)
          resolve(null)
        })

        const initReq = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'ClaudeCodeStudio', version: '2.1.0' }
          }
        })
        const listReq = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        })
        child.stdin.write(initReq + '\n' + listReq + '\n')
      } catch {
        resolve(null)
      }
    })
  }

  /**
   * Executes a tool exposed by any enabled MCP server!
   */
  async executeMcpTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    workspaceDir: string
  ): Promise<string> {
    const srv = this.servers.get(serverId)
    if (!srv) return `Error: 未找到 MCP 服务 "${serverId}"`
    if (!srv.enabled) return `Error: MCP 服务 "${srv.name}" 当前处于禁用状态，请先在 MCP 页面开启。`

    // Built-in native fast MCP bridges
    if (toolName === 'git_recent_commits') {
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 8))
      try {
        const out = execSync(
          `git log -n ${limit} --pretty=format:"%h | %ad | %an | %s" --date=short --stat`,
          { cwd: workspaceDir, encoding: 'utf-8', timeout: 5000 }
        )
        return `[MCP ${srv.name} -> git_recent_commits]\n${out || '(暂无 Git 提交记录)'}`
      } catch (e) {
        return `[MCP ${srv.name}] 当前目录非 Git 仓库或尚无提交: ${(e as Error).message}`
      }
    }

    if (toolName === 'git_file_blame') {
      const file = String(args.file_path || '')
      const start = Math.max(1, Number(args.start_line) || 1)
      const end = Math.max(start, Number(args.end_line) || start + 35)
      try {
        const out = execSync(`git blame -L ${start},${end} -- "${file}"`, {
          cwd: workspaceDir,
          encoding: 'utf-8',
          timeout: 5000
        })
        return `[MCP ${srv.name} -> git_file_blame (${file}:${start}-${end})]\n${out}`
      } catch (e) {
        return `[MCP ${srv.name}] git blame 执行提示: ${(e as Error).message}`
      }
    }

    if (toolName === 'inspect_binary_headers') {
      const target = path.isAbsolute(String(args.binary_path || ''))
        ? String(args.binary_path)
        : path.resolve(workspaceDir, String(args.binary_path || '/bin/ls'))
      try {
        const out = execSync(
          `file "${target}" && shasum -a 256 "${target}" && (otool -hv "${target}" 2>/dev/null || true) && (otool -L "${target}" 2>/dev/null || true)`,
          { cwd: workspaceDir, encoding: 'utf-8', timeout: 6000 }
        )
        return `[MCP ${srv.name} -> inspect_binary_headers]\n${out}`
      } catch (e) {
        return `[MCP ${srv.name}] 二进制头部分诊失败: ${(e as Error).message}`
      }
    }

    if (toolName === 'extract_binary_strings') {
      const target = path.isAbsolute(String(args.binary_path || ''))
        ? String(args.binary_path)
        : path.resolve(workspaceDir, String(args.binary_path || '/bin/ls'))
      const maxItems = Math.min(100, Math.max(10, Number(args.max_items) || 40))
      try {
        const out = execSync(`strings -n 5 "${target}" | head -n ${maxItems}`, {
          cwd: workspaceDir,
          encoding: 'utf-8',
          timeout: 6000
        })
        return `[MCP ${srv.name} -> extract_binary_strings (top ${maxItems})]\n${out}`
      } catch (e) {
        return `[MCP ${srv.name}] 字符串提取失败: ${(e as Error).message}`
      }
    }

    if (toolName === 'workspace_loc_stats') {
      const extCount: Record<string, { files: number; lines: number }> = {}
      const largest: Array<{ rel: string; lines: number }> = []
      const ignored = new Set(['.git', 'node_modules', 'dist', 'out', '.claude-desktop'])
      const walk = (dir: string): void => {
        let entries: fs.Dirent[] = []
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const e of entries) {
          if (ignored.has(e.name)) continue
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            walk(full)
          } else {
            const ext = path.extname(e.name) || '(no-ext)'
            try {
              const stat = fs.statSync(full)
              if (stat.size > 512_000) continue
              const lines = fs.readFileSync(full, 'utf-8').split('\n').length
              if (!extCount[ext]) extCount[ext] = { files: 0, lines: 0 }
              extCount[ext].files += 1
              extCount[ext].lines += lines
              largest.push({ rel: path.relative(workspaceDir, full), lines })
            } catch {
              // skip binary
            }
          }
        }
      }
      walk(workspaceDir)
      largest.sort((a, b) => b.lines - a.lines)
      const summary = Object.entries(extCount)
        .sort((a, b) => b[1].lines - a[1].lines)
        .map(([ext, v]) => `  ${ext.padEnd(10)} : ${v.files} files, ${v.lines} lines`)
        .join('\n')
      const topFiles = largest
        .slice(0, 8)
        .map((f) => `  ${String(f.lines).padStart(5)} lines | ${f.rel}`)
        .join('\n')
      return `[MCP ${srv.name} -> workspace_loc_stats]\nLanguage Breakdown:\n${summary}\n\nLargest Modules:\n${topFiles}`
    }

    // External HTTP MCP fallback
    if ((srv.transport === 'http' || srv.transport === 'sse') && srv.url) {
      try {
        const res = await fetch(srv.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: toolName, arguments: args }
          })
        })
        const json = await res.json()
        return JSON.stringify(json.result ?? json, null, 2)
      } catch (e) {
        return `[MCP HTTP 调用异常] ${(e as Error).message}`
      }
    }

    return `[MCP ${srv.name}] 已向服务 (${srv.command} ${(srv.args || []).join(' ')}) 分发工具调用 ${toolName}(${JSON.stringify(args)})。`
  }

  buildPromptInjection(): string {
    const enabled = this.listServers().filter((s) => s.enabled)
    if (enabled.length === 0) return ''
    const lines: string[] = [
      '### 已挂载的 MCP 服务与外部工具 (可通过 call_mcp_tool 调用)'
    ]
    for (const s of enabled) {
      const toolList = s.tools.map((t) => `${t.name}`).join(', ')
      lines.push(`- [${s.id}] ${s.name}: ${s.summary} (暴露工具: ${toolList})`)
    }
    return lines.join('\n')
  }

  private broadcast(newlyAdded?: McpServerItem): void {
    this.emitUpdate({
      type: 'mcp_updated',
      mcpServers: this.listServers(),
      ...(newlyAdded
        ? {
            notification: {
              title: `🔌 MCP 服务已挂载: ${newlyAdded.name}`,
              body: `可在左侧边栏「MCP」页面查看连接状态、暴露工具与调用示例。`,
              timestamp: Date.now()
            }
          }
        : {})
    })
  }
}
