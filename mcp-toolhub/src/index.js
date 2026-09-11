#!/usr/bin/env node
/**
 * mcp-toolhub — MCP server bridging DSH to the tool-hub platform API.
 *
 * Exposes tool-hub (http://127.0.0.1:18084) endpoints as MCP tools over stdio.
 * Base URL can be overridden via the TOOLHUB_API_BASE environment variable.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API_BASE = (process.env.TOOLHUB_API_BASE || "http://127.0.0.1:18084").replace(/\/+$/, "");

const server = new McpServer({ name: "toolhub", version: "0.1.0" });

/** Send an HTTP request to the tool-hub API and return parsed JSON (or raw text). */
async function apiRequest(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      `tool-hub API ${method} ${path} -> ${res.status} ${res.statusText}${text ? ": " + text : ""}`
    );
  }
  return data;
}

/** Standard success response for MCP tools. */
function ok(result) {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

/** Standard error response for MCP tools. */
function fail(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: "ERROR: " + msg }], isError: true };
}

// ---------------------------------------------------------------- tasks ----

server.tool(
  "create_task",
  { tool: z.string(), prompt: z.string(), params: z.record(z.unknown()).optional() },
  async (args) => {
    try {
      return ok(await apiRequest("POST", "/api/tasks", args));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "list_tasks",
  { status: z.string().optional() },
  async ({ status }) => {
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      return ok(await apiRequest("GET", `/api/tasks${qs}`));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_task",
  { id: z.string() },
  async ({ id }) => {
    try {
      return ok(await apiRequest("GET", `/api/tasks/${encodeURIComponent(id)}`));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "update_task",
  {
    id: z.string(),
    status: z.enum(["pending", "running", "done", "failed", "cancelled"]).optional(),
    images: z.array(z.string()).optional(),
    artifacts: z.array(z.string()).optional(),
    error: z.string().optional(),
    prompt: z.string().optional(),
  },
  async (args) => {
    try {
      const { id, ...body } = args;
      return ok(await apiRequest("PATCH", `/api/tasks/${encodeURIComponent(id)}`, body));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "cancel_task",
  { id: z.string() },
  async ({ id }) => {
    try {
      return ok(await apiRequest("POST", `/api/tasks/${encodeURIComponent(id)}/cancel`));
    } catch (e) {
      return fail(e);
    }
  }
);

// --------------------------------------------------------------- gallery ----

server.tool(
  "list_gallery",
  { tool: z.string().optional(), q: z.string().optional() },
  async ({ tool, q }) => {
    try {
      const params = new URLSearchParams();
      if (tool) params.set("tool", tool);
      if (q) params.set("q", q);
      const qs = params.toString() ? `?${params}` : "";
      return ok(await apiRequest("GET", `/api/gallery${qs}`));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "upload_image",
  { tool: z.string().optional(), url: z.string() },
  async ({ tool, url }) => {
    try {
      // 1) Download the image bytes.
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        throw new Error(
          `failed to download image ${url}: ${imgRes.status} ${imgRes.statusText}`
        );
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());

      // 2) Filename: last path segment of the URL, or a timestamp fallback.
      let filename;
      try {
        const last = new URL(url).pathname.split("/").filter(Boolean).pop();
        filename = last && last.includes(".") ? last : `image-${Date.now()}.png`;
      } catch {
        filename = `image-${Date.now()}.png`;
      }

      // 3) Build multipart form (Node 18+ globals) and POST to tool-hub.
      const form = new FormData();
      form.append("file", new Blob([buffer]), filename);
      const qs = tool ? `?tool=${encodeURIComponent(tool)}` : "";
      const res = await fetch(`${API_BASE}/api/gallery/upload${qs}`, {
        method: "POST",
        body: form,
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        throw new Error(
          `upload failed: ${res.status} ${res.statusText}${text ? ": " + text : ""}`
        );
      }
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "upload_artifact",
  { tool: z.string().optional(), path: z.string() },
  async ({ tool, path }) => {
    try {
      let content, filename;
      try {
        content = await readFile(path, "utf8");
        filename = basename(path);
      } catch (e) {
        return fail(new Error(`无法读取产物文件 ${path}: ${e instanceof Error ? e.message : String(e)}`));
      }
      return ok(await apiRequest("POST", "/api/gallery/artifact", { tool, filename, content }));
    } catch (e) {
      return fail(e);
    }
  }
);

// -------------------------------------------------------------- services ----

server.tool("get_service_status", {}, async () => {
  try {
    return ok(await apiRequest("GET", "/api/status"));
  } catch (e) {
    return fail(e);
  }
});

server.tool("start_service", { name: z.string() }, async ({ name }) => {
  try {
    return ok(await apiRequest("POST", "/api/start", { name }));
  } catch (e) {
    return fail(e);
  }
});

server.tool("stop_service", { name: z.string() }, async ({ name }) => {
  try {
    return ok(await apiRequest("POST", "/api/stop", { name }));
  } catch (e) {
    return fail(e);
  }
});

// ---------------------------------------------------------- credentials ----

server.tool("get_credentials", {}, async () => {
  try {
    return ok(await apiRequest("GET", "/api/credentials"));
  } catch (e) {
    return fail(e);
  }
});

server.tool(
  "set_credential",
  { key: z.string(), value: z.string() },
  async ({ key, value }) => {
    try {
      return ok(await apiRequest("POST", "/api/credentials", { key, value }));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool("import_ccswitch", {}, async () => {
  try {
    return ok(await apiRequest("POST", "/api/credentials/import-ccswitch"));
  } catch (e) {
    return fail(e);
  }
});

// ----------------------------------------------------------- architecture ----

server.tool("regenerate_architecture", {}, async () => {
  try {
    return ok(await apiRequest("POST", "/api/gen-likec4"));
  } catch (e) {
    return fail(e);
  }
});

// ------------------------------------------------------------------- run ----

const transport = new StdioServerTransport();
await server.connect(transport);
