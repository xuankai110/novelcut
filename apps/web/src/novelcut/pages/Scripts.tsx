import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Episode, EpisodeScript } from "../types";
import {
  listEpisodes, getSkeleton, listScripts, saveScript, deleteScript,
  appendTask, genId,
} from "../store";
import { loadLLMConfig, LLMError } from "../llm";
import { runEpisodeScript } from "../agent/runner";
import { SettingsDialog } from "../SettingsDialog";

export function ScriptsTab({ project }: { project: Project }) {
  const [episodes] = useState<Episode[]>(() => listEpisodes(project.id));
  const [scripts, setScripts] = useState<Record<string, EpisodeScript>>(() => listScripts(project.id));
  const [selectedId, setSelectedId] = useState<string | null>(() => listEpisodes(project.id)[0]?.id ?? null);
  const [showSettings, setShowSettings] = useState(false);
  const [singleRunning, setSingleRunning] = useState<string | null>(null);  // episode id being generated
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skeleton = useMemo(() => getSkeleton(project.id), [project.id]);
  const llm = loadLLMConfig();
  const llmReady = !!llm?.apiKey;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (!showSettings) setScripts(listScripts(project.id)); }, [showSettings, project.id]);

  const selected = episodes.find(e => e.id === selectedId);
  const selectedScript = selected ? scripts[selected.id] : undefined;

  const generateOne = async (ep: Episode) => {
    if (!llm || !skeleton) {
      if (!llm) setShowSettings(true);
      return;
    }
    setError(null);
    setSingleRunning(ep.id);
    const taskId = genId("task");
    appendTask({
      id: taskId, projectId: project.id, kind: "agent.script", model: llm.model,
      description: `扩写 EP${String(ep.index).padStart(2, "0")} · ${ep.title}`,
      status: "running", createdAt: Date.now(),
    });
    try {
      const prev = episodes.find(e => e.index === ep.index - 1);
      const prevHookEnd = prev?.blueprint?.hookEnd;
      const ac = new AbortController();
      abortRef.current = ac;
      const script = await runEpisodeScript(llm, project, skeleton, ep, { prevHookEnd, signal: ac.signal });
      saveScript(project.id, script);
      setScripts(listScripts(project.id));
      appendTask({
        id: taskId + "_done", projectId: project.id, kind: "agent.script", model: llm.model,
        description: `扩写完成 EP${String(ep.index).padStart(2, "0")} · ${script.scenes.length} 场`,
        status: "done", createdAt: Date.now(), finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      setError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "agent.script", model: llm.model,
        description: `扩写失败 EP${String(ep.index).padStart(2, "0")}: ${msg}`,
        status: "error", createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
    } finally {
      setSingleRunning(null);
      abortRef.current = null;
    }
  };

  const generateAll = async () => {
    if (!llm || !skeleton) {
      if (!llm) setShowSettings(true);
      return;
    }
    setError(null);
    setBatchRunning(true);
    const pending = episodes.filter(e => !scripts[e.id]);
    setBatchProgress({ done: 0, total: pending.length, label: "准备中…" });
    const ac = new AbortController();
    abortRef.current = ac;

    for (let i = 0; i < pending.length; i++) {
      if (ac.signal.aborted) break;
      const ep = pending[i];
      setBatchProgress({ done: i, total: pending.length, label: `扩写 EP${String(ep.index).padStart(2, "0")} · ${ep.title}` });
      try {
        const prev = episodes.find(e => e.index === ep.index - 1);
        const script = await runEpisodeScript(llm, project, skeleton, ep, {
          prevHookEnd: prev?.blueprint?.hookEnd, signal: ac.signal,
        });
        saveScript(project.id, script);
        setScripts(listScripts(project.id));
        appendTask({
          id: genId("task"), projectId: project.id, kind: "agent.script", model: llm.model,
          description: `扩写完成 EP${String(ep.index).padStart(2, "0")}`,
          status: "done", createdAt: Date.now(), finishedAt: Date.now(),
        });
      } catch (e) {
        const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
        appendTask({
          id: genId("task"), projectId: project.id, kind: "agent.script", model: llm.model,
          description: `扩写失败 EP${String(ep.index).padStart(2, "0")}: ${msg}`,
          status: "error", createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
        });
        // continue to next
      }
    }
    setBatchProgress({ done: pending.length, total: pending.length, label: "完成" });
    setBatchRunning(false);
    abortRef.current = null;
  };

  const cancelBatch = () => abortRef.current?.abort();

  const onRegenerate = (ep: Episode) => {
    if (!confirm(`重新生成 EP${String(ep.index).padStart(2, "0")} 剧本?现有版本会被覆盖。`)) return;
    deleteScript(project.id, ep.id);
    setScripts(listScripts(project.id));
    generateOne(ep);
  };

  if (episodes.length === 0) {
    return (
      <div className="nc-empty">
        <h3>还没有分集</h3>
        <p>先到「✍️ 编剧」tab 运行编剧 Agent,把事件分配到 N 集后这里会自动出现剧本扩写入口。</p>
        <button className="nc-btn nc-btn-primary" onClick={() => (window.location.hash = `/p/${project.id}/agent`)}>
          前往编剧 Agent →
        </button>
      </div>
    );
  }

  if (!skeleton) {
    return (
      <div className="nc-empty">
        <h3>缺少故事骨架</h3>
        <p>剧本扩写需要骨架做参考 (人物核 / 改编原则 / 三幕结构)。</p>
        <button className="nc-btn nc-btn-primary" onClick={() => (window.location.hash = `/p/${project.id}/agent`)}>
          前往生成骨架 →
        </button>
      </div>
    );
  }

  const scriptedCount = Object.keys(scripts).length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <h2 className="nc-page-title" style={{ fontSize: 20 }}>剧本 · {scriptedCount}/{episodes.length} 集已扩写</h2>
          <div className="nc-page-sub">每集独立扩写为可拍摄剧本(场景 / 动作 / 台词 / 音效 / 字幕)</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {batchRunning ? (
            <button className="nc-btn nc-btn-danger" onClick={cancelBatch}>
              ✕ 取消 ({batchProgress?.done}/{batchProgress?.total})
            </button>
          ) : (
            <button
              className="nc-btn nc-btn-primary"
              onClick={generateAll}
              disabled={!llmReady || scriptedCount === episodes.length}
            >
              {scriptedCount === 0 ? "⚡ 一键扩写全部" : `⚡ 扩写剩余 ${episodes.length - scriptedCount} 集`}
            </button>
          )}
        </div>
      </div>

      {batchRunning && batchProgress && <BatchProgress progress={batchProgress} />}

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 14,
          background: "#fee2e2", border: "1px solid #fecaca",
          fontSize: 12, color: "#b91c1c",
        }}>
          <strong>失败:</strong> {error}
        </div>
      )}

      <div className="nc-script-shell">
        <aside className="nc-script-side">
          {episodes.map((ep) => {
            const has = !!scripts[ep.id];
            const running = singleRunning === ep.id || (batchRunning && batchProgress?.label.includes(`EP${String(ep.index).padStart(2, "0")}`));
            return (
              <button
                key={ep.id}
                className="nc-script-item"
                aria-selected={selectedId === ep.id}
                onClick={() => setSelectedId(ep.id)}
              >
                <span className="nc-script-item-num">EP{String(ep.index).padStart(2, "0")}</span>
                <span className="nc-script-item-title">{ep.title}</span>
                <span className="nc-script-item-state">
                  {running ? <span className="nc-pill nc-pill-warm" style={{ fontSize: 9 }}>运行中</span>
                    : has ? <span className="nc-pill nc-pill-green" style={{ fontSize: 9 }}>✓</span>
                    : <span className="nc-pill nc-pill-gray" style={{ fontSize: 9 }}>未扩写</span>}
                </span>
              </button>
            );
          })}
        </aside>

        <main className="nc-script-main">
          {!selected ? (
            <Empty hint="左侧选一集" />
          ) : selectedScript ? (
            <ScriptView
              script={selectedScript}
              episode={selected}
              onRegenerate={() => onRegenerate(selected)}
              llmReady={llmReady}
              isRunning={singleRunning === selected.id}
            />
          ) : singleRunning === selected.id ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <div>正在扩写 EP{String(selected.index).padStart(2, "0")} 「{selected.title}」</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>通常 15-40 秒</div>
            </div>
          ) : (
            <BlueprintView
              episode={selected}
              llmReady={llmReady}
              onGenerate={() => generateOne(selected)}
            />
          )}
        </main>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{hint}</div>;
}

function BatchProgress({ progress }: { progress: { done: number; total: number; label: string } }) {
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div style={{
      padding: 14, marginBottom: 14, background: "#fff",
      border: "1px solid #ebe7df", borderRadius: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>⏳ {progress.label}</span>
        <span style={{ color: "var(--text-muted)" }}>{progress.done}/{progress.total} · {pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "#ebe7df", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--nc-cyan)", transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function BlueprintView({
  episode, llmReady, onGenerate,
}: { episode: Episode; llmReady: boolean; onGenerate: () => void }) {
  const bp = episode.blueprint;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
          EP{String(episode.index).padStart(2, "0")}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{episode.title}</div>
        {bp?.hookOpen && <div style={{ fontSize: 13, color: "var(--nc-cyan-strong)", marginBottom: 4 }}>⚡ 开场: {bp.hookOpen}</div>}
        {bp?.hookEnd && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>→ 结尾: {bp.hookEnd}</div>}
      </div>

      {bp?.summary && (
        <div className="nc-callout" style={{ marginBottom: 16 }}>
          <span className="nc-callout-kicker">本集 blueprint</span>
          <p style={{ marginTop: 6 }}>{bp.summary}</p>
          {bp.beats?.length > 0 && (
            <ol style={{ marginTop: 10, marginLeft: 18, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {bp.beats.map((b, i) => <li key={i}>{b}</li>)}
            </ol>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", padding: 24 }}>
        <button className="nc-btn nc-btn-primary" disabled={!llmReady} onClick={onGenerate}>
          ▶ 扩写本集剧本
        </button>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
          基于骨架 + blueprint 一次生成 · 通常 15-40 秒
        </div>
      </div>
    </div>
  );
}

function ScriptView({ script, episode, onRegenerate, llmReady, isRunning }: {
  script: EpisodeScript; episode: Episode; onRegenerate: () => void;
  llmReady: boolean; isRunning: boolean;
}) {
  const totalLines = script.scenes.reduce((s, sc) => s + sc.dialogue.length, 0);
  const totalChars = script.scenes.reduce((s, sc) =>
    s + sc.dialogue.reduce((d, ln) => d + ln.line.length, 0), 0);
  return (
    <div className="nc-script-doc">
      <div className="nc-script-header">
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            EP{String(episode.index).padStart(2, "0")}
            {script.metadata.style && ` · ${script.metadata.style}`}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 8px" }}>{script.episodeTitle}</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {script.metadata.platform} · {script.metadata.targetDuration} · {totalLines} 句台词 · {totalChars} 字
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="nc-btn nc-btn-ghost"
            onClick={() => {
              const text = scriptToPlainText(script);
              navigator.clipboard.writeText(text).then(() => alert("已复制全部剧本到剪贴板"));
            }}
          >
            📋 复制全文
          </button>
          <button className="nc-btn nc-btn-ghost" onClick={onRegenerate} disabled={!llmReady || isRunning}>
            重新生成
          </button>
        </div>
      </div>

      {episode.blueprint?.hookOpen && (
        <div className="nc-script-hook">⚡ 开场钩子: {episode.blueprint.hookOpen}</div>
      )}

      <div className="nc-script-section-title">剧情梗概</div>
      <div className="nc-script-synopsis">{script.synopsis}</div>

      <div className="nc-script-section-title">分场剧本</div>
      {script.scenes.map((scene, i) => (
        <div key={i} className="nc-script-scene">
          <div className="nc-script-scene-head">
            <span className="nc-pill" style={{ background: "var(--nc-cyan)", color: "#fff", fontWeight: 600 }}>
              场 {scene.index}
            </span>
            <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{scene.location}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {scene.timeOfDay}</span>
            {scene.characters.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                · 人物: {scene.characters.join(" / ")}
              </span>
            )}
          </div>
          {scene.onScreenText && (
            <div className="nc-script-screen-text">📺 {scene.onScreenText}</div>
          )}
          {scene.actions.map((a, j) => (
            <div key={j} className="nc-script-action">{a.startsWith("△") ? a : `△ ${a}`}</div>
          ))}
          {scene.dialogue.map((d, j) => (
            <div key={j} className="nc-script-dialogue">
              <span className="nc-script-char">{d.character}</span>
              {d.emotion && <span className="nc-script-emotion">({d.emotion})</span>}
              <span className="nc-script-line">{d.line}</span>
            </div>
          ))}
          {scene.audioCues && scene.audioCues.length > 0 && (
            <div className="nc-script-audio">
              {scene.audioCues.map((c, j) => <span key={j}>♪ {c}</span>)}
            </div>
          )}
        </div>
      ))}

      {episode.blueprint?.hookEnd && (
        <div className="nc-script-hook" style={{ borderColor: "var(--nc-green)", background: "#ecfdf5", color: "#065f46" }}>
          → 结尾留白: {episode.blueprint.hookEnd}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 18, textAlign: "right" }}>
        {new Date(script.generatedAt).toLocaleString("zh-CN")} · {script.model}
      </div>
    </div>
  );
}

function scriptToPlainText(s: EpisodeScript): string {
  const lines: string[] = [
    `# EP${String(s.episodeIndex).padStart(2, "0")} · ${s.episodeTitle}`,
    `# 平台: ${s.metadata.platform} | 时长: ${s.metadata.targetDuration} | 风格: ${s.metadata.style}`,
    ``,
    `## 剧情梗概`,
    s.synopsis,
    ``,
  ];
  for (const sc of s.scenes) {
    lines.push(`---`, `${sc.index} ${sc.location} ${sc.timeOfDay}`, `人物: ${sc.characters.join(" ")}`, ``);
    if (sc.onScreenText) lines.push(`[屏幕字幕] ${sc.onScreenText}`, ``);
    for (const a of sc.actions) lines.push(a.startsWith("△") ? a : `△ ${a}`);
    lines.push(``);
    for (const d of sc.dialogue) {
      const em = d.emotion ? ` (${d.emotion})` : "";
      lines.push(`${d.character}${em}: ${d.line}`);
    }
    if (sc.audioCues && sc.audioCues.length) lines.push(``, ...sc.audioCues.map(c => `[音效] ${c}`));
    lines.push(``);
  }
  return lines.join("\n");
}
