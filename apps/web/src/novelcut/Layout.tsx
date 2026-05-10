import { useState, type ReactNode } from "react";
import { getProject } from "./store";
import { SettingsDialog } from "./SettingsDialog";
import { loadLLMConfig } from "./llm";

interface Route {
  kind: "home" | "project";
  id?: string;
  tab?: string;
}

const TAB_LABELS: Record<string, string> = {
  novel: "小说",
  agent: "编剧",
  scripts: "剧本",
  assets: "资产",
  storyboard: "分镜",
  tasks: "任务",
};

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const project = route.kind === "project" && route.id ? getProject(route.id) : undefined;
  const [showSettings, setShowSettings] = useState(false);
  const cfg = typeof window !== "undefined" ? loadLLMConfig() : null;
  const configured = !!cfg?.apiKey;

  return (
    <div className="nc-app">
      <header className="nc-topbar">
        <div className="nc-brand" onClick={() => (window.location.hash = "/")}>
          <img src="/logo.png" alt="NovelCut" />
          <span className="nc-brand-name">Novel<em>Cut</em></span>
        </div>

        {route.kind === "project" && project && (
          <div className="nc-crumbs">
            <span className="sep">/</span>
            <strong>{project.name}</strong>
            {route.tab && TAB_LABELS[route.tab] && (
              <>
                <span className="sep">/</span>
                <span>{TAB_LABELS[route.tab]}</span>
              </>
            )}
          </div>
        )}

        <div className="nc-topbar-spacer" />

        <div className="nc-topbar-actions">
          <button
            className="nc-btn"
            onClick={() => setShowSettings(true)}
            title={configured ? `已配置 · ${cfg!.provider}` : "未配置大模型"}
          >
            <span style={{ fontSize: 13 }}>⚙</span>
            <span>设置</span>
            {!configured && (
              <span style={{
                width: 7, height: 7, borderRadius: 999,
                background: "#f59e0b", display: "inline-block", marginLeft: 4,
              }} />
            )}
          </button>
          <a className="nc-btn" href="https://github.com/" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>
      {children}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
