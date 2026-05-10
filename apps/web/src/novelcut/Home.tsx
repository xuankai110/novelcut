import { useEffect, useState } from "react";
import { listProjects, deleteProject } from "./store";
import type { Project } from "./types";
import { NewDramaDialog } from "./NewDramaDialog";

export function Home() {
  const [projects, setProjects] = useState<Project[]>(() => listProjects());
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const reload = () => setProjects(listProjects());
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

  const onCreated = (p: Project) => {
    setProjects(listProjects());
    setShowDialog(false);
    window.location.hash = `/p/${p.id}`;
  };

  const onDelete = (id: string) => {
    if (!confirm("删除该短剧及所有章节、资产、剧本？该操作不可恢复。")) return;
    deleteProject(id);
    setProjects(listProjects());
  };

  return (
    <div className="nc-page">
      <div className="nc-page-head">
        <div>
          <h1 className="nc-page-title">我的短剧</h1>
          <p className="nc-page-sub">从一部小说开始,一路推到分集出片。</p>
        </div>
        <div>
          <button className="nc-btn nc-btn-primary" onClick={() => setShowDialog(true)}>
            + 新建短剧
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="nc-empty">
          <h3>还没有短剧。从一部小说开始 →</h3>
          <p>
            点「新建短剧」选好题材和风格,接着上传 .txt / .docx 的小说原文,
            NovelCut 会拆章节、抽事件、生成故事骨架与分集决策。
          </p>
          <button className="nc-btn nc-btn-primary" onClick={() => setShowDialog(true)}>
            + 新建你的第一部短剧
          </button>
        </div>
      ) : (
        <div className="nc-grid">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onDelete={() => onDelete(p.id)} />
          ))}
        </div>
      )}

      {showDialog && (
        <NewDramaDialog onClose={() => setShowDialog(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const open = () => (window.location.hash = `/p/${project.id}`);
  return (
    <div className="nc-card" onClick={open}>
      <div className="nc-card-row">
        <div className="nc-card-title">{project.name}</div>
      </div>
      <div className="nc-card-meta">
        <span className="nc-pill">{project.genre}</span>
        <span className="nc-pill nc-pill-gray">{project.platform}</span>
        <span className="nc-pill nc-pill-gray">{project.episodeCount} 集</span>
        <span className="nc-pill nc-pill-warm">{project.tone}</span>
      </div>
      {project.synopsis && (
        <div style={{ fontSize: 13, color: "var(--text-muted, #74716b)", lineHeight: 1.55 }}>
          {project.synopsis.length > 80 ? project.synopsis.slice(0, 80) + "…" : project.synopsis}
        </div>
      )}
      <div className="nc-card-foot">
        <span>{new Date(project.updatedAt).toLocaleString("zh-CN")}</span>
        <button
          className="nc-btn nc-btn-danger"
          style={{ padding: "2px 8px", fontSize: 11 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          删除
        </button>
      </div>
    </div>
  );
}
