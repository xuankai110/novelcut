import { useState } from "react";
import type { Project, Asset } from "../types";
import { listAssets } from "../store";

const TABS: { id: Asset["kind"]; label: string; ico: string }[] = [
  { id: "char",  label: "角色", ico: "🧑" },
  { id: "prop",  label: "道具", ico: "🪙" },
  { id: "scene", label: "场景", ico: "🏙️" },
  { id: "media", label: "素材", ico: "🎞️" },
];

export function AssetsTab({ project }: { project: Project }) {
  const [kind, setKind] = useState<Asset["kind"]>("char");
  const all = listAssets(project.id);
  const filtered = all.filter((a) => a.kind === kind);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <h2 className="nc-page-title" style={{ fontSize: 20 }}>资产中心</h2>
          <div className="nc-page-sub">全局复用 · 任何剧本都可关联同一份角色/道具/场景。</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="nc-btn nc-btn-ghost">⚡ 批量生成</button>
          <button className="nc-btn nc-btn-primary">+ 新增{TABS.find(t => t.id === kind)?.label}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #ebe7df" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className="nc-tab"
            aria-selected={kind === t.id}
            onClick={() => setKind(t.id)}
            style={{ borderBottom: "2px solid", borderBottomColor: kind === t.id ? "var(--nc-cyan)" : "transparent" }}
          >
            <span className="ico">{t.ico}</span> {t.label} <span style={{ marginLeft: 4, fontSize: 11, color: "var(--text-faint)" }}>{all.filter(a => a.kind === t.id).length}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="nc-empty">
          <h3>暂无{TABS.find(t => t.id === kind)?.label}</h3>
          <p>「批量生成」会按你的剧本和题材自动产出一组候选 —— 例如霸总言情会先给到男主、女主、助理三个角色四视图设定。</p>
        </div>
      ) : (
        <div className="nc-grid">
          {filtered.map((a) => (
            <div key={a.id} className="nc-card">
              <div style={{ aspectRatio: "1/1", borderRadius: 8, background: "#f4f2ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                {a.previewUrl ? <img src={a.previewUrl} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : (TABS.find(t => t.id === a.kind)?.ico ?? "")}
              </div>
              <div className="nc-card-title">{a.name}</div>
              {a.description && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.description}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
