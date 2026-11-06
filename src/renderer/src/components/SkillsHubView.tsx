import React, { useState, useMemo } from 'react'
import {
  Blocks,
  Plus,
  Search,
  Sparkles,
  Play,
  ArrowUpRight,
  FileCode2,
  Trash2,
  CheckCircle2,
  ExternalLink,
  X,
  MessageSquarePlus
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { AgentSkillItem } from '@shared/types'

const SOURCE_BADGES: Record<
  AgentSkillItem['installedBy'],
  { label: string; className: string }
> = {
  agent: {
    label: '对话智能体装载',
    className: 'bg-[#D97757]/12 text-[#C45533] border-[#D97757]/25'
  },
  github: {
    label: 'GitHub SKILL.md',
    className: 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/20'
  },
  builtin: {
    label: '官方预置',
    className: 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20'
  },
  user: {
    label: '手动创建',
    className: 'bg-black/[0.05] text-[#6e6e73] border-black/[0.08]'
  }
}

export const SkillsHubView: React.FC = () => {
  const {
    skills,
    toggleSkill,
    installSkill,
    deleteSkill,
    launchExamplePromptInChat
  } = useAppStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'guide' | 'markdown'>('guide')
  const [showInstallModal, setShowInstallModal] = useState(false)

  // Install modal state
  const [ghUrl, setGhUrl] = useState('')
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] =
    useState<AgentSkillItem['category']>('security')
  const [customSummary, setCustomSummary] = useState('')
  const [customExplanation, setCustomExplanation] = useState('')
  const [customExamplePrompt, setCustomExamplePrompt] = useState('')
  const [isInstalling, setIsInstalling] = useState(false)

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.triggers.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [skills, searchQuery])

  const activeSkill = useMemo(() => {
    if (selectedId) {
      const found = filteredSkills.find((s) => s.id === selectedId)
      if (found) return found
    }
    return filteredSkills[0] || null
  }, [filteredSkills, selectedId])

  const handleInstallSubmit = async (): Promise<void> => {
    if (!ghUrl.trim() && !customName.trim()) return
    setIsInstalling(true)
    try {
      await installSkill({
        name: customName.trim() || undefined,
        category: customCategory,
        sourceUrl: ghUrl.trim() || undefined,
        installedBy: ghUrl.trim() ? 'github' : 'user',
        summary: customSummary.trim() || undefined,
        explanation: customExplanation.trim() || undefined,
        usageExamples: customExamplePrompt.trim()
          ? [
              {
                title: `${customName.trim() || '自定义技能'} 快速示例`,
                prompt: customExamplePrompt.trim(),
                expectedBehavior: '按装载的 SKILL.md 规范执行领域专业步骤并输出验证报告。'
              }
            ]
          : undefined
      })
      setGhUrl('')
      setCustomName('')
      setCustomSummary('')
      setCustomExplanation('')
      setCustomExamplePrompt('')
      setShowInstallModal(false)
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FBFBFD] animate-apple-view">
      {/* Minimalist Top Daylight Header: Title + 2 Action Buttons + Search Box Only */}
      <div className="px-7 py-4 bg-white border-b border-black/[0.06] flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-[20px] font-semibold tracking-tight text-[#1d1d1f] shrink-0">
          Skills 技能装载中心
        </h1>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() =>
              launchExamplePromptInChat(
                '请帮我从 https://github.com/mohitmishra786/low-level-dev-skills 体系参考设计并装载一个「C/Rust 内存安全与 Sanitizer (ASan/UBSan) 漏洞诊断」Skill，包含详细原理解释和 2 个使用示例。',
                false
              )
            }
            className="apple-press px-3.5 py-2 rounded-full bg-[#F5F5F7] hover:bg-[#EBEBF0] border border-black/[0.06] text-[12px] font-medium text-[#1d1d1f] flex items-center gap-1.5"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-[#D97757]" />
            <span>在对话中让 Agent 装载</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInstallModal(true)}
            className="apple-press px-4 py-2 rounded-full bg-[#1d1d1f] hover:bg-black text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-[0_3px_12px_rgba(0,0,0,0.14)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建 Skill</span>
          </button>
        </div>

        <div className="relative w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索已装载的 Skill 或关键词..."
            className="w-full pl-8 pr-3 py-1.5 rounded-full bg-[#F5F5F7] focus:bg-white border border-black/[0.06] focus:border-black/[0.18] text-[12px] text-[#1d1d1f] focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Master-Detail Content Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left List of Mounted Skills */}
        <div className="w-[330px] border-r border-black/[0.06] bg-[#F5F5F7]/55 overflow-y-auto p-3.5 space-y-2.5 shrink-0">
          {filteredSkills.length === 0 ? (
            <div className="p-8 text-center text-[12.5px] text-[#86868b]">
              未找到匹配的 Skill。你可以在对话中对智能体说「帮我装载某某 Skill」，或点击右上角导入。
            </div>
          ) : (
            filteredSkills.map((skill) => {
              const isSelected = activeSkill?.id === skill.id
              const badge = SOURCE_BADGES[skill.installedBy] || SOURCE_BADGES.user
              return (
                <div
                  key={skill.id}
                  onClick={() => setSelectedId(skill.id)}
                  className={`apple-press rounded-2xl p-3.5 cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-white border-black/[0.1] shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                      : 'bg-white/65 hover:bg-white border-black/[0.05]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-[#1d1d1f] truncate">
                        {skill.name}
                      </div>
                      <div className="text-[10.5px] font-mono text-[#86868b] truncate">
                        {skill.id}
                      </div>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={skill.enabled}
                        data-checked={skill.enabled}
                        onClick={() => toggleSkill(skill.id)}
                        className="apple-switch"
                      >
                        <span className="apple-switch-thumb" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11.5px] text-[#6e6e73] line-clamp-2 leading-relaxed mb-2.5">
                    {skill.summary}
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[10.5px] text-[#86868b]">
                      {skill.usageExamples.length} 个示例
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right Detailed Explanation & Runnable Usage Examples */}
        <div className="flex-1 overflow-y-auto p-7 bg-white">
          {activeSkill ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Skill Hero Card */}
              <div className="rounded-3xl bg-[#F5F5F7]/75 border border-black/[0.06] p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                          SOURCE_BADGES[activeSkill.installedBy].className
                        }`}
                      >
                        {SOURCE_BADGES[activeSkill.installedBy].label}
                      </span>
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white border border-black/[0.06] text-[#6e6e73]">
                        category: {activeSkill.category}
                      </span>
                      {activeSkill.enabled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#177233]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                          已挂载激活
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#86868b]">已停用</span>
                      )}
                    </div>

                    <h2 className="text-[24px] font-semibold text-[#1d1d1f] tracking-tight">
                      {activeSkill.name}
                    </h2>
                    <p className="text-[13.5px] text-[#3a3a3c] leading-relaxed">
                      {activeSkill.summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeSkill.sourceUrl && (
                      <a
                        href={activeSkill.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="apple-press px-3 py-1.5 rounded-full bg-white border border-black/[0.08] text-[11.5px] font-medium text-[#0071e3] flex items-center gap-1"
                      >
                        <span>GitHub 源仓库</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteSkill(activeSkill.id)}
                      title="卸载此 Skill"
                      className="apple-press p-2 rounded-full bg-white hover:bg-[#FF3B30]/10 border border-black/[0.08] text-[#86868b] hover:text-[#FF3B30] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub-tab Switcher: Guide & Examples vs Raw SKILL.md */}
                <div className="mt-5 pt-4 border-t border-black/[0.06] flex items-center justify-between flex-wrap gap-2">
                  <div className="inline-flex p-0.5 rounded-full bg-[#E5E5EA]/70">
                    <button
                      type="button"
                      onClick={() => setDetailTab('guide')}
                      className={`px-3.5 py-1 rounded-full text-[11.5px] font-medium transition-all ${
                        detailTab === 'guide'
                          ? 'bg-white text-[#1d1d1f] shadow-sm'
                          : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                      }`}
                    >
                      原理解释与使用示例
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailTab('markdown')}
                      className={`px-3.5 py-1 rounded-full text-[11.5px] font-medium flex items-center gap-1 transition-all ${
                        detailTab === 'markdown'
                          ? 'bg-white text-[#1d1d1f] shadow-sm'
                          : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                      }`}
                    >
                      <FileCode2 className="w-3 h-3" />
                      <span>SKILL.md 定义文件</span>
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-[#86868b] truncate max-w-xs">
                    .claude-desktop/skills/{activeSkill.id}/SKILL.md
                  </span>
                </div>
              </div>

              {detailTab === 'guide' ? (
                <>
                  {/* 1. Detailed Principle & Methodology Explanation */}
                  <section className="space-y-2.5">
                    <h3 className="text-[14px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                      <Blocks className="w-4 h-4 text-[#D97757]" />
                      <span>技能原理解释与执行方法论</span>
                    </h3>
                    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 text-[13.5px] text-[#3a3a3c] leading-[1.75] whitespace-pre-wrap">
                      {activeSkill.explanation}
                    </div>
                  </section>

                  {/* 2. Core Capabilities & Auto-Trigger Keywords */}
                  <section className="space-y-2.5">
                    <h3 className="text-[14px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#0071e3]" />
                      <span>核心能力矩阵与自动触发词</span>
                    </h3>
                    <div className="rounded-2xl border border-black/[0.07] bg-[#FBFBFD] p-5 space-y-4">
                      <ul className="space-y-2">
                        {activeSkill.capabilities.map((cap, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2.5 text-[13px] text-[#1d1d1f] leading-relaxed"
                          >
                            <span className="w-5 h-5 rounded-full bg-[#0071e3]/10 text-[#0071e3] text-[11px] font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{cap}</span>
                          </li>
                        ))}
                      </ul>

                      {activeSkill.triggers.length > 0 && (
                        <div className="pt-3 border-t border-black/[0.06] flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-[#86868b] mr-1">
                            对话命中词自动激活:
                          </span>
                          {activeSkill.triggers.map((kw, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-[#F2F2F7] text-[11px] font-mono text-[#3a3a3c]"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 3. Runnable Usage Examples */}
                  <section className="space-y-3">
                    <h3 className="text-[14px] font-semibold text-[#1d1d1f]">
                      使用示例（点击即可带入对话或立即试跑）
                    </h3>
                    <div className="space-y-3">
                      {activeSkill.usageExamples.map((ex, idx) => (
                        <div
                          key={idx}
                          className="rounded-2xl border border-black/[0.08] bg-white p-5 hover:border-black/[0.15] transition-all space-y-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[13.5px] font-semibold text-[#1d1d1f]">
                              示例 {idx + 1}：{ex.title}
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => launchExamplePromptInChat(ex.prompt, false)}
                                className="apple-press px-3 py-1 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[11.5px] font-medium text-[#1d1d1f] flex items-center gap-1"
                              >
                                <span>填入输入框</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => launchExamplePromptInChat(ex.prompt, true)}
                                className="apple-press px-3.5 py-1 rounded-full bg-[#0071e3] hover:bg-[#0077ED] text-[11.5px] font-semibold text-white flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>立即运行示例</span>
                              </button>
                            </div>
                          </div>

                          <div className="rounded-xl bg-[#F5F5F7] border border-black/[0.05] px-3.5 py-2.5 font-mono text-[12px] text-[#1d1d1f] leading-relaxed">
                            ❯ {ex.prompt}
                          </div>

                          <div className="text-[12px] text-[#6e6e73]">
                            <span className="font-medium text-[#3a3a3c]">预期执行效果：</span>
                            {ex.expectedBehavior}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <div className="rounded-2xl border border-black/[0.08] bg-[#F9F9FB] overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F2F2F7] border-b border-black/[0.06] text-[11.5px] font-mono text-[#6e6e73]">
                    {activeSkill.filePath}
                  </div>
                  <pre className="p-5 font-mono text-[12px] text-[#1d1d1f] whitespace-pre-wrap leading-[1.68] overflow-x-auto">
                    {activeSkill.rawMarkdown}
                  </pre>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal: Import from GitHub SKILL.md URL or Create Custom Skill */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-apple-modal w-full max-w-lg rounded-3xl apple-glass-heavy bg-white p-6 border border-black/[0.1] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1d1d1f]">
                  导入 GitHub Skill 或手动创建
                </h3>
                <p className="text-[12px] text-[#6e6e73] mt-0.5">
                  支持直接粘贴 GitHub 技能目录链接（自动拉取并解析 SKILL.md）
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="p-1.5 rounded-full hover:bg-black/[0.06] text-[#6e6e73]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  GitHub Skill 链接（可选，例如 low-level-dev-skills 子目录）
                </label>
                <input
                  type="text"
                  value={ghUrl}
                  onChange={(e) => setGhUrl(e.target.value)}
                  placeholder="https://github.com/mohitmishra786/low-level-dev-skills/tree/main/skills/..."
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] font-mono text-[#1d1d1f] focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-2">
                  <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                    技能名称（留空则从 SKILL.md 自动提取）
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="如：Rust Unsafe FFI 审计"
                    className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                    分类
                  </label>
                  <select
                    value={customCategory}
                    onChange={(e) =>
                      setCustomCategory(e.target.value as AgentSkillItem['category'])
                    }
                    className="w-full rounded-xl bg-[#F5F5F7] border border-black/[0.08] px-2.5 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                  >
                    <option value="security">安全与逆向</option>
                    <option value="low-level">底层与性能</option>
                    <option value="architecture">架构设计</option>
                    <option value="workflow">工作流</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  一句话核心摘要（可选）
                </label>
                <input
                  type="text"
                  value={customSummary}
                  onChange={(e) => setCustomSummary(e.target.value)}
                  placeholder="简述该技能解决的核心场景..."
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  原理解释与方法论指令（可选）
                </label>
                <textarea
                  rows={3}
                  value={customExplanation}
                  onChange={(e) => setCustomExplanation(e.target.value)}
                  placeholder="详细描述智能体激活该技能时应遵循的分步操作准则..."
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#3a3a3c] mb-1">
                  使用示例 Prompt（可选）
                </label>
                <input
                  type="text"
                  value={customExamplePrompt}
                  onChange={(e) => setCustomExamplePrompt(e.target.value)}
                  placeholder="例如：请使用本技能审查 src/ 下的指针边界..."
                  className="w-full rounded-xl bg-[#F5F5F7] focus:bg-white border border-black/[0.08] px-3 py-2 text-[12.5px] text-[#1d1d1f] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="apple-press px-4 py-2 rounded-full bg-[#F2F2F7] text-[12.5px] font-medium text-[#1d1d1f]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isInstalling || (!ghUrl.trim() && !customName.trim())}
                onClick={handleInstallSubmit}
                className="apple-press px-5 py-2 rounded-full bg-[#0071e3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-[12.5px] font-semibold"
              >
                {isInstalling ? '正在拉取并装载...' : '确认装载 Skill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
