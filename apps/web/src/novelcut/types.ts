/** NovelCut domain types — minimal MVP shape, persisted via @/novelcut/store. */

export type Genre =
  | "现代都市"
  | "古装宫斗"
  | "玄幻仙侠"
  | "霸总言情"
  | "悬疑推理"
  | "科幻未来"
  | "穿越重生"
  | "甜宠校园"
  | "其他";

export type Platform = "抖音" | "小红书" | "快手" | "TikTok" | "YouTube Shorts";

export type Tone = "压迫感强" | "甜宠治愈" | "热血爽感" | "悬疑紧张" | "诙谐轻喜";

export interface Project {
  id: string;
  name: string;
  genre: Genre;
  language: string;        // ISO-639-1
  platform: Platform;
  tone: Tone;
  episodeCount: number;    // planned
  synopsis?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  projectId: string;
  index: number;           // 1-based
  title: string;
  body: string;
  /** event extraction status */
  eventsStatus: "idle" | "running" | "done" | "error";
  eventCount?: number;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: "char" | "prop" | "scene" | "media";
  name: string;
  description?: string;
  prompt?: string;
  previewUrl?: string;     // generated image url (placeholder for MVP)
  createdAt: number;
}

export interface Episode {
  id: string;
  projectId: string;
  index: number;           // 1-based
  title: string;
  beats?: string;          // markdown
  status: "draft" | "scripted" | "shotlisted" | "rendered";
}

export interface TaskRow {
  id: string;
  projectId: string;
  kind: string;            // e.g. "image.scene", "video.shot", "agent.event-extract"
  model?: string;
  description: string;
  status: "queued" | "running" | "done" | "error";
  createdAt: number;
  finishedAt?: number;
}
