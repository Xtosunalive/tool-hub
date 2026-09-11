import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { RefreshCw, XCircle, ExternalLink } from "lucide-react";
import { client, type TaskItem } from "./api";
import { esc, fmtTime } from "@/lib/utils";

export default function TasksView() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try { setTasks(await client.listTasks(filter || undefined)); }
    catch (e) { toast.error(String((e as Error).message)); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = async (id: string) => {
    try { await client.cancelTask(id); load(); }
    catch (e) { toast.error(String((e as Error).message)); }
  };

  return (
    <div>
      <div className="flex gap-2.5 mb-4 items-center">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="">全部状态</option>
          <option value="pending">pending</option>
          <option value="running">running</option>
          <option value="done">done</option>
          <option value="failed">failed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
        <span className="text-xs text-text-hint ml-auto">提示：提交新任务后，到 DSH 说"处理任务"</span>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">暂无任务</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {tasks.map(t => (
            <div key={t.id} className="card flex items-center gap-4">
              <span className={"badge badge-" + t.status}>{t.status}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-hint">{esc(t.tool)}</div>
                <div className="text-sm text-text-main mt-0.5 truncate" title={esc(t.prompt)}>{esc(t.prompt)}</div>
              </div>
              {t.images.length > 0 && (
                <div className="flex gap-1.5">
                  {t.images.slice(0, 4).map(img => (
                    <img key={img} src={"/" + img} className="w-14 h-10 object-cover rounded-md border border-border-thin cursor-pointer"
                      onClick={() => window.open("/" + img, "_blank")} />
                  ))}
                </div>
              )}
              {t.artifacts && t.artifacts.length > 0 && (
                <div className="flex gap-1.5 flex-wrap max-w-[240px]">
                  {t.artifacts.slice(0, 4).map(a => (
                    <a key={a} href={"/" + a} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
                      <ExternalLink className="w-3 h-3" /> {esc(a.split("/").pop() || a)}
                    </a>
                  ))}
                </div>
              )}
              <div className="text-xs text-text-hint">{fmtTime(t.createdAt)}</div>
              {(t.status === "pending" || t.status === "running") && (
                <button onClick={() => cancel(t.id)}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border-thin text-text-sub hover:border-destructive hover:text-destructive">
                  <XCircle className="w-3 h-3" /> 取消
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

