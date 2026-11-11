# PatrickAI Agent · Claude Code Studio (A + B + C 三位一体桌面端)

基于 Claude Code (`v2.1.88`) 架构思想的 **Clean-Room 原生桌面端重构版**，采用 **Electron + React + TypeScript + Vite + Tailwind CSS** 构建，支持 **100% OpenAI 兼容接口（DeepSeek / SiliconFlow / OpenRouter / OpenAI / Google Gemini / 本地 Ollama）**。

## 📥 客户端下载 (Releases)

可直接前往 [GitHub Releases](https://github.com/vtherLiang/patrickAI_agent/releases) 下载对应系统的安装包或免安装版：

- **macOS 版本**：
  - `PatrickAI-Agent-mac-arm64-1.0.1.dmg` / `.zip`（Apple Silicon M1/M2/M3/M4 芯片）
  - `PatrickAI-Agent-mac-x64-1.0.1.dmg` / `.zip`（Intel 芯片）
  - *注：首次打开若提示未签名应用，可在终端执行 `xattr -cr "/Applications/PatrickAI Agent.app"` 或在「系统设置 -> 隐私与安全性」中点击「仍要打开」。*
- **Windows 版本**：
  - `PatrickAI-Agent-Windows-Setup-1.0.1.exe`（Windows x64 安装程序）
  - `PatrickAI-Agent-win-x64-1.0.1.zip`（Windows x64 绿色免安装版，解压即用）

## 核心架构模块

1. **方向 A：原生 AI 编程工作台 (`WorkbenchView` + `QueryEngine`)**
   - 完整复刻 ReAct 多轮工具调用循环（`src/main/engine/QueryEngine.ts`）
   - 内置 6 大沙箱工具（`read_file`、`search_files`、`edit_file`、`write_file`、`run_bash`、`delegate_to_swarm`）
   - **可视化 Diff 权限闸门 (`PermissionGate`)**：修改文件或执行命令前自动弹出双栏/行内 Unified Diff 审批卡片（支持「允许一次 / 本会话总是允许 / 拒绝」）
   - 右侧集成**实时终端流 (`stdout/stderr`)** 与**交互式项目文件树**

2. **方向 B：Coordinator 多智能体并发指挥中心 (`CoordinatorView` + `SwarmCoordinator`)**
   - 自动将复杂目标拆解为具有拓扑依赖关系的 **DAG 任务图**（Researcher -> 并行 Coder / Tester -> Reviewer）
   - **Git Worktree 物理隔离 (`WorktreeManager`)**：为并行编码的 Sub-Agent 自动创建独立分支工作区（位于 `.claude-desktop/worktrees/`），杜绝并发修改冲突，支持界面上一键 Merge 回主分支

3. **方向 C：KAIROS 后台守护与 Dream 夜间记忆引擎 (`KairosView` + `DreamEngine`)**
   - **三层上下文压缩管线 (`CompactPipeline`)**：
     - `MicroCompact`：自动折叠早期轮次的冗长工具输出，节省 60%+ Token
     - `AutoCompact`：水位线达到阈值时自动浓缩历史对话为 `<context_summary>` 检查点
     - `DreamEngine`：将对话经验与架构约定提炼沉淀至 `.claude-desktop/MEMORY.md`，并在后续会话自动注入系统提示词
   - **Mac 菜单栏常驻与全局快捷键**：关闭窗口后常驻顶部状态栏，按 `Option + Space` 随时呼出 `QuickLauncher` 快捷指令框

## 快速启动

```bash
# 安装依赖
npm install

# 启动开发模式桌面端
npm run dev

# 类型检查与生产构建
npm run typecheck
npm run build

# 打包桌面端安装包 (macOS / Windows)
npm run dist:mac
npm run dist:win
npm run dist:all
```
