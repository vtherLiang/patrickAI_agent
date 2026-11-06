import fs from 'fs'
import path from 'path'
import { AgentSkillItem, SkillUsageExample, StreamUpdatePayload } from '@shared/types'

export interface InstallSkillInput {
  id?: string
  name?: string
  category?: AgentSkillItem['category']
  sourceUrl?: string
  installedBy?: AgentSkillItem['installedBy']
  triggers?: string[]
  summary?: string
  explanation?: string
  capabilities?: string[]
  usageExamples?: SkillUsageExample[]
  rawMarkdown?: string
}

function slugifySkillId(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/https?:\/\/github\.com\//g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii.slice(0, 48) || `skill-${Date.now().toString(36)}`
}

/**
 * Converts GitHub tree/blob URLs to raw `SKILL.md` URLs.
 * Example:
 * `https://github.com/mohitmishra786/low-level-dev-skills/tree/main/skills/security/reverse-engineering`
 * -> `https://raw.githubusercontent.com/mohitmishra786/low-level-dev-skills/main/skills/security/reverse-engineering/SKILL.md`
 */
function resolveGitHubRawSkillUrl(url: string): { rawUrl: string; inferredSlug: string } | null {
  try {
    const trimmed = url.trim().replace(/\/+$/, '')
    if (trimmed.includes('raw.githubusercontent.com')) {
      const rawUrl = trimmed.endsWith('.md') ? trimmed : `${trimmed}/SKILL.md`
      const parts = rawUrl.split('/').filter(Boolean)
      const slug = parts[parts.length - 2] || 'github-skill'
      return { rawUrl, inferredSlug: slugifySkillId(slug) }
    }

    const u = new URL(trimmed)
    if (u.hostname !== 'github.com') return null
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.length < 2) return null

    const [owner, repo, mode, branch, ...rest] = segs
    if ((mode === 'tree' || mode === 'blob') && branch) {
      const subPath = rest.join('/')
      const rawPath = subPath.endsWith('.md')
        ? subPath
        : subPath
          ? `${subPath}/SKILL.md`
          : 'SKILL.md'
      const inferredSlug = rest.length > 0 ? rest[rest.length - 1].replace(/\.md$/i, '') : repo
      return {
        rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rawPath}`,
        inferredSlug: slugifySkillId(inferredSlug)
      }
    }

    return {
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`,
      inferredSlug: slugifySkillId(repo)
    }
  } catch {
    return null
  }
}

function parseMarkdownIntoSkillFields(
  md: string,
  fallbackId: string
): {
  name: string
  summary: string
  explanation: string
  capabilities: string[]
  triggers: string[]
  usageExamples: SkillUsageExample[]
} {
  let name = fallbackId
  let summary = ''
  const triggers: string[] = []

  // Parse YAML frontmatter if present
  const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---/)
  let body = md
  if (fmMatch) {
    const fm = fmMatch[1]
    body = md.slice(fmMatch[0].length).trim()
    const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m)
    const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m)
    if (nameMatch) name = nameMatch[1].trim()
    if (descMatch) summary = descMatch[1].trim()
  }

  const h1Match = body.match(/^#\s+(.+)$/m)
  if (h1Match && name === fallbackId) {
    name = h1Match[1].trim()
  }

  // Extract first non-heading paragraph as summary/explanation
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('```'))

  if (!summary && paragraphs[0]) {
    summary = paragraphs[0].replace(/\n/g, ' ').slice(0, 160)
  }

  const explanation =
    paragraphs.slice(0, 2).join('\n\n').slice(0, 650) ||
    summary ||
    `基于 SKILL.md 渐进式披露规范装载的专业智能体技能（${name}）。`

  // Extract bullet points as capabilities
  const bulletMatches = body.match(/^[-*]\s+\*?\*?([^\n]+)/gm) || []
  const capabilities = bulletMatches
    .map((b) => b.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim())
    .filter((b) => b.length > 6 && b.length < 120)
    .slice(0, 6)

  // Extract code blocks or build structured usage examples
  const codeBlocks = Array.from(body.matchAll(/```(?:bash|sh|c|rust|python|ts|text)?\n([\s\S]*?)```/g))
  const usageExamples: SkillUsageExample[] = codeBlocks.slice(0, 2).map((m, idx) => ({
    title: `示例工作流 #${idx + 1} (${name})`,
    prompt: `请启用 ${name} 技能，按以下流程帮我执行并分析：\n${m[1].trim().slice(0, 180)}`,
    expectedBehavior: `自动激活 ${name} 中的领域工具链与分步诊断规范，输出结构化分析结论。`
  }))

  if (usageExamples.length === 0) {
    usageExamples.push({
      title: `使用 ${name} 进行深度分析`,
      prompt: `请调用已装载的 [${name}] 技能，对当前工作区进行专项诊断并给出可执行方案。`,
      expectedBehavior: `智能体按 SKILL.md 定义的专业方法论完成分步勘探与验证。`
    })
  }

  const words = `${name} ${summary}`
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((w) => w.length >= 3)
  triggers.push(...Array.from(new Set(words)).slice(0, 6))

  return {
    name,
    summary: summary || `${name} 专项领域智能体技能`,
    explanation,
    capabilities:
      capabilities.length > 0
        ? capabilities
        : ['遵循渐进式上下文披露 (Progressive Disclosure)', '领域专用工具链编排与输出校验'],
    triggers,
    usageExamples
  }
}

function buildCanonicalSkillMarkdown(skill: Omit<AgentSkillItem, 'rawMarkdown' | 'filePath'>): string {
  const lines: string[] = [
    '---',
    `name: ${skill.id}`,
    `description: "${skill.summary.replace(/"/g, '\\"')}"`,
    `category: ${skill.category}`,
    ...(skill.sourceUrl ? [`source: "${skill.sourceUrl}"`] : []),
    `triggers: [${skill.triggers.map((t) => `"${t}"`).join(', ')}]`,
    '---',
    '',
    `# ${skill.name}`,
    '',
    skill.explanation,
    '',
    '## Core Capabilities & Methodology',
    ...skill.capabilities.map((c) => `- ${c}`),
    '',
    '## Usage Examples',
    ...skill.usageExamples.flatMap((ex, i) => [
      `### ${i + 1}. ${ex.title}`,
      `- **Prompt**: \`${ex.prompt}\``,
      `- **Expected Behavior**: ${ex.expectedBehavior}`,
      ''
    ])
  ]
  return lines.join('\n')
}

export class SkillManager {
  private skillsDir: string
  private skills = new Map<string, AgentSkillItem>()

  constructor(
    appDataDir: string,
    private emitUpdate: (payload: StreamUpdatePayload) => void
  ) {
    this.skillsDir = path.join(appDataDir, 'skills')
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true })
    }
    this.loadOrSeedSkills()
  }

  private loadOrSeedSkills(): void {
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(this.skillsDir, { withFileTypes: true })
    } catch {
      entries = []
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(this.skillsDir, entry.name)
      const metaPath = path.join(dir, 'skill.meta.json')
      const mdPath = path.join(dir, 'SKILL.md')
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as AgentSkillItem
          if (fs.existsSync(mdPath)) {
            meta.rawMarkdown = fs.readFileSync(mdPath, 'utf-8')
          }
          meta.filePath = mdPath
          this.skills.set(meta.id, meta)
        } catch {
          // ignore malformed
        }
      } else if (fs.existsSync(mdPath)) {
        const rawMarkdown = fs.readFileSync(mdPath, 'utf-8')
        const parsed = parseMarkdownIntoSkillFields(rawMarkdown, entry.name)
        const item: AgentSkillItem = {
          id: entry.name,
          name: parsed.name,
          category: 'custom',
          enabled: true,
          installedBy: 'user',
          installedAt: Date.now(),
          triggers: parsed.triggers,
          summary: parsed.summary,
          explanation: parsed.explanation,
          capabilities: parsed.capabilities,
          usageExamples: parsed.usageExamples,
          rawMarkdown,
          filePath: mdPath
        }
        this.skills.set(item.id, item)
      }
    }

    if (this.skills.size === 0) {
      this.seedDefaultSkills()
    }
  }

  private seedDefaultSkills(): void {
    // 1. Flagship Reference Skill: mohitmishra786/low-level-dev-skills -> reverse-engineering
    const reBase: Omit<AgentSkillItem, 'rawMarkdown' | 'filePath'> = {
      id: 'reverse-engineering',
      name: 'Reverse Engineering & Binary Triage',
      category: 'security',
      enabled: true,
      installedBy: 'github',
      sourceUrl:
        'https://github.com/mohitmishra786/low-level-dev-skills/tree/main/skills/security/reverse-engineering',
      installedAt: Date.now() - 3600_000,
      triggers: [
        'reverse',
        'binary',
        'ghidra',
        'radare2',
        'r2',
        'objdump',
        'otool',
        '逆向',
        '反编译',
        '反汇编',
        '二进制',
        '符号表'
      ],
      summary:
        '系统级二进制逆向工程与无符号程序分诊技能（参考 low-level-dev-skills），涵盖 Mach-O/ELF 静态分诊、radare2/Ghidra 控制流恢复与反编译分析。',
      explanation:
        '本技能源自 mohitmishra786/low-level-dev-skills 的 security/reverse-engineering 规范，采用渐进式上下文披露（Progressive Disclosure）架构。当对话涉及二进制可执行文件分析、无符号（Stripped）程序分诊、ABI 调用约定还原或安全漏洞定位时自动激活，指导智能体按「文件指纹与段表分诊 → 字符串/导入表交叉引用 → radare2 / objdump / otool 反汇编控制流还原 → Ghidra 伪代码等价重构」四步法系统推进，避免盲目猜测汇编语义。',
      capabilities: [
        'Stripped Binary 快速分诊：自动组合 file / otool -hv / readelf -h / nm -nm / strings 提取架构、PIE/NX/Canary 保护位与关键符号',
        'macOS Mach-O & Linux ELF 双平台反汇编工作流：支持 otool -tV、llvm-objdump -d --symbolize-operands 与交叉引用追踪',
        'radare2 / rizin 命令行自动化脚本：支持 r2 -AA -qc "afl; pdf @ main" 非交互式提取函数列表与 CFG 基本块',
        'Ghidra Headless & Binary Ninja 伪代码还原规范：指导结构体内存布局（Struct Offset）、虚表（vtable）与 ABI 寄存器传参推导',
        '安全审计边界：严格区分静态只读分诊与动态调试（lldb/gdb），在沙箱内执行可复现的逆向取证'
      ],
      usageExamples: [
        {
          title: '本地可执行二进制安全保护位与符号分诊 (Mach-O / ELF)',
          prompt:
            '使用 reverse-engineering 技能，对 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron 进行只读二进制头部、动态库依赖 (otool -L) 与安全编译保护位分诊，并输出结构化报告。',
          expectedBehavior:
            '自动按 Stripped Binary Triage 标准步骤调用 file、otool -hv、otool -L 等只读指令，解析架构信息、动态链接表与签名保护特征。'
        },
        {
          title: '编译一段 C 函数并用 objdump / otool 还原汇编控制流',
          prompt:
            '请启用逆向工程技能：帮我写一个带 switch 跳转表的小型 C 程序编译为无符号二进制（strip），然后演示如何仅通过反汇编与符号特征还原其原始控制流逻辑。',
          expectedBehavior:
            '构建最小可复现实验样本，展示从无符号汇编（ARM64/x86_64）推导分支跳转表与还原等价高级语言伪代码的完整方法论。'
        },
        {
          title: 'Ghidra / radare2 自动化逆向分析脚本生成',
          prompt:
            '基于 reverse-engineering 技能，为我生成一套针对未知固件/ELF 文件的 radare2 批处理初筛脚本与 Ghidra Python 符号恢复脚本模板。',
          expectedBehavior:
            '输出可直接运行的 r2 非交互分析命令序列与 Ghidra Headless postScript 脚本，附带关键 API 解释。'
        }
      ]
    }
    this.persistSkill({
      ...reBase,
      rawMarkdown: buildCanonicalSkillMarkdown(reBase),
      filePath: ''
    })

    // 2. Low-Level Systems Profiling Skill (from low-level-dev-skills ecosystem)
    const perfBase: Omit<AgentSkillItem, 'rawMarkdown' | 'filePath'> = {
      id: 'low-level-perf-profiler',
      name: 'Systems Performance & Memory Profiler',
      category: 'low-level',
      enabled: true,
      installedBy: 'github',
      sourceUrl: 'https://github.com/mohitmishra786/low-level-dev-skills',
      installedAt: Date.now() - 2400_000,
      triggers: [
        'profile',
        'flamegraph',
        'perf',
        'latency',
        'memory leak',
        '性能瓶颈',
        '火焰图',
        '内存泄漏',
        '耗时优化'
      ],
      summary:
        '底层系统与 Node/Electron 进程性能剖析技能：涵盖 CPU 热点采样、内存分配追踪、事件循环阻塞诊断与零拷贝优化建议。',
      explanation:
        '参考 low-level-dev-skills 性能工程体系构建。引导智能体遵循「先量化基准（Benchmark）再动刀优化」铁律，利用 macOS sample / vmmap、Node --cpu-prof / heapdump 及渲染帧率指标定位真实热点路径，拒绝无数据支撑的过早优化。',
      capabilities: [
        'macOS / Linux 原生采样剖析：支持 sample、time、lsof、ps 与 V8 CPU Profile 热点栈采样解读',
        '内存驻留与泄漏排查：区分 RSS、Heap Used、External Buffer 与闭包滞留引用链',
        'I/O 与 IPC 序列化瓶颈消除：识别高频大对象 JSON 跨进程传输并给出增量流式（Delta Streaming）改造方案'
      ],
      usageExamples: [
        {
          title: 'Electron 主进程与渲染进程 IPC 吞吐性能审计',
          prompt:
            '启用 low-level-perf-profiler 技能，审查当前项目 src/main 与 src/renderer 之间的流式消息同步机制，找出潜在的高频渲染或序列化热点并给出优化方案。',
          expectedBehavior:
            '精准定位流式 delta 更新、列表重渲染与状态持久化路径，输出带量化收益评估的优化清单。'
        }
      ]
    }
    this.persistSkill({
      ...perfBase,
      rawMarkdown: buildCanonicalSkillMarkdown(perfBase),
      filePath: ''
    })
  }

  private persistSkill(skill: AgentSkillItem): AgentSkillItem {
    const dir = path.join(this.skillsDir, skill.id)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const mdPath = path.join(dir, 'SKILL.md')
    const metaPath = path.join(dir, 'skill.meta.json')
    const rawMd =
      skill.rawMarkdown && skill.rawMarkdown.trim().length > 0
        ? skill.rawMarkdown
        : buildCanonicalSkillMarkdown(skill)

    const finalized: AgentSkillItem = {
      ...skill,
      rawMarkdown: rawMd,
      filePath: mdPath
    }

    fs.writeFileSync(mdPath, rawMd, 'utf-8')
    fs.writeFileSync(metaPath, JSON.stringify(finalized, null, 2), 'utf-8')
    this.skills.set(finalized.id, finalized)
    return finalized
  }

  listSkills(): AgentSkillItem[] {
    return Array.from(this.skills.values()).sort((a, b) => b.installedAt - a.installedAt)
  }

  toggleSkill(skillId: string): AgentSkillItem[] {
    const existing = this.skills.get(skillId)
    if (existing) {
      this.persistSkill({ ...existing, enabled: !existing.enabled })
      this.broadcast()
    }
    return this.listSkills()
  }

  deleteSkill(skillId: string): AgentSkillItem[] {
    const existing = this.skills.get(skillId)
    if (existing) {
      this.skills.delete(skillId)
      const dir = path.join(this.skillsDir, skillId)
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
      this.broadcast()
    }
    return this.listSkills()
  }

  /**
   * Installs or updates a Skill from either:
   * 1. A GitHub repository/folder URL (e.g. `https://github.com/mohitmishra786/low-level-dev-skills/tree/main/skills/...`)
   * 2. Agent-synthesized structured fields during a chat conversation (`installedBy: 'agent'`)
   * 3. Manual user import/creation in the Skills Hub UI
   */
  async installSkill(input: InstallSkillInput): Promise<AgentSkillItem> {
    let fetchedMd = input.rawMarkdown || ''
    let inferredId = input.id || (input.name ? slugifySkillId(input.name) : '')

    if (input.sourceUrl && !fetchedMd) {
      const gh = resolveGitHubRawSkillUrl(input.sourceUrl)
      if (gh) {
        if (!inferredId) inferredId = gh.inferredSlug
        try {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 8000)
          const res = await fetch(gh.rawUrl, { signal: ctrl.signal })
          clearTimeout(timer)
          if (res.ok) {
            fetchedMd = await res.text()
          }
        } catch {
          // Offline or blocked; fall back to structured fields below
        }
      }
    }

    if (!inferredId) {
      inferredId = `skill-${Date.now().toString(36)}`
    }

    const parsed = fetchedMd
      ? parseMarkdownIntoSkillFields(fetchedMd, inferredId)
      : {
          name: input.name || inferredId,
          summary: input.summary || `${input.name || inferredId} 专项技能`,
          explanation:
            input.explanation ||
            input.summary ||
            `由智能体为您定制装载的领域技能（${input.name || inferredId}），包含专用执行准则与示例提示词。`,
          capabilities:
            input.capabilities && input.capabilities.length > 0
              ? input.capabilities
              : ['按领域最佳实践执行代码审查与工具编排', '自动注入结构化步骤与边界检查'],
          triggers:
            input.triggers && input.triggers.length > 0
              ? input.triggers
              : [inferredId, (input.name || '').toLowerCase()].filter(Boolean),
          usageExamples:
            input.usageExamples && input.usageExamples.length > 0
              ? input.usageExamples
              : [
                  {
                    title: `执行 ${input.name || inferredId} 标准工作流`,
                    prompt: `请使用 [${input.name || inferredId}] 技能，帮我分析当前任务并按规范执行。`,
                    expectedBehavior: `自动激活 ${input.name || inferredId} 的核心步骤并输出验证结果。`
                  }
                ]
        }

    const itemBase: Omit<AgentSkillItem, 'rawMarkdown' | 'filePath'> = {
      id: inferredId,
      name: input.name || parsed.name,
      category: input.category || 'custom',
      enabled: true,
      installedBy: input.installedBy || (input.sourceUrl ? 'github' : 'user'),
      sourceUrl: input.sourceUrl,
      installedAt: Date.now(),
      triggers: input.triggers && input.triggers.length > 0 ? input.triggers : parsed.triggers,
      summary: input.summary || parsed.summary,
      explanation: input.explanation || parsed.explanation,
      capabilities:
        input.capabilities && input.capabilities.length > 0
          ? input.capabilities
          : parsed.capabilities,
      usageExamples:
        input.usageExamples && input.usageExamples.length > 0
          ? input.usageExamples
          : parsed.usageExamples
    }

    const saved = this.persistSkill({
      ...itemBase,
      rawMarkdown: fetchedMd || buildCanonicalSkillMarkdown(itemBase),
      filePath: ''
    })

    this.broadcast(saved)
    return saved
  }

  /**
   * Identifies any Skills explicitly mentioned with `@` in user query.
   * Matches `@SkillName` or `@skill-id` (case-insensitive).
   */
  findMentionedSkills(text: string): AgentSkillItem[] {
    if (!text || !text.includes('@')) return []
    const allSkills = this.listSkills()
    const mentioned: AgentSkillItem[] = []

    for (const s of allSkills) {
      const escapedName = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedId = s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`@(?:${escapedName}|${escapedId})(?=$|[\\s,，。！？!?;；:：\\]\\)\\}])`, 'i')
      if (pattern.test(text)) {
        if (!mentioned.some((m) => m.id === s.id)) {
          mentioned.push(s)
        }
      }
    }
    return mentioned
  }

  /**
   * Progressive Disclosure prompt injection:
   * - Prioritizes explicitly invoked skills via `@` syntax as top-priority system instructions.
   * - Always provides a compact 1-line index of enabled skills.
   * - Expands full `SKILL.md` instructions only for skills whose triggers match the active query.
   */
  buildPromptInjection(userQuery: string): string {
    const allSkills = this.listSkills()
    const explicitlyMentioned = this.findMentionedSkills(userQuery)

    // Explicitly mentioned skills are always activated, even if toggled off
    const enabled = allSkills.filter((s) => s.enabled || explicitlyMentioned.some((m) => m.id === s.id))
    if (enabled.length === 0 && explicitlyMentioned.length === 0) return ''

    const lines: string[] = []

    // 1. Top priority: Explicitly requested skills via @mention
    if (explicitlyMentioned.length > 0) {
      lines.push(
        '### 🎯【用户显式指定调用的专项技能 (Explicitly Invoked Skills)】',
        '用户在当前输入中使用 `@` 显式指定并锁定了以下专项技能。请将其作为最高优先级的执行准则与专业约束，严格遵循其方法论、工具调用规范与边界检查：'
      )
      for (const s of explicitlyMentioned) {
        lines.push(
          '',
          `#### 🌟 锁定技能: ${s.name} (ID: ${s.id}, 类别: ${s.category})`,
          s.rawMarkdown.trim(),
          ''
        )
      }
    }

    // 2. Progressive Disclosure for other enabled skills
    const remainingEnabled = enabled.filter((s) => !explicitlyMentioned.some((m) => m.id === s.id))
    if (remainingEnabled.length > 0) {
      lines.push(
        '### 已装载的其它技能库索引 (Progressive Disclosure Index)',
        ...remainingEnabled.map((s) => `- [${s.id}] ${s.name}: ${s.summary}`)
      )

      const qLower = userQuery.toLowerCase()
      const implicitlyMatched = remainingEnabled.filter(
        (s) =>
          qLower.includes(s.id.toLowerCase()) ||
          qLower.includes(s.name.toLowerCase()) ||
          s.triggers.some((t) => t && qLower.includes(t.toLowerCase()))
      )

      if (implicitlyMatched.length > 0) {
        lines.push('', '#### 上下文隐式触发的技能详情:')
        for (const s of implicitlyMatched.slice(0, 2)) {
          lines.push(`##### Skill: ${s.name} (${s.id})`, s.rawMarkdown.slice(0, 2600), '')
        }
      }
    }

    return lines.join('\n')
  }

  private broadcast(newlyInstalled?: AgentSkillItem): void {
    this.emitUpdate({
      type: 'skills_updated',
      skills: this.listSkills(),
      ...(newlyInstalled
        ? {
            notification: {
              title: `🧩 Skill 已装载: ${newlyInstalled.name}`,
              body: `可在左侧边栏「Skills」页面查看完整原理解释与使用示例。`,
              timestamp: Date.now()
            }
          }
        : {})
    })
  }
}
