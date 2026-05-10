/**
 * @novelcut/memory
 *
 * Project-scoped semantic memory. Two tiers:
 *
 *   short-term — append-only message log per session
 *   long-term  — embedded summaries with cosine recall
 *
 * Embeddings are computed locally via @huggingface/transformers (ONNX),
 * stored in better-sqlite3 alongside the project DB.
 */

export interface MemoryRecord {
  id: string;
  projectId: string;
  scope: "short" | "long";
  text: string;
  meta: Record<string, unknown>;
  embedding?: Float32Array;
  createdAt: number;
}

export interface MemoryStore {
  append(rec: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord>;
  recall(projectId: string, query: string, k?: number): Promise<MemoryRecord[]>;
  summarize(projectId: string, sessionId: string): Promise<MemoryRecord>;
}

/** Default ONNX model id. Pinned per release. */
export const DEFAULT_EMBED_MODEL = "Xenova/bge-small-en-v1.5";
