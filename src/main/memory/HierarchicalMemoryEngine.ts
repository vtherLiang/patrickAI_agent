import fs from 'fs'
import path from 'path'
import {
  ChatMessage,
  DreamLogEntry,
  MemoryLayer,
  MemoryNode,
  RecalledMemoryItem,
  StreamUpdatePayload,
  ToolCallItem
} from '@shared/types'
import { ConfigStore } from '../store/ConfigStore'
import { OpenAICompatibleClient } from '../llm/OpenAIClient'
import { SystemPromptBuilder } from '../engine/SystemPromptBuilder'

export const MEMORY_LAYER_META: Record<
  MemoryLayer,
  {
    name: string
    subtitle: string
    halfLifeDays: number // Infinity for L1
    priorWeight: number
    fileName: string
  }
> = {
  L1: {
    name: '核心理念与最高原则',
    subtitle: 'Core Philosophy & Constitutional Tenets (永不衰减 · 顶层先验)',
    halfLifeDays: Number.POSITIVE_INFINITY,
    priorWeight: 1.0,
    fileName: 'L1_core_philosophy.md'
  },
  L2: {
    name: '全局架构与领域模型',
    subtitle: 'System Architecture & Domain Invariants (长效稳态 · 模块契约)',
    halfLifeDays: 90,
    priorWeight: 0.85,
    fileName: 'L2_architecture.md'
  },
  L3: {
    name: '程序性工作流与技能范式',
    subtitle: 'Procedural Workflows & Verified SOPs (中长效 · 调试与构建剧本)',
    halfLifeDays: 45,
    priorWeight: 0.75,
    fileName: 'L3_workflows.md'
  },
  L4: {
    name: '情景决策与踩坑教训',
    subtitle: 'Episodic Decisions & Pitfall Lessons (艾宾浩斯演化 · 访问强化)',
    halfLifeDays: 14,
    priorWeight: 0.68,
    fileName: 'L4_episodic_lessons.md'
  },
  L5: {
    name: '细粒度偏好与交互习惯',
    subtitle: 'Micro-Preferences & Lexical Habits (动态微调 · 审美与语言习惯)',
    halfLifeDays: 30,
    priorWeight: 0.72,
    fileName: 'L5_micro_preferences.md'
  }
}

/**
 * Bilingual (Chinese bigram + English word stem) tokenizer for local zero-latency BM25 & Jaccard scoring.
 */
function tokenizeBilingual(text: string): string[] {
  const lower = text.toLowerCase()
  const tokens: string[] = []

  // English / code identifiers
  const asciiMatches = lower.match(/[a-z0-9_.-]{2,}/g) || []
  tokens.push(...asciiMatches)

  // Chinese characters & bigrams
  const cjkRuns = lower.match(/[\u4e00-\u9fa5]{2,}/g) || []
  for (const run of cjkRuns) {
    if (run.length <= 3) {
      tokens.push(run)
    }
    for (let i = 0; i < run.length - 1; i++) {
      tokens.push(run.slice(i, i + 2))
    }
  }
  return tokens
}

function computeTokenSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeBilingual(a))
  const setB = new Set(tokenizeBilingual(b))
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const tok of setA) {
    if (setB.has(tok)) inter++
  }
  return inter / Math.min(setA.size, Math.max(4, Math.sqrt(setA.size * setB.size)))
}

/**
 * Bilingual Domain Semantic Concept Synonym Clusters for Dense Vector Projection.
 * Bridges semantic paraphrasing gaps where surface lexical tokens do not overlap
 * (e.g., "高并发锁争用" <-> "async parallel race condition", "耗时卡顿" <-> "latency throughput cache").
 */
const SEMANTIC_CONCEPT_CLUSTERS: Array<{ id: string; terms: string[] }> = [
  {
    id: 'concept_concurrency',
    terms: ['并发', '异步', '锁', '竞态', '并行', '协程', '队列', 'concurrency', 'async', 'parallel', 'mutex', 'promise', 'swarm', 'worktree']
  },
  {
    id: 'concept_performance',
    terms: ['性能', '延迟', '吞吐', '优化', '提速', '缓存', '耗时', '卡顿', '内存', 'performance', 'latency', 'throughput', 'cache', 'optimize', 'fast']
  },
  {
    id: 'concept_memory_rag',
    terms: ['记忆', '遗忘', '上下文', '压缩', '检索', '召回', '结晶', '图谱', '向量', 'memory', 'context', 'compact', 'token', 'recall', 'hipporag', 'ebbinghaus', 'memdir', 'ppr']
  },
  {
    id: 'concept_architecture',
    terms: ['架构', '模块', '解耦', '设计', '契约', '接口', '分层', '拓扑', 'architecture', 'module', 'design', 'interface', 'contract', 'layer', 'schema', 'dag', 'sop']
  },
  {
    id: 'concept_debugging',
    terms: ['报错', '异常', '崩溃', '修复', '漏洞', '踩坑', '教训', '自愈', '反思', 'bug', 'error', 'fix', 'crash', 'exception', 'debug', 'pitfall', 'reflexion']
  },
  {
    id: 'concept_build_deploy',
    terms: ['构建', '打包', '编译', '发布', '安装包', '签名', '跨平台', '终端', 'build', 'compile', 'package', 'dist', 'dmg', 'exe', 'electron', 'tsc', 'node', 'homebrew']
  },
  {
    id: 'concept_ui_aesthetics',
    terms: ['界面', '样式', '纯白', '动画', '布局', '视觉', '毛玻璃', '极简', '交互', '折叠', 'ui', 'ux', 'style', 'apple', 'tailwind', 'theme', 'animation']
  },
  {
    id: 'concept_security_perm',
    terms: ['安全', '权限', '只读', '拦截', '沙箱', '脱敏', '密钥', '红线', 'security', 'permission', 'readonly', 'plan', 'bypass', 'sandbox', 'secret']
  },
  {
    id: 'concept_doc_analysis',
    terms: ['文档', '论文', '知识库', '解析', '提取', '总结', '结论', '要点', '精读', 'pdf', 'doc', 'paper', 'extract', 'ocr', 'summary', 'analysis', 'slice', 'slicing']
  },
  {
    id: 'concept_agent_reasoning',
    terms: ['思考', '推理', '搜索', '规划', '回溯', '剪枝', '智能体', '状态树', 'reasoning', 'search', 'plan', 'lats', 'mcts', 'agent', 'react', 'scratchpad']
  },
  {
    id: 'concept_skill_mcp',
    terms: ['技能', '工具', '插件', '挂载', '服务', '协议', '装载', '扩展', 'skill', 'mcp', 'tool', 'plugin', 'server', 'aci']
  },
  {
    id: 'concept_testing_lint',
    terms: ['测试', '校验', '断言', '回归', '边界', '类型', '语法', '检查', 'test', 'verify', 'assert', 'lint', 'typecheck', 'ast']
  }
]

/**
 * Computes a L2-normalized 128-dimensional Dense Semantic Projection Vector:
 * - Dimensions 0..23: Semantic Concept Synonym Cluster activations (captures synonym/paraphrase similarity)
 * - Dimensions 24..127: Signed Random Projection Hash (SimHash / Feature Hashing) of bilingual stems & char n-grams
 */
export function computeDenseSemanticEmbedding(text: string): Float32Array {
  const DIM = 128
  const vec = new Float32Array(DIM)
  const lower = text.toLowerCase()

  // 1. Concept cluster semantic projection (dims 0..23)
  for (let cIdx = 0; cIdx < SEMANTIC_CONCEPT_CLUSTERS.length; cIdx++) {
    const cluster = SEMANTIC_CONCEPT_CLUSTERS[cIdx]
    let hits = 0
    for (const term of cluster.terms) {
      if (lower.includes(term)) hits++
    }
    if (hits > 0) {
      vec[cIdx] = Math.min(2.2, 0.95 + Math.log(1 + hits) * 0.65)
    }
  }

  // 2. Signed feature hashing of tokens into dims 24..127
  const tokens = tokenizeBilingual(lower)
  for (const tok of tokens) {
    let h1 = 2166136261
    let h2 = 16777619
    for (let i = 0; i < tok.length; i++) {
      const code = tok.charCodeAt(i)
      h1 ^= code
      h1 = Math.imul(h1, 16777619)
      h2 ^= code * 31
      h2 = Math.imul(h2, 2166136261)
    }
    const bucket = 24 + (Math.abs(h1) % (DIM - 24))
    const sign = (h2 & 1) === 0 ? 1 : -1
    vec[bucket] += sign * 0.55
  }

  // L2 normalization
  let normSq = 0
  for (let i = 0; i < DIM; i++) {
    normSq += vec[i] * vec[i]
  }
  const norm = Math.sqrt(normSq)
  if (norm > 1e-6) {
    for (let i = 0; i < DIM; i++) {
      vec[i] /= norm
    }
  }
  return vec
}

export function computeDenseCosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
  }
  return Math.max(0, Math.min(1, dot))
}

/**
 * Extracts Knowledge Graph (KG) Entities (technical identifiers, file/module names, concept cluster IDs, keywords)
 * for HippoRAG Bipartite Entity-Memory Graph construction & Personalized PageRank (PPR).
 */
function extractKnowledgeGraphEntities(text: string, extraKeywords: string[] = [], tags: string[] = []): string[] {
  const lower = text.toLowerCase()
  const entities = new Set<string>()

  for (const kw of extraKeywords) {
    if (kw && kw.trim().length >= 2) entities.add(`ent:${kw.trim().toLowerCase()}`)
  }
  for (const tag of tags) {
    if (tag && tag.trim().length >= 2) entities.add(`tag:${tag.trim().toLowerCase()}`)
  }

  // Extract CamelCase / file / technical entities
  const techMatches = text.match(/[A-Za-z][A-Za-z0-9_.-]{2,}/g) || []
  for (const tm of techMatches) {
    entities.add(`tech:${tm.toLowerCase()}`)
  }

  // Extract activated semantic concept clusters as high-level KG hub entities
  for (const cluster of SEMANTIC_CONCEPT_CLUSTERS) {
    if (cluster.terms.some((t) => lower.includes(t))) {
      entities.add(`hub:${cluster.id}`)
    }
  }

  return Array.from(entities)
}

/**
 * MemoryBank Ebbinghaus Forgetting Curve with Recall Reinforcement:
 * R(m) = exp(- elapsedDays / (halfLifeDays * (1 + ln(1 + accessCount))))
 */
export function computeEbbinghausRetention(node: MemoryNode, now = Date.now()): number {
  const meta = MEMORY_LAYER_META[node.layer]
  if (!Number.isFinite(meta.halfLifeDays)) return 1.0
  const anchor = node.lastRecalledAt || node.updatedAt || node.createdAt
  const elapsedDays = Math.max(0, (now - anchor) / (1000 * 3600 * 24))
  const reinforcedStrength = meta.halfLifeDays * (1 + Math.log(1 + node.accessCount))
  return Math.max(0.15, Math.min(1.0, Math.exp(-elapsedDays / reinforcedStrength)))
}

/**
 * Frontier L1-L5 Hierarchical Self-Evolving Memory Engine
 * Combines:
 * 1. Claude Code `src/memdir/` + `AutoDream` (<200-line `MEMORY.md` pointer index + topic files + idle/turn consolidation)
 * 2. MemGPT / Letta (Constitutional L1 resident tier vs. Archival L2-L5 paged recall)
 * 3. A-MEM (Zettelkasten atomic notes + dynamic associative linking + Memory Evolution deduplication)
 * 4. HippoRAG & MemoryBank (1-hop associative graph spreading activation + Ebbinghaus retention curve)
 */
export class HierarchicalMemoryEngine {
  private nodes: MemoryNode[] = []
  private currentWorkspaceDir: string

  constructor(
    private configStore: ConfigStore,
    private llmClient: OpenAICompatibleClient,
    private emitUpdate: (payload: StreamUpdatePayload) => void
  ) {
    this.currentWorkspaceDir = this.configStore.getConfig().workspaceDir
    this.ensureWorkspaceLoaded(this.currentWorkspaceDir)
  }

  private getMemDir(workspaceDir: string): string {
    return path.join(workspaceDir, '.claude-desktop', 'memdir')
  }

  private getStorePath(workspaceDir: string): string {
    return path.join(this.getMemDir(workspaceDir), 'memories.json')
  }

  ensureWorkspaceLoaded(workspaceDir: string): void {
    const memDir = this.getMemDir(workspaceDir)
    if (!fs.existsSync(memDir)) {
      fs.mkdirSync(memDir, { recursive: true })
    }
    this.currentWorkspaceDir = workspaceDir
    const storePath = this.getStorePath(workspaceDir)

    if (fs.existsSync(storePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.nodes = parsed
          return
        }
      } catch {
        // re-seed below
      }
    }

    this.nodes = this.buildSeedNodes(workspaceDir)
    this.rebuildAssociativeLinks()
    this.persistAndSyncMemdir(workspaceDir)
  }

  private buildSeedNodes(workspaceDir: string): MemoryNode[] {
    const now = Date.now()
    return [
      {
        id: 'mem_l1_apple_cleanroom',
        layer: 'L1',
        title: 'Apple 纯白极简美学与零妥协工程品质',
        content:
          '桌面界面严格遵循 Apple 官网日光纯白毛玻璃美学（#FFFFFF / #F5F5F7）与弹簧物理反馈；功能设计坚持高内聚、无冗余按钮、开箱即用。',
        keywords: ['apple', '纯白', '设计', '美学', '极简', '动画', 'ui'],
        tags: ['philosophy', 'design-system', 'ux'],
        links: [],
        importance: 0.98,
        confidence: 0.99,
        accessCount: 4,
        source: 'seed',
        createdAt: now - 7200_000,
        updatedAt: now - 3600_000
      },
      {
        id: 'mem_l1_safety_autonomy',
        layer: 'L1',
        title: '智能体自主性与可控安全边界平衡',
        content:
          '尊重当前激活的 Claude Code 权限模式（Default / AcceptEdits / Plan / Bypass），在修改任何代码前必须先只读勘探上下文，绝不凭空臆测或破坏用户本地配置。',
        keywords: ['plan', 'bypass', '权限', '安全', '只读', 'config'],
        tags: ['philosophy', 'safety', 'permission'],
        links: [],
        importance: 0.96,
        confidence: 0.99,
        accessCount: 3,
        source: 'seed',
        createdAt: now - 7200_000,
        updatedAt: now - 3600_000
      },
      {
        id: 'mem_l2_abc_trinity',
        layer: 'L2',
        title: 'Claude Code Studio A+B+C 三位一体架构契约',
        content: `工作区 (${path.basename(workspaceDir)}) 采用 Electron + React + TypeScript 构建：A 为 Codex 侧栏 + Claude Code 引擎工作台（集成 Skills 与 MCP），B 为 Git Worktree 隔离的 Swarm 多智能体 DAG 编排，C 为 KAIROS 守护与 L1-L5 分层自演化记忆系统。`,
        keywords: ['架构', 'electron', 'workbench', 'swarm', 'kairos', 'skills', 'mcp', 'codex'],
        tags: ['architecture', 'core-modules'],
        links: [],
        importance: 0.92,
        confidence: 0.96,
        accessCount: 3,
        source: 'seed',
        createdAt: now - 5400_000,
        updatedAt: now - 1800_000
      },
      {
        id: 'mem_l3_node_toolchain',
        layer: 'L3',
        title: 'macOS Homebrew Node 工具链与类型校验工作流',
        content:
          '本机 Node 与 npm 位于 /opt/homebrew/bin/node；完成跨进程 IPC 或组件修改后，优先执行 tsc --noEmit 与 electron-vite build 验证零类型错误。',
        keywords: ['node', 'homebrew', 'tsc', 'build', '编译', '构建', '终端'],
        tags: ['workflow', 'toolchain', 'verification'],
        links: [],
        importance: 0.86,
        confidence: 0.95,
        accessCount: 2,
        source: 'seed',
        createdAt: now - 4800_000,
        updatedAt: now - 1800_000
      },
      {
        id: 'mem_l4_memdir_cap',
        layer: 'L4',
        title: '防范 MEMORY.md 超过 200 行导致上下文静默截断',
        content:
          '借鉴 Claude Code 源码 memdir 教训：根索引 MEMORY.md 必须保持在 200 行以内作为轻量指针索引，具体知识按 L1-L5 分层落盘并在每次询问时动态检索回调，避免全量塞入导致 Token 膨胀。',
        keywords: ['memory', '200行', '记忆', 'token', '压缩', '检索', 'memdir'],
        tags: ['pitfall', 'memory', 'context-window'],
        links: [],
        importance: 0.84,
        confidence: 0.94,
        accessCount: 2,
        source: 'seed',
        createdAt: now - 3600_000,
        updatedAt: now - 1200_000
      },
      {
        id: 'mem_l5_chinese_claude_format',
        layer: 'L5',
        title: '中文凝练沟通与 Claude Code 树状输出偏好',
        content:
          '用户偏好使用简洁清晰的中文沟通，推理与工具输出保持 Claude Code 原生 ✻ 思考折叠块与 ⏺ / ⎿ 树状结构，模式切换集成于输入框左下角（支持 Shift+Tab）。',
        keywords: ['中文', '格式', '思考', '动画', '输入框', 'shift+tab', '偏好'],
        tags: ['preference', 'style', 'interaction'],
        links: [],
        importance: 0.82,
        confidence: 0.95,
        accessCount: 5,
        source: 'seed',
        createdAt: now - 3600_000,
        updatedAt: now - 900_000
      }
    ]
  }

  getNodes(): MemoryNode[] {
    const ws = this.configStore.getConfig().workspaceDir
    if (ws !== this.currentWorkspaceDir) {
      this.ensureWorkspaceLoaded(ws)
    }
    return [...this.nodes].sort((a, b) => {
      if (a.layer !== b.layer) return a.layer.localeCompare(b.layer)
      return b.importance - a.importance || b.updatedAt - a.updatedAt
    })
  }

  /**
   * A-MEM Zettelkasten & HippoRAG Knowledge Graph Linker:
   * Connects atomic memory notes via shared KG entities, 128-D dense semantic embeddings, and lexical overlap
   * so multi-hop Personalized PageRank (PPR) random walk can propagate across associative bridges.
   */
  private rebuildAssociativeLinks(): void {
    const denseMap = new Map<string, Float32Array>()
    const entityMap = new Map<string, Set<string>>()

    for (const node of this.nodes) {
      const fullText = `${node.title} ${node.content} ${node.keywords.join(' ')}`
      denseMap.set(node.id, computeDenseSemanticEmbedding(fullText))
      entityMap.set(
        node.id,
        new Set(extractKnowledgeGraphEntities(fullText, node.keywords, node.tags))
      )
    }

    for (const node of this.nodes) {
      const linked: Array<{ id: string; sim: number }> = []
      const vecA = denseMap.get(node.id)!
      const entA = entityMap.get(node.id)!

      for (const other of this.nodes) {
        if (other.id === node.id) continue
        const vecB = denseMap.get(other.id)!
        const entB = entityMap.get(other.id)!

        let sharedEntities = 0
        for (const e of entA) {
          if (entB.has(e)) sharedEntities++
        }

        const denseSim = computeDenseCosineSimilarity(vecA, vecB)
        const lexSim = computeTokenSimilarity(
          `${node.title} ${node.keywords.join(' ')}`,
          `${other.title} ${other.keywords.join(' ')}`
        )
        const totalSim = sharedEntities * 0.16 + denseSim * 0.45 + lexSim * 0.45
        if (totalSim >= 0.28) {
          linked.push({ id: other.id, sim: totalSim })
        }
      }
      linked.sort((a, b) => b.sim - a.sim)
      node.links = linked.slice(0, 5).map((l) => l.id)
    }
  }

  /**
   * Writes `.claude-desktop/memdir/memories.json`, per-layer `L1..L5.md` topic files,
   * AND compiles `.claude-desktop/MEMORY.md` strictly <= 200 lines (Claude Code `memdir` standard!).
   */
  private persistAndSyncMemdir(workspaceDir = this.currentWorkspaceDir): string {
    try {
      const memDir = this.getMemDir(workspaceDir)
      if (!fs.existsSync(memDir)) {
        fs.mkdirSync(memDir, { recursive: true })
      }

      fs.writeFileSync(this.getStorePath(workspaceDir), JSON.stringify(this.nodes, null, 2), 'utf-8')

      const layers: MemoryLayer[] = ['L1', 'L2', 'L3', 'L4', 'L5']
      const indexLines: string[] = [
        '# Claude Code Studio 分层认知记忆总索引 (memdir / AutoDream)',
        '',
        '> 本索引严格遵循 Claude Code `< 200 行` 指针规范，由 **AutoDream 分层记忆引擎** 在每次对话后自动结晶演化。',
        '> 详细分层档案存放于 `.claude-desktop/memdir/L1..L5_*.md`，每次询问按 BM25 + HippoRAG 图谱 + 艾宾浩斯曲线动态检索回调。',
        ''
      ]

      for (const layer of layers) {
        const meta = MEMORY_LAYER_META[layer]
        const layerNodes = this.nodes
          .filter((n) => n.layer === layer)
          .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt)

        // Write full layer topic markdown file
        const layerMdLines: string[] = [
          `# ${layer} · ${meta.name}`,
          `> ${meta.subtitle}`,
          ''
        ]
        for (const n of layerNodes) {
          const retPct = Math.round(computeEbbinghausRetention(n) * 100)
          layerMdLines.push(
            `## ${n.title}`,
            `- **Layer**: ${n.layer} | **Retention**: ${retPct}% | **Recalls**: ${n.accessCount} | **Tags**: ${n.tags.join(', ') || 'general'}`,
            `- **Keywords**: ${n.keywords.join(', ')}`,
            '',
            n.content,
            ''
          )
        }
        fs.writeFileSync(path.join(memDir, meta.fileName), layerMdLines.join('\n'), 'utf-8')

        // Add compact 1-line pointers to MEMORY.md index (capped so total lines stay < 190)
        indexLines.push(`## ${layer} · ${meta.name} (memdir/${meta.fileName})`)
        if (layerNodes.length === 0) {
          indexLines.push(`- _(暂无 ${layer} 记忆节点，将在对话中自动结晶)_`)
        } else {
          for (const n of layerNodes.slice(0, 22)) {
            const snippet = n.content.replace(/\s+/g, ' ').slice(0, 88)
            indexLines.push(
              `- **[${n.title}]** (${n.keywords.slice(0, 4).join('/')}) → ${snippet}${n.content.length > 88 ? '…' : ''}`
            )
          }
        }
        indexLines.push('')
      }

      const cappedIndex = indexLines.slice(0, 195).join('\n')
      SystemPromptBuilder.writeMemoryMarkdown(workspaceDir, cappedIndex)
      return cappedIndex
    } catch (err) {
      console.warn('HierarchicalMemoryEngine persistAndSyncMemdir notice:', (err as Error).message)
      return ''
    }
  }

  /**
   * Per-Query Hybrid Memory Search & Callback (`retrieveForQuery`):
   * Runs automatically on EVERY user inquiry before calling the LLM!
   * Upgraded with Frontier Hybrid Retrieval + HippoRAG Personalized PageRank (PPR):
   * 1. Sparse BM25 IDF lexical scoring
   * 2. 128-D Dense Semantic Concept & N-gram Projection Cosine Similarity
   * 3. HippoRAG (NeurIPS 2024) Entity-Memory Knowledge Graph Multi-hop Personalized PageRank (PPR) Random Walk
   * 4. MemoryBank Ebbinghaus Forgetting Curve with Recall Reinforcement
   */
  retrieveForQuery(
    query: string,
    options: { topK?: number; recordAccess?: boolean } = {}
  ): RecalledMemoryItem[] {
    const ws = this.configStore.getConfig().workspaceDir
    if (ws !== this.currentWorkspaceDir) {
      this.ensureWorkspaceLoaded(ws)
    }
    if (this.nodes.length === 0) return []

    const topK = options.topK ?? 5
    const recordAccess = options.recordAccess ?? true
    const qTokens = tokenizeBilingual(query)
    const qLower = query.toLowerCase()
    const queryDenseVec = computeDenseSemanticEmbedding(query)
    const queryEntities = new Set(extractKnowledgeGraphEntities(query))

    // Compute IDF across current memory corpus & build Entity-Memory KG index
    const docFreq = new Map<string, number>()
    const nodeTokenSets = new Map<string, Set<string>>()
    const nodeEntitySets = new Map<string, Set<string>>()

    for (const node of this.nodes) {
      const fullText = `${node.title} ${node.content} ${node.keywords.join(' ')} ${node.tags.join(' ')}`
      const toks = new Set(tokenizeBilingual(fullText))
      nodeTokenSets.set(node.id, toks)
      for (const t of toks) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1)
      }
      nodeEntitySets.set(
        node.id,
        new Set(extractKnowledgeGraphEntities(fullText, node.keywords, node.tags))
      )
    }

    const N = Math.max(1, this.nodes.length)
    const rawScores = new Map<
      string,
      {
        sparseBm25: number
        denseCosine: number
        entityHitCount: number
        hybridSeed: number
        kwHit: boolean
        retention: number
      }
    >()

    for (const node of this.nodes) {
      const toks = nodeTokenSets.get(node.id)!
      let bm25Like = 0
      for (const qt of qTokens) {
        if (toks.has(qt)) {
          const df = docFreq.get(qt) || 1
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
          bm25Like += Math.max(0.25, idf)
        }
      }
      const sparseBm25 =
        qTokens.length > 0 ? Math.min(1.0, bm25Like / Math.max(2.2, qTokens.length * 0.45)) : 0

      const nodeDenseVec = computeDenseSemanticEmbedding(
        `${node.title} ${node.content} ${node.keywords.join(' ')}`
      )
      const denseCosine = computeDenseCosineSimilarity(queryDenseVec, nodeDenseVec)

      const nEntities = nodeEntitySets.get(node.id)!
      let entityHitCount = 0
      for (const qe of queryEntities) {
        if (nEntities.has(qe)) entityHitCount++
      }

      const kwHit = node.keywords.some((k) => k && qLower.includes(k.toLowerCase()))
      const retention = computeEbbinghausRetention(node)

      // Hybrid Sparse + Dense seed score (55% Sparse BM25 + 45% Dense Semantic Cosine + Entity/Keyword boost)
      const hybridSeed = Math.min(
        1.0,
        sparseBm25 * 0.55 +
          denseCosine * 0.45 +
          (kwHit ? 0.26 : 0) +
          Math.min(0.18, entityHitCount * 0.06)
      )

      rawScores.set(node.id, {
        sparseBm25,
        denseCosine,
        entityHitCount,
        hybridSeed,
        kwHit,
        retention
      })
    }

    // HippoRAG (NeurIPS 2024) Multi-hop Personalized PageRank (PPR) over Entity-Memory Knowledge Graph:
    // pi^{(k+1)} = (1 - damping) * p_0 + damping * W^T * pi^{(k)}
    const pprScores = this.runHippoRAGPersonalizedPageRank(rawScores, nodeEntitySets)

    const finalRanked: Array<{
      node: MemoryNode
      score: number
      reason: string
    }> = []

    for (const node of this.nodes) {
      const base = rawScores.get(node.id)!
      const meta = MEMORY_LAYER_META[node.layer]
      const pprVal = pprScores.get(node.id) || 0

      // Multi-hop PPR associative gain beyond direct seed score
      const pprGain = Math.max(0, pprVal - base.hybridSeed * 0.55)

      const directRelevance = base.kwHit
        ? Math.max(0.65, base.hybridSeed + 0.25)
        : base.hybridSeed

      const effectiveRelevance = Math.min(1.0, directRelevance + pprGain * 0.45)

      // Precision gatekeeper: requires meaningful hybrid semantic/lexical/PPR resonance (>= 0.30)
      if (effectiveRelevance < 0.30) {
        continue
      }

      // Multi-factor Fusion Scoring (70% Hybrid+PPR Relevance, 15% Layer Prior Importance, 15% Ebbinghaus Retention)
      const importanceWeight = meta.priorWeight * (node.importance || 0.8)
      const retentionBonus = (base.retention || 0.5) * 0.15

      const combinedScore = Math.min(
        0.98,
        effectiveRelevance * 0.70 + importanceWeight * 0.15 + retentionBonus
      )

      let reason = 'Dense+BM25 混合语义向量共振'
      if (base.kwHit) reason = `${node.layer} 核心关键词精准匹配`
      else if (pprGain > 0.10) reason = 'HippoRAG 多跳图谱 PPR 随机游走激活'
      else if (base.denseCosine >= 0.48 && base.sparseBm25 < 0.25)
        reason = '128维同义概念簇稠密向量召回'
      else if (node.layer === 'L1') reason = 'L1 核心架构原则共振'
      else if (node.layer === 'L2') reason = 'L2 全局契约模型回调'
      else if (node.layer === 'L4') reason = 'L4 历史踩坑教训对齐'
      else if (node.layer === 'L5') reason = 'L5 细粒度偏好习惯对齐'

      if (combinedScore >= 0.46) {
        finalRanked.push({
          node,
          score: Number(combinedScore.toFixed(2)),
          reason
        })
      }
    }

    // Sort descending by relevance-dominated score
    finalRanked.sort((a, b) => b.score - a.score)

    // Dynamic Top-K: Only select truly relevant memories, never pad with irrelevant noise!
    const selected = finalRanked.slice(0, topK)

    if (recordAccess && selected.length > 0) {
      const now = Date.now()
      const hitIds = new Set(selected.map((s) => s.node.id))
      for (const n of this.nodes) {
        if (hitIds.has(n.id)) {
          n.accessCount += 1
          n.lastRecalledAt = now
        }
      }
      this.persistAndSyncMemdir()
    }

    return selected.map((s) => ({
      id: s.node.id,
      layer: s.node.layer,
      title: s.node.title,
      content: s.node.content,
      score: s.score,
      matchReason: s.reason
    }))
  }

  /**
   * HippoRAG (Bernal et al., NeurIPS 2024) Multi-hop Personalized PageRank (PPR) Engine:
   * Constructs a transition graph over memory nodes connected via Zettelkasten links AND shared Knowledge Graph entities,
   * then runs 3 power-iteration steps with teleportation vector p_0 initialized from hybrid query seeds.
   */
  private runHippoRAGPersonalizedPageRank(
    rawScores: Map<
      string,
      {
        sparseBm25: number
        denseCosine: number
        entityHitCount: number
        hybridSeed: number
        kwHit: boolean
        retention: number
      }
    >,
    nodeEntitySets: Map<string, Set<string>>
  ): Map<string, number> {
    const p0 = new Map<string, number>()
    let seedSum = 0

    for (const node of this.nodes) {
      const s = rawScores.get(node.id)?.hybridSeed || 0
      const seedVal = s >= 0.22 ? s : 0
      p0.set(node.id, seedVal)
      seedSum += seedVal
    }

    if (seedSum <= 1e-6) {
      return p0
    }

    // Build weighted adjacency list (explicit Zettelkasten links + implicit KG entity co-occurrence bridges)
    const adj = new Map<string, Array<{ targetId: string; weight: number }>>()
    for (const node of this.nodes) {
      const edges = new Map<string, number>()
      for (const linkId of node.links) {
        edges.set(linkId, 1.0)
      }
      const entA = nodeEntitySets.get(node.id)!
      for (const other of this.nodes) {
        if (other.id === node.id) continue
        const entB = nodeEntitySets.get(other.id)!
        let shared = 0
        for (const e of entA) {
          if (entB.has(e)) shared++
        }
        if (shared > 0) {
          edges.set(other.id, (edges.get(other.id) || 0) + Math.min(0.8, shared * 0.25))
        }
      }
      const list = Array.from(edges.entries()).map(([targetId, weight]) => ({ targetId, weight }))
      adj.set(node.id, list)
    }

    // Power iteration: 3 multi-hop spreading steps with damping factor alpha = 0.50
    const alpha = 0.50
    let pi = new Map<string, number>(p0)

    for (let iter = 0; iter < 3; iter++) {
      const nextPi = new Map<string, number>()
      for (const node of this.nodes) {
        nextPi.set(node.id, (1 - alpha) * (p0.get(node.id) || 0))
      }

      for (const node of this.nodes) {
        const currentMass = pi.get(node.id) || 0
        if (currentMass <= 1e-5) continue
        const neighbors = adj.get(node.id) || []
        if (neighbors.length === 0) continue

        const totalWeight = neighbors.reduce((acc, item) => acc + item.weight, 0)
        if (totalWeight <= 1e-6) continue

        for (const edge of neighbors) {
          const transfer = alpha * currentMass * (edge.weight / totalWeight)
          nextPi.set(edge.targetId, (nextPi.get(edge.targetId) || 0) + transfer)
        }
      }
      pi = nextPi
    }

    return pi
  }

  /**
   * Upserts or evolves a memory node (A-MEM Memory Evolution deduplication):
   * If a node in the same layer already has high similarity (>= 0.42), evolves it in place!
   */
  upsertOrEvolveNode(
    candidate: {
      id?: string
      layer: MemoryLayer
      title: string
      content: string
      keywords?: string[]
      tags?: string[]
      importance?: number
      source?: MemoryNode['source']
    },
    allowEvolution = true
  ): { node: MemoryNode; isEvolved: boolean } {
    const now = Date.now()

    if (candidate.id) {
      const idx = this.nodes.findIndex((n) => n.id === candidate.id)
      if (idx >= 0) {
        const prev = this.nodes[idx]
        const updated: MemoryNode = {
          ...prev,
          layer: candidate.layer,
          title: candidate.title,
          content: candidate.content,
          keywords:
            candidate.keywords && candidate.keywords.length > 0
              ? candidate.keywords
              : prev.keywords,
          tags: candidate.tags && candidate.tags.length > 0 ? candidate.tags : prev.tags,
          importance: candidate.importance ?? prev.importance,
          updatedAt: now
        }
        this.nodes[idx] = updated
        this.rebuildAssociativeLinks()
        const md = this.persistAndSyncMemdir()
        this.broadcastMemoryState(md)
        return { node: updated, isEvolved: true }
      }
    }

    // Check A-MEM Evolution merge candidate
    if (allowEvolution) {
      let bestMatch: { idx: number; sim: number } | null = null
      this.nodes.forEach((existing, idx) => {
        if (existing.layer !== candidate.layer) return
        const sim = computeTokenSimilarity(
          `${existing.title} ${existing.content}`,
          `${candidate.title} ${candidate.content}`
        )
        if (sim >= 0.44 && (!bestMatch || sim > bestMatch.sim)) {
          bestMatch = { idx, sim }
        }
      })

      if (bestMatch !== null) {
        const target = this.nodes[(bestMatch as { idx: number; sim: number }).idx]
        target.title = candidate.title.length >= 4 ? candidate.title : target.title
        target.content = candidate.content
        target.keywords = Array.from(
          new Set([...target.keywords, ...(candidate.keywords || [])])
        ).slice(0, 10)
        target.tags = Array.from(new Set([...target.tags, ...(candidate.tags || [])])).slice(0, 6)
        target.importance = Math.min(0.99, Math.max(target.importance, (candidate.importance ?? 0.78) + 0.04))
        target.confidence = Math.min(0.99, target.confidence + 0.03)
        target.updatedAt = now
        this.rebuildAssociativeLinks()
        const md = this.persistAndSyncMemdir()
        this.broadcastMemoryState(md)
        return { node: target, isEvolved: true }
      }
    }

    const inferredKeywords =
      candidate.keywords && candidate.keywords.length > 0
        ? candidate.keywords
        : Array.from(new Set(tokenizeBilingual(`${candidate.title} ${candidate.content}`))).slice(0, 7)

    const fresh: MemoryNode = {
      id: `mem_${candidate.layer.toLowerCase()}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      layer: candidate.layer,
      title: candidate.title,
      content: candidate.content,
      keywords: inferredKeywords,
      tags: candidate.tags && candidate.tags.length > 0 ? candidate.tags : [candidate.layer.toLowerCase()],
      links: [],
      importance: candidate.importance ?? (candidate.layer === 'L1' ? 0.95 : 0.8),
      confidence: 0.9,
      accessCount: 1,
      source: candidate.source || 'auto_turn',
      createdAt: now,
      updatedAt: now
    }

    this.nodes.push(fresh)
    // Prune excess low-retention L4/L5 nodes if total exceeds 80 (AutoDream Pruning)
    if (this.nodes.length > 80) {
      this.nodes.sort((a, b) => {
        if (a.layer === 'L1' && b.layer !== 'L1') return -1
        if (b.layer === 'L1' && a.layer !== 'L1') return 1
        return computeEbbinghausRetention(b) * b.importance - computeEbbinghausRetention(a) * a.importance
      })
      this.nodes = this.nodes.slice(0, 80)
    }

    this.rebuildAssociativeLinks()
    const md = this.persistAndSyncMemdir()
    this.broadcastMemoryState(md)
    return { node: fresh, isEvolved: false }
  }

  deleteNode(nodeId: string): MemoryNode[] {
    this.nodes = this.nodes.filter((n) => n.id !== nodeId)
    this.rebuildAssociativeLinks()
    const md = this.persistAndSyncMemdir()
    this.broadcastMemoryState(md)
    return this.getNodes()
  }

  /**
   * Automatic Post-Turn Memory Crystallization (`autoCrystallizeTurn`):
   * Triggered automatically in the background after EVERY completed user-assistant exchange!
   * Does NOT require any manual user click.
   */
  async autoCrystallizeTurn(
    userQuery: string,
    assistantReply: string,
    toolCalls: ToolCallItem[] = []
  ): Promise<
    Array<{ id: string; layer: MemoryLayer; title: string; content: string; isEvolved?: boolean }>
  > {
    const cfg = this.configStore.getConfig()
    if (cfg.autoMemoryCrystallize === false) return []
    if (userQuery.trim().length < 4) return []

    const toolSummary = toolCalls
      .map((tc) => `${tc.name}(${tc.argumentsJson.slice(0, 90)}) -> ${tc.status}`)
      .join('; ')

    let extracted: Array<{
      layer: MemoryLayer
      title: string
      content: string
      keywords: string[]
      tags: string[]
      importance: number
    }> = []

    if (cfg.apiKey || cfg.baseUrl.includes('11434')) {
      try {
        const existingBrief = this.nodes
          .slice(0, 20)
          .map((n) => `[${n.layer}] ${n.title}: ${n.content.slice(0, 70)}`)
          .join('\n')

        const res = await this.llmClient.streamChatCompletion({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.fastModel || cfg.mainModel,
          messages: [
            {
              role: 'system',
              content: `你是 Claude Code AutoDream + A-MEM 分层认知记忆结晶引擎。
请审视本轮【用户提问】与【智能体执行结果】，判断其中是否蕴含值得长期记住或演化的新信息，并严格按 L1-L5 五层认知架构分类（若本轮仅是普通寒暄或无任何长期价值的临时查询，可返回空数组 []，宁缺毋滥，每次最多提取 1~2 条高价值原子记忆）：
- L1 (核心理念与最高原则): 用户表达的核心工程理念、设计哲学、绝对红线原则。
- L2 (全局架构与领域模型): 项目核心模块职责、数据结构契约、技术栈关键事实。
- L3 (程序性工作流与技能范式): 验证成功的可复用工作流、新装载的 Skill/MCP 使用方式、编译验证SOP。
- L4 (情景决策与踩坑教训): 本轮定位的 Bug 根因、环境坑点修复经验、具体技术取舍。
- L5 (细粒度偏好与交互习惯): 用户的语言风格、UI细节偏好、快捷键或格式微习惯。

严格只输出 JSON 格式：
{
  "memories": [
    {
      "layer": "L1|L2|L3|L4|L5",
      "title": "简明原子标题(8-22字)",
      "content": "清晰可复用的记忆正文(30-110字)",
      "keywords": ["关键词1", "关键词2", "关键词3"],
      "tags": ["标签1"],
      "importance": 0.85
    }
  ]
}`
            },
            {
              role: 'user',
              content: `已有核心记忆摘要:\n${existingBrief}\n\n本轮用户提问:\n${userQuery.slice(0, 800)}\n\n本轮调用工具:\n${toolSummary || '无'}\n\n本轮智能体回复摘要:\n${assistantReply.slice(0, 900)}`
            }
          ]
        })

        const jsonMatch = res.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed.memories)) {
            extracted = parsed.memories
              .filter(
                (m: any) =>
                  ['L1', 'L2', 'L3', 'L4', 'L5'].includes(m.layer) &&
                  m.title &&
                  m.content
              )
              .slice(0, 2)
              .map((m: any) => ({
                layer: m.layer as MemoryLayer,
                title: String(m.title).trim(),
                content: String(m.content).trim(),
                keywords: Array.isArray(m.keywords) ? m.keywords.map(String) : [],
                tags: Array.isArray(m.tags) ? m.tags.map(String) : [String(m.layer).toLowerCase()],
                importance: Number(m.importance) || 0.82
              }))
          }
        }
      } catch {
        // Fall through to deterministic heuristic crystallization below
      }
    }

    // Deterministic Zero-API Heuristic Crystallizer (ensures offline/demo or explicit preference statements ALWAYS crystallize!)
    if (extracted.length === 0) {
      extracted = this.heuristicExtractFromTurn(userQuery, toolCalls)
    }

    if (extracted.length === 0) return []

    const results: Array<{
      id: string
      layer: MemoryLayer
      title: string
      content: string
      isEvolved?: boolean
    }> = []

    for (const item of extracted) {
      const { node, isEvolved } = this.upsertOrEvolveNode({
        ...item,
        source: 'auto_turn'
      })
      results.push({
        id: node.id,
        layer: node.layer,
        title: node.title,
        content: node.content,
        isEvolved
      })
    }

    const logEntry: DreamLogEntry = {
      id: `autodream_${Date.now()}`,
      timestamp: Date.now(),
      trigger: 'auto_turn',
      extractedRules: results.map(
        (r) => `[${r.layer}${r.isEvolved ? '·演化更新' : '·新结晶'}] ${r.title}：${r.content}`
      ),
      summary: `对话后自动结晶 ${results.length} 条分层记忆 (${results.map((r) => r.layer).join(', ')})`,
      tokensSaved: 360 * results.length,
      layersTouched: Array.from(new Set(results.map((r) => r.layer)))
    }
    this.configStore.addDreamLog(logEntry)

    this.emitUpdate({
      type: 'dream_updated',
      dreamLogs: this.configStore.getDreamLogs(),
      memoryMarkdown: SystemPromptBuilder.readMemoryMarkdown(cfg.workspaceDir),
      memoryNodes: this.getNodes()
    })

    return results
  }

  private heuristicExtractFromTurn(
    userQuery: string,
    toolCalls: ToolCallItem[]
  ): Array<{
    layer: MemoryLayer
    title: string
    content: string
    keywords: string[]
    tags: string[]
    importance: number
  }> {
    const q = userQuery.trim()
    const items: Array<{
      layer: MemoryLayer
      title: string
      content: string
      keywords: string[]
      tags: string[]
      importance: number
    }> = []

    // Detect explicit L1 core philosophy / principle expressions
    if (/(核心理念|原则|必须坚持|绝不能|永远保持|底线|设计哲学)/.test(q)) {
      items.push({
        layer: 'L1',
        title: `用户确立核心原则: ${q.slice(0, 16)}`,
        content: `用户在对话中明确强调的顶层准则：${q.slice(0, 110)}`,
        keywords: tokenizeBilingual(q).slice(0, 6),
        tags: ['philosophy', 'user-rule'],
        importance: 0.95
      })
      return items
    }

    // Detect L5 explicit preference / habit expressions
    if (/(我喜欢|我偏好|以后请|以后都|不要用|请始终|习惯用|默认用)/.test(q)) {
      items.push({
        layer: 'L5',
        title: `交互与风格偏好: ${q.slice(0, 16)}`,
        content: `自动捕捉的用户细粒度偏好习惯：${q.slice(0, 110)}`,
        keywords: tokenizeBilingual(q).slice(0, 6),
        tags: ['preference', 'habit'],
        importance: 0.84
      })
      return items
    }

    // Detect L3 skill or MCP installation workflow
    const skillOrMcpTool = toolCalls.find(
      (tc) =>
        (tc.name === 'install_skill' || tc.name === 'install_mcp_server') &&
        tc.status === 'completed'
    )
    if (skillOrMcpTool) {
      items.push({
        layer: 'L3',
        title:
          skillOrMcpTool.name === 'install_skill'
            ? '工作流扩展：已通过对话装载新 Skill'
            : '工作流扩展：已通过对话挂载新 MCP 服务',
        content: `用户通过对话指令（"${q.slice(0, 50)}"）装载了扩展能力 ${skillOrMcpTool.argumentsJson.slice(0, 80)}，后续相关任务可优先激活该能力。`,
        keywords: ['skill', 'mcp', '装载', ...tokenizeBilingual(q).slice(0, 4)],
        tags: ['workflow', 'extension'],
        importance: 0.85
      })
    }

    return items
  }

  /**
   * Formats recalled L1-L5 memories for clean injection into `SystemPromptBuilder`.
   */
  formatRecalledForPrompt(recalled: RecalledMemoryItem[]): string {
    if (recalled.length === 0) return ''
    const lines: string[] = [
      '### 本轮检索回调的 L1-L5 分层认知记忆 (Hierarchical Memory Recall)',
      '以下记忆由混合检索引擎（BM25 + HippoRAG 关联图谱 + 艾宾浩斯遗忘强化）针对当前用户询问动态召回，请在推理与执行时严格遵循：'
    ]
    for (const item of recalled) {
      const meta = MEMORY_LAYER_META[item.layer]
      lines.push(
        `- **[${item.layer} · ${meta.name}] ${item.title}** (相关度 ${Math.round(item.score * 100)}%): ${item.content}`
      )
    }
    return lines.join('\n')
  }

  private broadcastMemoryState(memoryMarkdown: string): void {
    this.emitUpdate({
      type: 'dream_updated',
      dreamLogs: this.configStore.getDreamLogs(),
      memoryMarkdown,
      memoryNodes: this.getNodes()
    })
  }
}
