import React, { useState, useEffect } from 'react'
import {
  Moon,
  Sparkles,
  Save,
  Shield,
  Play,
  Plus,
  Clock,
  FileSearch,
  CheckCircle2
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const KairosView: React.FC = () => {
  const {
    memoryMarkdown,
    dreamLogs,
    kairosRules,
    triggerDream,
    saveMemoryMarkdown,
    toggleKairosRule,
    addKairosRule,
    runKairosRuleNow
  } = useAppStore()

  const [draftMemory, setDraftMemory] = useState(memoryMarkdown)
  const [isDreaming, setIsDreaming] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)

  // New KAIROS rule form
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleMinutes, setNewRuleMinutes] = useState('30')
  const [newRulePrompt, setNewRulePrompt] = useState('')

  useEffect(() => {
    setDraftMemory(memoryMarkdown)
  }, [memoryMarkdown])

  const handleRunDream = async (): Promise<void> => {
    setIsDreaming(true)
    try {
      await triggerDream()
    } finally {
      setIsDreaming(false)
    }
  }

  const handleSaveMemory = async (): Promise<void> => {
    await saveMemoryMarkdown(draftMemory)
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
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
  }

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 bg-[#0d0f12] overflow-y-auto">
      {/* Left 7 Cols: Dream Engine & Persistent MEMORY.md Editor */}
      <div className="lg:col-span-7 flex flex-col space-y-5">
        <div className="rounded-2xl bg-[#14171c] border border-[#282e39] p-5 flex flex-col flex-1">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Moon className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  方向 C：Dream 夜间记忆整理引擎 (<code className="text-amber-300">MEMORY.md</code>)
                </h2>
                <p className="text-xs text-slate-400">
                  复盘历史会话与代码改动，自动将项目架构规范与踩坑经验沉淀到{' '}
                  <code className="text-slate-300">.claude-desktop/MEMORY.md</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRunDream}
                disabled={isDreaming}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isDreaming ? '正在提炼记忆...' : '✨ 立即启动 Dream 提炼'}</span>
              </button>

              <button
                onClick={handleSaveMemory}
                className="px-3.5 py-2 rounded-xl bg-[#1b1f27] hover:bg-[#252a35] border border-[#282e39] text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
              >
                {savedNotice ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">已保存</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-slate-400" />
                    <span>保存修改</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <textarea
            value={draftMemory}
            onChange={(e) => setDraftMemory(e.target.value)}
            rows={15}
            className="flex-1 w-full rounded-xl bg-[#0d0f12] border border-[#282e39] focus:border-indigo-500 focus:outline-none p-4 font-mono text-xs text-slate-200 leading-relaxed resize-none"
          />

          {/* Recent Dream Consolidation History */}
          <div className="mt-4 pt-4 border-t border-[#282e39]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Dream 记忆结晶历史记录 ({dreamLogs.length})
            </h3>
            {dreamLogs.length === 0 ? (
              <div className="text-xs text-slate-500 py-3">
                暂无做梦记录，点击右上角「✨ 立即启动 Dream 提炼」即可体验自动记忆归纳。
              </div>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {dreamLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-[#0d0f12] border border-[#282e39] text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className="font-semibold text-indigo-300">{log.summary}</span>
                      <span className="font-mono text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-slate-400 space-y-0.5 text-[11px]">
                      {log.extractedRules.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right 5 Cols: KAIROS Autonomous Background Daemon & Proactive Triggers */}
      <div className="lg:col-span-5 flex flex-col space-y-5">
        <div className="rounded-2xl bg-[#14171c] border border-[#282e39] p-5 flex-1 flex flex-col">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                KAIROS 自主后台守护规则 (Proactive Daemon)
              </h2>
              <p className="text-xs text-slate-400">
                关闭主窗口后常驻 Mac 顶部菜单栏，按计划巡检项目并推送原生通知
              </p>
            </div>
          </div>

          {/* Rule List */}
          <div className="space-y-3 flex-1 overflow-y-auto">
            {kairosRules.map((rule) => (
              <div
                key={rule.id}
                className="p-3.5 rounded-xl bg-[#0d0f12] border border-[#282e39] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {rule.type === 'interval' ? (
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <FileSearch className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    <span className="text-xs font-semibold text-slate-200">{rule.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => runKairosRuleNow(rule.id)}
                      className="px-2 py-1 rounded bg-[#1b1f27] hover:bg-[#252a35] border border-[#282e39] text-[11px] text-slate-300 flex items-center gap-1 transition"
                      title="立即在后台执行一次巡检"
                    >
                      <Play className="w-3 h-3 text-emerald-400" />
                      <span>立即巡检</span>
                    </button>

                    <button
                      onClick={() => toggleKairosRule(rule.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                        rule.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {rule.enabled ? '守护中' : '已暂停'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400">{rule.promptInstruction}</p>

                <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between">
                  <span>
                    触发条件:{' '}
                    {rule.type === 'interval'
                      ? `每 ${rule.patternOrMinutes} 分钟`
                      : `监听 ${rule.patternOrMinutes}`}
                  </span>
                  {rule.lastTriggeredAt && (
                    <span>上次执行: {new Date(rule.lastTriggeredAt).toLocaleTimeString()}</span>
                  )}
                </div>

                {rule.lastResult && (
                  <div className="p-2 rounded bg-[#14171c] border border-[#282e39] font-mono text-[11px] text-emerald-300/90">
                    {rule.lastResult}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add New Rule Box */}
          <div className="mt-4 pt-4 border-t border-[#282e39] space-y-2.5">
            <div className="text-xs font-semibold text-slate-300">新增后台定时巡检规则</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="规则名称 (如: 依赖漏洞巡检)"
                className="flex-1 rounded-lg bg-[#0d0f12] border border-[#282e39] px-3 py-1.5 text-xs text-slate-200"
              />
              <input
                type="number"
                value={newRuleMinutes}
                onChange={(e) => setNewRuleMinutes(e.target.value)}
                placeholder="分钟"
                className="w-20 rounded-lg bg-[#0d0f12] border border-[#282e39] px-2.5 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRulePrompt}
                onChange={(e) => setNewRulePrompt(e.target.value)}
                placeholder="后台唤醒时执行的巡检指令..."
                className="flex-1 rounded-lg bg-[#0d0f12] border border-[#282e39] px-3 py-1.5 text-xs text-slate-200"
              />
              <button
                onClick={handleAddRule}
                className="px-3 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#e58869] text-white text-xs font-medium flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
