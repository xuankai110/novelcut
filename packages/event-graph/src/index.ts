/**
 * @novelcut/event-graph
 *
 * Chapter event graph for novel adaptation. Extracts structured events
 * from raw chapters and stores them as a queryable directed graph.
 *
 * Pipeline: novel text -> chapters -> per-chapter events -> graph edges (causality / character / location)
 */

export interface EventNode {
  id: string;
  chapterId: string;
  /** brief one-line summary, machine-readable */
  summary: string;
  /** characters mentioned in this event */
  characters: string[];
  /** location identifiers */
  locations: string[];
  /** time within story (relative beat index) */
  beat: number;
  /** raw quoted snippet for traceability */
  excerpt: string;
}

export type EdgeKind = "causes" | "follows" | "co-occurs" | "involves";

export interface EventEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  weight?: number;
}

export interface EventGraphSnapshot {
  nodes: EventNode[];
  edges: EventEdge[];
  version: number;
}

export interface EventGraphStore {
  upsertNode(node: EventNode): Promise<void>;
  upsertEdge(edge: EventEdge): Promise<void>;
  byChapter(chapterId: string): Promise<EventNode[]>;
  query(opts: { character?: string; location?: string; beatRange?: [number, number] }): Promise<EventNode[]>;
  snapshot(): Promise<EventGraphSnapshot>;
}

/**
 * Extract events from a chapter. Implementation will call an LLM
 * via the configured ScriptAgent (decision layer).
 *
 * TODO: implement in phase 2. Skeleton only.
 */
export async function extractEvents(_chapterText: string, _chapterId: string): Promise<EventNode[]> {
  throw new Error("extractEvents() not yet implemented");
}
