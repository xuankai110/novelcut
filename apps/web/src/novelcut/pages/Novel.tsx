import { useState, useRef } from "react";
import type { Project } from "../types";
import { genId, listChapters, setChapters, splitChapters, appendTask } from "../store";

export function NovelTab({ project }: { project: Project }) {
  const [chapters, setChaptersState] = useState(() => listChapters(project.id));
  const [active, setActive] = useState(false);
  const [pasting, setPasting] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = (raw: string, source: string) => {
    const parts = splitChapters(raw);
    const next = parts.map((c, i) => ({
      id: genId("ch"),
      projectId: project.id,
      index: i + 1,
      title: c.title,
      body: c.body,
      eventsStatus: "idle" as const,
    }));
    setChapters(project.id, next);
    setChaptersState(next);
    appendTask({
      id: genId("task"),
      projectId: project.id,
      kind: "novel.import",
      description: `从 ${source} 导入,解析得 ${next.length} 章`,
      status: "done",
      createdAt: Date.now(),
      finishedAt: Date.now(),
    });
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || "");
      ingest(txt, file.name);
    };
    reader.readAsText(file, "utf-8");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setActive(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const wordCount = chapters.reduce((s, c) => s + c.body.length, 0);

  return (
    <>
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
          <div className="nc-stat-value">{chapters.filter(c => c.eventsStatus === "done").length}</div>
        </div>
        <div className="nc-stat">
          <div className="nc-stat-label">语言</div>
          <div className="nc-stat-value" style={{ fontSize: 17 }}>{project.language}</div>
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
                onClick={() => { if (confirm("清空所有章节,重新导入?")) { setChapters(project.id, []); setChaptersState([]); } }}
              >
                清空重导
              </button>
              <button
                className="nc-btn nc-btn-primary"
                onClick={() => alert("事件抽取流程在下一阶段接入,目前先把章节准备好。")}
              >
                ⚡ 批量抽取事件
              </button>
            </div>
          </div>
          <table className="nc-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>#</th>
                <th>标题</th>
                <th>预览</th>
                <th style={{ width: 92 }}>字数</th>
                <th style={{ width: 110 }}>事件状态</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((c) => (
                <tr key={c.id}>
                  <td>{c.index}</td>
                  <td style={{ fontWeight: 500 }}>{c.title}</td>
                  <td style={{ color: "var(--text-muted)", maxWidth: 480 }}>
                    {c.body.replace(/\s+/g, " ").slice(0, 90)}…
                  </td>
                  <td>{c.body.length.toLocaleString()}</td>
                  <td>
                    {c.eventsStatus === "idle" && <span className="nc-pill nc-pill-gray">待抽取</span>}
                    {c.eventsStatus === "running" && <span className="nc-pill nc-pill-warm">抽取中</span>}
                    {c.eventsStatus === "done" && <span className="nc-pill nc-pill-green">{c.eventCount} 事件</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
