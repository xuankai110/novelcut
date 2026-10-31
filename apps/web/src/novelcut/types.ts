/** NovelCut domain types. */

export type Genre =
  | "现代都市" | "古装宫斗" | "玄幻仙侠" | "霸总言情"
  | "悬疑推理" | "科幻未来" | "穿越重生" | "甜宠校园" | "其他";
export type Platform = "抖音" | "小红书" | "快手" | "TikTok" | "YouTube Shorts";
export type Tone = "压迫感强" | "甜宠治愈" | "热血爽感" | "悬疑紧张" | "诙谐轻喜";

export type VideoRatio = "9:16" | "16:9" | "1:1" | "3:4" | "4:3";
export type ImageQuality = "1K" | "2K" | "4K";

export interface Project {
  id: string; name: string; genre: Genre; language: string;
  platform: Platform; tone: Tone; episodeCount: number; synopsis?: string;
  /** picture/video aspect ratio shared across all assets, storyboard, final video.
   *  default derived from platform (vertical platforms => 9:16). */
  videoRatio?: VideoRatio;
  /** image generation quality tier, passed to provider as `1K`/`2K`/`4K` or
   *  mapped to pixel size for OpenAI-style providers. default 1K. */
  imageQuality?: ImageQuality;
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

export interface DialogueLine { character: string; emotion?: string; line: string; }

export interface ScriptScene {
  index: string; location: string; timeOfDay: string; characters: string[];
  actions: string[]; dialogue: DialogueLine[];
  audioCues?: string[]; onScreenText?: string;
}

export interface EpisodeScript {
  episodeId: string; projectId: string; episodeIndex: number; episodeTitle: string;
  metadata: { targetDuration: string; targetWords: string; platform: string; style: string; beats: string; };
  synopsis: string; scenes: ScriptScene[];
  generatedAt: number; model?: string;
}

export interface Episode {
  id: string; projectId: string; index: number; title: string;
  blueprint?: EpisodeBlueprint; beats?: string;
  status: "draft" | "scripted" | "shotlisted" | "rendered";
}

export type AssetKind = "char" | "prop" | "scene" | "media";

export interface VoiceProfile {
  provider?: string;
  voiceId?: string;
  referenceAudioUrl?: string;
  speed?: number;
  style?: string;
  approvedSampleUrl?: string;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  name: string;
  /** Character voice bible; used when compiling dialogue into voice clips. */
  voiceProfile?: VoiceProfile;
  /** for characters: kept role from skeleton (女主/男主/反派/...) */
  role?: string;
  /** for characters: arc; for scenes: ambiance description; for props: usage */
  description?: string;
  /** rich visual prompt fed to image API */
  prompt?: string;
  /** generated image URL (preferred) or data URI */
  previewUrl?: string;
  promptStatus?: "idle" | "running" | "done" | "error";
  imageStatus?: "idle" | "running" | "done" | "error";
  promptError?: string;
  imageError?: string;
  createdAt: number;
  updatedAt?: number;
}

export type ShotFraming =
  | "ECU"     // 极特写 (eyes / lips)
  | "CU"      // 特写 (face)
  | "MCU"     // 中近景 (chest up)
  | "MS"      // 中景 (waist up)
  | "MLS"     // 中远景 (knees up)
  | "LS"      // 远景 (full body)
  | "EWS"     // 大全 (environment dominant)
  | "INSERT"  // 空镜 (object detail)
  | "OTS";    // 过肩

export type ShotCameraMove =
  | "static" | "dolly_in" | "dolly_out"
  | "pan_left" | "pan_right" | "tilt_up" | "tilt_down"
  | "tracking" | "handheld" | "crane";

export type GenStatus = "idle" | "running" | "done" | "error";
export type CameraAngle = "eye" | "high" | "low" | "dutch" | "top";
export type NarrativePov = "objective" | "character" | "flashback";
export type DialogueVoice = "on_screen" | "off_screen" | "inner" | "narration" | "flashback";
export type VoicePresetId = "clean" | "phone" | "inner" | "flashback" | "loudspeaker";
export type ShotRiskFlag = "multi_character" | "complex_action" | "physics_simulation" | "long_dialogue";

export interface DialogueIR {
  id: string;
  speaker: string;
  text: string;
  voice: DialogueVoice;
  emotion?: string;
  presetId?: VoicePresetId;
  /** Relative to the owning shot. Absolute time is derived by the render compiler. */
  tIn?: number;
  tOut?: number;
}

export type AudioNote =
  | { kind: "sfx"; desc: string; at?: number }
  | { kind: "ambience"; desc: string }
  | { kind: "music"; mood: string };

export interface ShotBlocking {
  count: number;
  positions?: string;
  facing?: string;
}

export interface ShotDepth {
  foreground?: string;
  midground?: string;
  background?: string;
  focus?: string;
}

export interface ShotAttempts {
  image: number;
  video: number;
}

export interface Shot {
  id: string;
  projectId: string;
  episodeId: string;
  episodeIndex: number;
  /** matches script scene.index (e.g. "1-1") */
  sceneIndex: string;
  /** scene location at time of shot generation (denormalized for display) */
  sceneLocation: string;
  /** scene timeOfDay */
  sceneTimeOfDay: string;
  /** 1-based shot number within the scene */
  shotIndex: number;

  framing: ShotFraming;
  cameraMove: ShotCameraMove;
  duration: number;            // seconds, normalized to 1.5-6.0
  cameraAngle?: CameraAngle;
  narrativePov?: NarrativePov;

  characters: string[];
  action: string;
  emotion?: string;
  blocking?: ShotBlocking;
  depth?: ShotDepth;
  /** @deprecated v1 compatibility. New code reads/writes dialogues. */
  dialogue?: { character: string; line: string };
  dialogues?: DialogueIR[];
  /** Title/location cards only. Dialogue subtitles derive from voice clips. */
  onScreenText?: string;
  /** @deprecated v1 compatibility. New code reads/writes audioNotes. */
  audioCue?: string;
  audioNotes?: AudioNote[];
  riskFlags?: ShotRiskFlag[];

  imagePrompt?: string;
  /** Motion and camera only; static identity comes from associated assets. */
  videoPrompt?: string;
  imageUrl?: string;           // generated still
  imageStatus?: GenStatus;
  imageError?: string;
  imageGeneratedAt?: number;
  videoUrl?: string;
  videoStatus?: GenStatus;
  videoError?: string;
  videoGeneratedAt?: number;
  attempts?: ShotAttempts;

  /** Auto-resolved asset ids (chars / scene / props) — used as conditioning later */
  associatedAssetIds: string[];

  /** Generation provenance */
  model?: string;
  createdAt: number;
  updatedAt: number;
}

/** Normalized v2 shot. Optional fields on Shot keep persisted v1 JSON type-compatible. */
export type ShotIR = Omit<Shot, "dialogues" | "audioNotes" | "videoStatus" | "attempts"> & {
  dialogues: DialogueIR[];
  audioNotes: AudioNote[];
  videoStatus: GenStatus;
  attempts: ShotAttempts;
};

export interface TaskRow {
  id: string; projectId: string; kind: string; model?: string;
  description: string; status: "queued" | "running" | "done" | "error";
  createdAt: number; finishedAt?: number; errorMessage?: string;
}
