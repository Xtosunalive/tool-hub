import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { RefreshCw, Download, Trash2, X } from "lucide-react";
import { client, type GalleryItem } from "./api";
import { esc } from "@/lib/utils";

export default function GalleryView() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [tool, setTool] = useState("");
  const [q, setQ] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await client.listGallery(tool, q)); }
    catch (e) { toast.error(String((e as Error).message)); }
  }, [tool, q]);
  useEffect(() => { load(); }, [load]);

  const tools = [...new Set(items.map(i => i.tool).filter(Boolean))];

  const onFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const tag = window.prompt("给这批文件标记工具名（用于图库筛选）:", "upload") || "upload";
    for (const f of arr) {
      try {
        if (/\.html?$/i.test(f.name)) await client.uploadArtifact(f, tag);
        else await client.uploadImage(f, tag);
      }
      catch (e) { toast.error("上传失败 " + f.name + ": " + (e as Error).message); }
    }
    toast.success("上传完成 " + arr.length + " 个");
    load();
  };

  const del = async (p: string) => {
    if (!window.confirm("删除这张图？")) return;
    try { await client.deleteImage(p); load(); toast.success("已删除"); }
    catch (e) { toast.error(String((e as Error).message)); }
  };

  return (
    <div>
      <div className="flex gap-2.5 mb-4 items-center flex-wrap">
        <input value={q} onChange={e => { setQ(e.target.value); }} placeholder="搜索文件名…"
          className="w-[200px] bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
        <select value={tool} onChange={e => { setTool(e.target.value); }}
          className="bg-surface-hover border border-border-thin rounded-lg px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="">全部工具</option>
          {tools.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="flex-1" />
        <button onClick={load} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border-thin text-text-sub hover:border-primary hover:text-text-main">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      <div
        className={"drop-zone mb-4 " + (dragOver ? "dragover" : "")}
        onClick={() => document.getElementById("fileInput")?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      >
        拖拽图片或 HTML 到这里上传，或点击选择文件（工具成果入库）
      </div>
      <input type="file" id="fileInput" multiple accept="image/*,.html,.htm" className="hidden"
        onChange={e => e.target.files && onFiles(e.target.files)} />

      {items.length === 0 ? (
        <div className="empty">暂无图片 —— 用工具画一张，或从 A 类工具导出后拖进来吧</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {items.map(i => (
            <div key={i.path} className="g-item group">
              {/\.html?$/i.test(i.name) ? (
                <div className="g-preview" onClick={() => setLightbox("/" + i.path)}>
                  <iframe src={"/" + i.path} title={i.name} className="g-html" sandbox="" />
                </div>
              ) : (
                <img src={"/" + i.path} alt={i.name} onClick={() => setLightbox("/" + i.path)} />
              )}
              <div className="meta">
                <span className="tool-tag">{esc(i.tool || "upload")}</span>
                <span>{i.date}</span>
              </div>
              <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-1">
                <a href={"/" + i.path} download={i.name}
                  className="bg-black/60 text-white text-[11px] px-2 py-1 rounded-md hover:bg-black/80">
                  <Download className="w-3 h-3" />
                </a>
                <button onClick={() => del(i.path)}
                  className="bg-black/60 text-white text-[11px] px-2 py-1 rounded-md hover:bg-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[100]" onClick={() => setLightbox(null)}>
          <button className="absolute top-5 right-7 text-white text-2xl"><X className="w-6 h-6" /></button>
          {/\.html?$/i.test(lightbox) ? (
            <iframe src={lightbox} className="w-[92vw] h-[88vh] rounded-lg bg-white" />
          ) : (
            <img src={lightbox} className="max-w-[92vw] max-h-[88vh] rounded-lg" />
          )}
        </div>
      )}
    </div>
  );
}

