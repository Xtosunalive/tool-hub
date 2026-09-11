// API 客户端 —— 与后端 /api/* 通信
export interface OnlineTool { name: string; desc: string; url: string; color?: string; }
export interface AgentTool { name: string; desc: string; creds?: string[]; params?: Record<string, string>; }
export interface LocalTool { name: string; desc: string; command: string; url: string; port: number; }
export interface ToolsBundle { a_online: OnlineTool[]; b_agent: AgentTool[]; c_local: LocalTool[]; }

export interface TaskItem {
  id: string; tool: string; prompt: string;
  params?: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  createdAt: string; images: string[]; artifacts?: string[];
}

export interface GalleryItem { path: string; name: string; date: string; tool: string; size: number; mtime: number; }
export interface TemplateItem { id: string; name: string; prompt: string; tool?: string; tags?: string[]; createdAt: string; }
export interface ServiceStatus { name: string; running: boolean; url: string | null; }
export interface CredentialSummary { [key: string]: { set: boolean; masked: string } }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error || r.statusText);
  return data as T;
}

export const client = {
  getTools: () => req<ToolsBundle>("/api/tools"),
  listTasks: (status?: string) => req<TaskItem[]>("/api/tasks" + (status ? "?status=" + encodeURIComponent(status) : "")),
  createTask: (tool: string, prompt: string, params?: Record<string, unknown>) =>
    req<TaskItem>("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, prompt, params }) }),
  cancelTask: (id: string) => req<TaskItem>("/api/tasks/" + id + "/cancel", { method: "POST" }),
  listGallery: (tool?: string, q?: string) =>
    req<GalleryItem[]>("/api/gallery?tool=" + encodeURIComponent(tool || "") + "&q=" + encodeURIComponent(q || "")),
  uploadImage: async (file: File, tool: string) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/gallery/upload?tool=" + encodeURIComponent(tool), { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error || "上传失败");
    return d;
  },
  uploadArtifact: async (file: File, tool: string) => {
    const content = await file.text();
    return req("/api/gallery/artifact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, filename: file.name, content }),
    });
  },
  deleteImage: (path: string) => req("/api/gallery/" + path, { method: "DELETE" }),
  listTemplates: () => req<TemplateItem[]>("/api/templates"),
  getServiceStatus: () => req<ServiceStatus[]>("/api/status"),
  startService: (name: string) => req("/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
  stopService: (name: string) => req("/api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
  genLikec4: () => req<{ ok: boolean; message?: string; error?: string }>("/api/gen-likec4", { method: "POST" }),
  getCredentials: () => req<CredentialSummary>("/api/credentials"),
  setCredential: (key: string, value: string) =>
    req<CredentialSummary>("/api/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) }),
  importCcswitch: () => req<{ ok: boolean; imported?: string[]; error?: string; summary?: CredentialSummary }>(
    "/api/credentials/import-ccswitch", { method: "POST" }),
};

