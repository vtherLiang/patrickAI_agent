# L4 · 情景决策与踩坑教训
> Episodic Decisions & Pitfall Lessons (艾宾浩斯演化 · 访问强化)

## 复刻ing 架构演进主体仍在未提交工作区
- **Layer**: L4 | **Retention**: 97% | **Recalls**: 1 | **Tags**: 项目事实, 版本控制
- **Keywords**: 复刻ing, 未提交改动, e855edb, 架构演进

复刻ing 仓库仅 1 次提交 e855edb（34 文件 +8105 行，A+B+C 骨架），而工作区有 25 文件 +6113/−1482 行未提交改动。总结架构演进时应对比「已提交骨架 vs 未提交演进」，并提示用户提交，而非按提交历史还原。

## 复刻ing 打包阻塞点与静默隐患
- **Layer**: L4 | **Retention**: 100% | **Recalls**: 3 | **Tags**: Electron打包, 踩坑教训
- **Keywords**: 复刻ing, 打包阻塞, mac-doc-helper, arm64, dist缺失

复刻ing 项目结构完整可封装，但存在 1 个直接阻塞打包的问题及 3 个打包后静默出错隐患；dist/ 目录不存在，说明从未成功产出过安装包。resources/mac-doc-helper 为仅 arm64 的 Mach-O 二进制，跨架构分发需注意。

## 防范 MEMORY.md 超过 200 行导致上下文静默截断
- **Layer**: L4 | **Retention**: 97% | **Recalls**: 2 | **Tags**: pitfall, memory, context-window
- **Keywords**: memory, 200行, 记忆, token, 压缩, 检索, memdir

借鉴 Claude Code 源码 memdir 教训：根索引 MEMORY.md 必须保持在 200 行以内作为轻量指针索引，具体知识按 L1-L5 分层落盘并在每次询问时动态检索回调，避免全量塞入导致 Token 膨胀。

## git-forensics-mcp 返回数与实际提交数需交叉核验
- **Layer**: L4 | **Retention**: 97% | **Recalls**: 1 | **Tags**: 工具使用, 数据核验
- **Keywords**: git-forensics-mcp, git_recent_commits, rev-list --count, 交叉核验

调用 git-forensics-mcp 的 git_recent_commits 请求 N 条记录时，若仓库实际提交数不足 N，工具可能不显式报错。必须用 git rev-list --count HEAD 交叉核验真实提交总数，再决定总结口径，避免按不存在的提交数编造演进叙事。

## 复刻ing 封装可行性评估结论
- **Layer**: L4 | **Retention**: 97% | **Recalls**: 3 | **Tags**: Electron打包, 踩坑预防
- **Keywords**: 封装可行性, electron-builder, 外部二进制, process.cwd, icns

复刻ing 项目已具备 electron-builder 打包配置与 out 构建产物，但封装前需确认 resources 图标 icns 存在、src/main 中 spawn/exec 调用的 claude CLI 等外部二进制路径在 .app 内可解析，且 process.cwd() 用法需改为 app.getPath 以适配打包后路径。

## Electron 打包前需修复外部依赖路径
- **Layer**: L4 | **Retention**: 98% | **Recalls**: 4 | **Tags**: 打包部署, 踩坑教训
- **Keywords**: Electron打包, spawn路径, 外部二进制, macOS App

复刻ing 项目封装为 macOS .app 前，必须核查 src/main 中 spawn/exec 调用的外部二进制（如 claude CLI）路径，避免打包后因相对路径失效导致运行时静默失败。

## 国内展讯类实时检索的抓取坑点
- **Layer**: L4 | **Retention**: 96% | **Recalls**: 1 | **Tags**: 网络抓取, 踩坑教训
- **Keywords**: 展讯检索, JS渲染, DNS失败, 雅昌, 中国美术馆

检索北京书法展等国内展讯时，Bing/360/搜狗/DuckDuckGo 返回 JS 渲染外壳抓不到正文；雅昌展览列表异步加载；namoc.org 与 chnmuseum.cn 本地 DNS 解析失败。可靠入口为 dpm.org.cn/shows.html、bjaa.com.cn、chncpa.org、exhibit.artron.net，中国美术馆展讯需走微信公众号。

## Semantic Scholar 429 限流需降级 OpenAlex
- **Layer**: L4 | **Retention**: 100% | **Recalls**: 1 | **Tags**: 踩坑教训, API限流
- **Keywords**: Semantic Scholar, 429, OpenAlex, open_access

Semantic Scholar API 高频调用易返回 429 限流，应直接降级到 OpenAlex（免密钥、覆盖广）；另 open_access 为 False 不等同无预印本，仍须用 export.arxiv.org/api/query 独立核验后再下结论。
