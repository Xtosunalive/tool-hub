#!/usr/bin/env node
/**
 * 做图工具聚合平台 — 后端
 * API 模式：http.createServer + routes/*.cjs 路由注册
 * 用法: node electron/main.cjs [端口]  (默认 18084)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn, exec } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = parseInt(process.argv[2] || process.env.API_PORT || "18084", 10);
const HOST = "127.0.0.1";

// ── 基础工具 ──
const sendJSON = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj, null, 2));
};
const readJson = (p, def) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return def; } };
const writeJson = (p, obj) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); };
const safeName = s => String(s).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
const ensure = d => fs.mkdirSync(d, { recursive: true });

// ── 目录 ──
const TASKS_DIR = path.join(ROOT, "tasks");
const IMAGES_DIR = path.join(ROOT, "images");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const TOOLS_FILE = path.join(ROOT, "tools.json");
const CREDS_FILE = path.join(ROOT, "credentials.json");
[ TASKS_DIR, IMAGES_DIR, TEMPLATES_DIR, path.join(ROOT, "logs") ].forEach(ensure);

// ── 工具清单 ──
const getTools = () => readJson(TOOLS_FILE, { a_online: [], b_agent: [], c_local: [] });

// ── 认证凭据（key -> secret，存本地 credentials.json） ──
const getCredentials = () => readJson(CREDS_FILE, {});
const setCredential = (key, value) => {
  const all = getCredentials();
  if (value === undefined || value === null || value === "") delete all[key];
  else all[key] = String(value);
  writeJson(CREDS_FILE, all);
  return all;
};
const maskSecret = s => {
  if (!s) return "";
  const str = String(s);
  if (str.length <= 8) return "****";
  return str.slice(0, 3) + "****" + str.slice(-3);
};
const getCredentialSummary = () => {
  const all = getCredentials();
  const out = {};
  for (const [k, v] of Object.entries(all)) out[k] = { set: !!v, masked: v ? maskSecret(v) : "" };
  return out;
};

// ── 从 cc-switch 当前生效配置导入凭据（读 ~/.claude/settings.json 的 env） ──
const CCSWITCH_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const CCSWITCH_KEYS = [
  "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "ANTHROPIC_API_KEY", "ANTHROPIC_API_TIMEOUT_MS", "OPENAI_API_KEY",
];
const importCcswitchCreds = () => {
  const src = readJson(CCSWITCH_SETTINGS, null);
  if (!src || !src.env || typeof src.env !== "object") {
    return { ok: false, error: "未找到 cc-switch 配置（~/.claude/settings.json）或其中没有 env" };
  }
  const imported = [];
  for (const k of CCSWITCH_KEYS) {
    const v = src.env[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      setCredential(k, String(v).trim());
      imported.push(k);
    }
  }
  if (imported.length === 0) {
    return { ok: false, error: "cc-switch 当前供应商 env 中没有可导入的 ANTHROPIC_*/OPENAI_* 凭据" };
  }
  return { ok: true, imported, summary: getCredentialSummary() };
};

// ── 任务 ──
const listTasks = status => {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs.readdirSync(TASKS_DIR).filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(TASKS_DIR, f), null)).filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .filter(t => !status || t.status === status);
};
const getTask = id => {
  const p = path.join(TASKS_DIR, safeName(id) + ".json");
  return fs.existsSync(p) ? readJson(p, null) : null;
};
const nextTaskId = () => {
  const n = new Date();
  const pad = x => String(x).padStart(2, "0");
  return n.getFullYear() + pad(n.getMonth() + 1) + pad(n.getDate()) + "-" +
    pad(n.getHours()) + pad(n.getMinutes()) + pad(n.getSeconds()) + "-" + crypto.randomBytes(2).toString("hex");
};

// ── 图库 ──
const listGallery = (tool, date, q) => {
  const out = [];
  if (!fs.existsSync(IMAGES_DIR)) return out;
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|html?)$/i.test(e.name)) {
        const rel = path.relative(ROOT, full).split(path.sep);
        out.push({ path: rel.join("/"), name: e.name, date: rel[1] || "", tool: rel[2] || "", size: fs.statSync(full).size, mtime: fs.statSync(full).mtimeMs });
      }
    }
  };
  walk(IMAGES_DIR);
  return out
    .filter(i => !tool || i.tool === tool)
    .filter(i => !date || i.date === date)
    .filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.mtime - a.mtime);
};

// ── 模板 ──
const listTemplates = () => {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(TEMPLATES_DIR, f), null)).filter(Boolean);
};

// ── 本地服务 ──
const localServices = {};
const startService = (name, command, expectedUrl) => {
  if (localServices[name]) return { ok: true, running: true, url: localServices[name].url };
  const proc = spawn("/bin/bash", ["-lc", command], { cwd: ROOT, detached: true, stdio: "ignore" });
  localServices[name] = { proc, url: expectedUrl, startedAt: Date.now() };
  proc.on("exit", () => { if (localServices[name] && localServices[name].proc === proc) delete localServices[name]; });
  return { ok: true, running: true, url: expectedUrl };
};
const stopService = name => {
  const s = localServices[name];
  if (!s) return { ok: true, running: false };
  try { process.kill(-s.proc.pid, "SIGTERM"); } catch {}
  delete localServices[name];
  return { ok: true, running: false };
};

// ── 路由注册 ──
const routes = [];
const registerRoute = (method, pathname, handler) => routes.push({ method, pathname, handler });
const matchRoutePattern = (pattern, pathname) => {
  if (!pattern.includes(":")) return pattern === pathname ? {} : null;
  const pSeg = pattern.split("/"), uSeg = pathname.split("/");
  if (pSeg.length !== uSeg.length) return null;
  const params = {};
  for (let i = 0; i < pSeg.length; i++) {
    if (pSeg[i].startsWith(":")) params[pSeg[i].slice(1)] = decodeURIComponent(uSeg[i]);
    else if (pSeg[i] !== uSeg[i]) return null;
  }
  return params;
};

// ── 架构图生成服务（手动触发，调用 scripts/generate-likec4-model.mjs + likec4 build） ──
function genLikec4(callback) {
  const steps = [
    'node scripts/generate-likec4-model.mjs --output likec4/generated.c4',
    'cd likec4 && npx likec4 validate .',
    'cd likec4 && npx likec4 build . -o dist --base /likec4/ --use-hash-history --title 做图工具聚合平台架构',
  ];
  let stepIdx = 0;
  const runNext = () => {
    if (stepIdx >= steps.length) return callback(null, { ok: true, message: '架构图已重新生成并构建完成' });
    const cmd = steps[stepIdx++];
    exec(cmd, { cwd: ROOT, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return callback(err, { ok: false, step: cmd, message: stderr || String(err) });
      runNext();
    });
  };
  runNext();
}

require("./routes/tool-hub-routes.cjs").register(registerRoute, {
  getTools, listTasks, getTask, nextTaskId, writeJson, TASKS_DIR,
  listGallery, IMAGES_DIR, ROOT, listTemplates, TEMPLATES_DIR,
  getCredentials, setCredential, getCredentialSummary, importCcswitchCreds,
  startService, stopService, localServices, genLikec4, getServiceStatus: () => {
    const tools = getTools();
    return (tools.c_local || []).map(t => ({ name: t.name, running: !!localServices[t.name], url: localServices[t.name] ? localServices[t.name].url : (t.url || null) }));
  },
});

// ── AutoGLM token 服务（供 autoglm-* 技能读取凭据） ──
// 技能脚本约定从 http://127.0.0.1:53699/get_token 获取 Bearer token，
// 这里把页面保存的凭据通过该端口暴露给技能调用。
const TOKEN_PORT = parseInt(process.env.AUTOGLM_TOKEN_PORT || "53699", 10);
const tokenServer = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1:" + TOKEN_PORT);
  if (u.pathname === "/get_token") {
    const key = u.searchParams.get("key") || "autoglm_token";
    const token = getCredentials()[key] || "";
    res.writeHead(token ? 200 : 404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(token ? (key === "autoglm_token" ? "Bearer " + token : token) : "no token configured: " + key);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});
tokenServer.listen(TOKEN_PORT, "127.0.0.1", () => {
  console.log("AutoGLM token 服务已启动: http://127.0.0.1:" + TOKEN_PORT + "/get_token");
});
tokenServer.on("error", () => { /* 端口被占用时静默跳过，不影响主服务 */ });

// ── 静态文件（图库图片 + 前端构建产物） ──
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };

// ── Server ──
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + HOST + ":" + PORT);
  const p = url.pathname;
  const method = req.method;
  const q = url.searchParams;

  // CORS + OPTIONS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // 图片静态服务
  if (p.startsWith("/images/")) {
    const fp = path.join(ROOT, p);
    const resolved = path.resolve(fp);
    if (resolved.startsWith(path.resolve(IMAGES_DIR)) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(resolved).pipe(res);
    }
    return sendJSON(res, 404, { error: "文件不存在" });
  }

  // likec4 架构图静态站点（tool-hub/likec4/dist，独立构建产物）
  if (p.startsWith("/likec4/") || p === "/likec4" || p === "/likec4/") {
    const lcDir = path.join(ROOT, "likec4", "dist");
    if (fs.existsSync(lcDir)) {
      let file = (p === "/likec4" || p === "/likec4/") ? "/index.html" : p.replace(/^\/likec4/, "");
      // hash history：未知路径回退到 index.html
      const fp = path.join(lcDir, file);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
        return fs.createReadStream(fp).pipe(res);
      }
      if (fs.existsSync(path.join(lcDir, "index.html"))) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return fs.createReadStream(path.join(lcDir, "index.html")).pipe(res);
      }
    }
    return sendJSON(res, 404, { error: "likec4 站点未构建" });
  }

  // API 路由
  if (p.startsWith("/api/")) {
    const matched = routes.find(r => r.method === method && matchRoutePattern(r.pathname, p) !== null);
    if (matched) {
      req.params = matchRoutePattern(matched.pathname, p);
      return matched.handler(req, res, { sendJSON, q });
    }
    return sendJSON(res, 404, { error: "未注册的 API 路由: " + method + " " + p });
  }

  // 前端构建产物
  const distDir = path.join(ROOT, "dist");
  if (fs.existsSync(distDir)) {
    let file = p === "/" ? "/index.html" : p;
    const fp = path.join(distDir, file);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(fp).pipe(res);
    }
  }
  return sendJSON(res, 404, { error: "Not Found: " + p });
});

server.listen(PORT, HOST, () => {
  console.log("做图工具聚合平台 API 已启动: http://" + HOST + ":" + PORT);
});

module.exports = { server, registerRoute };

