import fs from 'fs'
import path from 'path'

/**
 * Dynamically builds the system prompt by injecting workspace metadata,
 * project-level CLAUDE.md instructions, and Dream Engine's persistent MEMORY.md.
 */
export class SystemPromptBuilder {
  static build(workspaceDir: string): string {
    const sections: string[] = [
      `你是 Claude Code Desktop（A+B+C 三位一体原生桌面端 AI 研发引擎）。`,
      `当前工作区路径: ${workspaceDir}`,
      `操作系统环境: macOS (${process.platform} / ${process.arch})`,
      '',
      `### 核心工作准则`,
      `1. 修改任何代码前，请先使用 search_files 或 read_file 了解上下文，不要凭空猜测文件内容。`,
      `2. 修改现有文件优先使用 edit_file（提供精确的 old_string 与 new_string），新建文件使用 write_file。`,
      `3. 当用户任务非常庞大、跨越多个独立模块或适合多智能体并行开发时，你可以调用 delegate_to_swarm 工具启动 Coordinator 集群。`,
      `4. 回答保持专业、清晰、简洁。`
    ]

    // Inject CLAUDE.md if present in workspace
    const claudeMdPath = path.join(workspaceDir, 'CLAUDE.md')
    if (fs.existsSync(claudeMdPath)) {
      try {
        const claudeMd = fs.readFileSync(claudeMdPath, 'utf-8').slice(0, 4000)
        sections.push('', `### 项目规范 (CLAUDE.md)`, claudeMd)
      } catch {
        // ignore
      }
    }

    // Inject persistent Dream Memory (.claude-desktop/MEMORY.md)
    const memoryPath = this.getMemoryFilePath(workspaceDir)
    if (fs.existsSync(memoryPath)) {
      try {
        const memoryMd = fs.readFileSync(memoryPath, 'utf-8').slice(0, 4000)
        sections.push('', `### Dream 引擎沉淀的项目持久记忆 (.claude-desktop/MEMORY.md)`, memoryMd)
      } catch {
        // ignore
      }
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
        '# 项目持久记忆库 (Dream Engine Memory)',
        '',
        '> 本文件由 **KAIROS / Dream 夜间记忆引擎** 自动提炼维护，也会在每次主 Agent 与 Sub-agent 对话时自动注入上下文。',
        '',
        '## 架构约定与技术栈',
        '- 桌面端采用 Electron + React + TypeScript + Tailwind CSS 构建。',
        '- 核心引擎位于 `src/main/`，包含 `QueryEngine`、`ToolRegistry`、`CompactPipeline`、`SwarmCoordinator` 与 `DreamEngine`。',
        '',
        '## 用户偏好与开发纪律',
        '- 写入操作与终端命令默认经过可视化 Diff 与权限闸门审批。',
        '- 优先使用 OpenAI 兼容接口（支持 DeepSeek、Qwen、SiliconFlow、OpenRouter 等）。'
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
