<div align="center">

# 🎨 tool-hub

**做图工具聚合平台 — 工具导航 / 任务队列 / 图库**

把散落各处的画图工具、AI 配图 agent、本地绘图服务，收进一个桌面入口。

[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/Xtosunalive/tool-hub)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)
![React 18](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-server-8A2BE2)

</div>

> **一句话**: 画图这件事不该在八个网站、五个 CLI 和三份凭据之间来回切换 —— tool-hub 用一张导航、一条队列、一个图库解决。

---

## 为什么做这件事

画一张图，你可能要用到：

- **在线 SaaS**: draw.io、Excalidraw、Mermaid Live、Figma…… 每个都是独立标签页，收藏夹越堆越长；
- **AI 配图 agent**: 文生图、公众号封面、小红书配图…… 每个工具调用方式不同、凭据不同、产出散落在各自的输出目录；
- **本地服务**: LikeC4、AI 生成 draw.io…… 每次要手动 `cd` 进目录、敲启动命令、记端口号。

工具越多，**切换成本**越高；产出越多，**归档成本**越高。图做完了，却找不到上次生成的那张存在哪。

## 它解决了什么问题

- ✅ **一个入口**：在线工具、AI agent、本地服务三类画图工具统一导航，`tools.json` 配置驱动，加工具不改代码
- ✅ **一条队列**：AI 配图任务异步执行，pending / running / done / failed / cancelled 五态状态机，可随时取消
- ✅ **一个图库**：所有产出自动按 `日期 / 工具` 归档，支持按工具筛选和关键词搜索，也支持手动上传
- ✅ **一键启停**：本地服务（LikeC4、Next AI Draw.io）在设置页点击启动，不用记命令和端口
- ✅ **凭据集中**：API Key 统一在设置页管理、脱敏展示，`credentials.json` 已被 `.gitignore` 排除，永不入库
- ✅ **Agent 可用**：内置 MCP server，AI agent（Claude / DSH 等）可以直接把工具调用投进队列

## 它是怎么工作的

```
                         ┌─────────────────────────────────────┐
                         │      tool-hub 后端 (Node/Electron)   │
                         │       http://127.0.0.1:18084        │
                         └──────────────────┬──────────────────┘
                                            │ /api/*
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                             ▼                             ▼
       ┌─────────────┐              ┌──────────────┐              ┌──────────────┐
       │  工具导航     │   一键提交    │   任务队列    │   产物落盘    │     图库      │
       │  tools.json │ ──────────▶ │ tasks/*.json │ ──────────▶ │ images/日期/  │
       │  a / b / c  │              │   5 态状态机  │              │  按工具归档   │
       └─────────────┘              └──────┬───────┘              └──────────────┘
                                           │ spawn 子进程
                     ┌─────────────────────┼─────────────────────┐
                     ▼                     ▼                     ▼
              autoglm 文生图        huashu 公众号/小红书配图    lark-whiteboard / archify
```

同时，**mcp-toolhub** 把同一套 `/api/*` 暴露为 MCP tools（stdio），AI agent 无需打开界面就能建任务、查队列、取图库：

```
AI agent (Claude/DSH) ──stdio──▶ mcp-toolhub ──HTTP──▶ tool-hub /api/* ──▶ tasks / gallery
```

## 效果示例

**场景：给一篇公众号文章配图**

1. 在「工具导航」的 Agent 区选 `huashu-wechat-image`，贴入文章内容，类型选 `封面`，提交；
2. 「任务队列」里出现一条 `running` 记录，完成后变 `done`；
3. 切到「图库」，图片已自动归档在 `images/2026-08-27/huashu-wechat-image/` 下，直接预览、下载。

| 之前 | 之后 |
|------|------|
| 打开文生图网站 → 手动贴内容 → 等待 → 手动下载 → 手动归档到文件夹 | tool-hub 提交一次，队列自动跑，图库自动归档 |
| 凭据散在各个工具的配置里 | 设置页集中管理，脱敏显示 |
| 本地 likec4 / draw-io 服务记不住启动命令 | 设置页一键 start / stop，状态实时可见 |

## 快速开始

```bash
git clone https://github.com/Xtosunalive/tool-hub.git
cd tool-hub
npm install
npm run dev        # 后端 API :18084 + 前端 Vite :5175
```

> 首次使用：在「设置」页配置所需凭据（如 `autoglm_token`、`GEMINI_API_KEY`），或在项目根目录放置 `credentials.json`（已被 gitignore，不会提交）。

其他命令：

```bash
npm run build          # 前端构建
npm run gen:likec4     # 生成并校验 likec4 架构模型
```

## 工具注册表（tools.json）

| 分区 | 含义 | 例子 |
|------|------|------|
| `a_online` | 在线工具导航 | draw.io、Excalidraw、tldraw、Mermaid Live、PlantUML、Figma |
| `b_agent` | AI agent 工具（进队列异步执行） | autoglm 文生图/搜图、公众号配图、小红书配图、飞书画板、archify |
| `c_local` | 本地服务（一键启停） | LikeC4 CLI（自带）、Obsidian、Next AI Draw.io |

加一个工具 = 在 `tools.json` 里加一行 JSON，导航自动出现新卡片。

## 仓库结构

```
tool-hub/
├── electron/
│   ├── main.cjs                    ← Node 后端（默认端口 18084）
│   └── routes/
│       └── tool-hub-routes.cjs     ← /api/* 路由注册
├── src/
│   ├── features/tool-hub/
│   │   ├── ToolHubView.tsx         ← 工具导航（在线 / Agent / 本地 三区）
│   │   ├── TasksView.tsx           ← 任务队列
│   │   ├── GalleryView.tsx         ← 图库
│   │   ├── SettingsView.tsx        ← 凭据 / 模板 / 服务管理
│   │   └── api.ts                  ← API 客户端
│   ├── App.tsx
│   └── main.tsx
├── mcp-toolhub/                    ← MCP server（stdio 桥接 /api/*）
├── likec4/                         ← 架构即代码（C4 模型）
├── scripts/
│   └── generate-likec4-model.mjs   ← 架构模型生成脚本
├── tools.json                      ← 工具注册表（a_online / b_agent / c_local）
└── package.json
```

## 生态

- [publish-skill-to-github](https://github.com/Xtosunalive/publish-skill-to-github) — 本仓库的开源发布就是用它完成的：前置安全检查 → 干净提交 → tag → push
- 聚合的 AI 工具能力来自: `autoglm-*`（文生图/搜图）、`huashu-*`（公众号/小红书配图）、`archify`（架构图）、`lark-*`（飞书系）、`json-canvas`

## 关于作者

**Xtosunalive** — [GitHub @Xtosunalive](https://github.com/Xtosunalive)

## License

[MIT](./LICENSE) © 2026 Xtosunalive
