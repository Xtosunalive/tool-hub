/**
 * 做图工具聚合平台 — API 路由
 * registerRoute 路由注册模式
 */
const path = require("path");
const fs = require("fs");

module.exports.register = function (registerRoute, svc) {
  // GET /api/tools
  registerRoute("GET", "/api/tools", (req, res, ctx) => {
    return ctx.sendJSON(res, 200, svc.getTools());
  });

  // GET /api/tasks?status=
  registerRoute("GET", "/api/tasks", (req, res, ctx) => {
    return ctx.sendJSON(res, 200, svc.listTasks(ctx.q.get("status") || null));
  });

  // POST /api/tasks
  registerRoute("POST", "/api/tasks", (req, res, ctx) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        if (!data.tool || !data.prompt) return ctx.sendJSON(res, 400, { error: "tool 和 prompt 必填" });
        const id = svc.nextTaskId();
        const task = {
          id, tool: data.tool, prompt: data.prompt,
          params: data.params || {}, status: "pending",
          createdAt: new Date().toISOString(), images: [], artifacts: []
        };
        svc.writeJson(path.join(svc.TASKS_DIR, id + ".json"), task);
        return ctx.sendJSON(res, 201, task);
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });

  // GET /api/tasks/:id
  registerRoute("GET", "/api/tasks/:id", (req, res, ctx) => {
    const task = svc.getTask(req.params.id);
    if (!task) return ctx.sendJSON(res, 404, { error: "任务不存在: " + req.params.id });
    return ctx.sendJSON(res, 200, task);
  });

  // POST /api/tasks/:id/cancel
  registerRoute("POST", "/api/tasks/:id/cancel", (req, res, ctx) => {
    const task = svc.getTask(req.params.id);
    if (!task) return ctx.sendJSON(res, 404, { error: "任务不存在: " + req.params.id });
    if (task.status !== "pending" && task.status !== "running")
      return ctx.sendJSON(res, 400, { error: "当前状态不可取消: " + task.status });
    task.status = "cancelled";
    svc.writeJson(path.join(svc.TASKS_DIR, task.id + ".json"), task);
    return ctx.sendJSON(res, 200, task);
  });

  // PATCH /api/tasks/:id（Agent 回写执行结果：status/images）
  registerRoute("PATCH", "/api/tasks/:id", (req, res, ctx) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const task = svc.getTask(req.params.id);
        if (!task) return ctx.sendJSON(res, 404, { error: "任务不存在: " + req.params.id });
        const data = JSON.parse(body || "{}");
        const validStatus = ["pending", "running", "done", "failed", "cancelled"];
        if (data.status !== undefined) {
          if (!validStatus.includes(data.status)) return ctx.sendJSON(res, 400, { error: "非法状态: " + data.status });
          task.status = data.status;
        }
        if (data.images !== undefined) {
          if (!Array.isArray(data.images)) return ctx.sendJSON(res, 400, { error: "images 必须是数组" });
          task.images = data.images.filter(i => typeof i === "string");
        }
        if (data.artifacts !== undefined) {
          if (!Array.isArray(data.artifacts)) return ctx.sendJSON(res, 400, { error: "artifacts 必须是数组" });
          task.artifacts = data.artifacts.filter(i => typeof i === "string");
        }
        if (data.error !== undefined) task.error = data.error;
        if (data.prompt !== undefined && typeof data.prompt === "string" && data.prompt.trim())
          task.prompt = data.prompt.trim();
        task.updatedAt = new Date().toISOString();
        svc.writeJson(path.join(svc.TASKS_DIR, task.id + ".json"), task);
        return ctx.sendJSON(res, 200, task);
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });

  // GET /api/gallery?tool=&date=&q=
  registerRoute("GET", "/api/gallery", (req, res, ctx) => {
    return ctx.sendJSON(res, 200, svc.listGallery(ctx.q.get("tool"), ctx.q.get("date"), ctx.q.get("q")));
  });

  // POST /api/gallery/upload?tool= (multipart)
  registerRoute("POST", "/api/gallery/upload", (req, res, ctx) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try {
        const buf = Buffer.concat(chunks);
        const m = (req.headers["content-type"] || "").match(/boundary=(.+)$/);
        if (!m) return ctx.sendJSON(res, 400, { error: "缺少 boundary" });
        const boundary = "--" + m[1].trim();
        const parts = buf.toString("latin1").split(boundary).filter(s => s.includes("filename="));
        if (!parts.length) return ctx.sendJSON(res, 400, { error: "未找到文件" });
        const fm = parts[0].match(/filename="([^"]+)"/);
        const filename = fm ? fm[1] : "upload.png";
        const headerEnd = parts[0].indexOf("\r\n\r\n");
        const data = Buffer.from(parts[0].slice(headerEnd + 4, -2), "latin1");
        const tool = ctx.q.get("tool") || "upload";
        const date = new Date().toISOString().slice(0, 10);
        const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const dir = path.join(svc.IMAGES_DIR, date, String(tool).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60));
        fs.mkdirSync(dir, { recursive: true });
        const finalPath = path.join(dir, safe);
        fs.writeFileSync(finalPath, data);
        return ctx.sendJSON(res, 201, { path: path.relative(svc.ROOT, finalPath), name: safe, size: data.length });
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });

  // POST /api/gallery/artifact（JSON 内容入库：自包含 HTML 等非图片产物）
  registerRoute("POST", "/api/gallery/artifact", (req, res, ctx) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { tool, filename, content } = JSON.parse(body || "{}");
        if (typeof content !== "string" || !content.length)
          return ctx.sendJSON(res, 400, { error: "content 必填且非空" });
        let name = (typeof filename === "string" && filename.trim()) ? filename.trim() : "artifact.html";
        if (!/\.html?$/i.test(name)) name += ".html";
        const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const date = new Date().toISOString().slice(0, 10);
        const t = String(tool || "artifact").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const dir = path.join(svc.IMAGES_DIR, date, t);
        fs.mkdirSync(dir, { recursive: true });
        const finalPath = path.join(dir, safe);
        fs.writeFileSync(finalPath, content, "utf8");
        return ctx.sendJSON(res, 201, { path: path.relative(svc.ROOT, finalPath), name: safe, size: Buffer.byteLength(content, "utf8") });
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });

  // DELETE /api/gallery/:path
  registerRoute("DELETE", "/api/gallery/:path", (req, res, ctx) => {
    const fp = path.resolve(svc.ROOT, req.params.path);
    if (!fp.startsWith(path.resolve(svc.IMAGES_DIR))) return ctx.sendJSON(res, 400, { error: "非法路径" });
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); return ctx.sendJSON(res, 200, { ok: true }); }
    return ctx.sendJSON(res, 404, { error: "文件不存在" });
  });

  // GET /api/templates
  registerRoute("GET", "/api/templates", (req, res, ctx) => {
    return ctx.sendJSON(res, 200, svc.listTemplates());
  });

  // GET /api/credentials（脱敏摘要）
  registerRoute("GET", "/api/credentials", (req, res, ctx) => {
    return ctx.sendJSON(res, 200, svc.getCredentialSummary());
  });

  // POST /api/credentials { key, value }（value 为空则删除该 key）
  registerRoute("POST", "/api/credentials", (req, res, ctx) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { key, value } = JSON.parse(body || "{}");
        if (!key || !/^[a-zA-Z0-9_.-]{1,60}$/.test(String(key)))
          return ctx.sendJSON(res, 400, { error: "key 非法" });
        svc.setCredential(key, value);
        return ctx.sendJSON(res, 200, svc.getCredentialSummary());
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });

  // POST /api/credentials/import-ccswitch（从 cc-switch 当前生效配置导入凭据）
  registerRoute("POST", "/api/credentials/import-ccswitch", (req, res, ctx) => {
    try {
      const r = svc.importCcswitchCreds();
      return ctx.sendJSON(res, r.ok ? 200 : 400, r);
    } catch (e) { return ctx.sendJSON(res, 500, { ok: false, error: String(e) }); }
  });

  // GET /api/status
  registerRoute("GET", "/api/status", (req, res, ctx) => {
    return ctx.sendJSON(res, 200, svc.getServiceStatus());
  });

  // POST /api/gen-likec4（手动触发：重新生成架构图 DSL + 验证 + 重建静态站点）
  registerRoute("POST", "/api/gen-likec4", (req, res, ctx) => {
    svc.genLikec4((err, result) => {
      if (err) return ctx.sendJSON(res, 500, { ok: false, error: result.message || String(err) });
      return ctx.sendJSON(res, 200, result);
    });
  });

  // POST /api/start
  registerRoute("POST", "/api/start", (req, res, ctx) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { name } = JSON.parse(body || "{}");
        const tools = svc.getTools();
        const t = (tools.c_local || []).find(x => x.name === name);
        if (!t) return ctx.sendJSON(res, 404, { error: "未知服务: " + name });
        return ctx.sendJSON(res, 200, svc.startService(t.name, t.command, t.url));
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });

  // POST /api/stop
  registerRoute("POST", "/api/stop", (req, res, ctx) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { name } = JSON.parse(body || "{}");
        return ctx.sendJSON(res, 200, svc.stopService(name));
      } catch (e) { return ctx.sendJSON(res, 500, { error: String(e) }); }
    });
  });
};

