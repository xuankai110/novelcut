import { useEffect, useMemo, useState } from "react";
import type { Project } from "../types";
import { listChapters } from "../store";

/* xyflow lazily imported to avoid SSR. We dynamically import on the client. */
type FlowDeps = typeof import("@xyflow/react");

export function StoryboardTab({ project }: { project: Project }) {
  const chapters = useMemo(() => listChapters(project.id), [project.id]);
  const [Flow, setFlow] = useState<FlowDeps | null>(null);

  useEffect(() => {
    let alive = true;
    import("@xyflow/react").then((mod) => {
      if (alive) setFlow(mod);
      // also load CSS => {});
    });
    return () => { alive = false; };
  }, []);

  if (!Flow) {
    return (
      <div className="nc-canvas-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        正在加载画布…
      </div>
    );
  }

  const { ReactFlow, Background, Controls, MiniMap } = Flow;

  // Build a starter graph: chapter -> episode -> shot (3 shots per episode)
  const nodes: any[] = [];
  const edges: any[] = [];
  if (chapters.length === 0) {
    // Synthetic demo nodes to give visual life even before data exists
    nodes.push(
      { id: "s_chapter", position: { x: 40, y: 80 }, data: { label: "📕 章节(示例)" }, style: stylize("chapter") },
      { id: "s_event_1", position: { x: 280, y: 20 }, data: { label: "🌟 事件 #1" }, style: stylize("event") },
      { id: "s_event_2", position: { x: 280, y: 140 }, data: { label: "🌟 事件 #2" }, style: stylize("event") },
      { id: "s_episode", position: { x: 540, y: 80 }, data: { label: "🎬 EP01" }, style: stylize("episode") },
      { id: "s_shot_1", position: { x: 800, y: 0 }, data: { label: "📺 Shot 1" }, style: stylize("shot") },
      { id: "s_shot_2", position: { x: 800, y: 90 }, data: { label: "📺 Shot 2" }, style: stylize("shot") },
      { id: "s_shot_3", position: { x: 800, y: 180 }, data: { label: "📺 Shot 3" }, style: stylize("shot") },
      { id: "s_char", position: { x: 540, y: 240 }, data: { label: "🧑 角色 · 苏晚" }, style: stylize("asset") },
    );
    edges.push(
      e("s_chapter", "s_event_1"), e("s_chapter", "s_event_2"),
      e("s_event_1", "s_episode"), e("s_event_2", "s_episode"),
      e("s_episode", "s_shot_1"), e("s_episode", "s_shot_2"), e("s_episode", "s_shot_3"),
      e("s_char", "s_shot_1", "references"), e("s_char", "s_shot_2", "references"),
    );
  } else {
    chapters.slice(0, 6).forEach((c, i) => {
      const id = `c_${c.id}`;
      nodes.push({ id, position: { x: 40, y: i * 110 }, data: { label: `📕 ${c.title.slice(0, 18)}` }, style: stylize("chapter") });
      const epId = `ep_${c.id}`;
      nodes.push({ id: epId, position: { x: 360, y: i * 110 }, data: { label: `🎬 EP${String(i + 1).padStart(2, "0")}` }, style: stylize("episode") });
      edges.push(e(id, epId));
      for (let s = 0; s < 3; s++) {
        const shotId = `sh_${c.id}_${s}`;
        nodes.push({ id: shotId, position: { x: 660 + s * 200, y: i * 110 }, data: { label: `📺 #${s + 1}` }, style: stylize("shot") });
        edges.push(e(epId, shotId));
      }
    });
  }

  return (
    <div className="nc-canvas-shell">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background gap={16} color="#ebe7df" />
        <Controls position="bottom-right" />
        <MiniMap pannable zoomable nodeColor={(n: any) => (n.style?.background as string) || "#fff"} />
      </ReactFlow>
    </div>
  );
}

function e(source: string, target: string, label?: string) {
  return {
    id: `${source}-${target}`, source, target, label,
    style: { stroke: label === "references" ? "#94a3b8" : "#0ea5b8", strokeDasharray: label === "references" ? "4 4" : undefined },
    animated: !label,
    labelStyle: { fontSize: 10, fill: "#64748b" },
  };
}

function stylize(kind: string) {
  const map: Record<string, any> = {
    chapter:  { background: "#fff", border: "1px solid #ebe7df", color: "#1a1916" },
    event:    { background: "#fef3c7", border: "1px solid #fcd34d", color: "#78350f" },
    episode:  { background: "#0ea5b8", border: "1px solid #0ea5b8", color: "#fff", fontWeight: 600 },
    shot:     { background: "#ecfafd", border: "1px solid #cef0f5", color: "#087285" },
    asset:    { background: "#d1fae5", border: "1px solid #6ee7b7", color: "#065f46" },
  };
  return { ...map[kind], borderRadius: 8, padding: "6px 10px", fontSize: 12 };
}
