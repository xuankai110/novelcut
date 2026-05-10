/** NovelCut local persistence — localStorage only for MVP.
 *  Daemon-backed persistence is a future migration; the shape here mirrors
 *  what the daemon SQLite schema will look like.
 */
import type { Asset, Chapter, Episode, Project, TaskRow } from "./types";

const NS = "novelcut:v1";
const k = (suffix: string) => `${NS}:${suffix}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

// ----- Projects -----
export function listProjects(): Project[] {
  return readJson<Project[]>(k("projects"), []);
}
export function getProject(id: string): Project | undefined {
  return listProjects().find((p) => p.id === id);
}
export function upsertProject(p: Project): void {
  const all = listProjects().filter((x) => x.id !== p.id);
  all.unshift(p);
  writeJson(k("projects"), all);
}
export function deleteProject(id: string): void {
  writeJson(k("projects"), listProjects().filter((p) => p.id !== id));
  writeJson(k(`chapters:${id}`), []);
  writeJson(k(`assets:${id}`), []);
  writeJson(k(`episodes:${id}`), []);
  writeJson(k(`tasks:${id}`), []);
}

// ----- Chapters -----
export function listChapters(projectId: string): Chapter[] {
  return readJson<Chapter[]>(k(`chapters:${projectId}`), []);
}
export function setChapters(projectId: string, chapters: Chapter[]): void {
  writeJson(k(`chapters:${projectId}`), chapters);
}

// ----- Assets -----
export function listAssets(projectId: string): Asset[] {
  return readJson<Asset[]>(k(`assets:${projectId}`), []);
}
export function setAssets(projectId: string, assets: Asset[]): void {
  writeJson(k(`assets:${projectId}`), assets);
}

// ----- Episodes -----
export function listEpisodes(projectId: string): Episode[] {
  return readJson<Episode[]>(k(`episodes:${projectId}`), []);
}
export function setEpisodes(projectId: string, episodes: Episode[]): void {
  writeJson(k(`episodes:${projectId}`), episodes);
}

// ----- Tasks -----
export function listTasks(projectId?: string): TaskRow[] {
  if (projectId) return readJson<TaskRow[]>(k(`tasks:${projectId}`), []);
  // global view across projects — concat
  return listProjects().flatMap((p) => readJson<TaskRow[]>(k(`tasks:${p.id}`), []));
}
export function appendTask(t: TaskRow): void {
  const cur = readJson<TaskRow[]>(k(`tasks:${t.projectId}`), []);
  cur.unshift(t);
  writeJson(k(`tasks:${t.projectId}`), cur);
}

// ----- Naive chapter splitter — splits on common Chinese chapter markers -----
const CHAPTER_REGEX = /^(?:第[一二三四五六七八九十百千万0-9０-９]+[章回节卷]|Chapter\s+\d+|CHAPTER\s+\d+|序章|楔子|尾声|后记)/i;

export function splitChapters(text: string): { title: string; body: string }[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: { title: string; body: string[] }[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (CHAPTER_REGEX.test(trimmed)) {
      if (cur) chunks.push(cur);
      cur = { title: trimmed.slice(0, 50), body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else if (trimmed) {
      cur = { title: "正文", body: [line] };
    }
  }
  if (cur) chunks.push(cur);
  if (chunks.length === 0 && text.trim()) {
    chunks.push({ title: "全文", body: text.split("\n") });
  }
  return chunks.map((c) => ({ title: c.title, body: c.body.join("\n").trim() }));
}
