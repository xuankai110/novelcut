import type { Project } from "../types";
import { listTasks } from "../store";

export function TasksTab({ project }: { project: Project }) {
  const tasks = listTasks(project.id);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <h2 className="nc-page-title" style={{ fontSize: 20 }}>任务中心</h2>
          <div className="nc-page-sub">所有 AI 调用 (出图、出视频、抽事件、生成剧本) 都在这里留痕。</div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="nc-empty">
          <h3>还没有任务</h3>
          <p>导入小说、生成资产、出图出视频时这里会按时间倒序记录每一次模型调用 —— 含模型、提示词、状态和耗时。</p>
        </div>
      ) : (
        <table className="nc-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>描述</th>
              <th style={{ width: 130 }}>模型</th>
              <th style={{ width: 90 }}>状态</th>
              <th style={{ width: 170 }}>时间</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td><code style={{ fontSize: 12 }}>{t.kind}</code></td>
                <td>{t.description}</td>
                <td>{t.model || "—"}</td>
                <td>
                  {t.status === "queued" && <span className="nc-pill nc-pill-gray">排队中</span>}
                  {t.status === "running" && <span className="nc-pill nc-pill-warm">运行中</span>}
                  {t.status === "done" && <span className="nc-pill nc-pill-green">已完成</span>}
                  {t.status === "error" && <span className="nc-pill" style={{ background: "#fee2e2", color: "#b91c1c" }}>失败</span>}
                </td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(t.createdAt).toLocaleString("zh-CN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
