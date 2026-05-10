import type { ReactNode } from "react";
import { getProject } from "./store";

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
          <a className="nc-btn" href="https://github.com/" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>
      {children}
    </div>
  );
}
