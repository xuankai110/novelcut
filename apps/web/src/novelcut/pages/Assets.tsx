import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Asset, AssetKind, EpisodeScript } from "../types";
import {
  listAssets, upsertAsset, deleteAsset, genId,
  getSkeleton, listScripts, appendTask, upsertProject,
} from "../store";
import { RATIO_OPTIONS, QUALITY_OPTIONS, defaultRatioForPlatform } from "../projectMeta";
import type { VideoRatio, ImageQuality } from "../types";
import { loadLLMConfig, loadImageConfig, LLMError } from "../llm";
import { runAssetPrompt, runAssetImage } from "../agent/runner";
import { SettingsDialog } from "../SettingsDialog";

const TABS: { id: AssetKind; label: string; ico: string; hint: string }[] = [
  { id: "char",  label: "角色", ico: "🧑", hint: "人物参考图 — 跨集复用" },
  { id: "prop",  label: "道具", ico: "🪙", hint: "重要道具特写" },
  { id: "scene", label: "场景", ico: "🏙️", hint: "场景取景立绘 — 9:16 竖屏" },
  { id: "media", label: "素材", ico: "🎞️", hint: "封面 / 海报 / 字卡" },
];

export function AssetsTab({ project }: { project: Project }) {
  const [assets, setAssetsState] = useState<Asset[]>(() => listAssets(project.id));
  const [kind, setKind] = useState<AssetKind>("char");
  const [gridSize, setGridSize] = useState<"compact" | "comfy">(() => {
    if (typeof window === "undefined") return "compact";
    return (window.localStorage.getItem("novelcut:v1:asset-grid-size") as "compact" | "comfy") || "compact";
  });
  const updateGridSize = (s: "compact" | "comfy") => {
    setGridSize(s);
    if (typeof window !== "undefined") window.localStorage.setItem("novelcut:v1:asset-grid-size", s);
  };
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDrawer, setShowDrawer] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const skeleton = useMemo(() => getSkeleton(project.id), [project.id]);
  const scripts = useMemo(() => listScripts(project.id), [project.id]);
  const llm = loadLLMConfig();
  const img = loadImageConfig();

  const reload = () => setAssetsState(listAssets(project.id));
  useEffect(() => { if (!showSettings) reload(); }, [showSettings, project.id]);

  const filtered = assets.filter(a => a.kind === kind);
  const counts = TABS.reduce((acc, t) => {
    acc[t.id] = assets.filter(a => a.kind === t.id).length;
    return acc;
  }, {} as Record<AssetKind, number>);

  const upsertAndState = (a: Asset) => {
    upsertAsset(a);
    setAssetsState(listAssets(project.id));
  };

  const onAddManual = (newKind: AssetKind = kind) => {
    const a: Asset = {
      id: genId("ast"), projectId: project.id,
      kind: newKind, name: "", description: "",
      promptStatus: "idle", imageStatus: "idle",
      createdAt: Date.now(),
    };
    setEditingAsset(a);
  };

  const onSaveEdit = (asset: Asset) => {
    if (!asset.name.trim()) return alert("请填写名称");
    upsertAndState(asset);
    setEditingAsset(null);
  };

  const onDelete = (a: Asset) => {
    if (!confirm(`删除资产「${a.name}」?`)) return;
    deleteAsset(project.id, a.id);
    reload();
    if (showDrawer?.id === a.id) setShowDrawer(null);
  };

  const ensureLLM = () => { if (!llm) { setShowSettings(true); return false; } return true; };
  const ensureImg = () => { if (!img) { setShowSettings(true); return false; } return true; };

  const generatePromptFor = async (asset: Asset, ac: AbortController) => {
    if (!ensureLLM()) return;
    const updating = { ...asset, promptStatus: "running" as const, promptError: undefined };
    upsertAndState(updating);
    try {
      const prompt = await runAssetPrompt(llm!, project, asset, skeleton, { signal: ac.signal });
      const done: Asset = { ...updating, prompt, promptStatus: "done" };
      upsertAndState(done);
      appendTask({
        id: genId("task"), projectId: project.id, kind: "asset.prompt", model: llm!.model,
        description: `提示词就绪 · ${asset.name}`, status: "done",
        createdAt: Date.now(), finishedAt: Date.now(),
      });
      return done;
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      upsertAndState({ ...updating, promptStatus: "error", promptError: msg });
      appendTask({
        id: genId("task"), projectId: project.id, kind: "asset.prompt", model: llm!.model,
        description: `提示词失败 · ${asset.name}: ${msg}`, status: "error",
        createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
      throw e;
    }
  };

  const generateImageFor = async (asset: Asset, ac: AbortController) => {
    if (!ensureImg()) return;
    const updating: Asset = { ...asset, imageStatus: "running", imageError: undefined };
    upsertAndState(updating);
    try {
      const r = await runAssetImage(img!, project, asset, { signal: ac.signal });
      const url = r.url ?? (r.b64 ? `data:image/png;base64,${r.b64}` : undefined);
      const done: Asset = { ...updating, previewUrl: url, imageStatus: "done" };
      upsertAndState(done);
      appendTask({
        id: genId("task"), projectId: project.id, kind: "asset.image", model: img!.model,
        description: `资产出图 · ${asset.name}`, status: "done",
        createdAt: Date.now(), finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      upsertAndState({ ...updating, imageStatus: "error", imageError: msg });
      appendTask({
        id: genId("task"), projectId: project.id, kind: "asset.image", model: img!.model,
        description: `资产出图失败 · ${asset.name}: ${msg}`, status: "error",
        createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
      throw e;
    }
  };

  const onGenerateOne = async (asset: Asset, mode: "prompt" | "image" | "full") => {
    setError(null);
    if (mode !== "prompt" && !ensureImg()) return;
    if (mode !== "image" && !ensureLLM()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let cur = asset;
      if (mode !== "image" && (!cur.prompt || mode === "full")) {
        const updated = await generatePromptFor(cur, ac);
        if (updated) cur = updated;
      }
      if (mode !== "prompt") {
        await generateImageFor(cur, ac);
      }
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      setError(msg);
    } finally { abortRef.current = null; }
  };

  const onBatchGenerate = async (mode: "prompt" | "image" | "full") => {
    if (!ensureLLM() || (mode !== "prompt" && !ensureImg())) return;
    setError(null);
    const targets = filtered.filter(a => {
      if (mode === "prompt") return !a.prompt;
      if (mode === "image") return a.prompt && !a.previewUrl;
      return !a.previewUrl;  // full
    });
    if (targets.length === 0) {
      alert("当前 tab 没有需要处理的资产");
      return;
    }
    setBatchRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    setBatchProgress({ done: 0, total: targets.length, label: "准备中…" });
    for (let i = 0; i < targets.length; i++) {
      if (ac.signal.aborted) break;
      const a = targets[i];
      setBatchProgress({ done: i, total: targets.length, label: `${kindLabel(a.kind)} · ${a.name}` });
      try {
        let cur = a;
        if (mode !== "image" && !cur.prompt) {
          const u = await generatePromptFor(cur, ac);
          if (u) cur = u;
        }
        if (mode !== "prompt") {
          await generateImageFor(cur, ac);
        }
      } catch { /* keep going */ }
    }
    setBatchProgress({ done: targets.length, total: targets.length, label: "完成" });
    setBatchRunning(false);
    abortRef.current = null;
  };

  const cancelBatch = () => abortRef.current?.abort();

  const onSmartImport = () => {
    if (!skeleton) { alert("先到「编剧」tab 生成故事骨架,智能识别会从骨架的人物 + 剧本场景里提取资产。"); return; }
    const proposed = computeProposedAssets(project.id, skeleton, scripts, assets);
    if (proposed.chars.length === 0 && proposed.scenes.length === 0) {
      alert("没有发现可导入的新资产 — 骨架人物和剧本场景都已经在列表里。");
      return;
    }
    setShowImport(true);
    (window as any).__nc_proposed = proposed;
  };

  const onClearPrompts = () => {
    const all = listAssets(project.id);
    const withPrompt = all.filter(a => a.prompt);
    if (withPrompt.length === 0) { alert("当前没有任何提示词可清"); return; }
    if (!confirm(`清空全部 ${withPrompt.length} 个资产的提示词?\n\n图片(${all.filter(a => a.previewUrl).length} 张)不会动。\n\n这个操作不可恢复。`)) return;
    for (const a of all) {
      if (a.prompt || a.promptStatus !== "idle" || a.promptError) {
        upsertAsset({ ...a, prompt: undefined, promptStatus: "idle", promptError: undefined });
      }
    }
    setAssetsState(listAssets(project.id));
  };

  const onClearImages = () => {
    const all = listAssets(project.id);
    const withImage = all.filter(a => a.previewUrl);
    if (withImage.length === 0) { alert("当前没有任何已生成的图片"); return; }
    if (!confirm(`清空全部 ${withImage.length} 张已生成的图片?\n\n提示词不会动。\n\n这个操作不可恢复。`)) return;
    for (const a of all) {
      if (a.previewUrl || a.imageStatus !== "idle" || a.imageError) {
        upsertAsset({ ...a, previewUrl: undefined, imageStatus: "idle", imageError: undefined });
      }
    }
    setAssetsState(listAssets(project.id));
  };

  const proposedAssets = useMemo(
    () => skeleton ? computeProposedAssets(project.id, skeleton, scripts, assets) : { chars: [], scenes: [] },
    [skeleton, scripts, assets, project.id],
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="nc-page-title" style={{ fontSize: 20 }}>资产中心</h2>
          <div className="nc-page-sub" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>全局复用 · 角色四视图 / 道具双状态 / 场景 establishing — 都是 16:9 参考图,供分镜阶段调用。</span>
            <ProjectImagingBadge project={project} onChange={(p) => { /* re-renders via parent state */ window.location.reload(); }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <details style={{ position: "relative" }}>
            <summary style={{ listStyle: "none", cursor: "pointer" }}>
              <span className="nc-btn nc-btn-ghost" style={{ pointerEvents: "none" }}>⋯ 批量清理</span>
            </summary>
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 4px)",
              background: "#fff", border: "1px solid #ebe7df", borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: 4, zIndex: 10, minWidth: 180,
            }}>
              <button
                className="nc-btn nc-btn-ghost"
                style={{ width: "100%", justifyContent: "flex-start", borderColor: "transparent" }}
                onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; onClearPrompts(); }}
              >
                🗑 清空所有提示词
              </button>
              <button
                className="nc-btn nc-btn-ghost"
                style={{ width: "100%", justifyContent: "flex-start", borderColor: "transparent" }}
                onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; onClearImages(); }}
              >
                🖼 清空所有图片
              </button>
            </div>
          </details>
          <button className="nc-btn nc-btn-ghost" onClick={onSmartImport}>
            🤖 智能识别
            {(proposedAssets.chars.length + proposedAssets.scenes.length > 0) && (
              <span className="nc-pill" style={{ background: "var(--nc-cyan)", color: "#fff", marginLeft: 6, fontSize: 10 }}>
                {proposedAssets.chars.length + proposedAssets.scenes.length}
              </span>
            )}
          </button>
          {batchRunning ? (
            <button className="nc-btn nc-btn-danger" onClick={cancelBatch}>
              ✕ 取消 ({batchProgress?.done}/{batchProgress?.total})
            </button>
          ) : (
            <>
              <button
                className="nc-btn nc-btn-ghost"
                disabled={filtered.length === 0 || !llm}
                title={!llm ? "未配置 LLM" : ""}
                onClick={() => onBatchGenerate("prompt")}
              >
                ⚡ 批量生成提示词
              </button>
              <button
                className="nc-btn nc-btn-primary"
                disabled={filtered.length === 0 || !llm || !img}
                title={!img ? "未配置图像模型 — 无法出图" : !llm ? "未配置 LLM" : ""}
                onClick={() => onBatchGenerate("full")}
              >
                ⚡ 一键全自动 (提示词 + 出图)
              </button>
            </>
          )}
          <button className="nc-btn nc-btn-ghost" onClick={() => onAddManual()}>+ 新增{kindLabel(kind)}</button>
        </div>
      </div>

      {!img && (
        <div className="nc-callout" style={{
          marginBottom: 16,
          background: "linear-gradient(135deg, #fef3c7 0%, #fff 80%)",
          borderColor: "#fcd34d",
        }}>
          <span className="nc-callout-kicker" style={{ color: "#92400e", background: "#fff" }}>
            ⚠ 图像模型未配置
          </span>
          <h4>资产出图需要单独配置图像模型</h4>
          <p>
            <strong>大模型 (LLM) 和图像模型是两个独立配置。</strong>
            {llm && (llm.provider === "deepseek" || llm.provider === "anthropic")
              ? `你当前的 ${llm.provider} 只能写文,不能出图。`
              : ""}
            出图需要 OpenAI (gpt-image-2) / grsai / 可灵 / new-api 网关 等图像供应商。
            目前你<strong>只能生成提示词</strong>,不能直接出图。
          </p>
          <button
            className="nc-btn nc-btn-primary"
            style={{ marginTop: 10 }}
            onClick={() => setShowSettings(true)}
          >
            🖼 立即配置图像模型
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid #ebe7df", alignItems: "center" }}>
        {TABS.map((t) => (
          <button key={t.id} className="nc-tab" aria-selected={kind === t.id} onClick={() => setKind(t.id)}>
            <span className="ico">{t.ico}</span> {t.label}
            <span style={{ marginLeft: 4, fontSize: 11, color: "var(--text-faint)" }}>{counts[t.id]}</span>
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 2, paddingBottom: 6 }}>
          <button
            className="nc-btn nc-btn-ghost"
            style={{
              padding: "4px 10px", fontSize: 12,
              borderColor: gridSize === "compact" ? "var(--nc-cyan)" : "#e5e1d8",
              color: gridSize === "compact" ? "var(--nc-cyan-strong)" : undefined,
              background: gridSize === "compact" ? "var(--nc-cyan-tint)" : "#fff",
            }}
            onClick={() => updateGridSize("compact")}
            title="紧凑视图 — 一行多张缩略图"
          >⊞ 紧凑</button>
          <button
            className="nc-btn nc-btn-ghost"
            style={{
              padding: "4px 10px", fontSize: 12,
              borderColor: gridSize === "comfy" ? "var(--nc-cyan)" : "#e5e1d8",
              color: gridSize === "comfy" ? "var(--nc-cyan-strong)" : undefined,
              background: gridSize === "comfy" ? "var(--nc-cyan-tint)" : "#fff",
            }}
            onClick={() => updateGridSize("comfy")}
            title="大图视图 — 一行 2 张,看清细节"
          >▢ 大图</button>
        </div>
      </div>

      {batchRunning && batchProgress && (
        <div style={{ padding: 14, marginBottom: 14, background: "#fff", border: "1px solid #ebe7df", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>⏳ {batchProgress.label}</span>
            <span style={{ color: "var(--text-muted)" }}>{batchProgress.done}/{batchProgress.total} · {Math.round(batchProgress.done / batchProgress.total * 100)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "#ebe7df", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round(batchProgress.done / batchProgress.total * 100)}%`, background: "var(--nc-cyan)", transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "#fee2e2", border: "1px solid #fecaca", fontSize: 12, color: "#b91c1c" }}>
          <strong>失败:</strong> {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="nc-empty">
          <h3>暂无{kindLabel(kind)}</h3>
          <p>
            {skeleton
              ? `点击右上「🤖 智能识别」从故事骨架的人物和剧本场景里自动提取资产 — 一次成型最多 ${proposedAssets.chars.length + proposedAssets.scenes.length} 个候选。`
              : "建议先到「✍️ 编剧」生成故事骨架,然后回来「智能识别」可一键导入主要人物和场景作为资产。"}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
            {skeleton && (
              <button className="nc-btn nc-btn-primary" onClick={onSmartImport}>🤖 智能识别</button>
            )}
            <button className="nc-btn nc-btn-ghost" onClick={() => onAddManual()}>+ 手动添加</button>
          </div>
        </div>
      ) : (
        <div className={`nc-asset-grid nc-asset-grid-${gridSize}`}>
          {filtered.map((a) => (
            <AssetCard
              key={a.id} asset={a}
              onClick={() => setShowDrawer(a)}
              onGenerate={() => onGenerateOne(a, a.prompt ? "image" : "full")}
              onEdit={() => setEditingAsset(a)}
              onDelete={() => onDelete(a)}
            />
          ))}
        </div>
      )}

      {/* Drawer for full asset detail view */}
      {showDrawer && (
        <AssetDrawer
          asset={showDrawer}
          onClose={() => setShowDrawer(null)}
          onEdit={() => { setEditingAsset(showDrawer); setShowDrawer(null); }}
          onDelete={() => onDelete(showDrawer)}
          onGen={(mode) => onGenerateOne(showDrawer, mode)}
        />
      )}

      {editingAsset && (
        <EditAssetDialog
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={onSaveEdit}
        />
      )}

      {showImport && skeleton && (
        <SmartImportDialog
          proposed={proposedAssets}
          onClose={() => setShowImport(false)}
          onImport={(picked) => {
            const cur = listAssets(project.id);
            const next = [...cur];
            for (const p of picked) {
              next.push({
                id: genId("ast"), projectId: project.id,
                kind: p.kind, name: p.name,
                role: p.role, description: p.description,
                promptStatus: "idle", imageStatus: "idle",
                createdAt: Date.now(),
              });
            }
            setAssetsState(next);
            (cur => cur).call(null);  // satisfy lint
            for (const n of next.slice(cur.length)) upsertAsset(n);
            setShowImport(false);
          }}
        />
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} initialTab="image" />}
    </>
  );
}


function ProjectImagingBadge({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const [editing, setEditing] = useState(false);
  const ratio = project.videoRatio ?? (
    ["抖音","小红书","快手","TikTok","YouTube Shorts"].includes(project.platform) ? "9:16" : "16:9"
  );
  const quality = project.imageQuality ?? "1K";
  return (
    <>
      <button
        className="nc-pill"
        onClick={() => setEditing(true)}
        style={{
          background: "var(--nc-cyan-tint)", color: "var(--nc-cyan-strong)",
          border: "1px solid var(--nc-cyan-soft)", cursor: "pointer", padding: "2px 10px",
        }}
        title={`项目画幅 ${ratio} · 画质 ${quality} (用于分镜/视频出图,资产参考图固定 16:9)`}
      >
        🎞 项目 {ratio} · {quality}
      </button>
      <span className="nc-pill nc-pill-gray" style={{ padding: "2px 10px" }} title="资产参考图(角色4视图/道具双状态/场景establishing shot)固定 16:9 横版,与项目画幅无关">
        📐 资产 16:9
      </span>
      {editing && <ProjectImagingDialog project={project} onClose={() => setEditing(false)} onSave={onChange} />}
    </>
  );
}

function ProjectImagingDialog({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (p: Project) => void }) {
  const [ratio, setRatio] = useState<VideoRatio>(project.videoRatio ?? defaultRatioForPlatform(project.platform));
  const [quality, setQuality] = useState<ImageQuality>(project.imageQuality ?? "1K");
  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div className="nc-modal-title">项目画幅 / 画质</div>
            <div className="nc-page-sub">所有资产、分镜、视频共用 · 修改后已生成的资产不会自动重新出图</div>
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="nc-form-row">
          <label className="nc-label">画幅</label>
          <select className="nc-select" value={ratio} onChange={(e) => setRatio(e.target.value as VideoRatio)}>
            {RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
          </select>
        </div>
        <div className="nc-form-row">
          <label className="nc-label">画质</label>
          <select className="nc-select" value={quality} onChange={(e) => setQuality(e.target.value as ImageQuality)}>
            {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
          </select>
        </div>
        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
          <button className="nc-btn nc-btn-primary" onClick={() => {
            const next = { ...project, videoRatio: ratio, imageQuality: quality, updatedAt: Date.now() };
            upsertProject(next);
            onSave(next);
            onClose();
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}

function kindLabel(k: AssetKind): string {
  return k === "char" ? "角色" : k === "scene" ? "场景" : k === "prop" ? "道具" : "素材";
}

function computeProposedAssets(
  projectId: string,
  skeleton: any,
  scripts: Record<string, EpisodeScript>,
  existing: Asset[],
): { chars: { kind: AssetKind; name: string; role?: string; description?: string }[]; scenes: { kind: AssetKind; name: string; description?: string }[] } {
  const exNames = new Set(existing.map(a => `${a.kind}:${a.name.trim()}`));

  const chars: { kind: AssetKind; name: string; role?: string; description?: string }[] = [];
  for (const c of (skeleton?.characterCores ?? [])) {
    const key = `char:${c.name?.trim()}`;
    if (!c.name || exNames.has(key)) continue;
    chars.push({ kind: "char", name: c.name, role: c.role, description: c.arc });
    exNames.add(key);
  }
  // Also collect characters mentioned in scripts (named in dialogue) that aren't in skeleton
  const seenInScripts = new Set<string>();
  for (const s of Object.values(scripts)) {
    for (const sc of s.scenes ?? []) {
      for (const ch of (sc.characters ?? [])) seenInScripts.add(ch);
      for (const d of (sc.dialogue ?? [])) seenInScripts.add(d.character);
    }
  }
  for (const name of seenInScripts) {
    if (!name) continue;
    const key = `char:${name.trim()}`;
    if (exNames.has(key)) continue;
    chars.push({ kind: "char", name, role: "配角", description: "出现在剧本对白中" });
    exNames.add(key);
  }

  const scenes: { kind: AssetKind; name: string; description?: string }[] = [];
  const seenScenes = new Set<string>();
  for (const s of Object.values(scripts)) {
    for (const sc of s.scenes ?? []) {
      const loc = sc.location?.trim();
      if (!loc) continue;
      if (seenScenes.has(loc)) continue;
      seenScenes.add(loc);
      const key = `scene:${loc}`;
      if (exNames.has(key)) continue;
      scenes.push({ kind: "scene", name: loc, description: sc.timeOfDay });
      exNames.add(key);
    }
  }
  return { chars, scenes };
}

// ====== Components ======

function AssetCard({ asset, onClick, onGenerate, onEdit, onDelete }: {
  asset: Asset; onClick: () => void; onGenerate: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const generating = asset.promptStatus === "running" || asset.imageStatus === "running";
  const [imgBroken, setImgBroken] = useState(false);
  return (
    <div className="nc-asset-card" onClick={onClick}>
      <div className="nc-asset-thumb">
        {asset.previewUrl && !imgBroken ? (
          <img
            src={asset.previewUrl}
            alt={asset.name}
            onError={() => setImgBroken(true)}
            onLoad={() => setImgBroken(false)}
          />
        ) : asset.previewUrl && imgBroken ? (
          <div className="nc-asset-broken">
            <div style={{ fontSize: 24 }}>⚠</div>
            <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>图已过期<br />请重新出图</div>
          </div>
        ) : generating ? (
          <div className="nc-asset-loading">
            <div style={{ fontSize: 24 }}>⏳</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              {asset.promptStatus === "running" ? "写提示词…" : "出图中…"}
            </div>
          </div>
        ) : (
          <div className="nc-asset-empty">
            <div style={{ fontSize: 32 }}>{TABS.find(t => t.id === asset.kind)?.ico ?? "?"}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-muted)" }}>未出图</div>
          </div>
        )}
        {(asset.promptStatus === "error" || asset.imageStatus === "error") && (
          <div className="nc-asset-error-pill">✗</div>
        )}
      </div>
      <div className="nc-asset-meta">
        <div className="nc-asset-name">
          {asset.role && <span className="nc-pill" style={{ marginRight: 6, fontSize: 10 }}>{asset.role}</span>}
          {asset.name || "(未命名)"}
        </div>
        {asset.description && <div className="nc-asset-desc">{asset.description.slice(0, 60)}{asset.description.length > 60 ? "…" : ""}</div>}
      </div>
      <div className="nc-asset-actions" onClick={(e) => e.stopPropagation()}>
        <button className="nc-btn nc-btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={onGenerate} disabled={generating}>
          {asset.previewUrl ? "重新出图" : asset.prompt ? "出图" : "生成"}
        </button>
        <button className="nc-btn nc-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={onEdit}>编辑</button>
        <button className="nc-btn nc-btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={onDelete}>删</button>
      </div>
    </div>
  );
}

function AssetDrawer({ asset, onClose, onEdit, onDelete, onGen }: {
  asset: Asset; onClose: () => void;
  onEdit: () => void; onDelete: () => void;
  onGen: (mode: "prompt" | "image" | "full") => void;
}) {
  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal nc-asset-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{kindLabel(asset.kind)}</div>
            <div className="nc-modal-title" style={{ fontSize: 22 }}>{asset.name}</div>
            {asset.role && <div className="nc-page-sub">{asset.role}</div>}
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>

        {asset.previewUrl ? (
          <a href={asset.previewUrl} target="_blank" rel="noreferrer" title="点击在新标签页查看原图">
            <img src={asset.previewUrl} alt={asset.name}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; (e.currentTarget as HTMLImageElement).title = "图已过期,请重新出图"; }}
              style={{
                width: "100%",
                maxHeight: "min(72vh, 800px)",
                objectFit: "contain",
                borderRadius: 8,
                background: "#f4f2ed",
                marginBottom: 14,
                cursor: "zoom-in",
              }} />
          </a>
        ) : (
          <div style={{ height: 320, background: "#f4f2ed", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", marginBottom: 14 }}>
            未出图
          </div>
        )}

        {asset.description && (
          <div className="nc-form-row">
            <label className="nc-label">描述</label>
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{asset.description}</div>
          </div>
        )}

        <div className="nc-form-row">
          <label className="nc-label">视觉提示词 (image prompt)</label>
          {asset.prompt ? (
            <div style={{
              background: "#fffefb", border: "1px solid #ebe7df", borderRadius: 8,
              padding: "10px 12px", fontSize: 12, lineHeight: 1.6,
              fontFamily: "ui-monospace, monospace", color: "var(--text-strong)",
              maxHeight: 200, overflow: "auto",
            }}>
              {asset.prompt}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>尚未生成</div>
          )}
          {asset.promptError && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>提示词失败: {asset.promptError}</div>}
          {asset.imageError && <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>出图失败: {asset.imageError}</div>}
        </div>

        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-danger" onClick={onDelete} style={{ marginRight: "auto" }}>删除</button>
          <button className="nc-btn nc-btn-ghost" onClick={onEdit}>编辑</button>
          {!asset.prompt ? (
            <button className="nc-btn nc-btn-primary" onClick={() => onGen("prompt")}>生成提示词</button>
          ) : (
            <>
              <button className="nc-btn nc-btn-ghost" onClick={() => onGen("prompt")}>重写提示词</button>
              <button
                className="nc-btn nc-btn-primary"
                onClick={() => onGen("image")}
                title={"出图需要图像模型配置"}
              >
                {asset.previewUrl ? "重新出图" : "出图"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EditAssetDialog({ asset, onClose, onSave }: {
  asset: Asset; onClose: () => void; onSave: (a: Asset) => void;
}) {
  const [name, setName] = useState(asset.name);
  const [role, setRole] = useState(asset.role ?? "");
  const [description, setDescription] = useState(asset.description ?? "");
  const [prompt, setPrompt] = useState(asset.prompt ?? "");

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div className="nc-modal-title">{asset.name ? `编辑 · ${asset.name}` : `新增${kindLabel(asset.kind)}`}</div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="nc-form-row">
          <label className="nc-label">名称</label>
          <input className="nc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={asset.kind === "char" ? "苏晚 / 弗拉基米尔" : asset.kind === "scene" ? "莫斯科顶级晚宴厅" : ""} autoFocus />
        </div>
        {asset.kind === "char" && (
          <div className="nc-form-row">
            <label className="nc-label">角色定位</label>
            <input className="nc-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="女主 / 男主 / 反派 / 配角" />
          </div>
        )}
        <div className="nc-form-row">
          <label className="nc-label">描述</label>
          <textarea className="nc-textarea" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={asset.kind === "char" ? "性别、年龄、外貌、性格、弧光" : asset.kind === "scene" ? "氛围、时段、风格、关键道具" : ""} />
        </div>
        <div className="nc-form-row">
          <label className="nc-label">视觉提示词 (image prompt) — 可手动覆写</label>
          <textarea className="nc-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="留空则点保存后让 AI 生成" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
        </div>
        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
          <button className="nc-btn nc-btn-primary" onClick={() => onSave({
            ...asset,
            name: name.trim(),
            role: role.trim() || undefined,
            description: description.trim() || undefined,
            prompt: prompt.trim() || undefined,
            promptStatus: prompt.trim() ? "done" : asset.promptStatus,
          })}>保存</button>
        </div>
      </div>
    </div>
  );
}

function SmartImportDialog({ proposed, onClose, onImport }: {
  proposed: { chars: any[]; scenes: any[] };
  onClose: () => void;
  onImport: (picks: any[]) => void;
}) {
  const [pickedChars, setPickedChars] = useState<Set<number>>(new Set(proposed.chars.map((_, i) => i)));
  const [pickedScenes, setPickedScenes] = useState<Set<number>>(new Set(proposed.scenes.map((_, i) => i)));

  const toggle = (set: Set<number>, idx: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setter(next);
  };

  const onConfirm = () => {
    const picks = [
      ...proposed.chars.filter((_, i) => pickedChars.has(i)),
      ...proposed.scenes.filter((_, i) => pickedScenes.has(i)),
    ];
    if (picks.length === 0) return alert("至少选一个");
    onImport(picks);
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal" style={{ maxWidth: 640, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div className="nc-modal-title">🤖 智能识别 · 共 {proposed.chars.length + proposed.scenes.length} 项候选</div>
            <div className="nc-page-sub">从故事骨架的主要人物 + 剧本里出现过的场景中自动提取。勾选要导入的项。</div>
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>

        {proposed.chars.length > 0 && (
          <>
            <div className="nc-section-title" style={{ margin: "8px 0 8px" }}>角色 ({proposed.chars.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {proposed.chars.map((c, i) => (
                <label key={i} className="nc-import-row">
                  <input type="checkbox" checked={pickedChars.has(i)} onChange={() => toggle(pickedChars, i, setPickedChars)} />
                  <span className="nc-pill nc-import-pill">{c.role ?? "角色"}</span>
                  <div className="nc-import-body">
                    <div className="nc-import-name">{c.name}</div>
                    {c.description && <div className="nc-import-desc">{c.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        {proposed.scenes.length > 0 && (
          <>
            <div className="nc-section-title" style={{ margin: "8px 0 8px" }}>场景 ({proposed.scenes.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {proposed.scenes.map((s, i) => (
                <label key={i} className="nc-import-row">
                  <input type="checkbox" checked={pickedScenes.has(i)} onChange={() => toggle(pickedScenes, i, setPickedScenes)} />
                  <span className="nc-pill nc-pill-warm nc-import-pill">场景</span>
                  <div className="nc-import-body">
                    <div className="nc-import-name">{s.name}</div>
                    {s.description && <div className="nc-import-desc">{s.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-ghost" onClick={onClose}>取消</button>
          <button className="nc-btn nc-btn-primary" onClick={onConfirm}>
            导入 {pickedChars.size + pickedScenes.size} 项
          </button>
        </div>
      </div>
    </div>
  );
}
