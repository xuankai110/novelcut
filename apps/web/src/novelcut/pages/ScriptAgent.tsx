import { useEffect, useState } from "react";
import type { Project, StorySkeleton, Episode } from "../types";
import {
  listChapters, getSkeleton, saveSkeleton, clearSkeleton,
  listEpisodes, setEpisodes as saveEpisodes, appendTask, genId,
} from "../store";
import { loadLLMConfig, LLMError } from "../llm";
import { runSkeleton, runEpisodePlan } from "../agent/runner";
import { SettingsDialog } from "../SettingsDialog";

export function ScriptAgentTab({ project }: { project: Project }) {
  const [chapters, setChapters] = useState(() => listChapters(project.id));
  const [skeleton, setSkel] = useState<StorySkeleton | null>(() => getSkeleton(project.id));
  const [episodes, setEpisodesState] = useState<Episode[]>(() => listEpisodes(project.id));
  const [showSettings, setShowSettings] = useState(false);
  const [skelRunning, setSkelRunning] = useState(false);
  const [planRunning, setPlanRunning] = useState(false);
  const [skelError, setSkelError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const llm = loadLLMConfig();
  const llmReady = !!llm?.apiKey;
  const eventCount = chapters.reduce((s, c) => s + (c.eventCount ?? 0), 0);
  const chaptersWithEvents = chapters.filter(c => c.eventsStatus === "done");

  // Default episode count: respect project target but cap by event budget (2-3 events per ep)
  const suggestedEp = Math.max(3, Math.min(project.episodeCount, Math.floor(eventCount / 2.5)));
  const [episodeCount, setEpisodeCount] = useState(suggestedEp);

  useEffect(() => {
    if (!showSettings) {
      setChapters(listChapters(project.id));
      setSkel(getSkeleton(project.id));
      setEpisodesState(listEpisodes(project.id));
    }
  }, [showSettings, project.id]);

  const onRunSkeleton = async () => {
    if (!llm) { setShowSettings(true); return; }
    setSkelError(null);
    setSkelRunning(true);
    const taskId = genId("task");
    appendTask({
      id: taskId, projectId: project.id, kind: "agent.skeleton", model: llm.model,
      description: "生成故事骨架", status: "running", createdAt: Date.now(),
    });
    try {
      const { skeleton } = await runSkeleton(llm, project, chaptersWithEvents);
      saveSkeleton(project.id, skeleton);
      setSkel(skeleton);
      appendTask({
        id: taskId + "_done", projectId: project.id, kind: "agent.skeleton", model: llm.model,
        description: `骨架就绪 · ${skeleton.characterCores.length} 个主要人物`,
        status: "done", createdAt: Date.now(), finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      setSkelError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "agent.skeleton", model: llm.model,
        description: `骨架生成失败: ${msg}`, status: "error",
        createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
    } finally {
      setSkelRunning(false);
    }
  };

  const onRunPlan = async () => {
    if (!llm || !skeleton) return;
    setPlanError(null);
    setPlanRunning(true);
    const taskId = genId("task");
    appendTask({
      id: taskId, projectId: project.id, kind: "agent.episode-plan", model: llm.model,
      description: `分集决策 · 规划 ${episodeCount} 集`, status: "running", createdAt: Date.now(),
    });
    try {
      const { blueprints } = await runEpisodePlan(llm, project, chaptersWithEvents, skeleton, episodeCount);
      const eps: Episode[] = blueprints.map((bp) => ({
        id: genId("ep"), projectId: project.id, index: bp.index, title: bp.title,
        blueprint: bp, status: "draft" as const,
      }));
      saveEpisodes(project.id, eps);
      setEpisodesState(eps);
      appendTask({
        id: taskId + "_done", projectId: project.id, kind: "agent.episode-plan", model: llm.model,
        description: `分集就绪 · ${eps.length} 集`,
        status: "done", createdAt: Date.now(), finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
      setPlanError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "agent.episode-plan", model: llm.model,
        description: `分集失败: ${msg}`, status: "error",
        createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
    } finally {
      setPlanRunning(false);
    }
  };

  return (
    <>
      <div className="nc-callout">
        <span className="nc-callout-kicker">三层 Agent · 决策 / 执行 / 监督</span>
        <h4>编剧 Agent —— 从事件图谱到分集决策</h4>
        <p>两步走:先让 AI 提炼故事骨架 (一句话故事 + 三幕结构 + 改编原则),再基于骨架做分集决策表 (每集梗概/钩子/复用事件)。后续「剧本」tab 会基于这些 blueprint 扩写每集对白。</p>
      </div>

      {!llmReady && (
        <div className="nc-callout" style={{ marginBottom: 16 }}>
          <span className="nc-callout-kicker">需要先配置大模型</span>
          <h4>编剧 Agent 全程由 LLM 驱动</h4>
          <button className="nc-btn nc-btn-primary" style={{ marginTop: 8 }} onClick={() => setShowSettings(true)}>⚙ 现在去配置</button>
        </div>
      )}

      <div className="nc-stats">
        <div className="nc-stat">
          <div className="nc-stat-label">已抽事件章</div>
          <div className="nc-stat-value">{chaptersWithEvents.length}/{chapters.length}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">事件总数</div>
          <div className="nc-stat-value">{eventCount}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">故事骨架</div>
          <div className="nc-stat-value" style={{ fontSize: 17, color: skeleton ? "var(--nc-green)" : "var(--text-faint)" }}>
            {skeleton ? "✓ 已生成" : "未生成"}
          </div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">已规划集数</div>
          <div className="nc-stat-value">{episodes.length}/{project.episodeCount}</div>
        </div>
      </div>

      {/* ===== Step 1: Skeleton ===== */}
      <SectionCard
        step={1}
        title="生成故事骨架"
        subtitle="一句话故事 · 故事内核 · 隐线 · 主要人物 · 三幕结构 · 改编原则"
        right={
          skeleton && !skelRunning && (
            <button className="nc-btn nc-btn-ghost" onClick={() => { if (confirm("重新生成会覆盖现有骨架,确定?")) { clearSkeleton(project.id); setSkel(null); onRunSkeleton(); } }}>
              重新生成
            </button>
          )
        }
      >
        {chaptersWithEvents.length === 0 ? (
          <Empty hint="先到「小说」tab 抽取至少 1 章的事件" />
        ) : !skeleton && !skelRunning ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <button className="nc-btn nc-btn-primary" onClick={onRunSkeleton} disabled={!llmReady || skelRunning}>
              ▶ 运行 (基于 {chaptersWithEvents.length} 章 · {eventCount} 事件)
            </button>
            {skelError && <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c" }}>失败: {skelError}</div>}
          </div>
        ) : skelRunning ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
            <div style={{ marginBottom: 6, fontSize: 18 }}>⏳</div>
            正在生成故事骨架… (通常 15-40 秒)
          </div>
        ) : skeleton ? (
          <SkeletonView skeleton={skeleton} />
        ) : null}
      </SectionCard>

      {/* ===== Step 2: Episode plan ===== */}
      <SectionCard
        step={2}
        title="分集决策"
        subtitle="把事件分配到每一集 · 标注开场钩子 / 结尾留白 / 关键节拍"
        right={
          episodes.length > 0 && !planRunning && (
            <button className="nc-btn nc-btn-ghost" onClick={() => { if (confirm(`重新分集会覆盖现有 ${episodes.length} 集计划,确定?`)) { saveEpisodes(project.id, []); setEpisodesState([]); onRunPlan(); } }}>
              重新分集
            </button>
          )
        }
      >
        {!skeleton ? (
          <Empty hint="需先生成故事骨架" />
        ) : episodes.length === 0 && !planRunning ? (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 auto" }}>
                <label className="nc-label">本次规划集数</label>
                <input
                  type="number"
                  className="nc-input"
                  min={3}
                  max={Math.max(project.episodeCount, 100)}
                  value={episodeCount}
                  onChange={(e) => setEpisodeCount(Math.max(3, parseInt(e.target.value || "3", 10)))}
                  style={{ maxWidth: 200 }}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  建议 {suggestedEp} 集 (按事件总数 ÷ 2.5)。项目目标 {project.episodeCount} 集。
                </div>
              </div>
              <button className="nc-btn nc-btn-primary" onClick={onRunPlan} disabled={!llmReady || planRunning}>
                ▶ 运行分集决策
              </button>
            </div>
            {planError && <div style={{ fontSize: 12, color: "#b91c1c" }}>失败: {planError}</div>}
          </div>
        ) : planRunning ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
            <div style={{ marginBottom: 6, fontSize: 18 }}>⏳</div>
            正在做分集决策… (通常 30-90 秒,集数越多越慢)
          </div>
        ) : (
          <EpisodesGrid episodes={episodes} project={project} />
        )}
      </SectionCard>

      {episodes.length > 0 && (
        <div className="nc-callout" style={{ marginTop: 24 }}>
          <span className="nc-callout-kicker">下一步</span>
          <h4>分集就位 · 去「🎬 剧本」扩写每集</h4>
          <p>{episodes.length} 集已生成 blueprint (集名/梗概/钩子/节拍)。下一步可以在剧本 tab 让 AI 把每集扩写成完整对白脚本。</p>
          <button
            className="nc-btn nc-btn-primary"
            style={{ marginTop: 10 }}
            onClick={() => (window.location.hash = `/p/${project.id}/scripts`)}
          >
            前往剧本 →
          </button>
        </div>
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{hint}</div>;
}

function SectionCard({ step, title, subtitle, right, children }: {
  step: number; title: string; subtitle: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{
      border: "1px solid #ebe7df", borderRadius: 12, background: "#fff",
      marginBottom: 18, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f4f2ed" }}>
        <span style={{
          width: 28, height: 28, borderRadius: 999, background: "var(--nc-cyan)",
          color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700,
        }}>{step}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>
        </div>
        {right}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SkeletonView({ skeleton }: { skeleton: StorySkeleton }) {
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid #f4f2ed" }}>
      <div className="nc-label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-strong)" }}>{children}</div>
    </div>
  );
  return (
    <div>
      <Field label="一句话故事">
        <strong style={{ fontSize: 15 }}>{skeleton.oneLiner}</strong>
      </Field>
      <Field label="故事内核">{skeleton.storyCore}</Field>
      <Field label="隐线">{skeleton.hiddenPlot}</Field>
      <Field label={`主要人物 (${skeleton.characterCores.length})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {skeleton.characterCores.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span className="nc-pill" style={{ flexShrink: 0 }}>{c.role}</span>
              <div>
                <strong>{c.name}</strong>
                <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>{c.arc}</div>
              </div>
            </div>
          ))}
        </div>
      </Field>
      <Field label="三幕结构">
        {(["act1", "act2", "act3"] as const).map((k, i) => {
          const a = skeleton.threeActs[k];
          return (
            <div key={k} style={{ marginBottom: i < 2 ? 14 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className="nc-pill nc-pill-warm">第{["一", "二", "三"][i]}幕</span>
                <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{a.range}</span>
              </div>
              <div style={{ marginBottom: 6 }}>{a.summary}</div>
              <ul style={{ marginLeft: 18, color: "var(--text-muted)", fontSize: 12 }}>
                {a.keyBeats.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            </div>
          );
        })}
      </Field>
      <Field label="改编原则">
        <ul style={{ marginLeft: 18 }}>
          {skeleton.adaptationPrinciples.map((p, i) => <li key={i} style={{ marginBottom: 2 }}>{p}</li>)}
        </ul>
      </Field>
      <div style={{ padding: "10px 18px", fontSize: 11, color: "var(--text-faint)" }}>
        {new Date(skeleton.generatedAt).toLocaleString("zh-CN")} · {skeleton.model}
      </div>
    </div>
  );
}

function EpisodesGrid({ episodes, project }: { episodes: Episode[]; project: Project }) {
  return (
    <div style={{ padding: 16 }}>
      <div className="nc-grid">
        {episodes.map((ep) => {
          const bp = ep.blueprint;
          return (
            <div key={ep.id} className="nc-card" onClick={() => (window.location.hash = `/p/${project.id}/scripts`)}>
              <div className="nc-card-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="nc-pill" style={{ background: "var(--nc-cyan)", color: "#fff" }}>EP{String(ep.index).padStart(2, "0")}</span>
                  <div className="nc-card-title" style={{ fontSize: 14 }}>{ep.title}</div>
                </div>
              </div>
              {bp?.hookOpen && (
                <div style={{ fontSize: 11, color: "var(--nc-cyan-strong)", fontWeight: 500 }}>
                  ⚡ {bp.hookOpen}
                </div>
              )}
              {bp?.summary && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {bp.summary.slice(0, 120)}{bp.summary.length > 120 ? "…" : ""}
                </div>
              )}
              {bp?.hookEnd && (
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                  → {bp.hookEnd}
                </div>
              )}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                {bp?.beats?.slice(0, 2).map((b, i) => (
                  <span key={i} className="nc-pill nc-pill-gray" style={{ fontSize: 10 }}>
                    {b.length > 14 ? b.slice(0, 14) + "…" : b}
                  </span>
                ))}
                {bp?.beats && bp.beats.length > 2 && (
                  <span className="nc-pill nc-pill-gray" style={{ fontSize: 10 }}>+{bp.beats.length - 2}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
