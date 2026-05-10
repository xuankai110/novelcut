import type { Project } from "../types";
import { listEpisodes } from "../store";

export function ScriptsTab({ project }: { project: Project }) {
  const episodes = listEpisodes(project.id);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <h2 className="nc-page-title" style={{ fontSize: 20 }}>剧本 · {project.episodeCount} 集计划</h2>
          <div className="nc-page-sub">每一集独立编辑,关联角色、道具、场景资产。</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="nc-btn nc-btn-ghost">+ 上传剧本</button>
          <button className="nc-btn nc-btn-primary">+ 新增剧本</button>
        </div>
      </div>

      {episodes.length === 0 ? (
        <div className="nc-empty">
          <h3>还没有剧本</h3>
          <p>可以从「编剧」tab 直接生成,也可以在这里手动新建或上传 .txt / .docx。</p>
        </div>
      ) : (
        <div className="nc-grid">
          {episodes.map((e) => (
            <div key={e.id} className="nc-card">
              <div className="nc-card-title">EP{String(e.index).padStart(2, "0")} · {e.title}</div>
              <div className="nc-card-meta">
                <span className="nc-pill">{e.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
