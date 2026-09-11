import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { ExternalLink, Play, Square, Send, Wand2 } from "lucide-react";
import { client, type ToolsBundle, type TemplateItem } from "./api";
import { esc } from "@/lib/utils";

export default function ToolHubView({ onGoGallery }: { onGoGallery: () => void }) {
  const [tools, setTools] = useState<ToolsBundle | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [tool, setTool] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    client.getTools().then(setTools).catch(e => toast.error(String(e.message)));
    client.listTemplates().then(setTemplates).catch(() => {});
  }, []);

  const submit = async () => {
    if (!tool) return toast.error("请选择工具");
    if (!prompt.trim()) return toast.error("请输入提示词");
    setSubmitting(true);
    try {
      const t = await client.createTask(tool, prompt.trim());
      toast.success("任务已提交: " + t.id);
      setPrompt("");
    } catch (e) { toast.error(String((e as Error).message)); }
    finally { setSubmitting(false); }
  };

  const startLocal = async (name: string) => {
    try {
      const r = await client.startService(name);
      toast.success("已启动: " + name);
      if ((r as { url?: string }).url) setTimeout(() => window.open((r as { url: string }).url, "_blank"), 600);
    } catch (e) { toast.error(String((e as Error).message)); }
  };
  const stopLocal = async (name: string) => {
    try { await client.stopService(name); toast.success("已停止: " + name); }
    catch (e) { toast.error(String((e as Error).message)); }
  };

  return (
    <div className="space-y-8">
      {/* A 类：在线工具 */}
      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> A 类 · 在线工具（点击跳转直接使用）
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
          {(tools?.a_online || []).map(t => (
            <div key={t.name} className="card card-hover" onClick={() => window.open(t.url, "_blank")}>
              <div className="dot dot-online mb-2.5" style={t.color ? { background: t.color } : undefined} />
              <h3 className="text-sm font-semibold text-text-main">{esc(t.name)}</h3>
              <p className="text-xs text-text-hint mt-1 leading-relaxed">{esc(t.desc)}</p>
              <span className="badge badge-pending mt-3 inline-flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> 在线 · 跳转
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* B 类：Agent 任务 */}
      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> B 类 · Agent 任务（在 DSH 对话中直接使用）
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
          {(tools?.b_agent || []).map(t => (
            <div key={t.name} className="card">
              <div className="dot dot-agent mb-2.5" />
              <h3 className="text-sm font-semibold text-text-main">{esc(t.name)}</h3>
              <p className="text-xs text-text-hint mt-1 leading-relaxed">{esc(t.desc)}</p>
              {t.creds && t.creds.length > 0 && (
                <p className="text-xs text-text-hint mt-1">
                  所需凭据：<code className="mono">{esc(t.creds.join(", "))}</code>
                </p>
              )}
              <span className="badge badge-done mt-3 inline-flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> Agent · 任务
              </span>
            </div>
          ))}
        </div>

        {/* DSH 使用引导 */}
        <div className="card mt-4">
          <h3 className="text-sm font-semibold text-text-main mb-2">怎么用？直接在 DSH 对话里说</h3>
          <p className="text-xs text-text-hint leading-relaxed mb-3">
            Agent 已通过 MCP 接入本平台（<code className="mono">mcp__toolhub__*</code> 工具）。
            在 DSH 中描述需求，Agent 会先与你多轮对话打磨提示词，确认后再调用工具生成图片、
            写入图库并更新任务状态，结果实时显示在下方任务列表与图库。
          </p>
          <div className="text-xs bg-surface-hover border border-border-thin rounded-lg px-3 py-2.5 text-text-sub leading-relaxed">
            示例：<br />
            “帮我生成一张科技风的公众号封面，深蓝背景，主题是 AI 架构图，先给三个方案我选”<br />
            “用 autoglm 画一只小猫，水彩风格，我看看效果再调整”
          </div>
        </div>

        {/* 快速创建草稿（可选，不执行） */}
        <div className="card mt-4 opacity-80">
          <label className="block text-xs text-text-hint mb-1.5">快速记录需求草稿（不执行，仅入列）</label>
          <select
            value={tool} onChange={e => setTool(e.target.value)}
            className="w-full bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
          >
            <option value="">请选择…</option>
            {(tools?.b_agent || []).map(t => <option key={t.name} value={t.name}>{t.name} — {esc(t.desc)}</option>)}
          </select>

          <label className="block text-xs text-text-hint mt-4 mb-1.5">提示词 / 描述</label>
          <textarea
            value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="例如：一只在月球上钓鱼的橘猫，水彩风格"
            className="w-full min-h-[90px] bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-primary resize-y"
          />

          <label className="block text-xs text-text-hint mt-4 mb-1.5">提示词模板（点击填充）</label>
          <div className="flex flex-wrap gap-2">
            {templates.length ? templates.map(t => (
              <button key={t.id} onClick={() => { setPrompt(t.prompt); if (t.tool) setTool(t.tool); }}
                className="text-xs px-3 py-1.5 rounded-full bg-surface-hover border border-border-thin text-text-hint hover:border-primary hover:text-text-main">
                {esc(t.name)}
              </button>
            )) : <span className="text-xs text-text-hint">暂无模板</span>}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button onClick={submit} disabled={submitting}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Send className="w-4 h-4" /> {submitting ? "提交中…" : "创建任务"}
            </button>
            <span className="text-xs text-text-hint">仅记录到任务列表；完整对话润色与生成请到 DSH 进行</span>
          </div>
        </div>
      </section>

      {/* C 类：本地服务 */}
      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> C 类 · 本地服务（一键启动）
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
          {(tools?.c_local || []).map(t => (
            <div key={t.name} className="card">
              <div className="dot dot-local mb-2.5" />
              <h3 className="text-sm font-semibold text-text-main">{esc(t.name)}</h3>
              <p className="text-xs text-text-hint mt-1 leading-relaxed">{esc(t.desc)}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => startLocal(t.name)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
                  <Play className="w-3 h-3" /> 启动
                </button>
                <button onClick={() => stopLocal(t.name)}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border-thin text-text-sub hover:border-destructive hover:text-destructive">
                  <Square className="w-3 h-3" /> 停止
                </button>
              </div>
              <span className="badge badge-pending mt-3">本地服务</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

