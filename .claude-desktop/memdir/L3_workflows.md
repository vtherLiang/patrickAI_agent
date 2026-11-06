# L3 · 程序性工作流与技能范式
> Procedural Workflows & Verified SOPs (中长效 · 调试与构建剧本)

## 学术论文引文网络实时检索工作流
- **Layer**: L3 | **Retention**: 100% | **Recalls**: 1 | **Tags**: 学术检索, 工作流
- **Keywords**: OpenAlex, 引文网络, DOI, arXiv, 相关工作

为用户找某篇论文的相关工作时，先用 OpenAlex 查 https://api.openalex.org/works/doi:{DOI} 取 referenced_works 与 cited_by_api_url，逐条取标题/DOI/arXiv ID，再用 arXiv API 查预印本链接；最终按“关系类型+链接”输出优先级表格。

## macOS Homebrew Node 工具链与类型校验工作流
- **Layer**: L3 | **Retention**: 99% | **Recalls**: 2 | **Tags**: workflow, toolchain, verification
- **Keywords**: node, homebrew, tsc, build, 编译, 构建, 终端

本机 Node 与 npm 位于 /opt/homebrew/bin/node；完成跨进程 IPC 或组件修改后，优先执行 tsc --noEmit 与 electron-vite build 验证零类型错误。

## 能力说明书编写前先扫描真实代码事实
- **Layer**: L3 | **Retention**: 100% | **Recalls**: 2 | **Tags**: 文档工作流, 验证SOP
- **Keywords**: 能力说明书, 代码事实核对, ToolRegistry, 文档一致性

完善《我能帮你做什么》能力说明书时，先并行执行 search_files/read_file 定位文档，再用 run_bash 遍历 src/main 各模块（engine/context/memory/coordinator/daemon/tools）、ToolRegistry 工具名、config.json 与权限字段，确保文档描述与真实实现一致，避免凭空杜撰能力。

## 能力说明书分段拼接更新法
- **Layer**: L3 | **Retention**: 100% | **Recalls**: 5 | **Tags**: 文档维护, 工作流
- **Keywords**: 能力说明书, 分段拼接, APPEND-HERE, edit_file

更新《我能帮你做什么》等长文档时，先用 sed 分段读取并写入 /tmp 临时文件，再用 write_file 重建主文件并保留 <!-- APPEND-HERE --> 锚点，最后用 edit_file 在锚点处追加新章节，避免整文件重写导致内容丢失。

## GitHub 实时项目检索工作流
- **Layer**: L3 | **Retention**: 99% | **Recalls**: 2 | **Tags**: 工作流, 检索
- **Keywords**: GitHub API, trending, 项目推荐, curl

为用户推荐 GitHub 开源项目时，先用 curl 调 GitHub Search API（stars:>2000 过滤）与 trending 页面抓取实时快照，再用 for 循环批量拉取候选仓库元数据，最后按主题分组呈现并附链接。
