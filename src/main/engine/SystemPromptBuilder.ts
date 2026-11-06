import fs from 'fs'
import path from 'path'
import { AgentPermissionMode } from '@shared/types'

export interface PromptDynamicInjections {
  recalledMemoriesBlock?: string
  skillsBlock?: string
  mcpBlock?: string
}

/**
 * Dynamically builds the system prompt by injecting workspace metadata,
 * active permission mode (e.g. Claude Code Plan Mode), project-level CLAUDE.md,
 * dynamically recalled L1-L5 hierarchical memories (`memdir`), active Skills, and MCP tools.
 */
export class SystemPromptBuilder {
  static build(
    workspaceDir: string,
    permissionMode: AgentPermissionMode = 'default',
    dynamicInjections?: PromptDynamicInjections
  ): string {
    const sections: string[] = [
      `你是 Claude Code Studio（融合 OpenAI Codex 多项目侧栏 + Claude Code v2.1.88 核心引擎 + L1-L5 分层自演化记忆系统的原生桌面研发工作台）。`,
      `当前激活工作区路径: ${workspaceDir}`,
      `操作系统环境: macOS (${process.platform} / ${process.arch})`,
      `当前权限与执行模式: ${permissionMode}`,
      '',
      `### 核心工作准则`,
      `1. 修改任何代码前，请先使用 search_files 或 read_file 了解上下文，不要凭空猜测文件内容。`,
      `2. 修改现有文件优先使用 edit_file（提供精确的 old_string 与 new_string），新建文件使用 write_file。`,
      `3. **执行工具后必须输出结论与反馈**：在调用 read_file、search_files、run_bash 等工具获取信息后，**必须向用户输出条理清晰的正式答复**，直接回应用户的提问，总结核心发现、代码事实与分析结论。**严禁在工具执行完毕后留白或不给用户任何文字反馈！**`,
      `4. **知识库文档与论文深度分析规范**：当用户请求读取并深入分析知识库归档文档、PDF 论文、架构规范或技术报告时，请优先使用已集成富文档解析的 \`read_file\` 读取目标文档。读取完成后，**必须向用户交付完整、高密度的结构化深度分析报告**，严禁只输出「已读取」或过程日志！报告必须清晰包含：`,
      `   - **【核心结论与命题判断】**：明确指出该论文/文档的核心研究命题、要解决的核心瓶颈以及最终成立的关键结论；`,
      `   - **【关键要点与架构机制】**：深入剖析其核心架构体系、服务感知算法逻辑、切片控制流与技术创新点；`,
      `   - **【量化指标与论据数据】**：提炼文档中的核心量化对比（如时延缩减、SLA 保证度、资源利用率等硬核实验数据）；`,
      `   - **【局限性与落地建议】**：客观评析其工程约束条件、落地实施建议与未来演进方向。`,
      `5. **文件夹与代码勘探回答规范（参考 Claude Code 终端标准）**：当用户询问目录文件、架构现状或「能否封装/打包为 app」等问题时，在读取 package.json、构建配置等文件后，必须输出结构化报告：包含【结论判断】、【文件夹核心架构（配合清晰对齐的 ASCII 树形图 ├── / └──）】、【可行性依据】、【发现的具体问题与缺失项】及【下一步建议】。`,
      `6. **Skills 技能装载**：当用户在对话中让你安装、装载、导入（例如给出 GitHub skills 链接）或创建某个 Skill 时，请立即调用 \`install_skill\` 工具（填写详细的 explanation 原理解释与 usage_examples 使用示例），装载后提醒用户可点击左侧边栏「Skills」查看完整说明与一键示例。`,
      `7. **MCP 服务挂载与调用**：当用户要求挂载 MCP 服务时调用 \`install_mcp_server\`；需要调用已挂载的 MCP 能力（如 Git Blame、二进制逆向分诊、代码统计）时调用 \`call_mcp_tool\`。`,
      `8. 当用户任务跨越多个独立模块适合多智能体并行开发时，可调用 \`delegate_to_swarm\` 启动 Coordinator 集群。`,
      `9. **工具操作意图摘要**：调用 \`run_bash\`、\`write_file\`、\`edit_file\`、\`read_file\`、\`search_files\` 时，请填写 \`description\` 参数（用 5~15 字简明总结当前操作在干什么，如「读取并提取 PDF 论文全文」、「提炼切片架构核心结论」），方便折叠摘要栏向用户直观呈现。`,
      `10. 回答保持专业、清晰、简洁，排版段落分明。`
    ]

    if (permissionMode === 'plan') {
      sections.push(
        '',
        `### [PLAN MODE 已激活 - 只读规划模式]`,
        `你当前处于 Claude Code 的 **Plan Mode (只读架构规划模式)**：`,
        `- 严禁调用任何写入项目业务文件或执行副作用终端命令的工具（仅允许调用只读检索工具进行代码勘探）。`,
        `- 请先全面调查相关文件，然后输出一份结构化的【实施计划 (Implementation Plan)】，包含：问题根因/架构现状、拟修改文件清单、分步实施细节与验证方案，等待用户切换回执行模式后再动手修改。`
      )
    }

    // Inject CLAUDE.md if present in workspace
    const claudeMdPath = path.join(workspaceDir, 'CLAUDE.md')
    if (fs.existsSync(claudeMdPath)) {
      try {
        const claudeMd = fs.readFileSync(claudeMdPath, 'utf-8').slice(0, 3500)
        sections.push('', `### 项目静态规范 (CLAUDE.md)`, claudeMd)
      } catch {
        // ignore
      }
    }

    // 1. Selective Per-Query L1-L5 Hierarchical Memory Recall
    // Only injects memories if the relevance engine successfully recalls relevant memories for this specific turn!
    if (dynamicInjections?.recalledMemoriesBlock && dynamicInjections.recalledMemoriesBlock.trim()) {
      sections.push('', dynamicInjections.recalledMemoriesBlock.trim())
    }

    // 2. Active Progressive-Disclosure Skills
    if (dynamicInjections?.skillsBlock) {
      sections.push('', dynamicInjections.skillsBlock)
    }

    // 3. Active MCP Servers
    if (dynamicInjections?.mcpBlock) {
      sections.push('', dynamicInjections.mcpBlock)
    }

    return sections.join('\n')
  }

  static getMemoryFilePath(workspaceDir: string): string {
    return path.join(workspaceDir, '.claude-desktop', 'MEMORY.md')
  }

  static readMemoryMarkdown(workspaceDir: string): string {
    const file = this.getMemoryFilePath(workspaceDir)
    if (!fs.existsSync(file)) {
      return [
        '# Claude Code Studio 分层认知记忆总索引 (memdir / AutoDream)',
        '',
        '> 本索引严格遵循 Claude Code `< 200 行` 指针规范，由 **AutoDream 分层记忆引擎** 在每次对话后自动结晶演化。',
        '',
        '## L1 · 核心理念与最高原则',
        '- **[Apple 纯白极简美学]** → 坚持日光纯白毛玻璃质感、弹簧物理交互与零冗余按钮。',
        '',
        '## L2 · 全局架构与领域模型',
        '- **[A+B+C 三位一体工作台]** → 融合 Codex 多项目侧栏（含 Skills/MCP）、Swarm 集群与 L1-L5 分层记忆。'
      ].join('\n')
    }
    return fs.readFileSync(file, 'utf-8')
  }

  static writeMemoryMarkdown(workspaceDir: string, content: string): void {
    const file = this.getMemoryFilePath(workspaceDir)
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(file, content, 'utf-8')
  }
}
