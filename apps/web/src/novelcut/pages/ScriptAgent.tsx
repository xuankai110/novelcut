import type { Project } from "../types";
import { listChapters } from "../store";

export function ScriptAgentTab({ project }: { project: Project }) {
  const chapters = listChapters(project.id);
  const ready = chapters.length > 0;

  return (
    <>
      <div className="nc-callout">
        <span className="nc-callout-kicker">三层 Agent · 决策 / 执行 / 监督</span>
        <h4>编剧 Agent —— 从事件图谱到分集决策</h4>
        <p>
          编剧 Agent 读取「小说」tab 抽出的事件图谱,产出故事骨架(一句话 + 故事内核 + 隐线 + 三幕结构 + 人物核),
          再按你设定的题材/平台/集数/风格做分集决策表。监督层会评估每集 hook、留白、情绪曲线后给修订意见。
        </p>
      </div>

      <div className="nc-section-title">运行前置条件</div>
      <div className="nc-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Step done={ready} label="导入小说原文" hint={ready ? `${chapters.length} 章已导入` : "先到「小说」tab 上传"} />
        <Step done={false} label="抽取章节事件" hint="批量抽取后形成事件图谱" />
        <Step done={false} label="选择参考剧脚本" hint="可选 · 加载竞品分集结构作为风格参考" />
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
        <button className="nc-btn nc-btn-primary" disabled={!ready} onClick={() => alert("运行编剧 Agent —— vertical slice 下一步落地")}>
          ▶ 运行编剧 Agent
        </button>
      </div>

      <div className="nc-section-title">输出预览</div>
      <div className="nc-empty" style={{ padding: 32 }}>
        <p style={{ marginBottom: 0 }}>
          运行后这里会出现:故事骨架卡片、三幕结构时间轴、分集决策表 (改编原则 / 主要剧情决策 / 节拍)、
          以及监督层修订意见。
        </p>
      </div>
    </>
  );
}

function Step({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <div className="nc-card" style={{ cursor: "default" }}>
      <div className="nc-card-row">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 999,
            background: done ? "var(--nc-green)" : "#e5e1d8",
            color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700,
          }}>
            {done ? "✓" : ""}
          </span>
          <span style={{ fontWeight: 600 }}>{label}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{hint}</div>
    </div>
  );
}
