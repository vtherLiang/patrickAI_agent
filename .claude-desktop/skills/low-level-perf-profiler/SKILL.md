---
name: low-level-perf-profiler
description: "底层系统与 Node/Electron 进程性能剖析技能：涵盖 CPU 热点采样、内存分配追踪、事件循环阻塞诊断与零拷贝优化建议。"
category: low-level
source: "https://github.com/mohitmishra786/low-level-dev-skills"
triggers: ["profile", "flamegraph", "perf", "latency", "memory leak", "性能瓶颈", "火焰图", "内存泄漏", "耗时优化"]
---

# Systems Performance & Memory Profiler

参考 low-level-dev-skills 性能工程体系构建。引导智能体遵循「先量化基准（Benchmark）再动刀优化」铁律，利用 macOS sample / vmmap、Node --cpu-prof / heapdump 及渲染帧率指标定位真实热点路径，拒绝无数据支撑的过早优化。

## Core Capabilities & Methodology
- macOS / Linux 原生采样剖析：支持 sample、time、lsof、ps 与 V8 CPU Profile 热点栈采样解读
- 内存驻留与泄漏排查：区分 RSS、Heap Used、External Buffer 与闭包滞留引用链
- I/O 与 IPC 序列化瓶颈消除：识别高频大对象 JSON 跨进程传输并给出增量流式（Delta Streaming）改造方案

## Usage Examples
### 1. Electron 主进程与渲染进程 IPC 吞吐性能审计
- **Prompt**: `启用 low-level-perf-profiler 技能，审查当前项目 src/main 与 src/renderer 之间的流式消息同步机制，找出潜在的高频渲染或序列化热点并给出优化方案。`
- **Expected Behavior**: 精准定位流式 delta 更新、列表重渲染与状态持久化路径，输出带量化收益评估的优化清单。
