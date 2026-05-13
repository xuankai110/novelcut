import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Episode, EpisodeScript, ScriptScene, Shot, Asset } from "../types";
import {
  listEpisodes, listScripts, listAssets, listShots, listShotsByEpisode,
  listShotsByScene, upsertShots, upsertShot, deleteShot, deleteShotsByScene,
  appendTask, genId, getSkeleton,
} from "../store";
import { loadLLMConfig, loadImageConfig, LLMError } from "../llm";
import { runShotlist, normalizeShot, autoLinkAssetIds, runShotImage } from "../agent/runner";
import { SettingsDialog } from "../SettingsDialog";
import { SafeImg } from "../SafeImg";

const FRAMING_LABELS: Record<string, string> = {
  ECU: "极特", CU: "特写", MCU: "中近", MS: "中景", MLS: "中远",
  LS: "远景", EWS: "大全", INSERT: "空镜", OTS: "过肩",
};
const MOVE_LABELS: Record<string, string> = {
  static: "静止", dolly_in: "推近", dolly_out: "拉远",
  pan_left: "左摇", pan_right: "右摇", tilt_up: "上摇", tilt_down: "下摇",
  tracking: "跟拍", handheld: "手持", crane: "升降",
};
const FRAMING_OPTIONS = Object.keys(FRAMING_LABELS);
const MOVE_OPTIONS = Object.keys(MOVE_LABELS);

export function StoryboardTab({ project }: { project: Project }) {
  const [episodes] = useState<Episode[]>(() => listEpisodes(project.id));
  const [scripts] = useState<Record<string, EpisodeScript>>(() => listScripts(project.id));
  const [allShots, setAllShots] = useState<Shot[]>(() => listShots(project.id));
  const [assets, setAssets] = useState<Asset[]>(() => listAssets(project.id));
  const [selectedEpId, setSelectedEpId] = useState<string | null>(() => listEpisodes(project.id)[0]?.id ?? null);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerShotId, setDrawerShotId] = useState<string | null>(null);

  const [running, setRunning] = useState<{ kind: "shotlist" | "image" | "batch"; total: number; done: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const skeleton = useMemo(() => getSkeleton(project.id), [project.id]);
  const llm = loadLLMConfig();
  const img = loadImageConfig();
  const llmReady = !!llm?.apiKey;
  const imgReady = !!img?.apiKey;

  const reload = () => {
    setAllShots(listShots(project.id));
    setAssets(listAssets(project.id));
  };

  const selectedEp = episodes.find(e => e.id === selectedEpId) ?? null;
  const selectedScript = selectedEp ? scripts[selectedEp.id] : undefined;
  const selectedEpShots = selectedEp ? listShotsByEpisode(project.id, selectedEp.id) : [];

  const drawerShot = drawerShotId ? allShots.find(s => s.id === drawerShotId) ?? null : null;

  const totalShots = allShots.length;
  const totalGenerated = allShots.filter(s => s.imageStatus === "done").length;
  const epsWithShots = new Set(allShots.map(s => s.episodeId)).size;

  // Group selected episode shots by scene index
  const shotsBySceneIndex = useMemo(() => {
    const map: Record<string, Shot[]> = {};
    for (const s of selectedEpShots) {
      if (!map[s.sceneIndex]) map[s.sceneIndex] = [];
      map[s.sceneIndex].push(s);
    }
    return map;
  }, [selectedEpShots]);

  if (episodes.length === 0) {
    return (
      <div className="nc-empty">
        <h3>还没有分集</h3>
        <p>分镜基于剧本拆分。先到「✍️ 编剧」生成分集计划,再到「🎬 剧本」扩写每集对白,然后这里就能拆镜了。</p>
        <button className="nc-btn nc-btn-primary" onClick={() => (window.location.hash = `/p/${project.id}/agent`)}>
          前往编剧 →
        </button>
      </div>
    );
  }

  const ensureLLM = () => { if (!llm) { setShowSettings(true); return false; } return true; };
  const ensureImg = () => { if (!img) { setShowSettings(true); return false; } return true; };

  const shotlistOneScene = async (ep: Episode, scene: ScriptScene, ac: AbortController, opts?: { silent?: boolean }) => {
    if (!llm) return;
    const taskId = genId("task");
    appendTask({
      id: taskId, projectId: project.id, kind: "agent.shotlist", model: llm.model,
      description: `拆镜 EP${String(ep.index).padStart(2, "0")} 场 ${scene.index}`,
      status: "running", createdAt: Date.now(),
    });
    try {
      const raws = await runShotlist(llm, {
        project, skeleton, episode: ep,
        scene: {
          index: scene.index,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
          characters: scene.characters,
          actions: scene.actions,
          dialogue: scene.dialogue,
          audioCues: scene.audioCues,
          onScreenText: scene.onScreenText,
        },
      }, { signal: ac.signal });

      // Drop existing shots for this scene, then add fresh
      deleteShotsByScene(project.id, ep.id, scene.index);
      const allAssetsFresh = listAssets(project.id);
      const shots: Shot[] = raws.map((raw) => {
        const norm = normalizeShot(raw, {
          projectId: project.id,
          episodeId: ep.id,
          episodeIndex: ep.index,
          sceneIndex: scene.index,
          sceneLocation: scene.location,
          sceneTimeOfDay: scene.timeOfDay,
        });
        const associatedAssetIds = autoLinkAssetIds(norm.characters, scene.location, allAssetsFresh);
        return { id: genId("shot"), ...norm, associatedAssetIds, model: llm.model } as Shot;
      });
      upsertShots(project.id, shots);
      setAllShots(listShots(project.id));
      appendTask({
        id: taskId + "_done", projectId: project.id, kind: "agent.shotlist", model: llm.model,
        description: `拆镜完成 EP${String(ep.index).padStart(2, "0")} 场 ${scene.index} · ${shots.length} 镜`,
        status: "done", createdAt: Date.now(), finishedAt: Date.now(),
      });
      return shots;
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      if (!opts?.silent) setError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "agent.shotlist", model: llm.model,
        description: `拆镜失败 EP${String(ep.index).padStart(2, "0")} 场 ${scene.index}: ${msg}`,
        status: "error", createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
      throw e;
    }
  };

  const onShotlistOneScene = async (scene: ScriptScene) => {
    if (!selectedEp || !ensureLLM()) return;
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning({ kind: "shotlist", total: 1, done: 0, label: `拆镜 场 ${scene.index}` });
    try { await shotlistOneScene(selectedEp, scene, ac); } catch {} finally {
      setRunning(null); abortRef.current = null;
    }
  };

  const onShotlistAllScenes = async () => {
    if (!selectedEp || !selectedScript || !ensureLLM()) return;
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    const scenes = selectedScript.scenes;
    setRunning({ kind: "shotlist", total: scenes.length, done: 0, label: "准备中…" });
    for (let i = 0; i < scenes.length; i++) {
      if (ac.signal.aborted) break;
      const sc = scenes[i];
      setRunning({ kind: "shotlist", total: scenes.length, done: i, label: `拆镜 场 ${sc.index}` });
      try { await shotlistOneScene(selectedEp, sc, ac, { silent: true }); }
      catch {} // continue to next scene
    }
    setRunning(null); abortRef.current = null;
  };

  const generateShotImage = async (shot: Shot, ac: AbortController, opts?: { silent?: boolean }) => {
    if (!img) return;
    upsertShot({ ...shot, imageStatus: "running", imageError: undefined });
    setAllShots(listShots(project.id));
    const taskId = genId("task");
    appendTask({
      id: taskId, projectId: project.id, kind: "shot.image", model: img.model,
      description: `出图 EP${String(shot.episodeIndex).padStart(2, "0")} ${shot.sceneIndex}-${shot.shotIndex}`,
      status: "running", createdAt: Date.now(),
    });
    try {
      const allAssetsFresh = listAssets(project.id);
      const linkedAssets = allAssetsFresh.filter(a => shot.associatedAssetIds.includes(a.id));
      const charAssets = linkedAssets.filter(a => a.kind === "char");
      const sceneAsset = linkedAssets.find(a => a.kind === "scene");
      const r = await runShotImage(img, project, shot, charAssets, sceneAsset, { signal: ac.signal });
      const url = r.url ?? (r.b64 ? `data:image/png;base64,${r.b64}` : undefined);
      const updated: Shot = {
        ...shot, imageUrl: url, imageStatus: "done", imageError: undefined,
        imageGeneratedAt: Date.now(),
      };
      upsertShot(updated);
      setAllShots(listShots(project.id));
      appendTask({
        id: taskId + "_done", projectId: project.id, kind: "shot.image", model: img.model,
        description: `出图完成 ${shot.sceneIndex}-${shot.shotIndex}`,
        status: "done", createdAt: Date.now(), finishedAt: Date.now(),
      });
      return updated;
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      upsertShot({ ...shot, imageStatus: "error", imageError: msg });
      setAllShots(listShots(project.id));
      if (!opts?.silent) setError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "shot.image", model: img.model,
        description: `出图失败 ${shot.sceneIndex}-${shot.shotIndex}: ${msg}`,
        status: "error", createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
      throw e;
    }
  };

  const onGenShotImage = async (shot: Shot) => {
    if (!ensureImg()) return;
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning({ kind: "image", total: 1, done: 0, label: `出图 ${shot.sceneIndex}-${shot.shotIndex}` });
    try { await generateShotImage(shot, ac); } catch {} finally {
      setRunning(null); abortRef.current = null;
    }
  };

  const onBatchGenImagesForEpisode = async () => {
    if (!ensureImg() || !selectedEp) return;
    setError(null);
    const targets = selectedEpShots.filter(s => !s.imageUrl);
    if (targets.length === 0) { alert("当前集所有镜都已出图"); return; }
    const ac = new AbortController();
    abortRef.current = ac;
    for (let i = 0; i < targets.length; i++) {
      if (ac.signal.aborted) break;
      const sh = targets[i];
      if (!sh) continue;
      setRunning({ kind: "batch", total: targets.length, done: i, label: `出图 ${sh.sceneIndex}-${sh.shotIndex}` });
      try { await generateShotImage(sh, ac, { silent: true }); }
      catch {}
    }
    setRunning(null); abortRef.current = null;
  };

  const onBatchGenImagesForScene = async (sceneIndex: string) => {
    if (!ensureImg() || !selectedEp) return;
    setError(null);
    const targets = listShotsByScene(project.id, selectedEp.id, sceneIndex).filter(s => !s.imageUrl);
    if (targets.length === 0) { alert("此场所有镜都已出图"); return; }
    const ac = new AbortController();
    abortRef.current = ac;
    for (let i = 0; i < targets.length; i++) {
      if (ac.signal.aborted) break;
      const sh = targets[i];
      if (!sh) continue;
      setRunning({ kind: "batch", total: targets.length, done: i, label: `出图 ${sh.sceneIndex}-${sh.shotIndex}` });
      try { await generateShotImage(sh, ac, { silent: true }); } catch {}
    }
    setRunning(null); abortRef.current = null;
  };

  const onCancel = () => abortRef.current?.abort();

  const onShotChange = (updated: Shot) => {
    upsertShot(updated);
    setAllShots(listShots(project.id));
  };

  const onShotDelete = (s: Shot) => {
    if (!confirm(`删除镜 ${s.sceneIndex}-${s.shotIndex}?`)) return;
    deleteShot(project.id, s.id);
    setAllShots(listShots(project.id));
    if (drawerShotId === s.id) setDrawerShotId(null);
  };

  return (
    <>
      <div className="nc-callout">
        <span className="nc-callout-kicker">竖屏 9:16 短剧分镜</span>
        <h4>从剧本到镜头表 · 每场 2-5 镜 · 平均 3 秒/镜</h4>
        <p>
          AI 按短剧节奏拆镜 (开场钩 / 冲突镜 / 结尾留白),自动选 framing (CU/MS/LS) 和 cameraMove (静止/推近/手持等)。
          每镜会自动关联本场的角色资产和场景资产,出图时把资产参考注入,保证人物/场景跨镜一致。
        </p>
      </div>

      {!llmReady && (
        <div className="nc-callout" style={{ marginBottom: 16 }}>
          <span className="nc-callout-kicker">需要先配置大模型</span>
          <h4>拆镜由 LLM 完成</h4>
          <button className="nc-btn nc-btn-primary" style={{ marginTop: 8 }} onClick={() => setShowSettings(true)}>⚙ 现在去配置</button>
        </div>
      )}

      <div className="nc-stats">
        <div className="nc-stat">
          <div className="nc-stat-label">已拆镜集</div>
          <div className="nc-stat-value">{epsWithShots}/{episodes.length}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">总镜数</div>
          <div className="nc-stat-value">{totalShots}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">已出图</div>
          <div className="nc-stat-value">{totalGenerated}/{totalShots || 0}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">总时长估算</div>
          <div className="nc-stat-value" style={{ fontSize: 17 }}>
            {(allShots.reduce((s, sh) => s + sh.duration, 0) / 60).toFixed(1)} 分钟
          </div>
        </div>
      </div>

      {/* Episode tabs */}
      <div className="nc-storyboard-eptabs">
        {episodes.map((ep) => {
          const epShots = allShots.filter(s => s.episodeId === ep.id);
          const epShotCount = epShots.length;
          const epDone = epShots.filter(s => s.imageStatus === "done").length;
          return (
            <button
              key={ep.id}
              className="nc-storyboard-eptab"
              aria-selected={selectedEpId === ep.id}
              onClick={() => setSelectedEpId(ep.id)}
            >
              <span className="nc-storyboard-eptab-num">EP{String(ep.index).padStart(2, "0")}</span>
              <span className="nc-storyboard-eptab-title">{ep.title}</span>
              <span className="nc-storyboard-eptab-count">
                {epShotCount === 0 ? <span className="nc-pill nc-pill-gray" style={{ fontSize: 9 }}>未拆</span>
                  : epDone === epShotCount ? <span className="nc-pill nc-pill-green" style={{ fontSize: 9 }}>{epShotCount}镜✓</span>
                    : <span className="nc-pill nc-pill-warm" style={{ fontSize: 9 }}>{epDone}/{epShotCount}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action bar for selected episode */}
      {selectedEp && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 12px", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>EP{String(selectedEp.index).padStart(2, "0")}</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{selectedEp.title}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {running ? (
              <button className="nc-btn nc-btn-danger" onClick={onCancel}>
                ✕ 取消 ({running.done}/{running.total})
              </button>
            ) : (
              <>
                <button
                  className="nc-btn nc-btn-ghost"
                  onClick={onShotlistAllScenes}
                  disabled={!llmReady || !selectedScript}
                  title={!selectedScript ? "本集尚未生成剧本" : ""}
                >
                  ⚡ 拆全集{selectedScript ? `${selectedScript.scenes.length}场` : ""}
                </button>
                <button
                  className="nc-btn nc-btn-primary"
                  onClick={onBatchGenImagesForEpisode}
                  disabled={!imgReady || selectedEpShots.length === 0}
                  title={!imgReady ? "未配置图像模型" : ""}
                >
                  🖼 出图全集 ({selectedEpShots.filter(s => !s.imageUrl).length}/{selectedEpShots.length})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {running && (
        <div style={{ padding: 14, marginBottom: 14, background: "#fff", border: "1px solid #ebe7df", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>⏳ {running.label}</span>
            <span style={{ color: "var(--text-muted)" }}>{running.done}/{running.total} · {Math.round((running.done / Math.max(1, running.total)) * 100)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "#ebe7df", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((running.done / Math.max(1, running.total)) * 100)}%`, background: "var(--nc-cyan)", transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "#fee2e2", border: "1px solid #fecaca", fontSize: 12, color: "#b91c1c" }}>
          <strong>失败:</strong> {error}
        </div>
      )}

      {/* Per-scene strips */}
      {!selectedEp ? (
        <Empty hint="左侧选一集" />
      ) : !selectedScript ? (
        <div className="nc-empty">
          <h3>本集尚未生成剧本</h3>
          <p>分镜需要先有剧本。回「🎬 剧本」tab 扩写本集后再回来拆镜。</p>
          <button className="nc-btn nc-btn-primary" onClick={() => (window.location.hash = `/p/${project.id}/scripts`)}>
            前往剧本 →
          </button>
        </div>
      ) : selectedScript.scenes.length === 0 ? (
        <Empty hint="本集剧本中没有场景" />
      ) : (
        <div className="nc-storyboard-scenes">
          {selectedScript.scenes.map((scene) => {
            const shots = shotsBySceneIndex[scene.index] ?? [];
            return (
              <SceneStrip
                key={scene.index}
                scene={scene}
                shots={shots}
                assets={assets}
                onShotlistScene={() => onShotlistOneScene(scene)}
                onBatchImage={() => onBatchGenImagesForScene(scene.index)}
                onClickShot={(s) => setDrawerShotId(s.id)}
                onDeleteAllShots={() => {
                  if (!confirm(`清空场 ${scene.index} 的所有镜?`)) return;
                  if (selectedEp) {
                    deleteShotsByScene(project.id, selectedEp.id, scene.index);
                    setAllShots(listShots(project.id));
                  }
                }}
                disabled={!!running}
                llmReady={llmReady}
                imgReady={imgReady}
              />
            );
          })}
        </div>
      )}

      {drawerShot && (
        <ShotDrawer
          shot={drawerShot}
          assets={assets}
          onClose={() => setDrawerShotId(null)}
          onChange={onShotChange}
          onDelete={() => onShotDelete(drawerShot)}
          onGenImage={() => onGenShotImage(drawerShot)}
          imgReady={imgReady}
          isRunning={drawerShot.imageStatus === "running"}
        />
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{hint}</div>;
}

// ============ Scene strip ============

function SceneStrip({
  scene, shots, assets,
  onShotlistScene, onBatchImage, onClickShot, onDeleteAllShots,
  disabled, llmReady, imgReady,
}: {
  scene: ScriptScene;
  shots: Shot[];
  assets: Asset[];
  onShotlistScene: () => void;
  onBatchImage: () => void;
  onClickShot: (s: Shot) => void;
  onDeleteAllShots: () => void;
  disabled: boolean;
  llmReady: boolean;
  imgReady: boolean;
}) {
  const pending = shots.filter(s => !s.imageUrl).length;
  return (
    <div className="nc-scene-strip">
      <div className="nc-scene-strip-head">
        <div className="nc-scene-strip-info">
          <span className="nc-pill" style={{ background: "var(--nc-cyan)", color: "#fff", fontWeight: 600 }}>
            场 {scene.index}
          </span>
          <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{scene.location}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {scene.timeOfDay}</span>
          {scene.characters.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {scene.characters.join(" / ")}</span>
          )}
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-faint)" }}>
            {shots.length === 0 ? "未拆镜" : `${shots.length} 镜 · ${shots.length - pending}/${shots.length} 已出图`}
          </span>
        </div>
        <div className="nc-scene-strip-actions">
          <button
            className="nc-btn nc-btn-ghost"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={onShotlistScene}
            disabled={disabled || !llmReady}
          >
            {shots.length === 0 ? "⚡ 拆此场" : "重拆此场"}
          </button>
          {shots.length > 0 && (
            <>
              <button
                className="nc-btn nc-btn-primary"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={onBatchImage}
                disabled={disabled || !imgReady || pending === 0}
              >
                🖼 出图 ({pending}/{shots.length})
              </button>
              <button
                className="nc-btn nc-btn-danger"
                style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={onDeleteAllShots}
                disabled={disabled}
              >
                🗑
              </button>
            </>
          )}
        </div>
      </div>

      {shots.length === 0 ? (
        <div className="nc-scene-strip-empty">
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>未拆镜 — 点击「拆此场」让 AI 把这场拆成 2-5 个镜头</div>
        </div>
      ) : (
        <div className="nc-shot-row">
          {shots.map((s) => (
            <ShotCard key={s.id} shot={s} assets={assets} onClick={() => onClickShot(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShotCard({ shot, assets, onClick }: { shot: Shot; assets: Asset[]; onClick: () => void }) {
  const linked = assets.filter(a => shot.associatedAssetIds.includes(a.id));
  return (
    <div className="nc-shot-card" onClick={onClick}>
      <div className="nc-shot-thumb">
        {shot.imageUrl ? (
          <SafeImg
            src={shot.imageUrl}
            alt={`${shot.sceneIndex}-${shot.shotIndex}`}
            fallback={
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                width: "100%", height: "100%",
                background: "#fee2e2", color: "#b91c1c",
                textAlign: "center", padding: 8,
              }}>
                <div style={{ fontSize: 22 }}>⚠</div>
                <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>图已过期<br />请重新出图</div>
              </div>
            }
          />
        ) : shot.imageStatus === "running" ? (
          <div className="nc-shot-loading">⏳<div style={{ fontSize: 10, marginTop: 4 }}>出图中</div></div>
        ) : (
          <div className="nc-shot-empty">
            <div style={{ fontSize: 28 }}>🎬</div>
            <div style={{ fontSize: 10, marginTop: 4, color: "var(--text-muted)" }}>未出图</div>
          </div>
        )}
        <div className="nc-shot-overlay-top">
          <span className="nc-shot-num">{shot.sceneIndex}-{shot.shotIndex}</span>
          <span className="nc-shot-framing">{FRAMING_LABELS[shot.framing] ?? shot.framing}</span>
        </div>
        <div className="nc-shot-overlay-bot">
          <span className="nc-shot-duration">{shot.duration.toFixed(1)}s</span>
          {shot.cameraMove !== "static" && <span className="nc-shot-move">{MOVE_LABELS[shot.cameraMove] ?? shot.cameraMove}</span>}
        </div>
        {shot.imageStatus === "error" && <div className="nc-shot-error-pill">✗</div>}
      </div>
      <div className="nc-shot-meta">
        {shot.dialogue?.line ? (
          <div className="nc-shot-dialogue">
            <strong>{shot.dialogue.character}: </strong>
            <span>{shot.dialogue.line.length > 28 ? shot.dialogue.line.slice(0, 28) + "…" : shot.dialogue.line}</span>
          </div>
        ) : (
          <div className="nc-shot-action">{shot.action.length > 36 ? shot.action.slice(0, 36) + "…" : shot.action}</div>
        )}
        {linked.length > 0 && (
          <div className="nc-shot-assets">
            {linked.slice(0, 3).map((a) => (
              <span key={a.id} className="nc-pill nc-pill-gray" style={{ fontSize: 9 }}>{a.kind === "char" ? "👤" : "📍"}{a.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Shot drawer ============

function ShotDrawer({
  shot, assets, onClose, onChange, onDelete, onGenImage, imgReady, isRunning,
}: {
  shot: Shot;
  assets: Asset[];
  onClose: () => void;
  onChange: (s: Shot) => void;
  onDelete: () => void;
  onGenImage: () => void;
  imgReady: boolean;
  isRunning: boolean;
}) {
  const [edited, setEdited] = useState<Shot>(shot);

  useEffect(() => { setEdited(shot); }, [shot.id, shot.updatedAt, shot.imageUrl]);

  const linkedAssets = assets.filter(a => edited.associatedAssetIds.includes(a.id));
  const unlinkedAssets = assets.filter(a => !edited.associatedAssetIds.includes(a.id));

  const update = (patch: Partial<Shot>) => setEdited({ ...edited, ...patch, updatedAt: Date.now() });
  const save = () => { onChange(edited); };

  const toggleAsset = (assetId: string) => {
    const has = edited.associatedAssetIds.includes(assetId);
    update({
      associatedAssetIds: has
        ? edited.associatedAssetIds.filter(id => id !== assetId)
        : [...edited.associatedAssetIds, assetId],
    });
  };

  return (
    <div className="nc-modal-backdrop" onClick={onClose}>
      <div className="nc-modal nc-shot-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              EP{String(edited.episodeIndex).padStart(2, "0")} · 场 {edited.sceneLocation} · {edited.sceneTimeOfDay}
            </div>
            <div className="nc-modal-title" style={{ fontSize: 22 }}>
              镜 {edited.sceneIndex}-{edited.shotIndex}
            </div>
          </div>
          <button className="nc-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="nc-shot-drawer-body">
          <div className="nc-shot-drawer-image">
            {edited.imageUrl ? (
              <a href={edited.imageUrl} target="_blank" rel="noreferrer" title="点击新标签页看原图">
                <SafeImg
                  src={edited.imageUrl}
                  alt={`${edited.sceneIndex}-${edited.shotIndex}`}
                  fallback={
                    <div className="nc-shot-drawer-empty" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                      ⚠ 图已过期 · 请重新出图
                    </div>
                  }
                />
              </a>
            ) : (
              <div className="nc-shot-drawer-empty">
                {isRunning ? "⏳ 出图中…" : "🎬 未出图"}
              </div>
            )}
            {edited.imageError && (
              <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 8 }}>失败: {edited.imageError}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="nc-btn nc-btn-primary" onClick={onGenImage} disabled={!imgReady || isRunning}>
                {edited.imageUrl ? "🖼 重新出图" : "🖼 出图"}
              </button>
            </div>
          </div>

          <div className="nc-shot-drawer-fields">
            <div className="nc-form-grid">
              <div className="nc-form-row">
                <label className="nc-label">framing 景别</label>
                <select className="nc-select" value={edited.framing} onChange={(e) => update({ framing: e.target.value as any })}>
                  {FRAMING_OPTIONS.map(f => <option key={f} value={f}>{f} — {FRAMING_LABELS[f]}</option>)}
                </select>
              </div>
              <div className="nc-form-row">
                <label className="nc-label">cameraMove 运镜</label>
                <select className="nc-select" value={edited.cameraMove} onChange={(e) => update({ cameraMove: e.target.value as any })}>
                  {MOVE_OPTIONS.map(m => <option key={m} value={m}>{m} — {MOVE_LABELS[m]}</option>)}
                </select>
              </div>
            </div>

            <div className="nc-form-grid">
              <div className="nc-form-row">
                <label className="nc-label">duration 秒数</label>
                <input
                  type="number" step="0.5" min={1.5} max={5}
                  className="nc-input"
                  value={edited.duration}
                  onChange={(e) => update({ duration: Math.max(1.5, Math.min(5, parseFloat(e.target.value || "3"))) })}
                />
              </div>
              <div className="nc-form-row">
                <label className="nc-label">入镜人物 (空格分隔)</label>
                <input
                  className="nc-input"
                  value={edited.characters.join(" ")}
                  onChange={(e) => update({ characters: e.target.value.trim().split(/\s+/).filter(Boolean) })}
                />
              </div>
            </div>

            <div className="nc-form-row">
              <label className="nc-label">动作描述</label>
              <textarea
                className="nc-textarea" style={{ minHeight: 70 }}
                value={edited.action}
                onChange={(e) => update({ action: e.target.value })}
              />
            </div>

            <div className="nc-form-row">
              <label className="nc-label">台词 (可选)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="nc-input"
                  placeholder="人物名"
                  style={{ maxWidth: 160 }}
                  value={edited.dialogue?.character ?? ""}
                  onChange={(e) => update({
                    dialogue: { character: e.target.value, line: edited.dialogue?.line ?? "" },
                  })}
                />
                <input
                  className="nc-input"
                  placeholder="台词内容"
                  value={edited.dialogue?.line ?? ""}
                  onChange={(e) => update({
                    dialogue: { character: edited.dialogue?.character ?? "", line: e.target.value },
                  })}
                />
              </div>
            </div>

            <div className="nc-form-grid">
              <div className="nc-form-row">
                <label className="nc-label">屏幕字幕 (可选)</label>
                <input className="nc-input" value={edited.onScreenText ?? ""} onChange={(e) => update({ onScreenText: e.target.value || undefined })} />
              </div>
              <div className="nc-form-row">
                <label className="nc-label">音效线索 (可选)</label>
                <input className="nc-input" value={edited.audioCue ?? ""} onChange={(e) => update({ audioCue: e.target.value || undefined })} />
              </div>
            </div>

            <div className="nc-form-row">
              <label className="nc-label">图像 prompt (英文 seed,出图时会拼接资产参考)</label>
              <textarea
                className="nc-textarea"
                style={{ minHeight: 100, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                value={edited.imagePrompt ?? ""}
                onChange={(e) => update({ imagePrompt: e.target.value })}
              />
            </div>

            <div className="nc-form-row">
              <label className="nc-label">关联资产 ({linkedAssets.length})</label>
              <div className="nc-shot-linked-assets">
                {linkedAssets.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>(未关联任何资产)</span>}
                {linkedAssets.map(a => (
                  <button key={a.id} className="nc-asset-chip nc-asset-chip-linked" onClick={() => toggleAsset(a.id)}>
                    {a.kind === "char" ? "👤" : a.kind === "scene" ? "📍" : "🪙"} {a.name} ✕
                  </button>
                ))}
              </div>
              {unlinkedAssets.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>+ 添加更多资产 ({unlinkedAssets.length})</summary>
                  <div className="nc-shot-linked-assets" style={{ marginTop: 6 }}>
                    {unlinkedAssets.map(a => (
                      <button key={a.id} className="nc-asset-chip" onClick={() => toggleAsset(a.id)}>
                        {a.kind === "char" ? "👤" : a.kind === "scene" ? "📍" : "🪙"} {a.name} +
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>

        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-danger" onClick={onDelete} style={{ marginRight: "auto" }}>删除此镜</button>
          <button className="nc-btn nc-btn-ghost" onClick={onClose}>关闭</button>
          <button className="nc-btn nc-btn-primary" onClick={save}>保存修改</button>
        </div>
      </div>
    </div>
  );
}
