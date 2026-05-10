import type { Chapter, EpisodeBlueprint, Project, StorySkeleton, SkeletonProvenance } from "../types";
import { chat, extractJson, type LLMConfig } from "../llm";
import { SKELETON_SYSTEM, buildSkeletonUser, EPISODE_PLAN_SYSTEM, buildEpisodePlanUser } from "./prompts";

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
    generatedAt: Date.now(),
    model: llm.model,
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

export interface RunEpisodePlanProgress {
  done: number; total: number; chunkLabel: string;
}

export interface RunEpisodePlanOptions {
  /** how many episodes per LLM call. default 5. */
  chunkSize?: number;
  /** progress callback (after each chunk). */
  onChunk?: (p: RunEpisodePlanProgress) => void;
  /** abort signal */
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
    // accept only items inside the requested range, then append
    const filtered = batch.filter(b => b.index >= cursor && b.index <= end);
    blueprints.push(...filtered);
    blueprints.sort((a, b) => a.index - b.index);
    opts.onChunk?.({ done: Math.min(episodeCount, end), total: episodeCount, chunkLabel: `${chunkLabel} 完成` });
    cursor = end + 1;
  }
  return { blueprints };
}
