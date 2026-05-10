import { useState, useRef, useEffect } from "react";
import type { Project, Chapter, ChapterEvent } from "../types";
import { genId, listChapters, setChapters, splitChapters, appendTask } from "../store";
import { loadLLMConfig, chat, extractJson, LLMError } from "../llm";
import { SettingsDialog } from "../SettingsDialog";

const EXTRACT_SYSTEM = `你是一个短剧编剧助理,擅长从中文小说章节中抽取结构化"故事事件"。
要求:
- 每个事件包含 summary (一句话), characters (人物名数组), locations (地点数组), beat (该事件在本章中的叙事节拍位置 1-10 整数,1=章首,10=章尾), excerpt (原文相关短句 20-60 字)
- 一章通常抽取 3-7 个关键事件,别太碎也别太粗
- 严格返回 JSON 格式: {"events": [...]} ,不要 markdown 代码块、不要任何解释文字
- 人物名和地点用原文出现的称呼,简洁准确`;

const buildExtractMessages = (chapter: Pick<Chapter, "title" | "body">) => [
  { role: "system" as const, content: EXTRACT_SYSTEM },
  { role: "user" as const, content: `章节标题: ${chapter.title}\n\n章节原文:\n"""\n${chapter.body.slice(0, 8000)}\n"""` },
];

export function NovelTab({ project }: { project: Project }) {
  const [chapters, setChaptersState] = useState(() => listChapters(project.id));
  const [active, setActive] = useState(false);
  const [pasting, setPasting] = useState("");
  const [extractRunning, setExtractRunning] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const llm = loadLLMConfig();
  const llmReady = !!llm?.apiKey && !!llm?.baseUrl && !!llm?.model;

  // re-read on settings dialog close
  useEffect(() => {
    if (!showSettings) {
      setChaptersState(listChapters(project.id));
    }
  }, [showSettings, project.id]);

  const ingest = (raw: string, source: string) => {
    const parts = splitChapters(raw);
    const next: Chapter[] = parts.map((c, i) => ({
      id: genId("ch"),
      projectId: project.id,
      index: i + 1,
      title: c.title,
      body: c.body,
      eventsStatus: "idle",
    }));
    setChapters(project.id, next);
    setChaptersState(next);
    appendTask({
      id: genId("task"), projectId: project.id, kind: "novel.import",
      description: `从 ${source} 导入,解析得 ${next.length} 章`, status: "done",
      createdAt: Date.now(), finishedAt: Date.now(),
    });
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result || ""), file.name);
    reader.readAsText(file, "utf-8");
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setActive(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const persist = (next: Chapter[]) => {
    setChapters(project.id, next);
    setChaptersState(next);
  };

  const extractAll = async () => {
    if (!llm) { setShowSettings(true); return; }
    cancelRef.current = false;
    setExtractRunning(true);
    setExtractProgress({ done: 0, total: chapters.length });
    let working = [...chapters];

    for (let i = 0; i < working.length; i++) {
      if (cancelRef.current) break;
      const ch = working[i];
      // mark running
      working = working.map((c) => c.id === ch.id ? { ...c, eventsStatus: "running" as const } : c);
      persist(working);

      const taskId = genId("task");
      appendTask({
        id: taskId, projectId: project.id, kind: "agent.event-extract",
        model: llm.model,
        description: `抽取「${ch.title}」事件`, status: "running",
        createdAt: Date.now(),
      });

      try {
        const resp = await chat(llm, {
          messages: buildExtractMessages(ch),
          temperature: 0.2,
          json: true,
        });
        const parsed = extractJson<{ events?: ChapterEvent[] } | ChapterEvent[]>(resp.content);
        const events: ChapterEvent[] = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
        const cleaned = events.filter((e) => e && e.summary).map((e) => ({
          summary: String(e.summary),
          characters: Array.isArray(e.characters) ? e.characters.map(String) : [],
          locations: Array.isArray(e.locations) ? e.locations.map(String) : [],
          beat: Number.isFinite(e.beat) ? Math.max(1, Math.min(10, Math.round(Number(e.beat)))) : 5,
          excerpt: String(e.excerpt ?? ""),
        }));
        working = working.map((c) => c.id === ch.id ? {
          ...c, eventsStatus: "done" as const, eventCount: cleaned.length, events: cleaned,
        } : c);
        persist(working);

        appendTask({
          id: taskId + "_done", projectId: project.id, kind: "agent.event-extract",
          model: llm.model,
          description: `抽取「${ch.title}」: ${cleaned.length} 事件`, status: "done",
          createdAt: Date.now(), finishedAt: Date.now(),
        });
      } catch (e) {
        const msg = e instanceof LLMError ? `[${e.status}] ${e.message}` : String((e as Error).message ?? e);
        working = working.map((c) => c.id === ch.id ? {
          ...c, eventsStatus: "error" as const, errorMessage: msg,
        } : c);
        persist(working);
        appendTask({
          id: taskId + "_err", projectId: project.id, kind: "agent.event-extract",
          model: llm.model,
          description: `抽取「${ch.title}」失败: ${msg}`, status: "error",
          createdAt: Date.now(), finishedAt: Date.now(), errorMessage: msg,
        });
      }
      setExtractProgress({ done: i + 1, total: working.length });
    }

    setExtractRunning(false);
    setExtractProgress(null);
  };

  const cancelExtract = () => { cancelRef.current = true; };

  const wordCount = chapters.reduce((s, c) => s + c.body.length, 0);
  const doneCount = chapters.filter(c => c.eventsStatus === "done").length;
  const totalEvents = chapters.reduce((s, c) => s + (c.eventCount ?? 0), 0);

  return (
    <>
      {!llmReady && chapters.length > 0 && (
        <div className="nc-callout" style={{ marginBottom: 16 }}>
          <span className="nc-callout-kicker">需要先配置大模型</span>
          <h4>抽取事件、生成剧本都要用到 LLM</h4>
          <p>点右上「设置」选好供应商、填 API Key、保存。OpenAI 兼容协议都行。</p>
          <button className="nc-btn nc-btn-primary" style={{ marginTop: 8 }} onClick={() => setShowSettings(true)}>
            ⚙ 现在去配置
          </button>
        </div>
      )}

      <div className="nc-stats">
        <div className="nc-stat">
          <div className="nc-stat-label">章节数</div>
          <div className="nc-stat-value">{chapters.length}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">字数</div>
          <div className="nc-stat-value">{wordCount.toLocaleString()}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">已抽事件</div>
          <div className="nc-stat-value">{doneCount}/{chapters.length}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">事件总数</div>
          <div className="nc-stat-value">{totalEvents}</div>
        </div>
      </div>

      {chapters.length === 0 ? (
        <>
          <div
            className="nc-drop"
            data-active={active}
            onDragOver={(e) => { e.preventDefault(); setActive(true); }}
            onDragLeave={() => setActive(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📕</div>
            <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>拖放小说原文到这里 或 点击上传</div>
            <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-muted)" }}>支持 .txt / .docx · 自动按章节切分</div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.docx,.md"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </div>

          <div className="nc-section-title">或者直接粘贴文本</div>
          <textarea
            className="nc-textarea"
            placeholder="把你的小说原文贴到这里 — 支持「第一章」「Chapter 1」等常见章节标记"
            value={pasting}
            onChange={(e) => setPasting(e.target.value)}
            style={{ minHeight: 200 }}
          />
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="nc-btn nc-btn-primary"
              disabled={!pasting.trim()}
              onClick={() => { ingest(pasting, "粘贴文本"); setPasting(""); }}
            >
              解析并导入
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="nc-section-title" style={{ margin: 0 }}>章节列表</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="nc-btn nc-btn-ghost"
                disabled={extractRunning}
                onClick={() => { if (confirm("清空所有章节,重新导入?")) { setChapters(project.id, []); setChaptersState([]); } }}
              >
                清空重导
              </button>
              {extractRunning ? (
                <button className="nc-btn nc-btn-danger" onClick={cancelExtract}>
                  ✕ 取消 ({extractProgress?.done}/{extractProgress?.total})
                </button>
              ) : (
                <button className="nc-btn nc-btn-primary" onClick={extractAll} disabled={chapters.length === 0}>
                  ⚡ 批量抽取事件
                </button>
              )}
            </div>
          </div>
          <table className="nc-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>#</th>
                <th>标题</th>
                <th>预览</th>
                <th style={{ width: 92 }}>字数</th>
                <th style={{ width: 130 }}>事件状态</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((c) => (
                <ChapterRow
                  key={c.id}
                  chapter={c}
                  expanded={!!expanded[c.id]}
                  onToggle={() => setExpanded((m) => ({ ...m, [c.id]: !m[c.id] }))}
                />
              ))}
            </tbody>
          </table>
        </>
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}

function ChapterRow({
  chapter, expanded, onToggle,
}: {
  chapter: Chapter;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = chapter.eventsStatus === "done" || chapter.eventsStatus === "error";
  return (
    <>
      <tr style={{ cursor: canExpand ? "pointer" : "default" }} onClick={canExpand ? onToggle : undefined}>
        <td>{chapter.index}</td>
        <td style={{ fontWeight: 500 }}>
          {canExpand && <span style={{ marginRight: 6, color: "var(--text-faint)" }}>{expanded ? "▾" : "▸"}</span>}
          {chapter.title}
        </td>
        <td style={{ color: "var(--text-muted)", maxWidth: 480 }}>
          {chapter.body.replace(/\s+/g, " ").slice(0, 90)}…
        </td>
        <td>{chapter.body.length.toLocaleString()}</td>
        <td>
          {chapter.eventsStatus === "idle" && <span className="nc-pill nc-pill-gray">待抽取</span>}
          {chapter.eventsStatus === "running" && <span className="nc-pill nc-pill-warm">抽取中…</span>}
          {chapter.eventsStatus === "done" && <span className="nc-pill nc-pill-green">✓ {chapter.eventCount} 事件</span>}
          {chapter.eventsStatus === "error" && <span className="nc-pill" style={{ background: "#fee2e2", color: "#b91c1c" }}>✗ 失败</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ background: "#fffefb", padding: "16px 24px" }}>
            {chapter.eventsStatus === "done" && chapter.events && chapter.events.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {chapter.events.map((e, idx) => (
                  <div key={idx} style={{
                    background: "#fff", border: "1px solid #ebe7df", borderRadius: 8, padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className="nc-pill nc-pill-gray" style={{ fontSize: 10 }}>beat {e.beat}</span>
                      <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{e.summary}</span>
                    </div>
                    {(e.characters.length > 0 || e.locations.length > 0) && (
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                        {e.characters.length > 0 && <span>👤 {e.characters.join("、")}</span>}
                        {e.locations.length > 0 && <span>📍 {e.locations.join("、")}</span>}
                      </div>
                    )}
                    {e.excerpt && (
                      <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", borderLeft: "2px solid var(--nc-cyan-soft)", paddingLeft: 8 }}>
                        "{e.excerpt}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : chapter.eventsStatus === "error" ? (
              <div style={{ color: "#b91c1c", fontSize: 13 }}>
                抽取失败: <code>{chapter.errorMessage}</code>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)" }}>无事件</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
