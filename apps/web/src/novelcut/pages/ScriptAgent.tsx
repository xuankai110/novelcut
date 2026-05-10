import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, StorySkeleton, Episode } from "../types";
import {
  listChapters, getSkeleton, saveSkeleton, clearSkeleton,
  listEpisodes, setEpisodes as saveEpisodes, appendTask, genId,
} from "../store";
import { loadLLMConfig, LLMError } from "../llm";
import { runSkeleton, runEpisodePlan, buildProvenance } from "../agent/runner";
import { checkSkeletonStaleness, coverageLabel } from "../agent/staleness";
import { SettingsDialog } from "../SettingsDialog";

export function ScriptAgentTab({ project }: { project: Project }) {
  const [chapters, setChapters] = useState(() => listChapters(project.id));
  const [skeleton, setSkel] = useState<StorySkeleton | null>(() => getSkeleton(project.id));
  const [episodes, setEpisodesState] = useState<Episode[]>(() => listEpisodes(project.id));
  const [showSettings, setShowSettings] = useState(false);
  const [skelRunning, setSkelRunning] = useState(false);
  const [planRunning, setPlanRunning] = useState(false);
  const [planProgress, setPlanProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [skelError, setSkelError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const planAbortRef = useRef<AbortController | null>(null);

  const llm = loadLLMConfig();
  const llmReady = !!llm?.apiKey;

  const eventCount = chapters.reduce((s, c) => s + (c.eventCount ?? 0), 0);
  const chaptersWithEvents = chapters.filter(c => c.eventsStatus === "done");
  const currentProvenance = useMemo(() => buildProvenance(project, chapters), [chapters, project]);
  const currentCoverage = currentProvenance.coverage;
  const stale = useMemo(() => checkSkeletonStaleness(skeleton, chapters), [skeleton, chapters]);
  const skeletonCov = coverageLabel(skeleton?.basedOn?.coverage);

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
      description: `生成故事骨架 (基于 ${chaptersWithEvents.length} 章 / ${currentProvenance.wordCount.toLocaleString()} 字)`,
      status: "running", createdAt: Date.now(),
    });
    try {
      const { skeleton } = await runSkeleton(llm, project, chapters);
      saveSkeleton(project.id, skeleton);
      setSkel(skeleton);
      appendTask({
        id: taskId + "_done", projectId: project.id, kind: "agent.skeleton", model: llm.model,
        description: `骨架就绪 · ${skeleton.characterCores.length} 个主要人物 · 覆盖率 ${Math.round((skeleton.basedOn?.coverage ?? 0) * 100)}%`,
        status: "done", createdAt: Date.now(), finishedAt: Date.now(),
      });
    } catch (e) {
      const msg = formatErr(e);
      setSkelError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "agent.skeleton", model: llm.model,
        description: `骨架生成失败: ${msg}`, status: "error",
        createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
    } finally { setSkelRunning(false); }
  };

  const handleRegenSkeleton = () => {
    const hasEpisodes = episodes.length > 0;
    let msg = "重新生成会覆盖现有骨架。";
    if (hasEpisodes) msg += `\n现有 ${episodes.length} 集 blueprint 与新骨架可能不一致,建议同时重新分集。`;
    msg += "\n\n继续?";
    if (!confirm(msg)) return;
    clearSkeleton(project.id);
    setSkel(null);
    onRunSkeleton();
  };

  const onRunPlan = async () => {
    if (!llm || !skeleton) return;
    setPlanError(null);
    setPlanRunning(true);
    setPlanProgress({ done: 0, total: episodeCount, label: "准备中…" });
    const taskId = genId("task");
    const ac = new AbortController();
    planAbortRef.current = ac;
    appendTask({
      id: taskId, projectId: project.id, kind: "agent.episode-plan", model: llm.model,
      description: `分集决策 · 规划 ${episodeCount} 集`, status: "running", createdAt: Date.now(),
    });
    try {
      const { blueprints } = await runEpisodePlan(
        llm, project, chapters, skeleton, episodeCount,
        {
          chunkSize: 5,
          signal: ac.signal,
          onChunk: (p) => setPlanProgress({ done: p.done, total: p.total, label: p.chunkLabel }),
        },
      );
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
      const msg = formatErr(e);
      setPlanError(msg);
      appendTask({
        id: taskId + "_err", projectId: project.id, kind: "agent.episode-plan", model: llm.model,
        description: `分集失败: ${msg}`, status: "error",
        createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
      });
    } finally {
      setPlanRunning(false);
      setPlanProgress(null);
      planAbortRef.current = null;
    }
  };

  const onCancelPlan = () => { planAbortRef.current?.abort(); };

  return (
    <>
      <div className="nc-callout">
        <span className="nc-callout-kicker">三层 Agent · 决策 / 执行 / 监督</span>
        <h4>编剧 Agent —— 从事件图谱到分集决策</h4>
        <p>两步走:先让 AI 提炼故事骨架,再基于骨架做分集决策表 (每集梗概/钩子/复用事件)。</p>
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
          📌 骨架不会锁死:你随时可以追加章节后重新生成。多于 5 集会自动分批生成,失败可单独重试。
        </p>
      </div>

      {!llmReady && (
        <div className="nc-callout" style={{ marginBottom: 16 }}>
          <span className="nc-callout-kicker">需要先配置大模型</span>
          <h4>编剧 Agent 全程由 LLM 驱动</h4>
          <button className="nc-btn nc-btn-primary" style={{ marginTop: 8 }} onClick={() => setShowSettings(true)}>⚙ 现在去配置</button>
        </div>
      )}

      {skeleton && stale.stale && (
        <div className="nc-callout" style={{
          marginBottom: 16,
          background: "linear-gradient(135deg, #fef3c7 0%, #fff 80%)",
          borderColor: "#fcd34d",
        }}>
          <span className="nc-callout-kicker" style={{ color: "#92400e", background: "#fff" }}>⚠ 骨架可能已过时</span>
          <h4>原料发生变化 · {stale.reason}</h4>
          <p>
            当前骨架基于 {skeleton.basedOn?.chapterCount ?? "?"} 章 · {skeleton.basedOn?.wordCount.toLocaleString() ?? "?"} 字生成
            ({new Date(skeleton.generatedAt).toLocaleString("zh-CN")})。
            现在已是 {chaptersWithEvents.length} 章 · {currentProvenance.wordCount.toLocaleString()} 字。
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="nc-btn nc-btn-primary" onClick={handleRegenSkeleton} disabled={!llmReady || skelRunning}>
              重新生成骨架
            </button>
          </div>
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
          <div className="nc-stat-label">原料覆盖率</div>
          <div className="nc-stat-value" style={{
            fontSize: 17,
            color: currentCoverage < 0.6 ? "#f59e0b" : currentCoverage < 1.0 ? "var(--nc-green)" : "var(--nc-cyan-strong)",
          }}>
            {Math.round(currentCoverage * 100)}%
          </div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">已规划集数</div>
          <div className="nc-stat-value">{episodes.length}/{project.episodeCount}</div>
        </div>
      </div>

      {/* Step 1 */}
      <SectionCard
        step={1}
        title="生成故事骨架"
        subtitle="一句话故事 · 故事内核 · 隐线 · 主要人物 · 三幕结构 · 改编原则"
        right={
          skeleton && !skelRunning && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="nc-pill" style={{ background: skeletonCov.color + "22", color: skeletonCov.color }}>
                {skeletonCov.label}
              </span>
              <button className="nc-btn nc-btn-ghost" onClick={handleRegenSkeleton}>重新生成</button>
            </div>
          )
        }
      >
        {chaptersWithEvents.length === 0 ? (
          <Empty hint="先到「小说」tab 抽取至少 1 章的事件" />
        ) : !skeleton && !skelRunning ? (
          <SkeletonPreflight
            coverage={currentCoverage} wordCount={currentProvenance.wordCount}
            targetWords={project.episodeCount * 1500}
            chaptersWithEvents={chaptersWithEvents.length} eventCount={eventCount}
            llmReady={llmReady} onRun={onRunSkeleton}
            onGoImport={() => (window.location.hash = `/p/${project.id}/novel`)}
            error={skelError}
          />
        ) : skelRunning ? (
          <RunningState label="正在生成故事骨架… (通常 15-40 秒)" />
        ) : skeleton ? (
          <SkeletonView skeleton={skeleton} />
        ) : null}
      </SectionCard>

      {/* Step 2 */}
      <SectionCard
        step={2}
        title="分集决策"
        subtitle="把事件分配到每一集 · 标注开场钩子 / 结尾留白 / 关键节拍 · 每 5 集一批,逐批生成"
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
            {stale.stale && (
              <div style={{
                padding: "10px 14px", marginBottom: 14, borderRadius: 8,
                background: "#fef3c7", border: "1px solid #fcd34d",
                fontSize: 12, color: "#92400e",
              }}>
                ⚠ 骨架基于较少原料生成 · 建议先重新生成骨架,再分集,效果更好
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 auto" }}>
                <label className="nc-label">本次规划集数</label>
                <input
                  type="number" className="nc-input" min={3}
                  max={Math.max(project.episodeCount, 100)}
                  value={episodeCount}
                  onChange={(e) => setEpisodeCount(Math.max(3, parseInt(e.target.value || "3", 10)))}
                  style={{ maxWidth: 200 }}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  建议 {suggestedEp} 集 (按事件总数 ÷ 2.5)。项目目标 {project.episodeCount} 集。每 5 集一批。
                </div>
              </div>
              <button className="nc-btn nc-btn-primary" onClick={onRunPlan} disabled={!llmReady}>
                ▶ 运行分集决策
              </button>
            </div>
            {planError && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "#fee2e2", border: "1px solid #fecaca",
                fontSize: 12, color: "#b91c1c",
              }}>
                <strong>失败:</strong> {planError}
                <div style={{ marginTop: 4, color: "#991b1b" }}>
                  排查方向:① 减少集数后再试 ② 换更快的模型 (DeepSeek 慢时改 deepseek-v3 或 OpenAI gpt-4o-mini) ③ 检查 API Key 配额
                </div>
              </div>
            )}
          </div>
        ) : planRunning ? (
          <PlanProgress progress={planProgress} onCancel={onCancelPlan} />
        ) : (
          <EpisodesGrid episodes={episodes} project={project} />
        )}
      </SectionCard>

      {episodes.length > 0 && (
        <div className="nc-callout" style={{ marginTop: 24 }}>
          <span className="nc-callout-kicker">下一步</span>
          <h4>分集就位 · 去「🎬 剧本」扩写每集</h4>
          <p>{episodes.length} 集已生成 blueprint。下一步可以在剧本 tab 让 AI 把每集扩写成完整对白脚本。</p>
          <button
            className="nc-btn nc-btn-primary" style={{ marginTop: 10 }}
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

function formatErr(e: unknown): string {
  if (e instanceof LLMError) return `[${e.status}] ${e.message}`;
  return String((e as Error)?.message ?? e);
}

function PlanProgress({ progress, onCancel }: { progress: { done: number; total: number; label: string } | null; onCancel: () => void }) {
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
        <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>
          ⏳ {progress?.label ?? "运行中…"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {progress ? `${progress.done}/${progress.total} 集 · ${pct}%` : ""}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "#ebe7df", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--nc-cyan)", transition: "width 0.3s" }} />
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        每批 5 集左右、一批 30-60 秒。整体可能要数分钟。失败时只会丢掉当前批次,前面已生成的不会消失。
      </div>
      <div style={{ marginTop: 14, textAlign: "right" }}>
        <button className="nc-btn nc-btn-danger" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function SkeletonPreflight({
  coverage, wordCount, targetWords, chaptersWithEvents, eventCount,
  llmReady, onRun, onGoImport, error,
}: {
  coverage: number; wordCount: number; targetWords: number;
  chaptersWithEvents: number; eventCount: number;
  llmReady: boolean; onRun: () => void; onGoImport: () => void; error: string | null;
}) {
  const cov = coverageLabel(coverage);
  const isLow = coverage < 0.6;
  const remain = Math.max(0, targetWords - wordCount);
  return (
    <div style={{ padding: 18 }}>
      {isLow && (
        <div style={{
          background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10,
          padding: "12px 16px", marginBottom: 16,
        }}>
          <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 4, fontSize: 13 }}>
            ⚠ 当前原料覆盖率仅 {Math.round(coverage * 100)}% (推荐 ≥ 60%)
          </div>
          <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.7 }}>
            基于不足的原料生成骨架可能:三幕分布不准 / 主要人物可能遗漏 / 改编原则只能基于已知部分。
            <br />
            建议:<strong>先补足材料再生成最终骨架</strong> (推荐) ,
            或者<strong>先跑一版草稿骨架试试结构</strong> ,
            后续追加章节后再「重新生成」(骨架不会锁死,可随时重新生成)。
          </div>
          <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>
            还需 ~<strong>{remain.toLocaleString()}</strong> 字达到推荐覆盖率
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="nc-btn nc-btn-primary" onClick={onRun} disabled={!llmReady}>
          ▶ {isLow ? "先跑一版草稿骨架" : "运行"} (基于 {chaptersWithEvents} 章 · {eventCount} 事件)
        </button>
        {isLow && (
          <button className="nc-btn nc-btn-ghost" onClick={onGoImport}>
            去「小说」补充材料 →
          </button>
        )}
        <span className="nc-pill" style={{ background: cov.color + "22", color: cov.color, marginLeft: "auto" }}>
          {cov.label}
        </span>
      </div>
      {error && <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c" }}>失败: {error}</div>}
    </div>
  );
}

function RunningState({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
      <div style={{ marginBottom: 6, fontSize: 18 }}>⏳</div>
      {label}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{hint}</div>;
}

function SectionCard({ step, title, subtitle, right, children }: {
  step: number; title: string; subtitle: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid #ebe7df", borderRadius: 12, background: "#fff", marginBottom: 18, overflow: "hidden" }}>
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
  const cov = coverageLabel(skeleton.basedOn?.coverage);
  return (
    <div>
      {skeleton.basedOn && (
        <div style={{
          padding: "10px 18px", background: cov.color + "10", fontSize: 12,
          color: "var(--text-muted)", borderBottom: "1px solid #f4f2ed",
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ color: cov.color, fontWeight: 600 }}>{cov.label}</span>
          <span>·</span>
          <span>基于 {skeleton.basedOn.chapterCount} 章 / {skeleton.basedOn.wordCount.toLocaleString()} 字 / {skeleton.basedOn.eventCount} 事件</span>
          <span>·</span>
          <span>目标 {skeleton.basedOn.targetEpisodes} 集</span>
        </div>
      )}
      <Field label="一句话故事"><strong style={{ fontSize: 15 }}>{skeleton.oneLiner}</strong></Field>
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
              {bp?.hookOpen && <div style={{ fontSize: 11, color: "var(--nc-cyan-strong)", fontWeight: 500 }}>⚡ {bp.hookOpen}</div>}
              {bp?.summary && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {bp.summary.slice(0, 120)}{bp.summary.length > 120 ? "…" : ""}
                </div>
              )}
              {bp?.hookEnd && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>→ {bp.hookEnd}</div>}
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
