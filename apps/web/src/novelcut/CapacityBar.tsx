import type { Project } from "./types";

export function CapacityBar({
  project,
  wordCount,
  onAddMore,
}: {
  project: Project;
  wordCount: number;
  onAddMore: () => void;
}) {
  const target = project.episodeCount * 1500;
  const pct = Math.min(100, Math.round((wordCount / target) * 100));
  const remaining = Math.max(0, target - wordCount);
  const status: "low" | "ok" | "abundant" =
    wordCount < target * 0.5 ? "low" : wordCount < target * 1.2 ? "ok" : "abundant";

  const statusColor = status === "low" ? "#f59e0b" : status === "ok" ? "var(--nc-green)" : "var(--nc-cyan)";
  const statusLabel = status === "low" ? "原料不足" : status === "ok" ? "够用" : "充足";
  const targetMin = Math.round((project.episodeCount * 30) / 60);

  return (
    <div className="nc-capacity">
      <div className="nc-capacity-head">
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>
            目标 · {project.episodeCount} 集 × ~30 秒 ≈ {targetMin} 分钟成片
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            按经验值 ~1,500 字源材料 / 集 估算,推荐至少 {target.toLocaleString()} 字
          </div>
        </div>
        <span className="nc-pill" style={{ background: statusColor + "22", color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      <div className="nc-capacity-bar">
        <div
          className="nc-capacity-fill"
          style={{ width: `${pct}%`, background: statusColor }}
        />
      </div>

      <div className="nc-capacity-foot">
        <span>
          已导入 <strong>{wordCount.toLocaleString()}</strong> 字 · 进度 <strong>{pct}%</strong>
        </span>
        {remaining > 0 ? (
          <span style={{ color: "var(--text-muted)" }}>
            建议再加 <strong style={{ color: statusColor }}>{remaining.toLocaleString()}</strong> 字
          </span>
        ) : (
          <span style={{ color: statusColor }}>原料充足,可以推进下一阶段</span>
        )}
        <button className="nc-btn nc-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={onAddMore}>
          + 继续导入
        </button>
      </div>
    </div>
  );
}
