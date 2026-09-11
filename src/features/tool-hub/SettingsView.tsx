import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Square, RefreshCw, ExternalLink, KeyRound, Trash2, Import } from "lucide-react";
import { client, type ServiceStatus, type CredentialSummary, type ToolsBundle } from "./api";
import { esc } from "@/lib/utils";

const CRED_PRESETS = [
  { key: "autoglm_token", label: "AutoGLM（文生图/搜图/搜索）", hint: "智谱 AutoGLM token" },
  { key: "GEMINI_API_KEY", label: "Google Gemini（公众号/小红书配图）", hint: "Gemini API Key" },
  { key: "OPENAI_API_KEY", label: "OpenAI", hint: "OpenAI API Key" },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek", hint: "DeepSeek API Key" },
];

export default function SettingsView() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [genBusy, setGenBusy] = useState(false);
  const [creds, setCreds] = useState<CredentialSummary>({});
  const [credKey, setCredKey] = useState("autoglm_token");
  const [credValue, setCredValue] = useState("");
  const [tools, setTools] = useState<ToolsBundle | null>(null);

  const load = async () => {
    try { setServices(await client.getServiceStatus()); }
    catch (e) { toast.error(String((e as Error).message)); }
    try { setCreds(await client.getCredentials()); }
    catch (e) { toast.error(String((e as Error).message)); }
    try { setTools(await client.getTools()); }
    catch (e) { /* 静默 */ }
  };
  useEffect(() => { load(); }, []);

  const saveCred = async () => {
    const key = credKey.trim();
    if (!key) return toast.error("请输入凭据名称");
    try {
      setCreds(await client.setCredential(key, credValue.trim()));
      toast.success("凭据已保存: " + key);
      setCredValue("");
    } catch (e) { toast.error(String((e as Error).message)); }
  };

  const removeCred = async (key: string) => {
    if (!window.confirm("删除凭据 " + key + "？")) return;
    try {
      setCreds(await client.setCredential(key, ""));
      toast.success("已删除: " + key);
    } catch (e) { toast.error(String((e as Error).message)); }
  };

  const [ccBusy, setCcBusy] = useState(false);
  const importCcswitch = async () => {
    setCcBusy(true);
    try {
      const r = await client.importCcswitch();
      if (r.ok) {
        toast.success("已从 cc-switch 导入: " + (r.imported || []).join(", "));
        if (r.summary) setCreds(r.summary);
      } else {
        toast.error(r.error || "导入失败");
      }
    } catch (e) { toast.error(String((e as Error).message)); }
    finally { setCcBusy(false); }
  };

  const start = async (name: string) => {
    try {
      const r = await client.startService(name);
      toast.success("已启动: " + name);
      if ((r as { url?: string }).url) setTimeout(() => window.open((r as { url: string }).url, "_blank"), 600);
      load();
    } catch (e) { toast.error(String((e as Error).message)); }
  };
  const stop = async (name: string) => {
    try { await client.stopService(name); toast.success("已停止: " + name); load(); }
    catch (e) { toast.error(String((e as Error).message)); }
  };

  const genLikec4 = async () => {
    setGenBusy(true);
    try {
      const r = await client.genLikec4();
      if (r.ok) toast.success(r.message || "架构图已更新");
      else toast.error(r.error || "生成失败");
    } catch (e) { toast.error(String((e as Error).message)); }
    finally { setGenBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-[720px]">
      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> 本地服务管理
        </h2>
        <div className="space-y-2.5">
          {services.map(s => (
            <div key={s.name} className="card flex items-center gap-4">
              <div className="flex-1">
                <h4 className="text-sm font-semibold">{esc(s.name)}</h4>
                {s.url && <p className="text-xs text-text-hint mt-1">{esc(s.url)}</p>}
              </div>
              <span className={"badge " + (s.running ? "badge-done" : "badge-cancelled")}>
                {s.running ? "● 运行中" : "○ 已停止"}
              </span>
              <button onClick={() => start(s.name)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
                <Play className="w-3 h-3" /> 启动
              </button>
              <button onClick={() => stop(s.name)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border-thin text-text-sub hover:border-destructive hover:text-destructive">
                <Square className="w-3 h-3" /> 停止
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> 认证配置
        </h2>
        <div className="card space-y-3">
          <p className="text-xs text-text-hint leading-relaxed">
            Agent 任务执行时需要对应服务的认证凭据。凭据保存到本地 <code className="mono">credentials.json</code>，
            AutoGLM 系列通过本地 token 服务（<code className="mono">http://127.0.0.1:53699/get_token?key=…</code>）获取；
            其他凭据在执行任务时注入对应技能。保存后无需重启。
          </p>

          <div className="flex items-center gap-2.5">
            <button onClick={importCcswitch} disabled={ccBusy}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main disabled:opacity-50">
              <Import className={"w-3.5 h-3.5 " + (ccBusy ? "animate-spin" : "")} />
              {ccBusy ? "导入中…" : "从 cc-switch 导入当前供应商"}
            </button>
            <span className="text-xs text-text-hint">读取 ~/.claude/settings.json 的当前生效 env（ANTHROPIC_*/OPENAI_*）</span>
          </div>

          {/* 工具 → 所需凭据映射 */}
          {tools?.b_agent?.length ? (
            <div className="text-xs space-y-1">
              <div className="text-text-hint">各工具所需凭据：</div>
              {tools.b_agent.map(t => (
                <div key={t.name} className="flex items-center gap-2">
                  <code className="mono text-text-sub flex-1">{esc(t.name)}</code>
                  <span className="text-text-hint">
                    {t.creds && t.creds.length ? t.creds.map(c => {
                      const preset = CRED_PRESETS.find(p => p.key === c);
                      const configured = creds[c]?.set;
                      return (
                        <span key={c} className={"badge ml-1 " + (configured ? "badge-done" : "badge-cancelled")}>
                          {c}{configured ? " ✓" : " ✗"}
                        </span>
                      );
                    }) : <span className="badge badge-cancelled">无需认证</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {Object.keys(creds).length > 0 && (
            <div className="flex flex-col gap-1.5">
              {Object.entries(creds).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <KeyRound className="w-3.5 h-3.5 text-text-hint" />
                  <code className="mono flex-1">{esc(k)}</code>
                  <span className={"badge " + (v.set ? "badge-done" : "badge-cancelled")}>
                    {v.set ? "● 已配置 " + esc(v.masked) : "○ 未配置"}
                  </span>
                  <button onClick={() => removeCred(k)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border-thin text-text-sub hover:border-destructive hover:text-destructive">
                    <Trash2 className="w-3 h-3" /> 删除
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[180px_1fr] gap-2.5 items-center">
            <select value={credKey} onChange={e => setCredKey(e.target.value)}
              className="w-full bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
              {CRED_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <div className="flex gap-2.5">
              <input value={credValue} onChange={e => setCredValue(e.target.value)} type="password" placeholder="填写 token / API Key"
                className="flex-1 bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
              <button onClick={saveCred}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
                <KeyRound className="w-3.5 h-3.5" /> 保存
              </button>
            </div>
          </div>
          <p className="text-xs text-text-hint">
            当前类型：<code className="mono">{esc(credKey)}</code>
            {CRED_PRESETS.find(p => p.key === credKey)?.hint && " — " + esc(CRED_PRESETS.find(p => p.key === credKey)!.hint)}
            {creds[credKey]?.set ? "（已配置 " + esc(creds[credKey].masked) + "）" : "（未配置）"}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> 架构图管理
        </h2>
        <div className="card">
          <p className="text-xs text-text-hint leading-relaxed">
            平台架构图由生成器从代码库自动扫描生成（LikeC4 DSL）。改代码后点击下方按钮重新生成并构建。
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={genLikec4} disabled={genBusy}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <RefreshCw className={"w-4 h-4 " + (genBusy ? "animate-spin" : "")} />
              {genBusy ? "生成中…" : "重新生成架构图"}
            </button>
            <a href="/likec4/" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
              <ExternalLink className="w-3.5 h-3.5" /> 查看架构图
            </a>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-hint mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-sm" /> 存储位置
        </h2>
        <div className="card">
          <label className="block text-xs text-text-hint mb-1.5">项目目录</label>
          <input value={import.meta.env.VITE_DATA_DIR || "/Users/klena/tool-hub" } readOnly
            className="w-full bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm" />
          <div className="text-xs text-text-hint mt-2 leading-relaxed">
            · 图片存于 <code className="mono">images/{'{日期}/{工具}/'}</code><br />
            · 任务存于 <code className="mono">tasks/*.json</code><br />
            · 工具清单可编辑 <code className="mono">tools.json</code> 增删
          </div>
        </div>
      </section>
    </div>
  );
}

