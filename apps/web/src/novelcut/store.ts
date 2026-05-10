/** NovelCut local persistence — localStorage only for MVP. */
import type { Asset, Chapter, Episode, EpisodeScript, Project, Shot, StorySkeleton, TaskRow } from "./types";

const NS = "novelcut:v1";
const k = (suffix: string) => `${NS}:${suffix}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function listProjects(): Project[] { return readJson<Project[]>(k("projects"), []); }
export function getProject(id: string): Project | undefined { return listProjects().find((p) => p.id === id); }
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
  writeJson(k(`skeleton:${id}`), null);
  writeJson(k(`scripts:${id}`), {});
  writeJson(k(`shots:${id}`), []);
}

export function listChapters(projectId: string): Chapter[] {
  return readJson<Chapter[]>(k(`chapters:${projectId}`), []);
}
export function setChapters(projectId: string, chapters: Chapter[]): void {
  writeJson(k(`chapters:${projectId}`), chapters);
}
export function appendChapters(projectId: string, parts: { title: string; body: string }[]): Chapter[] {
  const cur = listChapters(projectId);
  const startIdx = cur.length;
  const next: Chapter[] = [
    ...cur,
    ...parts.map((p, i) => ({
      id: genId("ch"), projectId, index: startIdx + i + 1,
      title: p.title, body: p.body, eventsStatus: "idle" as const,
    })),
  ];
  setChapters(projectId, next);
  return next;
}

export function listAssets(projectId: string): Asset[] { return readJson<Asset[]>(k(`assets:${projectId}`), []); }
export function setAssets(projectId: string, assets: Asset[]): void { writeJson(k(`assets:${projectId}`), assets); }
export function upsertAsset(asset: Asset): Asset {
  const cur = listAssets(asset.projectId);
  const next = cur.filter(a => a.id !== asset.id);
  next.push({ ...asset, updatedAt: Date.now() });
  next.sort((a, b) => (a.createdAt - b.createdAt));
  setAssets(asset.projectId, next);
  return asset;
}
export function deleteAsset(projectId: string, assetId: string): void {
  setAssets(projectId, listAssets(projectId).filter(a => a.id !== assetId));
}

export function listEpisodes(projectId: string): Episode[] { return readJson<Episode[]>(k(`episodes:${projectId}`), []); }
export function setEpisodes(projectId: string, episodes: Episode[]): void { writeJson(k(`episodes:${projectId}`), episodes); }

export function getSkeleton(projectId: string): StorySkeleton | null {
  return readJson<StorySkeleton | null>(k(`skeleton:${projectId}`), null);
}
export function saveSkeleton(projectId: string, skeleton: StorySkeleton): void {
  writeJson(k(`skeleton:${projectId}`), skeleton);
}
export function clearSkeleton(projectId: string): void { writeJson(k(`skeleton:${projectId}`), null); }

type ScriptMap = Record<string, EpisodeScript>;
export function listScripts(projectId: string): ScriptMap { return readJson<ScriptMap>(k(`scripts:${projectId}`), {}); }
export function getScript(projectId: string, episodeId: string): EpisodeScript | undefined { return listScripts(projectId)[episodeId]; }
export function saveScript(projectId: string, script: EpisodeScript): void {
  const map = listScripts(projectId);
  map[script.episodeId] = script;
  writeJson(k(`scripts:${projectId}`), map);
}
export function deleteScript(projectId: string, episodeId: string): void {
  const map = listScripts(projectId);
  delete map[episodeId];
  writeJson(k(`scripts:${projectId}`), map);
}

// ----- Shots -----
export function listShots(projectId: string): Shot[] {
  return readJson<Shot[]>(k(`shots:${projectId}`), []);
}
export function setShots(projectId: string, shots: Shot[]): void {
  writeJson(k(`shots:${projectId}`), shots);
}
export function listShotsByEpisode(projectId: string, episodeId: string): Shot[] {
  return listShots(projectId).filter(s => s.episodeId === episodeId)
    .sort((a, b) => {
      // sort by sceneIndex (string like "1-1") then shotIndex
      const [aA, aB] = a.sceneIndex.split("-").map(n => parseInt(n, 10));
      const [bA, bB] = b.sceneIndex.split("-").map(n => parseInt(n, 10));
      if (aA !== bA) return (aA || 0) - (bA || 0);
      if (aB !== bB) return (aB || 0) - (bB || 0);
      return a.shotIndex - b.shotIndex;
    });
}
export function listShotsByScene(projectId: string, episodeId: string, sceneIndex: string): Shot[] {
  return listShots(projectId)
    .filter(s => s.episodeId === episodeId && s.sceneIndex === sceneIndex)
    .sort((a, b) => a.shotIndex - b.shotIndex);
}
export function upsertShot(shot: Shot): void {
  const cur = listShots(shot.projectId);
  const next = cur.filter(s => s.id !== shot.id);
  next.push({ ...shot, updatedAt: Date.now() });
  setShots(shot.projectId, next);
}
export function upsertShots(projectId: string, shots: Shot[]): void {
  if (shots.length === 0) return;
  const map = new Map<string, Shot>();
  for (const s of listShots(projectId)) map.set(s.id, s);
  for (const s of shots) map.set(s.id, { ...s, updatedAt: Date.now() });
  setShots(projectId, [...map.values()]);
}
export function deleteShot(projectId: string, shotId: string): void {
  setShots(projectId, listShots(projectId).filter(s => s.id !== shotId));
}
export function deleteShotsByScene(projectId: string, episodeId: string, sceneIndex: string): void {
  setShots(projectId, listShots(projectId).filter(s => !(s.episodeId === episodeId && s.sceneIndex === sceneIndex)));
}
export function deleteShotsByEpisode(projectId: string, episodeId: string): void {
  setShots(projectId, listShots(projectId).filter(s => s.episodeId !== episodeId));
}

export function listTasks(projectId?: string): TaskRow[] {
  if (projectId) return readJson<TaskRow[]>(k(`tasks:${projectId}`), []);
  return listProjects().flatMap((p) => readJson<TaskRow[]>(k(`tasks:${p.id}`), []));
}
export function appendTask(t: TaskRow): void {
  const cur = readJson<TaskRow[]>(k(`tasks:${t.projectId}`), []);
  cur.unshift(t);
  writeJson(k(`tasks:${t.projectId}`), cur);
}

export function hasSeenWelcome(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(k("welcome-seen")) === "1";
}
export function markWelcomeSeen(): void { window.localStorage.setItem(k("welcome-seen"), "1"); }

const CHAPTER_REGEX = /^(?:第[一二三四五六七八九十百千万0-9０-９]+[章回节卷]|Chapter\s+\d+|CHAPTER\s+\d+|序章|楔子|尾声|后记)/i;
export interface SplitResult { parts: { title: string; body: string }[]; hadMarkers: boolean; }

export function splitChapters(text: string): SplitResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: { title: string; body: string[] }[] = [];
  let cur: { title: string; body: string[] } | null = null;
  let foundMarker = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (CHAPTER_REGEX.test(trimmed)) {
      foundMarker = true;
      if (cur) chunks.push(cur);
      cur = { title: trimmed.slice(0, 50), body: [] };
    } else if (cur) cur.body.push(line);
    else if (trimmed) cur = { title: "正文", body: [line] };
  }
  if (cur) chunks.push(cur);
  if (chunks.length === 0 && text.trim()) chunks.push({ title: "全文", body: text.split("\n") });
  return {
    parts: chunks.map((c) => ({ title: c.title, body: c.body.join("\n").trim() })),
    hadMarkers: foundMarker,
  };
}
export function autoSplitByLength(text: string, targetCharsPerChapter = 3000): { title: string; body: string }[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];
  const out: { title: string; body: string }[] = [];
  let buffer: string[] = []; let bufLen = 0;
  for (const p of paragraphs) {
    buffer.push(p); bufLen += p.length;
    if (bufLen >= targetCharsPerChapter) {
      out.push({ title: `第 ${out.length + 1} 段`, body: buffer.join("\n\n") });
      buffer = []; bufLen = 0;
    }
  }
  if (buffer.length) out.push({ title: `第 ${out.length + 1} 段`, body: buffer.join("\n\n") });
  return out;
}
