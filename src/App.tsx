import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { LayoutDashboard, Images, ListTodo, Settings } from "lucide-react";
import ToolHubView from "@/features/tool-hub/ToolHubView";
import GalleryView from "@/features/tool-hub/GalleryView";
import TasksView from "@/features/tool-hub/TasksView";
import SettingsView from "@/features/tool-hub/SettingsView";

type ViewId = "hub" | "gallery" | "tasks" | "settings";

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "hub", label: "工具台", icon: LayoutDashboard },
  { id: "gallery", label: "图库", icon: Images },
  { id: "tasks", label: "任务", icon: ListTodo },
  { id: "settings", label: "设置", icon: Settings },
];

export default function App() {
  const [view, setView] = useState<ViewId>("hub");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/tasks?status=pending");
        const list = await r.json();
        setPendingCount(Array.isArray(list) ? list.length : 0);
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-surface-root text-text-main">
      <header className="sticky top-0 z-10 border-b border-border-thin bg-surface-card px-6 py-3 flex items-center gap-6">
        <h1 className="text-xl font-semibold text-text-main">
          做图<span className="text-primary">工具聚合平台</span>
        </h1>
        <nav className="flex gap-2">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={
                "px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 " +
                (view === n.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-text-hint hover:text-text-main hover:bg-surface-hover")
              }
            >
              <n.icon className="w-4 h-4" />
              {n.label}
              {n.id === "tasks" && pendingCount > 0 && (
                <span className="bg-kg-warn text-white rounded-full px-1.5 text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto text-xs text-text-hint">localhost:18084 · 单用户</div>
      </header>

      <main className="mx-auto max-w-[1280px] p-6">
        {view === "hub" && <ToolHubView onGoGallery={() => setView("gallery")} />}
        {view === "gallery" && <GalleryView />}
        {view === "tasks" && <TasksView />}
        {view === "settings" && <SettingsView />}
      </main>
      <Toaster position="bottom-center" />
    </div>
  );
}
