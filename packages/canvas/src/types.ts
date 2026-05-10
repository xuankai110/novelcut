export type NodeKind =
  | "chapter"
  | "event"
  | "episode"
  | "script"
  | "shot"
  | "asset:char"
  | "asset:scene"
  | "asset:prop"
  | "image"
  | "video";

export type EdgeKind = "derives_from" | "references";

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}
