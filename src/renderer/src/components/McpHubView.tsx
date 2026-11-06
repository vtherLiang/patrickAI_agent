import React, { useState, useMemo } from 'react'
import {
  ArrowLeft,
  Cpu,
  Plus,
  RefreshCw,
  Play,
  ArrowUpRight,
  Trash2,
  Terminal,
  Wrench,
  X,
  MessageSquarePlus
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

const QUICK_MCP_TEMPLATES = [
  {
    name: 'GitHub Repository MCP',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    category: '代码托管与 PR 协同',
    summary: '连接 GitHub Issues、Pull Requests、Code Search 与 Release API 的官方 MCP 服务。',
    explanation:
      '挂载后允许智能体直接读取仓库 Issue 上下文、创建或评审 Pull Request 并检索远端分支提交，适合跨仓库协作研发。',
    tools: [
      { name: 'search_repositories', description: '检索 GitHub 仓库元数据' },
      { name: 'list_pull_requests', description: '获取目标仓库活跃 PR 与评审评论' }
    ]
  },
  {
    name: 'SQLite Local Database MCP',
    transport: 'stdio' as const,
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', './local.db'],
    category: '本地数据库查询',
    summary: '只读与受控 SQL 查询本地 SQLite 数据库表结构与采样记录。',
    explanation:
      '自动提取 SQLite Schema（CREATE TABLE）与索引分布，支持智能体直接编写并验证 SQL 查询性能。',
    tools: [
      { name: 'list_tables', description: '列出当前 SQLite 数据库所有数据表结构' },
      { name: 'read_query', description: '执行安全的 SELECT 分析查询' }
    ]
  },
  {
    name: 'Ghidra Headless Decompiler MCP',
    transport: 'http' as const,
    url: 'http://127.0.0.1:8089/mcp',
    category: '安全与二进制逆向',
    summary: '桥接本地 Ghidra Headless / GhidraMCP 实例，远程拉取反编译伪代码与交叉引用表。',
    explanation:
      '与 reverse-engineering 技能深度联动：当本地启动 GhidraMCP 插件（默认端口 8089）后，智能体可按地址实时拉取反编译 C 伪代码、重命名符号并同步结构体定义。',
    tools: [
      { name: 'decompile_function', description: '按函数名或虚拟地址获取 Ghidra 反编译伪代码' },
      { name: 'list_xrefs_to', description: '查询指向目标地址的所有代码/数据交叉引用' }
    ]
  }
]

export const McpHubView: React.FC = () => {
  const {
    mcpServers,
    toggleMcpServer,
    upsertMcpServer,
    deleteMcpServer,
    probeMcpServer,
    setWorkbenchSubView,
    launchExamplePromptInChat
  } = useAppStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [probingId, setProbingId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('npx')
  const [argsText, setArgsText] = useState('-y @modelcontextprotocol/server-memory')
  const [url, setUrl] = useState('http://127.0.0.1:8080/mcp')
  const [summary, setSummary] = useState('')
  const [explanation, setExplanation] = useState('')

  const activeServer = useMemo(() => {
    if (selectedId) {
      const found = mcpServers.find((s) => s.id === selectedId)
      if (found) return found
    }
    return mcpServers[0] || null
  }, [mcpServers, selectedId])

  const handleProbe = async (id: string): Promise<void> => {
    setProbingId(id)
    try {
      await probeMcpServer(id)
    } finally {
      setProbingId(null)
    }
  }

  const handleCreateCustom = async (): Promise<void> => {
    if (!name.trim()) return
    await upsertMcpServer({
      name: name.trim(),
      transport,
      command: transport === 'stdio' ? command.trim() : undefined,
      args:
        transport === 'stdio'
          ? argsText
              .trim()
              .split(/\s+/)
              .filter(Boolean)
          : undefined,
      url: transport !== 'stdio' ? url.trim() : undefined,
      summary: summary.trim() || undefined,
      explanation: explanation.trim() || undefined,
      installedBy: 'user'
    })
    setName('')
    setSummary('')
    setExplanation('')
    setShowAddModal(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FBFBFD] animate-apple-view">
      {/* Header */}
      <div className="px-7 pt-6 pb-4 bg-white border-b border-black/[0.06] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWorkbenchSubView('chat')}
            className="apple-press px-3 py-1.5 rounded-full bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回线程对话</span>
          </button>

          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-[#1d1d1f]">
              MCP 服务挂载台
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              launchExamplePromptInChat(
                '请帮我挂载一个名为「Radare2 Binary Analysis MCP」的 stdio MCP 服务（命令 r2mcp），包含详细用途解释与反汇编函数分析工具说明。',
                false
              )
            }
            className="apple-press px-3.5 py-2 rounded-full bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.06] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-[#0071e3]" />
            <span>在对话中让 Agent 挂载</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="apple-press px-4 py-2 rounded-full bg-[#1d1d1f] hover:bg-black text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-[0_3px_12px_rgba(0,0,0,0.14)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>挂载 MCP 服务</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left List */}
        <div className="w-[330px] border-r border-black/[0.06] bg-[#F5F5F7]/55 overflow-y-auto p-3.5 space-y-2.5 shrink-0">
          {mcpServers.map((srv) => {
            const isSelected = activeServer?.id === srv.id
            const dotClass = !srv.enabled
              ? 'bg-[#aeaeb2]'
              : srv.status === 'connected'
                ? 'bg-[#34C759]'
                : 'bg-[#0071e3]'

            return (
              <div
                key={srv.id}
                onClick={() => setSelectedId(srv.id)}
                className={`apple-press rounded-2xl p-3.5 cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-white border-black/[0.1] shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                    : 'bg-white/65 hover:bg-white border-black/[0.05]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-[#1d1d1f] truncate">
                        {srv.name}
                      </div>
                      <div className="text-[10.5px] font-mono text-[#86868b] truncate">
                        {srv.transport.toUpperCase()} · {srv.tools.length} tools
                      </div>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={srv.enabled}
                      data-checked={srv.enabled}
                      onClick={() => toggleMcpServer(srv.id)}
                      className="apple-switch"
                    >
                      <span className="apple-switch-thumb" />
                    </button>
                  </div>
                </div>

                <p className="text-[11.5px] text-[#6e6e73] line-clamp-2 leading-relaxed mb-2">
                  {srv.summary}
                </p>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-black/[0.05] text-[#6e6e73]">
                    {srv.category}
                  </span>
                  {srv.installedBy === 'agent' && (
                    <span className="px-2 py-0.5 rounded-full bg-[#D97757]/12 text-[#C45533] font-medium">
                      对话装载
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Detail Pane */}
        <div className="flex-1 overflow-y-auto p-7 bg-white">
          {activeServer ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Hero Card */}
              <div className="rounded-3xl bg-[#F5F5F7]/75 border border-black/[0.06] p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-white border border-black/[0.07] text-[11px] font-mono font-semibold text-[#1d1d1f]">
                        {activeServer.transport.toUpperCase()}
                      </span>
                      <span className="text-[11.5px] text-[#6e6e73]">{activeServer.category}</span>
                    </div>
                    <h2 className="text-[24px] font-semibold text-[#1d1d1f] tracking-tight">
                      {activeServer.name}
                    </h2>
                    <p className="text-[13.5px] text-[#3a3a3c] mt-1">{activeServer.summary}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleProbe(activeServer.id)}
                      disabled={probingId === activeServer.id}
                      className="apple-press px-3.5 py-1.5 rounded-full bg-white border border-black/[0.08] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          probingId === activeServer.id ? 'animate-spin text-[#0071e3]' : ''
                        }`}
                      />
                      <span>{probingId === activeServer.id ? '握手中...' : '探测连接'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteMcpServer(activeServer.id)}
                      title="卸载此 MCP 服务"
                      className="apple-press p-2 rounded-full bg-white hover:bg-[#FF3B30]/10 border border-black/[0.08] text-[#86868b] hover:text-[#FF3B30]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Endpoint / Command Preview */}
                <div className="rounded-2xl bg-white border border-black/[0.06] px-4 py-3 flex items-center gap-2.5 font-mono text-[12px] text-[#1d1d1f]">
                  <Terminal className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                  <span className="truncate">
                    {activeServer.transport === 'stdio'
                      ? `${activeServer.command || ''} ${(activeServer.args || []).join(' ')}`
                      : activeServer.url}
                  </span>
                </div>

                {activeServer.errorMessage && (
                  <div className="text-[11.5px] text-[#C96A00] bg-[#FF9500]/10 px-3 py-2 rounded-xl">
                    {activeServer.errorMessage}
                  </div>
                )}
              </div>

              {/* Explanation */}
              <section className="space-y-2">
                <h3 className="text-[14px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#0071e3]" />
                  <span>服务架构解释与用途</span>
                </h3>
                <div className="rounded-2xl border border-black/[0.07] bg-white p-5 text-[13.5px] text-[#3a3a3c] leading-[1.72]">
                  {activeServer.explanation}
                </div>
              </section>

              {/* Exposed Tools */}
              <section className="space-y-2.5">
                <h3 className="text-[14px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#D97757]" />
                  <span>暴露的 MCP 工具函数 ({activeServer.tools.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeServer.tools.map((t, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-black/[0.07] bg-[#FBFBFD] p-4 space-y-1.5"
                    >
                      <div className="font-mono text-[12.5px] font-semibold text-[#1d1d1f]">
                        {t.name}()
                      </div>
                      <p className="text-[12px] text-[#6e6e73] leading-relaxed">{t.description}</p>
                      {t.inputExample && (
                        <div className="pt-1 font-mono text-[11px] text-[#86868b] truncate">
                          参数示例: {t.inputExample}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Usage Examples */}
              <section className="space-y-2.5">
                <h3 className="text-[14px] font-semibold text-[#1d1d1f]">对话调用示例</h3>
                <div className="space-y-2.5">
                  {activeServer.usageExamples.map((ex, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-black/[0.08] bg-white p-4 flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#1d1d1f]">{ex.title}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => launchExamplePromptInChat(ex.prompt, false)}
                            className="apple-press px-3 py-1 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[11.5px] font-medium text-[#1d1d1f] flex items-center gap-1"
                          >
                            <span>填入对话框</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => launchExamplePromptInChat(ex.prompt, true)}
                            className="apple-press px-3.5 py-1 rounded-full bg-[#0071e3] hover:bg-[#0077ED] text-[11.5px] font-semibold text-white flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>立即调用</span>
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#F5F5F7] px-3 py-2 font-mono text-[12px] text-[#1d1d1f]">
                        ❯ {ex.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {/* Add MCP Server Modal (Templates + Custom) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-apple-modal w-full max-w-xl rounded-3xl bg-white p-6 border border-black/[0.1] shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1d1d1f]">挂载新 MCP 服务</h3>
                <p className="text-[12px] text-[#6e6e73] mt-0.5">
                  一键选择常用官方模板，或自定义 Stdio / HTTP 端点
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-full hover:bg-black/[0.06] text-[#6e6e73]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1-Click Quick Templates */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                一键预置模板
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {QUICK_MCP_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={async () => {
                      await upsertMcpServer({ ...tpl, installedBy: 'preset' })
                      setShowAddModal(false)
                    }}
                    className="apple-press p-3 rounded-2xl bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.06] text-left space-y-1"
                  >
                    <div className="text-[12px] font-semibold text-[#1d1d1f] truncate">
                      {tpl.name}
                    </div>
                    <div className="text-[10.5px] text-[#6e6e73] line-clamp-2">{tpl.summary}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-black/[0.06] pt-3 space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                    服务名称
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：Postgres Analytics MCP"
                    className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                    传输协议
                  </label>
                  <select
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as 'stdio' | 'http' | 'sse')}
                    className="w-full rounded-xl bg-[#F5F5F7] border border-black/[0.08] px-2.5 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                  >
                    <option value="stdio">stdio</option>
                    <option value="http">http</option>
                    <option value="sse">sse</option>
                  </select>
                </div>
              </div>

              {transport === 'stdio' ? (
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                      命令 (Command)
                    </label>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12px] font-mono text-[#1d1d1f] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                      参数 (空格分隔)
                    </label>
                    <input
                      type="text"
                      value={argsText}
                      onChange={(e) => setArgsText(e.target.value)}
                      className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12px] font-mono text-[#1d1d1f] focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                    远端 URL 端点
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12px] font-mono text-[#1d1d1f] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  一句话摘要与说明
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="说明该 MCP 暴露哪些外部能力..."
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="apple-press px-4 py-2 rounded-full bg-[#F2F2F7] text-[12.5px] font-medium text-[#1d1d1f]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!name.trim()}
                onClick={handleCreateCustom}
                className="apple-press px-5 py-2 rounded-full bg-[#0071e3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-[12.5px] font-semibold"
              >
                确认挂载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
