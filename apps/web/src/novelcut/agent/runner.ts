import type {
  Asset, Chapter, Episode, EpisodeBlueprint, EpisodeScript, Project,
  ScriptScene, StorySkeleton, SkeletonProvenance,
} from "../types";
import {
  chat, extractJson, imageGenerate, type LLMConfig, type ImageConfig,
} from "../llm";
import {
  SKELETON_SYSTEM, buildSkeletonUser,
  EPISODE_PLAN_SYSTEM, buildEpisodePlanUser,
  SCRIPT_SYSTEM, buildScriptUser,
  ASSET_PROMPT_SYSTEM, buildAssetPromptUser,
} from "./prompts";

export interface RunSkeletonResult { skeleton: StorySkeleton; raw: string; }

export function buildProvenance(project: Project, chapters: Chapter[]): SkeletonProvenance {
  const usedChapters = chapters.filter(c => c.eventsStatus === "done");
  const wordCount = usedChapters.reduce((s, c) => s + c.body.length, 0);
  const eventCount = usedChapters.reduce((s, c) => s + (c.eventCount ?? 0), 0);
  const target = Math.max(1, project.episodeCount * 1500);
  return {
    chapterIds: usedChapters.map(c => c.id).sort(),
    chapterCount: usedChapters.length,
    eventCount, wordCount,
    targetEpisodes: project.episodeCount,
    coverage: Math.min(2, wordCount / target),
  };
}

export async function runSkeleton(
  llm: LLMConfig, project: Project, chapters: Chapter[],
): Promise<RunSkeletonResult> {
  const used = chapters.filter(c => c.eventsStatus === "done");
  const resp = await chat(llm, {
    messages: [
      { role: "system", content: SKELETON_SYSTEM },
      { role: "user", content: buildSkeletonUser(project, used) },
    ],
    temperature: 0.4, json: true,
  });
  const parsed = extractJson<Partial<StorySkeleton>>(resp.content);
  const skeleton: StorySkeleton = {
    oneLiner: String(parsed.oneLiner ?? ""),
    storyCore: String(parsed.storyCore ?? ""),
    hiddenPlot: String(parsed.hiddenPlot ?? ""),
    characterCores: Array.isArray(parsed.characterCores) ? parsed.characterCores.map((c: any) => ({
      name: String(c?.name ?? ""), role: String(c?.role ?? ""), arc: String(c?.arc ?? ""),
    })) : [],
    threeActs: {
      act1: normAct(parsed.threeActs?.act1, "1-?集"),
      act2: normAct(parsed.threeActs?.act2, "?-?集"),
      act3: normAct(parsed.threeActs?.act3, "?-?集"),
    },
    adaptationPrinciples: Array.isArray(parsed.adaptationPrinciples)
      ? parsed.adaptationPrinciples.map(String) : [],
    generatedAt: Date.now(), model: llm.model,
    basedOn: buildProvenance(project, chapters),
  };
  return { skeleton, raw: resp.content };
}

function normAct(a: any, fallbackRange: string) {
  return {
    range: String(a?.range ?? fallbackRange),
    summary: String(a?.summary ?? ""),
    keyBeats: Array.isArray(a?.keyBeats) ? a.keyBeats.map(String) : [],
  };
}

export interface RunEpisodePlanProgress { done: number; total: number; chunkLabel: string; }
export interface RunEpisodePlanOptions {
  chunkSize?: number;
  onChunk?: (p: RunEpisodePlanProgress) => void;
  signal?: AbortSignal;
}
export interface RunEpisodePlanResult { blueprints: EpisodeBlueprint[]; }

export async function runEpisodePlan(
  llm: LLMConfig, project: Project, chapters: Chapter[],
  skeleton: StorySkeleton, episodeCount: number, opts: RunEpisodePlanOptions = {},
): Promise<RunEpisodePlanResult> {
  const used = chapters.filter(c => c.eventsStatus === "done");
  const chunkSize = Math.max(2, opts.chunkSize ?? 5);
  const blueprints: EpisodeBlueprint[] = [];
  let cursor = 1;
  while (cursor <= episodeCount) {
    if (opts.signal?.aborted) throw new Error("已取消");
    const end = Math.min(episodeCount, cursor + chunkSize - 1);
    const chunkLabel = `第 ${cursor}-${end} 集`;
    opts.onChunk?.({ done: cursor - 1, total: episodeCount, chunkLabel: `生成中: ${chunkLabel}` });
    const resp = await chat(llm, {
      messages: [
        { role: "system", content: EPISODE_PLAN_SYSTEM },
        { role: "user", content: buildEpisodePlanUser(project, used, skeleton, cursor, end, episodeCount, blueprints) },
      ],
      temperature: 0.4, json: true, signal: opts.signal,
    });
    const parsed = extractJson<{ episodes?: any[] } | any[]>(resp.content);
    const list = Array.isArray(parsed) ? parsed : (parsed.episodes ?? []);
    const batch: EpisodeBlueprint[] = list.map((e: any, i: number) => ({
      index: Number.isFinite(e?.index) ? Number(e.index) : cursor + i,
      title: String(e?.title ?? `第 ${cursor + i} 集`),
      summary: String(e?.summary ?? ""),
      beats: Array.isArray(e?.beats) ? e.beats.map(String) : [],
      hookOpen: String(e?.hookOpen ?? ""),
      hookEnd: String(e?.hookEnd ?? ""),
      retainsEvents: Array.isArray(e?.retainsEvents) ? e.retainsEvents.map(String) : [],
      newScenes: Array.isArray(e?.newScenes) ? e.newScenes.map(String) : undefined,
    }));
    const filtered = batch.filter(b => b.index >= cursor && b.index <= end);
    blueprints.push(...filtered);
    blueprints.sort((a, b) => a.index - b.index);
    opts.onChunk?.({ done: Math.min(episodeCount, end), total: episodeCount, chunkLabel: `${chunkLabel} 完成` });
    cursor = end + 1;
  }
  return { blueprints };
}

export interface RunScriptOptions { prevHookEnd?: string; signal?: AbortSignal; }

export async function runEpisodeScript(
  llm: LLMConfig, project: Project, skeleton: StorySkeleton,
  episode: Episode, opts: RunScriptOptions = {},
): Promise<EpisodeScript> {
  const resp = await chat(llm, {
    messages: [
      { role: "system", content: SCRIPT_SYSTEM },
      { role: "user", content: buildScriptUser(project, skeleton, episode, opts.prevHookEnd) },
    ],
    temperature: 0.55, json: true, signal: opts.signal,
  });
  const parsed = extractJson<{ synopsis?: string; scenes?: any[] }>(resp.content);
  const scenes: ScriptScene[] = Array.isArray(parsed.scenes) ? parsed.scenes.map((s: any, i: number) => ({
    index: String(s?.index ?? `1-${i + 1}`),
    location: String(s?.location ?? ""),
    timeOfDay: String(s?.timeOfDay ?? ""),
    characters: Array.isArray(s?.characters) ? s.characters.map(String) : [],
    actions: Array.isArray(s?.actions) ? s.actions.map(String) : [],
    dialogue: Array.isArray(s?.dialogue) ? s.dialogue.map((d: any) => ({
      character: String(d?.character ?? ""),
      emotion: d?.emotion ? String(d.emotion) : undefined,
      line: String(d?.line ?? ""),
    })) : [],
    audioCues: Array.isArray(s?.audioCues) ? s.audioCues.map(String) : undefined,
    onScreenText: s?.onScreenText ? String(s.onScreenText) : undefined,
  })) : [];

  return {
    episodeId: episode.id, projectId: episode.projectId,
    episodeIndex: episode.index, episodeTitle: episode.title,
    metadata: {
      targetDuration: "30 秒", targetWords: "150-200 字台词",
      platform: project.platform, style: `${project.genre} · ${project.tone}`,
      beats: episode.blueprint?.beats?.join(" → ") ?? "",
    },
    synopsis: String(parsed.synopsis ?? ""),
    scenes,
    generatedAt: Date.now(), model: llm.model,
  };
}

// =============== Asset prompt + image ===============

export interface RunAssetPromptOptions { signal?: AbortSignal; }
export async function runAssetPrompt(
  llm: LLMConfig, project: Project, asset: Asset, skeleton: StorySkeleton | null,
  opts: RunAssetPromptOptions = {},
): Promise<string> {
  const resp = await chat(llm, {
    messages: [
      { role: "system", content: ASSET_PROMPT_SYSTEM },
      { role: "user", content: buildAssetPromptUser(project, asset, skeleton) },
    ],
    temperature: 0.6, json: true, signal: opts.signal,
  });
  const parsed = extractJson<{ prompt?: string }>(resp.content);
  const prompt = String(parsed?.prompt ?? "").trim();
  if (!prompt) throw new Error("LLM 没产出 prompt 字段");
  return prompt;
}

export interface RunAssetImageOptions {
  /** override aspect/size for this call (advanced — usually let project decide). */
  size?: string;
  aspectRatio?: string;
  signal?: AbortSignal;
}

export async function runAssetImage(
  img: ImageConfig, project: Project, asset: Asset, opts: RunAssetImageOptions = {},
): Promise<{ url?: string; b64?: string }> {
  if (!asset.prompt) throw new Error("资产缺少 prompt — 请先生成提示词");
  const { getVideoRatio, getImageQuality, ratioToPixelSize } = await import("../projectMeta");
  const ratio = getVideoRatio(project);
  const quality = getImageQuality(project);
  const useAR = img.useAspectRatio;
  // Toonflow-aligned: every asset follows project ratio (no per-kind override)
  const result = await imageGenerate(img, {
    prompt: asset.prompt,
    size: useAR ? undefined : (opts.size ?? ratioToPixelSize(ratio, quality)),
    aspectRatio: useAR ? (opts.aspectRatio ?? ratio) : undefined,
    signal: opts.signal,
  });
  return { url: result.url, b64: result.b64 };
}
