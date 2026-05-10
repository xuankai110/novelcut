import * as React from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanvasNode, CanvasEdge } from "./types.js";

export interface StoryboardCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export default function StoryboardCanvas({ nodes, edges }: StoryboardCanvasProps) {
  // Map NovelCut nodes to xyflow nodes — minimal, for skeleton.
  const flowNodes = nodes.map((n) => ({
    id: n.id,
    type: "default",
    position: n.position,
    data: { label: `${n.kind}: ${(n.data as { name?: string }).name ?? n.id}` },
  }));
  const flowEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
