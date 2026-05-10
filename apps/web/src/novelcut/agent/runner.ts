import type { Chapter, EpisodeBlueprint, Project, StorySkeleton } from "../types";
import { chat, extractJson, type LLMConfig } from "../llm";
import { SKELETON_SYSTEM, buildSkeletonUser, EPISODE_PLAN_SYSTEM, buildEpisodePlanUser } from "./prompts";

export interface RunSkeletonResult {
  skeleton: StorySkeleton;
  raw: string;
}

export async function runSkeleton(
  llm: LLMConfig, project: Project, chapters: Chapter[],
): Promise<RunSkeletonResult> {
  const resp = await chat(llm, {
    messages: [
      { role: "system", content: SKELETON_SYSTEM },
      { role: "user", content: buildSkeletonUser(project, chapters) },
    ],
    temperature: 0.4,
    json: true,
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
      ? parsed.adaptationPrinciples.map(String)
      : [],
    generatedAt: Date.now(),
    model: llm.model,
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

export interface RunEpisodePlanResult {
  blueprints: EpisodeBlueprint[];
  raw: string;
}

export async function runEpisodePlan(
  llm: LLMConfig, project: Project, chapters: Chapter[], skeleton: StorySkeleton, episodeCount: number,
): Promise<RunEpisodePlanResult> {
  const resp = await chat(llm, {
    messages: [
      { role: "system", content: EPISODE_PLAN_SYSTEM },
      { role: "user", content: buildEpisodePlanUser(project, chapters, skeleton, episodeCount) },
    ],
    temperature: 0.4,
    json: true,
  });
  const parsed = extractJson<{ episodes?: any[] } | any[]>(resp.content);
  const list = Array.isArray(parsed) ? parsed : (parsed.episodes ?? []);
  const blueprints: EpisodeBlueprint[] = list.map((e: any, i: number) => ({
    index: Number.isFinite(e?.index) ? Number(e.index) : i + 1,
    title: String(e?.title ?? `第 ${i + 1} 集`),
    summary: String(e?.summary ?? ""),
    beats: Array.isArray(e?.beats) ? e.beats.map(String) : [],
    hookOpen: String(e?.hookOpen ?? ""),
    hookEnd: String(e?.hookEnd ?? ""),
    retainsEvents: Array.isArray(e?.retainsEvents) ? e.retainsEvents.map(String) : [],
    newScenes: Array.isArray(e?.newScenes) ? e.newScenes.map(String) : undefined,
  }));
  blueprints.sort((a, b) => a.index - b.index);
  return { blueprints, raw: resp.content };
}
