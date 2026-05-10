import { useState } from "react";
import type { Project, Episode } from "../types";
import { listEpisodes } from "../store";

export function ScriptsTab({ project }: { project: Project }) {
  const episodes = listEpisodes(project.id);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <h2 className="nc-page-title" style={{ fontSize: 20 }}>剧本 · {episodes.length}/{project.episodeCount} 集</h2>
          <div className="nc-page-sub">每一集独立编辑,关联角色、道具、场景资产。点卡片展开 blueprint 详情。</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="nc-btn nc-btn-primary" disabled>+ 扩写完整对白 (即将到来)</button>
        </div>
      </div>

      {episodes.length === 0 ? (
        <div className="nc-empty">
          <h3>还没有分集</h3>
          <p>先到「✍️ 编剧」tab 运行编剧 Agent,把事件分配到 N 集后这里会自动出现 blueprint 卡片。</p>
          <button className="nc-btn nc-btn-primary" onClick={() => (window.location.hash = `/p/${project.id}/agent`)}>
            前往编剧 Agent →
          </button>
        </div>
      ) : (
        <div className="nc-grid">
          {episodes.map((ep) => (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              expanded={openId === ep.id}
              onToggle={() => setOpenId(openId === ep.id ? null : ep.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function EpisodeCard({ episode, expanded, onToggle }: {
  episode: Episode; expanded: boolean; onToggle: () => void;
}) {
  const bp = episode.blueprint;
  return (
    <div
      className="nc-card"
      onClick={onToggle}
      style={expanded ? { gridColumn: "1 / -1", cursor: "default" } : undefined}
    >
      <div className="nc-card-row">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="nc-pill" style={{ background: "var(--nc-cyan)", color: "#fff" }}>EP{String(episode.index).padStart(2, "0")}</span>
          <div className="nc-card-title" style={{ fontSize: 15 }}>{episode.title}</div>
        </div>
        <span className="nc-pill nc-pill-gray" style={{ fontSize: 10 }}>{episode.status}</span>
      </div>

      {!expanded && (
        <>
          {bp?.hookOpen && <div style={{ fontSize: 12, color: "var(--nc-cyan-strong)", fontWeight: 500 }}>⚡ {bp.hookOpen}</div>}
          {bp?.summary && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{bp.summary.slice(0, 100)}{bp.summary.length > 100 ? "…" : ""}</div>}
        </>
      )}

      {expanded && bp && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          <Detail label="开场钩子">
            <div style={{ color: "var(--nc-cyan-strong)", fontWeight: 500 }}>⚡ {bp.hookOpen}</div>
          </Detail>
          <Detail label="本集梗概">{bp.summary}</Detail>
          <Detail label="关键节拍">
            <ol style={{ marginLeft: 18, lineHeight: 1.7 }}>
              {bp.beats.map((b, i) => <li key={i}>{b}</li>)}
            </ol>
          </Detail>
          <Detail label="结尾留白">
            <div style={{ color: "var(--text-faint)" }}>→ {bp.hookEnd}</div>
          </Detail>
          {bp.retainsEvents.length > 0 && (
            <Detail label={`复用原著事件 (${bp.retainsEvents.length})`}>
              <ul style={{ marginLeft: 18, lineHeight: 1.7, color: "var(--text-muted)" }}>
                {bp.retainsEvents.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Detail>
          )}
          {bp.newScenes && bp.newScenes.length > 0 && (
            <Detail label={`编剧新增场景 (${bp.newScenes.length})`}>
              <ul style={{ marginLeft: 18, lineHeight: 1.7, color: "var(--text-muted)" }}>
                {bp.newScenes.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Detail>
          )}
          <button className="nc-btn nc-btn-ghost" onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ alignSelf: "flex-start" }}>
            收起
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="nc-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--text-strong)" }}>{children}</div>
    </div>
  );
}
