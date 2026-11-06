import React, { useState, useEffect, useRef } from 'react'
import {
  Moon,
  Sparkles,
  Play,
  Plus,
  Check,
  ChevronDown,
  X,
  Search,
  Trash2,
  Network,
  Layers
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { MemoryLayer, RecalledMemoryItem } from '@shared/types'
import { LAYER_BADGE_STYLE } from './ClaudeActivityElements'

const LAYER_INFO: Record<
  MemoryLayer,
  { label: string; desc: string; retentionTag: string }
> = {
  L1: {
    label: 'L1 · 核心理念与最高原则',
    desc: '用户的顶层设计哲学、架构信仰与不可妥协的安全边界',
    retentionTag: '永不衰减 · 顶层常驻'
  },
  L2: {
    label: 'L2 · 全局架构与领域模型',
    desc: '代码库模块职责契约、核心数据流与技术栈关键事实',
    retentionTag: '半衰期 90d · 稳态层'
  },
  L3: {
    label: 'L3 · 工作流与技能范式',
    desc: '经验证的构建/调试 SOP、已装载 Skill 与 MCP 协作方法论',
    retentionTag: '半衰期 45d · 程序记忆'
  },
  L4: {
    label: 'L4 · 情景决策与踩坑教训',
    desc: '具体会话中的 Bug 根因、环境坑点修复与历史技术取舍',
    retentionTag: '半衰期 14d · 艾宾浩斯强化'
  },
  L5: {
    label: 'L5 · 细粒度偏好与微习惯',
    desc: '沟通语种、代码命名、UI 细节偏好与快捷键交互微习惯',
    retentionTag: '半衰期 30d · 动态微调'
  }
}

export const KairosView: React.FC = () => {
  const {
    config,
    updateConfig,
    memoryMarkdown,
    memoryNodes,
    dreamLogs,
    kairosRules,
    triggerDream,
    saveMemoryMarkdown,
    upsertMemoryNode,
    deleteMemoryNode,
    searchMemories,
    toggleKairosRule,
    addKairosRule,
    runKairosRuleNow
  } = useAppStore()

  const [selectedLayer, setSelectedLayer] = useState<'ALL' | MemoryLayer>('ALL')
  const [activeTab, setActiveTab] = useState<'nodes' | 'index_md'>('nodes')
  const [draftMemory, setDraftMemory] = useState(memoryMarkdown)
  const [isDreaming, setIsDreaming] = useState(false)
  const [syncState, setSyncState] = useState<'synced' | 'saving'>('synced')

  // Live Recall Simulator
  const [simQuery, setSimQuery] = useState('')
  const [simResults, setSimResults] = useState<RecalledMemoryItem[] | null>(null)

  // Add Memory Node Modal
  const [showAddNode, setShowAddNode] = useState(false)
  const [nodeLayer, setNodeLayer] = useState<MemoryLayer>('L1')
  const [nodeTitle, setNodeTitle] = useState('')
  const [nodeContent, setNodeContent] = useState('')
  const [nodeKeywords, setNodeKeywords] = useState('')

  // Add KAIROS Rule Sheet
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleMinutes, setNewRuleMinutes] = useState('30')
  const [newRulePrompt, setNewRulePrompt] = useState('')

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraftMemory(memoryMarkdown)
  }, [memoryMarkdown])

  const handleMemoryChange = (nextText: string): void => {
    setDraftMemory(nextText)
    setSyncState('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      await saveMemoryMarkdown(nextText)
      setSyncState('synced')
    }, 600)
  }

  const handleRunDream = async (): Promise<void> => {
    setIsDreaming(true)
    try {
      await triggerDream()
    } finally {
      setIsDreaming(false)
    }
  }

  const handleSimulateSearch = async (q: string): Promise<void> => {
    setSimQuery(q)
    if (!q.trim()) {
      setSimResults(null)
      return
    }
    const hits = await searchMemories(q.trim())
    setSimResults(hits)
  }

  const handleCreateNode = async (): Promise<void> => {
    if (!nodeTitle.trim() || !nodeContent.trim()) return
    await upsertMemoryNode({
      layer: nodeLayer,
      title: nodeTitle.trim(),
      content: nodeContent.trim(),
      keywords: nodeKeywords
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    })
    setNodeTitle('')
    setNodeContent('')
    setNodeKeywords('')
    setShowAddNode(false)
  }

  const handleAddRule = async (): Promise<void> => {
    if (!newRuleName.trim() || !newRulePrompt.trim()) return
    await addKairosRule({
      name: newRuleName.trim(),
      type: 'interval',
      patternOrMinutes: newRuleMinutes || '30',
      promptInstruction: newRulePrompt.trim()
    })
    setNewRuleName('')
    setNewRulePrompt('')
    setShowAddSheet(false)
  }

  const autoCrystallizeOn = config?.autoMemoryCrystallize ?? true
  const filteredNodes =
    selectedLayer === 'ALL'
      ? memoryNodes
      : memoryNodes.filter((n) => n.layer === selectedLayer)

  const indexLineCount = draftMemory.split('\n').length

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 bg-[#FBFBFD]">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Editorial Header + Automatic Turn-by-Turn Crystallization Toggle */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F2F7] border border-black/[0.06] text-[11px] font-medium text-[#3a3a3c] mb-2.5">
              <Moon className="w-3 h-3 text-[#5856D6]" />
              <span>
                Claude Code memdir + A-MEM 自演化笔记 + HippoRAG 联想图谱 + 艾宾浩斯遗忘强化
              </span>
            </div>
            <h1 className="text-[30px] font-semibold tracking-tight apple-hero-text">
              L1–L5 分层认知记忆与守护引擎
            </h1>
            <p className="text-[13px] text-[#6e6e73] mt-1">
              无需手动点击：每次询问前自动混合检索回调相关分层记忆，每次回复后后台无感结晶演化新认知。
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Zero-Click Automatic Post-Turn Crystallization Pill */}
            <div className="px-4 py-2 rounded-full bg-white border border-black/[0.08] shadow-sm flex items-center gap-2.5">
              <span className="text-[12px] font-medium text-[#1d1d1f]">
                每次对话后自动结晶记忆
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoCrystallizeOn}
                data-checked={autoCrystallizeOn}
                onClick={() =>
                  updateConfig({ autoMemoryCrystallize: !autoCrystallizeOn })
                }
                className="apple-switch"
              >
                <span className="apple-switch-thumb" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowAddNode(true)}
              className="apple-press px-4 py-2 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[12.5px] font-semibold text-[#1d1d1f] flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>手动写入记忆</span>
            </button>

            <button
              onClick={handleRunDream}
              disabled={isDreaming}
              className="apple-press px-4 py-2 rounded-full bg-[#5856D6] hover:bg-[#4B49C8] disabled:opacity-50 text-white text-[12.5px] font-semibold flex items-center gap-1.5 shadow-[0_4px_16px_rgba(88,86,214,0.28)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isDreaming ? '正在深度重整...' : '全局深度整合'}</span>
            </button>
          </div>
        </div>

        {/* L1 - L5 Cognitive Stratification Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <button
            type="button"
            onClick={() => setSelectedLayer('ALL')}
            className={`apple-press rounded-2xl p-3.5 text-left border transition-all ${
              selectedLayer === 'ALL'
                ? 'bg-[#1d1d1f] text-white border-[#1d1d1f] shadow-md'
                : 'bg-white border-black/[0.06] hover:border-black/[0.14] text-[#1d1d1f]'
            }`}
          >
            <div className="text-[11px] font-mono opacity-75">ALL LAYERS</div>
            <div className="text-[20px] font-semibold mt-0.5">{memoryNodes.length}</div>
            <div className="text-[11px] opacity-80 mt-0.5">全部原子记忆</div>
          </button>

          {(['L1', 'L2', 'L3', 'L4', 'L5'] as MemoryLayer[]).map((layer) => {
            const count = memoryNodes.filter((n) => n.layer === layer).length
            const active = selectedLayer === layer
            return (
              <button
                key={layer}
                type="button"
                onClick={() => setSelectedLayer(layer)}
                className={`apple-press rounded-2xl p-3.5 text-left border transition-all ${
                  active
                    ? 'bg-white border-[#0071e3] ring-2 ring-[#0071e3]/15 shadow-sm'
                    : 'bg-white border-black/[0.06] hover:border-black/[0.14]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-1.5 py-0.2 rounded border text-[10.5px] font-mono font-semibold ${LAYER_BADGE_STYLE[layer]}`}
                  >
                    {layer}
                  </span>
                  <span className="text-[16px] font-semibold text-[#1d1d1f]">{count}</span>
                </div>
                <div className="text-[11.5px] font-medium text-[#1d1d1f] mt-1.5 truncate">
                  {LAYER_INFO[layer].label.split(' · ')[1]}
                </div>
                <div className="text-[10px] text-[#86868b] mt-0.5 truncate">
                  {LAYER_INFO[layer].retentionTag}
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 8 Cols: L1-L5 Zettelkasten Atomic Matrix + Live Query Recall Simulator + <200-line MEMORY.md */}
          <div className="lg:col-span-8 apple-bento rounded-3xl p-6 flex flex-col space-y-4">
            {/* Sub-Header Switcher */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex p-0.5 rounded-full bg-[#EFEFF4] border border-black/[0.05]">
                <button
                  type="button"
                  onClick={() => setActiveTab('nodes')}
                  className={`px-3.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-all ${
                    activeTab === 'nodes'
                      ? 'bg-white text-[#1d1d1f] shadow-sm'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>分层原子记忆图谱 ({filteredNodes.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('index_md')}
                  className={`px-3.5 py-1 rounded-full text-[12px] font-medium transition-all ${
                    activeTab === 'index_md'
                      ? 'bg-white text-[#1d1d1f] shadow-sm'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  memdir 总索引 MEMORY.md ({indexLineCount}/200 行)
                </button>
              </div>

              {selectedLayer !== 'ALL' && (
                <span className="text-[11.5px] text-[#6e6e73]">
                  {LAYER_INFO[selectedLayer].desc}
                </span>
              )}
            </div>

            {/* Live Retrieval Callback Simulator */}
            <div className="rounded-2xl bg-[#F5F5F7]/85 border border-black/[0.06] p-3.5 space-y-2.5">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3" />
                <input
                  type="text"
                  value={simQuery}
                  onChange={(e) => handleSimulateSearch(e.target.value)}
                  placeholder="输入任意模拟提问，实时测试每次对话的 L1–L5 记忆检索与回调命中得分..."
                  className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-white border border-black/[0.07] text-[12.5px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0071e3]"
                />
                {simQuery && (
                  <button
                    type="button"
                    onClick={() => handleSimulateSearch('')}
                    className="absolute right-2.5 text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {simResults && (
                <div className="animate-apple-view space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-[#5856D6]">
                    模拟检索回调结果（本提问将向 System Prompt 动态注入以下 {simResults.length} 条记忆）：
                  </div>
                  {simResults.map((hit) => (
                    <div
                      key={hit.id}
                      className="rounded-xl bg-white border border-black/[0.06] px-3 py-2 flex items-center justify-between gap-2 text-[12px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.2 rounded border text-[10px] font-mono font-semibold shrink-0 ${
                            LAYER_BADGE_STYLE[hit.layer]
                          }`}
                        >
                          {hit.layer}
                        </span>
                        <span className="font-semibold text-[#1d1d1f] truncate">{hit.title}</span>
                      </div>
                      <span className="text-[10.5px] font-mono text-[#6e6e73] shrink-0">
                        {hit.matchReason} · {Math.round(hit.score * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeTab === 'nodes' ? (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {filteredNodes.map((node) => (
                  <div
                    key={node.id}
                    className="group rounded-2xl bg-[#FBFBFD] hover:bg-white border border-black/[0.07] hover:border-black/[0.13] p-4 transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10.5px] font-mono font-semibold ${
                            LAYER_BADGE_STYLE[node.layer]
                          }`}
                        >
                          {node.layer}
                        </span>
                        <h3 className="text-[13.5px] font-semibold text-[#1d1d1f]">
                          {node.title}
                        </h3>
                        {node.source === 'auto_turn' && (
                          <span className="px-2 py-0.2 rounded-full bg-[#5856D6]/10 text-[#5856D6] text-[10px] font-medium">
                            对话自动结晶
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-[10.5px] font-mono text-[#86868b] shrink-0">
                        <span>回调 {node.accessCount} 次</span>
                        {node.links.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[#0071e3]">
                            <Network className="w-3 h-3" />
                            {node.links.length}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteMemoryNode(node.id)}
                          title="删除该记忆节点"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#FF3B30]/10 text-[#86868b] hover:text-[#FF3B30] transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[12.5px] text-[#3a3a3c] leading-relaxed">{node.content}</p>

                    {node.keywords.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {node.keywords.slice(0, 7).map((kw, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.2 rounded bg-[#F2F2F7] text-[10.5px] font-mono text-[#6e6e73]"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11.5px] text-[#6e6e73]">
                  <span className="font-mono">.claude-desktop/MEMORY.md (严格受控 &lt; 200 行上限)</span>
                  <span className="inline-flex items-center gap-1">
                    {syncState === 'saving' ? (
                      '正在同步...'
                    ) : (
                      <>
                        <Check className="w-3 h-3 text-[#34C759]" />
                        <span>已同步</span>
                      </>
                    )}
                  </span>
                </div>
                <textarea
                  value={draftMemory}
                  onChange={(e) => handleMemoryChange(e.target.value)}
                  rows={18}
                  className="w-full rounded-2xl bg-[#F5F5F7]/70 border border-black/[0.06] focus:bg-white focus:border-black/[0.16] focus:outline-none p-4 font-mono text-[11.5px] text-[#1d1d1f] leading-[1.68] resize-none transition-all"
                />
              </div>
            )}

            {dreamLogs.length > 0 && (
              <details className="group pt-3 border-t border-black/[0.06]">
                <summary className="cursor-pointer list-none flex items-center justify-between text-[12px] text-[#6e6e73] hover:text-[#1d1d1f] select-none">
                  <span>最近自动结晶与演化流水 ({dreamLogs.length})</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto">
                  {dreamLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.05] text-[12px]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-[#1d1d1f]">{log.summary}</span>
                        <span className="text-[10px] font-mono text-[#86868b]">
                          {log.trigger === 'auto_turn' ? '自动结晶 · ' : ''}
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <ul className="list-disc list-inside text-[#6e6e73] space-y-0.5 text-[11px]">
                        {log.extractedRules.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Right 4 Cols: KAIROS Autonomous Background Patrol Rules */}
          <div className="lg:col-span-4 apple-bento rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1d1d1f]">KAIROS 后台巡检</h2>
                  <p className="text-[12px] text-[#86868b] mt-0.5">
                    常驻菜单栏，按周期静默守护工作区
                  </p>
                </div>

                <button
                  onClick={() => setShowAddSheet((v) => !v)}
                  title="添加巡检规则"
                  className="apple-press w-7 h-7 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1d1d1f]"
                >
                  {showAddSheet ? <X className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              {showAddSheet && (
                <div className="animate-apple-modal mb-4 p-4 rounded-2xl bg-[#F5F5F7] border border-black/[0.07] space-y-2.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      placeholder="巡检名称"
                      className="flex-1 rounded-xl bg-white border border-black/[0.08] px-3 py-1.5 text-[12px] text-[#1d1d1f] focus:outline-none"
                    />
                    <input
                      type="number"
                      value={newRuleMinutes}
                      onChange={(e) => setNewRuleMinutes(e.target.value)}
                      placeholder="分钟"
                      className="w-16 rounded-xl bg-white border border-black/[0.08] px-2.5 py-1.5 text-[12px] text-[#1d1d1f] font-mono text-center focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={newRulePrompt}
                    onChange={(e) => setNewRulePrompt(e.target.value)}
                    placeholder="唤醒后执行的检查指令..."
                    className="w-full rounded-xl bg-white border border-black/[0.08] px-3 py-1.5 text-[12px] text-[#1d1d1f] focus:outline-none"
                  />
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleAddRule}
                      disabled={!newRuleName.trim() || !newRulePrompt.trim()}
                      className="apple-press px-4 py-1.5 rounded-full bg-[#1d1d1f] text-white disabled:opacity-35 text-[12px] font-semibold"
                    >
                      创建规则
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-[#F5F5F7]/75 border border-black/[0.06] divide-y divide-black/[0.06] overflow-hidden">
                {kairosRules.map((rule) => (
                  <div key={rule.id} className="p-4 group hover:bg-black/[0.02] transition-colors">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[13px] font-semibold text-[#1d1d1f] truncate">
                        {rule.name}
                      </span>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          onClick={() => runKairosRuleNow(rule.id)}
                          title="立即执行一次巡检"
                          className="apple-press opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-white border border-black/[0.07] text-[#1d1d1f] transition-opacity shadow-sm"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </button>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.enabled}
                          data-checked={rule.enabled}
                          onClick={() => toggleKairosRule(rule.id)}
                          className="apple-switch"
                        >
                          <span className="apple-switch-thumb" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[12px] text-[#6e6e73] leading-relaxed mb-1.5">
                      {rule.promptInstruction}
                    </p>

                    <div className="text-[11px] text-[#86868b]">
                      {rule.type === 'interval'
                        ? `每 ${rule.patternOrMinutes} 分钟运行`
                        : `监听 ${rule.patternOrMinutes}`}
                      {rule.lastTriggeredAt &&
                        ` · 上次 ${new Date(rule.lastTriggeredAt).toLocaleTimeString()}`}
                    </div>

                    {rule.lastResult && (
                      <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-white border border-black/[0.05] font-mono text-[10.5px] text-[#177233] truncate">
                        {rule.lastResult}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-black/[0.06] text-[11px] text-[#86868b] leading-relaxed space-y-1">
              <div>
                <strong>分层存储位置：</strong>
                <span className="font-mono">.claude-desktop/memdir/L1..L5_*.md</span>
              </div>
              <div>
                关闭窗口后程序将继续在 macOS 菜单栏静默运行，随时按{' '}
                <kbd className="font-mono text-[#1d1d1f]">⌥Space</kbd> 呼出。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Manual L1-L5 Memory Node Modal */}
      {showAddNode && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-apple-modal w-full max-w-md rounded-3xl bg-white p-6 border border-black/[0.1] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#1d1d1f]">
                写入 L1–L5 分层认知记忆
              </h3>
              <button
                type="button"
                onClick={() => setShowAddNode(false)}
                className="p-1.5 rounded-full hover:bg-black/[0.06] text-[#6e6e73]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  记忆层级 (L1–L5)
                </label>
                <select
                  value={nodeLayer}
                  onChange={(e) => setNodeLayer(e.target.value as MemoryLayer)}
                  className="w-full rounded-xl bg-[#F5F5F7] border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                >
                  {(['L1', 'L2', 'L3', 'L4', 'L5'] as MemoryLayer[]).map((l) => (
                    <option key={l} value={l}>
                      {LAYER_INFO[l].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  原子记忆标题
                </label>
                <input
                  type="text"
                  value={nodeTitle}
                  onChange={(e) => setNodeTitle(e.target.value)}
                  placeholder="例如：核心模块必须保持零外部运行时耦合"
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  记忆内容描述
                </label>
                <textarea
                  rows={3}
                  value={nodeContent}
                  onChange={(e) => setNodeContent(e.target.value)}
                  placeholder="详细描述该原则、架构约定、工作流或细粒度偏好..."
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  检索关联关键词（逗号分隔，可选）
                </label>
                <input
                  type="text"
                  value={nodeKeywords}
                  onChange={(e) => setNodeKeywords(e.target.value)}
                  placeholder="如：架构, 解耦, typescript"
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddNode(false)}
                className="apple-press px-4 py-2 rounded-full bg-[#F2F2F7] text-[12.5px] font-medium text-[#1d1d1f]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!nodeTitle.trim() || !nodeContent.trim()}
                onClick={handleCreateNode}
                className="apple-press px-5 py-2 rounded-full bg-[#0071e3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-[12.5px] font-semibold"
              >
                保存至 {nodeLayer}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
