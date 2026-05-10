/** NovelCut domain types. */

export type Genre =
  | "现代都市" | "古装宫斗" | "玄幻仙侠" | "霸总言情"
  | "悬疑推理" | "科幻未来" | "穿越重生" | "甜宠校园" | "其他";
export type Platform = "抖音" | "小红书" | "快手" | "TikTok" | "YouTube Shorts";
export type Tone = "压迫感强" | "甜宠治愈" | "热血爽感" | "悬疑紧张" | "诙谐轻喜";

export interface Project {
  id: string; name: string; genre: Genre; language: string;
  platform: Platform; tone: Tone; episodeCount: number; synopsis?: string;
  createdAt: number; updatedAt: number;
}

export interface ChapterEvent {
  summary: string; characters: string[]; locations: string[]; beat: number; excerpt: string;
}

export interface Chapter {
  id: string; projectId: string; index: number; title: string; body: string;
  eventsStatus: "idle" | "running" | "done" | "error";
  eventCount?: number; events?: ChapterEvent[]; errorMessage?: string;
}

export interface CharacterCore { name: string; role: string; arc: string; }
export interface ActPlan { range: string; summary: string; keyBeats: string[]; }

export interface SkeletonProvenance {
  chapterIds: string[]; chapterCount: number; eventCount: number;
  wordCount: number; targetEpisodes: number; coverage: number;
}

export interface StorySkeleton {
  oneLiner: string; storyCore: string; hiddenPlot: string;
  characterCores: CharacterCore[];
  threeActs: { act1: ActPlan; act2: ActPlan; act3: ActPlan };
  adaptationPrinciples: string[];
  generatedAt: number; model?: string;
  basedOn?: SkeletonProvenance;
}

export interface EpisodeBlueprint {
  index: number; title: string; summary: string;
  beats: string[]; hookOpen: string; hookEnd: string;
  retainsEvents: string[]; newScenes?: string[];
}

export interface DialogueLine {
  character: string;
  emotion?: string;
  line: string;
}

export interface ScriptScene {
  index: string;          // e.g. "1-1"
  location: string;
  timeOfDay: string;      // e.g. "夜/内"
  characters: string[];
  actions: string[];      // △-prefixed staging notes
  dialogue: DialogueLine[];
  audioCues?: string[];
  onScreenText?: string;
}

export interface EpisodeScript {
  episodeId: string;
  projectId: string;
  episodeIndex: number;
  episodeTitle: string;
  metadata: {
    targetDuration: string;
    targetWords: string;
    platform: string;
    style: string;
    beats: string;
  };
  synopsis: string;
  scenes: ScriptScene[];
  generatedAt: number;
  model?: string;
}

export interface Episode {
  id: string; projectId: string; index: number; title: string;
  blueprint?: EpisodeBlueprint; beats?: string;
  status: "draft" | "scripted" | "shotlisted" | "rendered";
}

export interface Asset {
  id: string; projectId: string;
  kind: "char" | "prop" | "scene" | "media";
  name: string; description?: string; prompt?: string; previewUrl?: string;
  createdAt: number;
}

export interface TaskRow {
  id: string; projectId: string; kind: string; model?: string;
  description: string; status: "queued" | "running" | "done" | "error";
  createdAt: number; finishedAt?: number; errorMessage?: string;
}
