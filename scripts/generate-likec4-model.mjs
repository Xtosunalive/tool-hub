#!/usr/bin/env node
/**
 * tool-hub 架构图自动生成器（适配版）
 * 机制：扫描代码库 → 分类 → 生成 LikeC4 DSL（架构图自动更新）
 *
 * 数据源：
 *   - src/features/tool-hub/  → 前端视图组件（hub/gallery/tasks/settings）
 *   - electron/routes/        → API 路由
 *   - electron/main.cjs       → 后端入口
 *   - package.json            → 技术栈 & 外部依赖
 *
 * 用法：
 *   node scripts/generate-likec4-model.mjs
 *   node scripts/generate-likec4-model.mjs --output likec4/generated.c4
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = join(__dirname, '..');

// ── 视图上下文 → 组件前缀映射（tool-hub 业务语义） ──
const VIEWS = {
  hub:      { title: '工具台',   description: 'A类在线工具跳转 / B类任务表单 / C类本地服务' },
  gallery:  { title: '图库',     description: '图片上传 / 网格展示 / 筛选 / 预览 / 下载 / 删除' },
  tasks:    { title: '任务',     description: '任务状态列表 / 待办计数 / 取消' },
  settings: { title: '设置',     description: '本地服务启停 / 存储目录' },
};

const ROUTE_GROUPS = {
  tools:     'GET /api/tools',
  tasks:     'POST|GET /api/tasks + cancel',
  gallery:   'GET|POST|DELETE /api/gallery',
  templates: 'GET|POST /api/templates',
  service:   'GET /api/status + POST /api/start|stop',
};

function scanDir(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(ext) && !f.startsWith('__'))
    .map(f => basename(f, ext));
}
function safeId(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+/, '').slice(0, 50);
}
function esc(s) {
  return s.replace(/'/g, "\\'");
}

// ── 主逻辑 ──
const outPath = process.argv[3] || join(REPO_ROOT, 'likec4', 'generated.c4');
const generatedAt = new Date().toISOString();
const ts = generatedAt.replace('T', ' ').slice(0, 19);

// 前端视图组件
const features = readdirSync(join(REPO_ROOT, 'src', 'features'))
  .filter(f => !f.startsWith('_') && !f.startsWith('.'))
  .flatMap(f => {
    const dir = join(REPO_ROOT, 'src', 'features', f);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(x => x.endsWith('.tsx') && !x.endsWith('.test.tsx') && !x.startsWith('index'))
      .map(x => basename(x, '.tsx'));
  });

// API 路由
const routes = scanDir(join(REPO_ROOT, 'electron', 'routes'), '.cjs');

// package.json 依赖
const pkj = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'));
const deps = { ...pkj.dependencies, ...pkj.devDependencies };

const L = [];
L.push("// 自动生成于 " + generatedAt);
L.push("// 生成器版本 1.0.0 (tool-hub 适配版)");
L.push("// 数据源: src/features/ (" + features.length + " 组件), electron/routes/ (" + routes.length + " 路由), package.json");
L.push("// 警告: 此文件由 scripts/generate-likec4-model.mjs 生成，请勿手动编辑");
L.push('');
L.push('specification {');
L.push('  element person');
L.push('  element system');
L.push('  element container');
L.push('  element component');
L.push('  element external');
L.push('}');
L.push('');
L.push('model {');
L.push('');
L.push('  // ── 角色 ──');
L.push("  user = person '用户' {");
L.push("    description '打开浏览器使用平台的单用户（localhost）'");
L.push('  }');
L.push('');
L.push("  agent = person 'Agent (DSH)' {");
L.push("    description '后台执行层：读 pending 任务 → 调对应 skill 出图 → 写回图库'");
L.push('  }');
L.push('');
L.push('  // ── 系统 ──');
L.push("  toolhub = system '做图工具聚合平台 (tool-hub)' {");
L.push("    description '工具导航 / 任务队列 / 图库 三位一体，本身不实现渲染，全部跳转外部工具'");
L.push('');
L.push('    // ── Web 前端 container ──');
L.push("    web = container 'Web 前端' {");
L.push("      description 'React SPA, " + features.length + " 个视图组件 (Vite 构建 → dist/)，由 API 服务托管静态文件'");
for (const [key, info] of Object.entries(VIEWS)) {
  const views = features.filter(f => f.toLowerCase().startsWith(key.toLowerCase()) || f.toLowerCase().includes(key.toLowerCase()));
  if (views.length === 0) continue;
  L.push("      " + key + "Ui = component '" + info.title + "' {");
  L.push("        description '" + esc(info.description) + " (" + esc(views.join(', ')) + ")'");
  L.push('      }');
}
L.push('    }');
L.push('');
L.push('    // ── API 服务 container ──');
L.push("    api = container 'API 服务' {");
L.push("      description 'Node.js http.createServer (18084), " + routes.length + " 路由文件, registerRoute 模式'");
for (const [key, desc] of Object.entries(ROUTE_GROUPS)) {
  L.push("      " + key + "Route = component '" + esc(desc) + "' {");
  L.push("        description '路由组 " + key + "'");
  L.push('      }');
}
L.push("      staticRoute = component '静态托管' {");
L.push("        description 'dist/ 前端产物 + /images/ 图片文件 + /likec4/ 架构图站点'");
L.push('      }');
L.push('    }');
L.push('');
L.push('    // ── 数据层 container ──');
L.push("    data = container '数据层' {");
L.push("      description '纯文件系统存储，无数据库'");
L.push("      toolsJson = external 'tools.json' { description '工具清单（可编辑增删）' }");
L.push("      tasksDir = external 'tasks/*.json' { description '任务队列（pending→running→done/failed/cancelled）' }");
L.push("      imagesDir = external 'images/{日期}/{工具}/' { description '图库文件（上传 + Agent 出图落盘）' }");
L.push("      templatesDir = external 'templates/*.json' { description '提示词模板库' }");
L.push('    }');
L.push('  }');
L.push('');
L.push('  // ── 外部工具（A 类在线跳转） ──');
L.push("  drawio = external 'draw.io' { description 'app.diagrams.net — 通用流程图/架构图' }");
L.push("  excalidraw = external 'Excalidraw' { description 'excalidraw.com — 手绘风白板' }");
L.push("  tldraw = external 'tldraw' { description 'tldraw.com — 强交互画布' }");
L.push("  mermaid = external 'Mermaid Live' { description 'mermaid.live — 流程图/时序/甘特 DSL' }");
L.push("  plantuml = external 'PlantUML' { description 'plantuml.com — UML/时序/用例' }");
L.push("  likec4play = external 'LikeC4 Playground' { description 'playground.likec4.dev — C4 架构图' }");
L.push("  echarts = external 'ECharts' { description 'echarts.apache.org — 数据图表' }");
L.push("  figma = external 'Figma' { description 'figma.com — 专业 UI 设计' }");
L.push('');
L.push('  // ── 外部工具（B 类 Agent skill） ──');
L.push("  autoglm = external 'autoglm-generate/search-image' { description '文生图 / 搜图' }");
L.push("  huashu = external 'huashu-wechat/xhs-image' { description '公众号 / 小红书配图' }");
L.push("  whiteboard = external 'lark-whiteboard' { description '飞书画板（Mermaid/PlantUML/SVG）' }");
L.push("  jsoncanvas = external 'json-canvas' { description 'JSON Canvas 思维导图/画布' }");
L.push('');
L.push('  // ── 外部工具（C 类本地服务） ──');
L.push("  likec4cli = external 'LikeC4 CLI' { description 'npx likec4 start . --port 5175（tool-hub 自带）' }");
L.push("  obsidian = external 'Obsidian' { description 'Excalidraw/Mermaid/Canvas 内置（obsidian://open）' }");
L.push('');
L.push('  // ── 外部依赖（package.json） ──');
const externalDeps = [
  ['react', 'React'],
  ['react-dom', 'React DOM'],
  ['lucide-react', 'Lucide Icons'],
  ['sonner', 'Sonner Toast'],
  ['zustand', 'Zustand'],
  ['vite', 'Vite'],
  ['tailwindcss', 'Tailwind CSS'],
];
for (const [pkg, label] of externalDeps) {
  if (deps[pkg]) {
    const ver = deps[pkg].replace(/^[\^~]/, '');
    L.push("  " + safeId(pkg) + " = external '" + esc(label) + "' { description '" + esc(ver) + "' }");
  }
}
L.push('');
L.push('  // ── 关系：用户交互 ──');
L.push("  user -> web.hubUi '浏览工具台'");
L.push("  user -> web.galleryUi '管理图库'");
L.push("  user -> web.tasksUi '跟踪任务'");
L.push("  user -> web.settingsUi '管理本地服务'");
L.push('');
L.push('  // ── 关系：前端 → API ──');
L.push("  web.hubUi -> api.toolsRoute 'GET /api/tools'");
L.push("  web.hubUi -> api.tasksRoute 'POST /api/tasks（提交任务）'");
L.push("  web.hubUi -> api.serviceRoute 'POST /api/start|stop（C类）'");
L.push("  web.galleryUi -> api.galleryRoute 'GET/POST/DELETE /api/gallery'");
L.push("  web.tasksUi -> api.tasksRoute 'GET 列表 / POST cancel'");
L.push("  web.settingsUi -> api.serviceRoute 'GET /api/status'");
L.push('');
L.push('  // ── 关系：API → 数据层 ──');
L.push("  api.staticRoute -> data.imagesDir '静态服务'");
L.push("  api.toolsRoute -> data.toolsJson '读'");
L.push("  api.tasksRoute -> data.tasksDir '读写'");
L.push("  api.galleryRoute -> data.imagesDir '读写'");
L.push("  api.templatesRoute -> data.templatesDir '读写'");
L.push('');
L.push('  // ── 关系：跳转 / 执行 / 起服务 ──');
L.push("  web.hubUi -> drawio '跳转打开'");
L.push("  web.hubUi -> excalidraw '跳转打开'");
L.push("  web.hubUi -> tldraw '跳转打开'");
L.push("  web.hubUi -> mermaid '跳转打开'");
L.push("  web.hubUi -> plantuml '跳转打开'");
L.push("  web.hubUi -> likec4play '跳转打开'");
L.push("  web.hubUi -> echarts '跳转打开'");
L.push("  web.hubUi -> figma '跳转打开'");
L.push('');
L.push('  // Agent 执行链路');
L.push("  agent -> data.tasksDir '读 pending 任务'");
L.push("  agent -> autoglm '调用（文生图/搜图）'");
L.push("  agent -> huashu '调用（配图）'");
L.push("  agent -> whiteboard '调用（画板）'");
L.push("  agent -> jsoncanvas '调用（思维导图）'");
L.push("  autoglm -> data.imagesDir '出图落盘'");
L.push("  huashu -> data.imagesDir '出图落盘'");
L.push("  whiteboard -> data.imagesDir '导出落盘'");
L.push("  jsoncanvas -> data.imagesDir '导出落盘'");
L.push("  agent -> data.tasksDir '标记 done（附 images 路径）'");
L.push('');
L.push("  api.serviceRoute -> likec4cli 'spawn 启动'");
L.push("  api.serviceRoute -> obsidian 'spawn 启动'");
L.push('}');
L.push('');
L.push('views {');
L.push('  view landscape of toolhub {');
L.push("    title '做图工具聚合平台 — 全景（工具导航 / 任务队列 / 图库）(" + ts + ")'");
L.push('    include *');
L.push('  }');
L.push('  view containers of toolhub {');
L.push("    title '平台内部 — 前端 / API / 数据层'");
L.push('    include toolhub.*');
L.push('  }');
L.push('  view flow of toolhub {');
L.push("    title '核心闭环 — 提交任务 → Agent 执行 → 出图入库'");
L.push('    include user, web.hubUi, api.tasksRoute, data.tasksDir, agent, autoglm, huashu, whiteboard, jsoncanvas, data.imagesDir');
L.push('  }');
L.push('}');

const output = L.join('\n') + '\n';
writeFileSync(outPath, output, 'utf-8');

console.log("LikeC4 模型已写入 " + outPath);
console.log("   " + features.length + " 视图组件, " + routes.length + " 路由文件");
console.log("   生成时间: " + generatedAt);
