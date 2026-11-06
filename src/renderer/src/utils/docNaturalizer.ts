import { NaturalizeLevel } from '@shared/types'
import { isMarkdownTableDivider } from './wechatFormatter'

export const DEFAULT_DOC_TEMPLATE = `# 项目架构与交付方案报告

## 一、方案概述
经过对当前工程的深度勘探，整个系统已具备标准桌面客户端的封装与多智能体编排能力。

### 核心亮点
- **Apple 日光白极简美学**：全局采用纯白流体磨砂玻璃与弹簧微动反馈
- **TiMem 认知记忆检索**：基于时间记忆树进行动态相关性过滤，杜绝无效噪音
- **全格式附件解析引擎**：原生支持 PNG/JPG、DOCX、PDF 与代码文件的多维理解

| 模块名称 | 技术栈 | 运行状态 |
| :--- | :--- | :--- |
| 工作台 A | Electron + React + Vite | 正常运行中 |
| 多智能体 B | Swarm + Git Worktree DAG | 随时可调用 |
| 记忆守护 C | KAIROS + TiMem 记忆树 | 自动自演化 |

## 二、后续待办建议
1. 补齐 \`electron-builder\` 自动化打包脚本
2. 接入飞书开放平台 Webhook，实现一键文档云端分发`

export interface NaturalizeResult {
  text: string
  changeCount: number
  charDelta: number
}

interface ReplacementRule {
  reg: RegExp
  rep: string | ((...args: string[]) => string)
}

const BALANCED_RULES: ReplacementRule[] = [
  // 1. Conversational AI preambles & closings
  {
    reg: /^(好的|当然|没问题|当然可以|收到|非常好的问题)[！!，,。.\s]*(下面|接下来|这里)?(我(将|来|会|已)?|让我)?(为您|为你|帮您|帮你)?(详细|全面|深入|系统地?)?(整理|分析|介绍|解答|梳理|总结|提供|说明|拆解)(一下|如下)?[：:，,。.\s]*/g,
    rep: ''
  },
  {
    reg: /作为一个\s*AI\s*(语言模型|助手|智能助手|大模型)[，,、。\s]*/gi,
    rep: ''
  },
  {
    reg: /希望(以上|上述|这些)(内容|分析|方案|建议|解答|信息|总结)?(能够|能|可以)?对(您|你)有所(帮助|启发|参考)[。！!~\s]*/g,
    rep: ''
  },
  {
    reg: /如(果|有)(您|你)?(还有)?任何(疑问|问题|需要|不清楚的地方)[，,、\s]*欢迎随时(向我)?(提问|告诉我|交流|沟通|追问)[。！!~\s]*/g,
    rep: ''
  },

  // 2. Stiff AI transition clichés
  {
    reg: /^(总的来说|总而言之|综上所述|概而言之|归根结底|不难看出|不难发现|显而易见|毫无疑问|毋庸置疑|不可否认的是|值得注意的是|需要指出的是|需要特别说明的是|值得一提的是|众所周知|正如我们所知)[，,、：\s]*/g,
    rep: ''
  },
  {
    reg: /^在当今([^，,]{2,14})的?背景下[，,、]\s*/g,
    rep: ''
  },
  {
    reg: /(换句话说|换言之|也就是说)[，,]\s*/g,
    rep: ''
  },
  {
    reg: /此外[，,]值得一提的是[，,]/g,
    rep: '此外，'
  },
  {
    reg: /我们可以(清晰地|清楚地|明显地)?看到[，,]?/g,
    rep: ''
  },
  {
    reg: /让我们(一起)?来(看看|分析一下|了解一下)/g,
    rep: '来看'
  },
  {
    reg: /请注意[，,]/g,
    rep: '注意：'
  },

  // 3. Stiff AI translationese & bloated nominalizations -> natural human phrasing
  {
    reg: /经过对([^，,。]{1,22})的深度(勘探|剖析|洞察|挖掘|探索|调研)/g,
    rep: '深入了解$1后'
  },
  {
    reg: /整个系统已具备([^。，,]+?)的?能力/g,
    rep: '系统已支持$1'
  },
  {
    reg: /已具备([^。，,]{2,26}?)的?能力/g,
    rep: '已支持$1'
  },
  {
    reg: /具备([^。，,]{2,22}?)的能力/g,
    rep: '支持$1'
  },
  {
    reg: /基于([^，,。]{2,18})进行(动态|实时|自动|深度|全面|高效|精准)?相关性过滤/g,
    rep: '按$1$2筛选相关内容'
  },
  {
    reg: /进行(深度|全面|动态|自动|实时|高效|精准|统一|有效|合理|深入|细致|系统)?(过滤|分析|梳理|排查|优化|重构|封装|配置|部署|测试|校验|验证|检索|整合|拆解|管理|处理|升级|迭代|评估|设计|存储|归档|转换|渲染|调度)/g,
    rep: '$1$2'
  },
  {
    reg: /旨在为([^，,。]{1,16})提供/g,
    rep: '为$1提供'
  },
  {
    reg: /不仅能够([^，,。]+)[，,]而且(还)?(能够|可以)/g,
    rep: '既能$1，也能'
  },
  {
    reg: /能够有效(地)?/g,
    rep: '能够'
  },
  {
    reg: /从而有效(地)?/g,
    rep: '从而'
  },

  // 4. Exaggerated AI buzzwords -> clear, grounded human language
  { reg: /核心亮点/g, rep: '主要特点' },
  { reg: /后续待办建议/g, rep: '后续优化建议' },
  { reg: /全局采用纯白流体磨砂玻璃与弹簧微动反馈/g, rep: '整体采用日光白磨砂质感与自然弹性交互' },
  { reg: /全局采用/g, rep: '整体采用' },
  { reg: /流体磨砂玻璃/g, rep: '柔和磨砂界面' },
  { reg: /弹簧微动反馈/g, rep: '自然弹性反馈' },
  { reg: /杜绝无效噪音/g, rep: '减少无关信息干扰' },
  { reg: /杜绝/g, rep: '避免' },
  { reg: /原生支持/g, rep: '直接支持' },
  { reg: /多维理解/g, rep: '综合解析' },
  { reg: /正常运行中/g, rep: '运行稳定' },
  { reg: /随时可调用/g, rep: '随时可用' },
  { reg: /自动自演化/g, rep: '持续自动更新' },
  { reg: /实现一键文档云端分发/g, rep: '支持文档一键同步至飞书' },
  { reg: /全方位赋能/g, rep: '全面支持' },
  { reg: /赋能/g, rep: '助力' },
  { reg: /抓手/g, rep: '切入点' },
  { reg: /形成闭环/g, rep: '跑通完整链路' },
  { reg: /心智负担/g, rep: '使用门槛' },
  { reg: /底层逻辑/g, rep: '核心机制' },
  { reg: /顶层设计/g, rep: '整体架构' },
  { reg: /颗粒度/g, rep: '细节' },
  { reg: /无缝衔接/g, rep: '顺畅衔接' },
  { reg: /极大地(提升|提高|增强|改善|降低|简化)/g, rep: '明显$1' },
  { reg: /显著地(提升|提高|增强|改善|降低|简化)/g, rep: '有效$1' }
]

const DEEP_GONGWEN_RULES: ReplacementRule[] = [
  // 1. Strip all conversational preambles, closings, and 1st/2nd-person chatter
  {
    reg: /^(好的|当然|没问题|当然可以|收到|非常好的问题)[！!，,。.\s]*(下面|接下来|这里)?(我(将|来|会|已)?|让我)?(为您|为你|帮您|帮你)?(详细|全面|深入|系统地?)?(整理|分析|介绍|解答|梳理|总结|提供|说明|拆解)(一下|如下)?[：:，,。.\s]*/g,
    rep: ''
  },
  {
    reg: /作为一个\s*AI\s*(语言模型|助手|智能助手|大模型)[，,、。\s]*/gi,
    rep: ''
  },
  {
    reg: /希望(以上|上述|这些)(内容|分析|方案|建议|解答|信息|总结)?(能够|能|可以)?对(您|你)有所(帮助|启发|参考)[。！!~\s]*/g,
    rep: ''
  },
  {
    reg: /如(果|有)(您|你)?(还有)?任何(疑问|问题|需要|不清楚的地方)[，,、\s]*欢迎随时(向我)?(提问|告诉我|交流|沟通|追问)[。！!~\s]*/g,
    rep: ''
  },
  {
    reg: /^(总的来说|总而言之|综上所述|概而言之|归根结底|不难看出|不难发现|显而易见|毫无疑问|毋庸置疑|值得注意的是|需要指出的是|需要特别说明的是|值得一提的是|众所周知|正如我们所知)[，,、：\s]*/g,
    rep: ''
  },
  {
    reg: /(换句话说|换言之|也就是说)[，,]\s*/g,
    rep: ''
  },
  {
    reg: /(我们可以看到|不难发现|让我们来看看)[，,、\s]*/g,
    rep: ''
  },
  {
    reg: /(非常|十分|特别|极其|相当|尤为|真正意义上|全方位地?|多维度地?|深层次地?)/g,
    rep: ''
  },

  // 2. Executive / 公文 formal headings & section titles
  { reg: /方案概述/g, rep: '总体概况' },
  { reg: /核心亮点/g, rep: '建设成效' },
  { reg: /主要特点/g, rep: '主要特性' },
  { reg: /后续待办建议/g, rep: '下一步工作计划' },
  { reg: /后续优化建议/g, rep: '下一步工作计划' },
  { reg: /常见问题(与|及)?解决方案/g, rep: '问题处置方案' },
  { reg: /总结(与|及)展望/g, rep: '工作总结' },

  // 3. Crisp 公文 diction & condensation
  {
    reg: /经过对当前工程的深度勘探[，,]整个系统已具备标准桌面客户端的封装与多智能体编排能力/g,
    rep: '经工程勘察评估，系统具备桌面端封装及多智能体编排能力'
  },
  {
    reg: /经过对([^，,。]{1,22})的深度(勘探|剖析|洞察|挖掘|探索|调研)/g,
    rep: '经对$1勘察评估'
  },
  {
    reg: /整个系统已具备([^。，,]+?)能力/g,
    rep: '系统具备$1能力'
  },
  {
    reg: /标准桌面客户端的封装/g,
    rep: '桌面端封装'
  },
  {
    reg: /全局采用纯白流体磨砂玻璃与弹簧微动反馈/g,
    rep: '统一采用日光白磨砂界面与微动反馈机制'
  },
  { reg: /全局采用/g, rep: '统一采用' },
  {
    reg: /基于([^，,。]{2,18})进行(动态|实时|自动)?相关性过滤/g,
    rep: '依托$1实施$2相关性过滤'
  },
  {
    reg: /基于([^，,。]{2,18})进行([^，,。]{2,14})/g,
    rep: '依托$1开展$2'
  },
  {
    reg: /进行(深度|全面|动态|自动|实时|高效|精准|统一|有效|合理|深入|细致|系统)?(过滤|分析|梳理|排查|优化|重构|封装|配置|部署|测试|校验|验证|检索|整合|拆解|管理|处理|升级|迭代|评估|设计|存储|归档|转换|渲染|调度)/g,
    rep: '$1$2'
  },
  { reg: /杜绝无效噪音/g, rep: '剔除冗余干扰' },
  { reg: /杜绝/g, rep: '严防' },
  { reg: /原生支持/g, rep: '支持' },
  { reg: /文件的多维理解/g, rep: '文件解析' },
  { reg: /多维理解/g, rep: '综合解析' },
  { reg: /正常运行中/g, rep: '运行正常' },
  { reg: /随时可调用/g, rep: '就绪待命' },
  { reg: /自动自演化/g, rep: '自动演进' },
  { reg: /补齐/g, rep: '完善' },
  { reg: /实现一键文档云端分发/g, rep: '实现文档云端分发' },
  { reg: /一键/g, rep: '快速' },

  // 4. Formal 公文 connectives & modal particles
  { reg: /^首先[，,、]\s*/g, rep: '一是' },
  { reg: /^其次[，,、]\s*/g, rep: '二是' },
  { reg: /^再次[，,、]\s*/g, rep: '三是' },
  { reg: /^最后[，,、]\s*/g, rep: '此外，' },
  { reg: /(但是|不过)[，,]?/g, rep: '但' },
  { reg: /因为/g, rep: '因' },
  { reg: /(所以|因此)[，,]?/g, rep: '故' },
  { reg: /(如果|假如|倘若)/g, rep: '若' },
  { reg: /(而且|并且)/g, rep: '且' },
  { reg: /(目前已经|现在已经|已经)/g, rep: '已' },
  { reg: /(目前|现阶段)/g, rep: '现' },
  { reg: /接下来(需要|要|将)?/g, rep: '后续拟' },
  { reg: /(建议可以|可以尝试)/g, rep: '建议' },
  { reg: /(大约|大概|差不多)/g, rep: '约' },
  { reg: /(马上|立刻|立即)/g, rep: '即刻' },
  { reg: /通过([^，,。]{2,14})的方式/g, rep: '经由$1' },
  { reg: /为了(能够)?/g, rep: '为' },
  { reg: /(能够|可以)/g, rep: '可' },
  { reg: /需要/g, rep: '需' },
  { reg: /(赋能|助力)/g, rep: '支撑' },
  { reg: /抓手/g, rep: '重点举措' },
  { reg: /心智负担/g, rep: '操作成本' },
  {
    reg: /(客户端|系统|代码|方案|文档|数据|性能|架构|模块|接口|流程)的(封装|重构|架构|落地|分发|存储|优化|设计|编排|管理|升级|部署)/g,
    rep: '$1$2'
  }
]

function applyRulesToProtectedSegment(segment: string, rules: ReplacementRule[]): {
  out: string
  hits: number
} {
  if (!segment.trim()) return { out: segment, hits: 0 }

  // Mask inline code `...` and markdown link URLs `](...)` so technical tokens stay 100% intact
  const masks: string[] = []
  let masked = segment.replace(/`[^`]+`|\((https?:\/\/[^)]+)\)/g, (m) => {
    const idx = masks.length
    masks.push(m)
    return `\uE000MASK_${idx}\uE001`
  })

  let hits = 0
  for (const rule of rules) {
    const before = masked
    masked = masked.replace(rule.reg, rule.rep as string)
    if (masked !== before) {
      hits++
    }
  }

  // Clean up accidental double punctuation after phrase removal
  masked = masked
    .replace(/^[，,、；;]+\s*/g, '')
    .replace(/([，,。；：])[，,、]+/g, '$1')

  // Unmask protected inline code and URLs
  const restored = masked.replace(/\uE000MASK_(\d+)\uE001/g, (_m, idxStr) => {
    return masks[Number(idxStr)] ?? ''
  })

  return { out: restored, hits }
}

/**
 * Syntax-safe 3-level Markdown AI-tone naturalization & 公文 condensation engine.
 * Preserves code blocks, inline code, links, headings, lists, and GFM table pipes.
 */
export function naturalizeMarkdownDocument(
  rawMarkdown: string,
  level: NaturalizeLevel
): NaturalizeResult {
  if (!rawMarkdown || level === 'faithful') {
    return {
      text: rawMarkdown,
      changeCount: 0,
      charDelta: 0
    }
  }

  const rules = level === 'balanced' ? BALANCED_RULES : DEEP_GONGWEN_RULES
  const lines = rawMarkdown.split('\n')
  const outLines: string[] = []
  let inCodeFence = false
  let totalHits = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence
      outLines.push(line)
      continue
    }

    if (inCodeFence || !trimmed || isMarkdownTableDivider(trimmed)) {
      outLines.push(line)
      continue
    }

    // Markdown Table Row: transform cell by cell to preserve pipes
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rawCells = trimmed.slice(1, -1).split('|')
      const transformedCells = rawCells.map((cell) => {
        const res = applyRulesToProtectedSegment(cell.trim(), rules)
        totalHits += res.hits
        return ` ${res.out.trim()} `
      })
      outLines.push(`|${transformedCells.join('|')}|`)
      continue
    }

    // Preserve leading Markdown block markers (`# `, `- `, `1. `, `> `)
    const prefixMatch = line.match(/^(\s*(?:#{1,4}|[-*+]|\d+\.|>)\s+)(.*)$/)
    if (prefixMatch) {
      const prefix = prefixMatch[1]
      const body = prefixMatch[2]
      // Handle `**Title**：Description` inside list items cleanly
      const boldColonMatch = body.match(/^(\*\*[^*]+\*\*[：:]\s*)(.*)$/)
      if (boldColonMatch) {
        const headRes = applyRulesToProtectedSegment(boldColonMatch[1], rules)
        const descRes = applyRulesToProtectedSegment(boldColonMatch[2], rules)
        totalHits += headRes.hits + descRes.hits
        outLines.push(`${prefix}${headRes.out}${descRes.out}`)
      } else {
        const res = applyRulesToProtectedSegment(body, rules)
        totalHits += res.hits
        outLines.push(`${prefix}${res.out}`)
      }
      continue
    }

    const res = applyRulesToProtectedSegment(line, rules)
    totalHits += res.hits
    if (res.out.trim().length === 0 && line.trim().length > 0) {
      // Conversational fluff line completely stripped — skip leaving an extra blank gap
      continue
    }
    outLines.push(res.out)
  }

  const finalText = outLines.join('\n').replace(/\n{3,}/g, '\n\n')
  return {
    text: finalText,
    changeCount: totalHits,
    charDelta: finalText.length - rawMarkdown.length
  }
}

const TRAILING_DANGLING_CHARS = /[与和及的了在对关于中等之或并把将向从是为、，,：:；;（(\[-]+$/
const LEADING_NOISE_CHARS = /^[、，,：:；;）)\]-]+/

function trimToMaxCharsCleanly(raw: string, maxChars = 7): string {
  let s = raw
    .replace(LEADING_NOISE_CHARS, '')
    .replace(TRAILING_DANGLING_CHARS, '')
    .trim()

  const chars = Array.from(s)
  if (chars.length <= maxChars) {
    return s
  }

  let sliced = chars.slice(0, maxChars).join('')
  sliced = sliced.replace(TRAILING_DANGLING_CHARS, '').trim()
  return sliced || chars.slice(0, maxChars).join('')
}

function condenseCandidatePhrase(phrase: string): string {
  let clean = phrase
    // Remove markdown markers, quotes, brackets, emojis
    .replace(/[`*_~#>|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    // Remove leading numbering like "一、", "1.", "(一)", "第一章"
    .replace(/^([（(]?[一二三四五六七八九十0-9]+[）)]?[、.．:：\s]+|第[一二三四五六七八九十0-9]+[章节部分篇][\s：:、]*)/, '')
    // Remove conversational & generic prefixes
    .replace(
      /^(好的|当然|没问题|以下是|下面是|为您整理的|关于|针对|面向|基于|深入理解|全面解析|详细分析|深度勘探|如何实现|如何|浅谈|本项目|当前项目|项目的?|当前|最新|完整|标准)+[，,：:\s]*/,
      ''
    )
    // Strip leading date/quarter prefix when a substantive topic follows (e.g. "2026年第四季度分布式网关..." -> "分布式网关...")
    .replace(/^(?:20\d{2}年?(?:第[一二三四1-4]季度|Q[1-4]|度|[01]?\d月)?)(?=.{3,})/i, '')
    // Strip leading bureaucratic action verbs when a clear subject follows (e.g. "进一步推进人工智能大模型..." -> "人工智能大模型...")
    .replace(/^(?:进一步|加快|全面|深入|持续)?(?:推进|加强|做好|开展|落实|规范|优化)(?=.{3,})/, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[【】「」『』《》“”"'？?！!。…]+/g, '')
    .replace(/\s+/g, '')
    .trim()

  // If still longer than 7 chars, condense filler conjunctions (`的`, `与`, `和`, `以及`, `方案报告` -> `报告`/`方案`)
  if (Array.from(clean).length > 7) {
    clean = clean
      .replace(/方案报告$/, '报告')
      .replace(/分析报告$/, '分析')
      .replace(/指南文档$/, '指南')
      .replace(/(以及|与|和|及|的)/g, '')
  }

  return trimToMaxCharsCleanly(clean, 7)
}

/**
 * Synthesizes a concise, content-aware tab label strictly <= 7 characters (never generic `main`).
 */
export function generateSmartDocTabTitle(
  content: string,
  existingTitles: string[] = []
): string {
  const raw = (content || '').trim()
  if (!raw) {
    return deduplicateShortTitle('新建排版稿', existingTitles)
  }

  // Strip fenced code blocks first while remembering code language if code-only
  let detectedCodeLang = ''
  const withoutCode = raw.replace(/```([A-Za-z0-9_+-]*)\n[\s\S]*?```/g, (_m, lang: string) => {
    if (!detectedCodeLang && lang) detectedCodeLang = lang.toUpperCase()
    return ''
  })

  const lines = withoutCode
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let baseTitle = ''

  // Priority 1: Explicit Markdown Heading (# .. ####)
  const headingLine = lines.find((l) => /^#{1,4}\s+.+/.test(l))
  if (headingLine) {
    const hText = headingLine.replace(/^#{1,4}\s+/, '')
    baseTitle = condenseCandidatePhrase(hText)
  }

  // Priority 2: Bracketed or Bold Lead Title (【...】 / 《...》 / **...**)
  if (!baseTitle || Array.from(baseTitle).length < 2) {
    for (const ln of lines.slice(0, 6)) {
      const bracketMatch = ln.match(/[【《「]([^】》」]{2,20})[】》」]/)
      if (bracketMatch) {
        baseTitle = condenseCandidatePhrase(bracketMatch[1])
        if (Array.from(baseTitle).length >= 2) break
      }
      const boldMatch = ln.match(/\*\*([^*]{2,24})\*\*/)
      if (boldMatch) {
        baseTitle = condenseCandidatePhrase(boldMatch[1])
        if (Array.from(baseTitle).length >= 2) break
      }
    }
  }

  // Priority 3: Markdown Table Headers
  if (!baseTitle || Array.from(baseTitle).length < 2) {
    const tableHeader = lines.find(
      (l) => l.includes('|') && !isMarkdownTableDivider(l)
    )
    if (tableHeader) {
      const cols = tableHeader
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      if (cols.length > 0) {
        baseTitle = condenseCandidatePhrase(`${cols.slice(0, 2).join('')}表`)
      }
    }
  }

  // Priority 4: First substantive prose clause (skipping pure conversational greetings)
  if (!baseTitle || Array.from(baseTitle).length < 2) {
    for (const ln of lines) {
      if (isMarkdownTableDivider(ln)) continue
      const clauses = ln.split(/[。！？!?；;\n]/).map((c) => c.trim()).filter(Boolean)
      for (const cl of clauses) {
        const subClauses = cl.split(/[，,：:]/).map((s) => s.trim()).filter(Boolean)
        for (const sub of subClauses) {
          if (/^(好的|当然|没问题|你好|您好|下面|以下是|总结如下)$/.test(sub)) continue
          const candidate = condenseCandidatePhrase(sub)
          if (Array.from(candidate).length >= 2) {
            baseTitle = candidate
            break
          }
        }
        if (Array.from(baseTitle).length >= 2) break
      }
      if (Array.from(baseTitle).length >= 2) break
    }
  }

  // Priority 5: Code-only fallback
  if (!baseTitle || Array.from(baseTitle).length < 2) {
    baseTitle = detectedCodeLang
      ? trimToMaxCharsCleanly(`${detectedCodeLang.slice(0, 3)}代码稿`, 7)
      : '精修排版稿'
  }

  return deduplicateShortTitle(baseTitle, existingTitles)
}

function deduplicateShortTitle(candidate: string, existingTitles: string[]): string {
  const clean = trimToMaxCharsCleanly(candidate || '精修排版稿', 7) || '精修排版稿'
  const existingSet = new Set(existingTitles)
  if (!existingSet.has(clean)) return clean

  let idx = 2
  while (idx < 100) {
    const suffix = String(idx)
    const maxBase = Math.max(1, 7 - suffix.length)
    const baseChars = Array.from(clean).slice(0, maxBase).join('').replace(TRAILING_DANGLING_CHARS, '')
    const next = `${baseChars || Array.from(clean).slice(0, maxBase).join('')}${suffix}`
    if (!existingSet.has(next)) return next
    idx++
  }
  return clean
}
