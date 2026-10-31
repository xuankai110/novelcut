import type { DialogueVoice, VoicePresetId } from "../types";

export type ClipKind = "video" | "voice" | "sfx" | "ambience" | "music" | "cg" | "subtitle";
export type ClipStatus = "idle" | "queued" | "running" | "done" | "error" | "accepted";

export interface VoiceClipPayload {
  speaker: string;
  text: string;
  voice: DialogueVoice;
  emotion?: string;
  voiceId?: string;
}
export interface SfxClipPayload { desc: string; }
export interface AmbienceClipPayload { desc: string; }
export interface MusicClipPayload { mood: string; }
export interface VideoClipPayload { prompt: string; }
export interface CgClipPayload { assetUrl?: string; description: string; }
export interface SubtitleClipPayload { text: string; }

interface TrackClipBase<K extends ClipKind, P> {
  id: string;
  /** Anchor shot. Cross-shot audio keeps the first shot as its anchor. */
  shotId: string;
  kind: K;
  /** Seconds relative to the anchor shot, never absolute episode time. */
  tIn: number;
  tOut: number;
  payload: P;
  presetId?: VoicePresetId;
  provider?: string;
  model?: string;
  status: ClipStatus;
  attempts: number;
  assetUrl?: string;
  error?: string;
  cost?: number;
  estimated?: boolean;
}

export type TrackClip =
  | TrackClipBase<"voice", VoiceClipPayload>
  | TrackClipBase<"sfx", SfxClipPayload>
  | TrackClipBase<"ambience", AmbienceClipPayload>
  | TrackClipBase<"music", MusicClipPayload>
  | TrackClipBase<"video", VideoClipPayload>
  | TrackClipBase<"cg", CgClipPayload>
  | TrackClipBase<"subtitle", SubtitleClipPayload>;

export interface VoicePreset {
  id: VoicePresetId;
  /** Server-owned template. Never accept this value from an LLM response. */
  ffmpegFilter: string;
  gainDb?: number;
}

export type TransitionKind = "cut" | "dissolve" | "fade" | "flash";
export interface Transition {
  id: string;
  fromShotId: string;
  toShotId: string;
  kind: TransitionKind;
  duration: number;
}

type AddRenderTimes<T> = T extends unknown ? T & { absIn: number; absOut: number } : never;
export type RenderClip = AddRenderTimes<TrackClip> & { trackId: string };

export interface RenderTrack {
  id: string;
  kind: ClipKind;
  clipIds: string[];
}

export interface RenderPlanShot {
  shotId: string;
  startSec: number;
  endSec: number;
  duration: number;
  clipIds: string[];
}

export type RenderLayer = "video" | "cg" | "on_screen_text" | "subtitle" | "ai_disclosure";

export interface RenderPlan {
  version: 1;
  projectId: string;
  episodeId: string;
  duration: number;
  shots: RenderPlanShot[];
  clips: RenderClip[];
  tracks: RenderTrack[];
  transitions: Transition[];
  layers: RenderLayer[];
}
