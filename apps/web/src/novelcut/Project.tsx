import { useEffect, useState } from "react";
import { getProject, hasSeenWelcome } from "./store";
import type { Project as ProjectT } from "./types";
import { NovelTab } from "./pages/Novel";
import { ScriptAgentTab } from "./pages/ScriptAgent";
import { ScriptsTab } from "./pages/Scripts";
import { AssetsTab } from "./pages/Assets";
import { StoryboardTab } from "./pages/Storyboard";
import { TasksTab } from "./pages/Tasks";
import { PipelineStepper } from "./PipelineStepper";
import { WelcomeTour } from "./WelcomeTour";

const TABS: { id: string; ico: string; label: string }[] = [
  { id: "novel",      ico: "📕", label: "小说" },
  { id: "agent",      ico: "✍️", label: "编剧" },
  { id: "scripts",    ico: "🎬", label: "剧本" },
  { id: "assets",     ico: "👥", label: "资产" },
  { id: "storyboard", ico: "📺", label: "分镜" },
  { id: "tasks",      ico: "📋", label: "任务" },
];

export function Project({ projectId, tab }: { projectId: string; tab: string }) {
  const [project, setProject] = useState<ProjectT | undefined>(() => getProject(projectId));
  const [showWelcome, setShowWelcome] = useState(false);

  // First-time auto-show
  useEffect(() => {
    setProject(getProject(projectId));
    if (typeof window !== "undefined" && !hasSeenWelcome()) {
      setShowWelcome(true);
    }
  }, [projectId]);

  // Re-open via 🧭 button in top bar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onShow = () => setShowWelcome(true);
    window.addEventListener("novelcut:show-tour", onShow);
    return () => window.removeEventListener("novelcut:show-tour", onShow);
  }, []);

  if (!project) {
    return (
      <div className="nc-page">
        <div className="nc-empty">
          <h3>找不到该短剧</h3>
          <p>项目 ID <code>{projectId}</code> 不存在 —— 可能已被删除。</p>
          <button className="nc-btn nc-btn-primary" onClick={() => (window.location.hash = "/")}>返回我的短剧</button>
        </div>
      </div>
    );
  }

  const setTab = (id: string) => (window.location.hash = `/p/${projectId}/${id}`);

  return (
    <>
      <nav className="nc-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="nc-tab"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span className="ico">{t.ico}</span> {t.label}
          </button>
        ))}
      </nav>
      <div className="nc-page">
        <PipelineStepper project={project} currentTab={tab} />
        {tab === "novel"      && <NovelTab project={project} />}
        {tab === "agent"      && <ScriptAgentTab project={project} />}
        {tab === "scripts"    && <ScriptsTab project={project} />}
        {tab === "assets"     && <AssetsTab project={project} />}
        {tab === "storyboard" && <StoryboardTab project={project} />}
        {tab === "tasks"      && <TasksTab project={project} />}
      </div>
      {showWelcome && <WelcomeTour project={project} onClose={() => setShowWelcome(false)} />}
    </>
  );
}
