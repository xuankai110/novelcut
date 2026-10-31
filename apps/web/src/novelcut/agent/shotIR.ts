import type {
  AudioNote, CameraAngle, DialogueIR, DialogueVoice, GenStatus, NarrativePov,
  Shot, ShotAttempts, ShotCameraMove, ShotFraming, ShotIR, ShotRiskFlag, VoicePresetId,
} from "../types";

export const VALID_FRAMING: ShotFraming[] = ["ECU", "CU", "MCU", "MS", "MLS", "LS", "EWS", "INSERT", "OTS"];
export const VALID_MOVE: ShotCameraMove[] = ["static", "dolly_in", "dolly_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "tracking", "handheld", "crane"];
const VALID_VOICE: DialogueVoice[] = ["on_screen", "off_screen", "inner", "narration", "flashback"];
const VALID_PRESET: VoicePresetId[] = ["clean", "phone", "inner", "flashback", "loudspeaker"];
const VALID_RISK: ShotRiskFlag[] = ["multi_character", "complex_action", "physics_simulation", "long_dialogue"];
const VALID_STATUS: GenStatus[] = ["idle", "running", "done", "error"];

export interface RawDialogue {
  id?: string;
  speaker?: string;
  character?: string;
  text?: string;
  line?: string;
  voice?: string;
  emotion?: string;
  presetId?: string;
  tIn?: number;
  tOut?: number;
}

export interface RawShot {
  shotIndex?: number;
  framing?: string;
  cameraMove?: string;
  duration?: number;
  cameraAngle?: string;
  narrativePov?: string;
  characters?: string[];
  action?: string;
  emotion?: string;
  blocking?: { count?: number; positions?: string; facing?: string };
  depth?: { foreground?: string; midground?: string; background?: string; focus?: string };
  /** v1 model output */
  dialogue?: RawDialogue;
  dialogues?: RawDialogue[];
  onScreenText?: string;
  /** v1 model output */
  audioCue?: string;
  audioNotes?: AudioNote[];
  riskFlags?: string[];
  imagePrompt?: string;
  videoPrompt?: string;
  associatedAssetIds?: string[];
  imageUrl?: string;
  imageStatus?: GenStatus;
  imageError?: string;
  imageGeneratedAt?: number;
  videoUrl?: string;
  videoStatus?: GenStatus;
  videoError?: string;
  videoGeneratedAt?: number;
  attempts?: Partial<ShotAttempts>;
  model?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ShotNormalizationBase {
  projectId: string;
  episodeId: string;
  episodeIndex: number;
  sceneIndex: string;
  sceneLocation: string;
  sceneTimeOfDay: string;
}

const text = (value: unknown) => value == null ? "" : String(value);
const optionalText = (value: unknown) => text(value).trim() || undefined;
const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const round = (value: number) => Math.round(value * 1000) / 1000;
const oneOf = <T extends string>(value: unknown, values: T[], fallback: T): T =>
  values.includes(value as T) ? value as T : fallback;

/** Rough production estimate: 4.5 Chinese characters/sec plus a short performance pause. */
export function estimateDialogueDuration(value: string): number {
  const chars = Array.from(value.replace(/\s/g, "")).length;
  return round(Math.max(0.8, chars / 4.5 + 0.3));
}

/** Losslessly split legacy free-form cues into production intents. */
export function parseLegacyAudioCue(cue?: string): AudioNote[] {
  if (!cue?.trim()) return [];
  return cue.split(/[；;\n]+/).map(part => part.trim()).filter(Boolean).map(part => {
    if (/^(?:BGM|音乐|配乐)\s*[:：]/i.test(part)) {
      return { kind: "music", mood: part.replace(/^(?:BGM|音乐|配乐)\s*[:：]\s*/i, "") };
    }
    if (/^(?:AMB|环境音|氛围|底噪)\s*[:：]/i.test(part)) {
      return { kind: "ambience", desc: part.replace(/^(?:AMB|环境音|氛围|底噪)\s*[:：]\s*/i, "") };
    }
    return { kind: "sfx", desc: part.replace(/^(?:SFX|音效)\s*[:：]\s*/i, "") };
  });
}

function normalizeDialogues(raw: RawShot): DialogueIR[] {
  const source = Array.isArray(raw.dialogues) && raw.dialogues.length > 0
    ? raw.dialogues
    : raw.dialogue ? [raw.dialogue] : [];
  const usedIds = new Set<string>();
  return source.map((item, index): DialogueIR | null => {
    const value = item ?? {};
    const body = text(value.text ?? value.line).trim();
    if (!body) return null;
    const voice = oneOf(value.voice, VALID_VOICE, "on_screen");
    const inferredPreset = voice === "inner" ? "inner" : voice === "flashback" ? "flashback" : "clean";
    const tIn = finite(value.tIn);
    const tOut = finite(value.tOut);
    const requestedId = optionalText(value.id) ?? `dialogue_${index + 1}`;
    let id = requestedId;
    while (usedIds.has(id)) id = `${requestedId}_${index + 1}`;
    usedIds.add(id);
    return {
      id,
      speaker: text(value.speaker ?? value.character).trim(),
      text: body,
      voice,
      emotion: optionalText(value.emotion),
      presetId: oneOf(value.presetId, VALID_PRESET, inferredPreset),
      tIn: tIn == null ? undefined : Math.max(0, round(tIn)),
      tOut: tOut == null ? undefined : Math.max(0, round(tOut)),
    };
  }).filter((item): item is DialogueIR => item !== null);
}

function normalizeAudioNotes(raw: RawShot): AudioNote[] {
  if (!Array.isArray(raw.audioNotes) || raw.audioNotes.length === 0) return parseLegacyAudioCue(raw.audioCue);
  return raw.audioNotes.map((note): AudioNote | null => {
    if (!note || typeof note !== "object") return null;
    if (note.kind === "music") {
      const mood = text(note.mood).trim();
      return mood ? { kind: "music", mood } : null;
    }
    const desc = text((note as { desc?: string }).desc).trim();
    if (!desc) return null;
    if (note.kind === "ambience") return { kind: "ambience", desc };
    if (note.kind === "sfx") {
      const at = finite(note.at);
      return { kind: "sfx", desc, at: at == null ? undefined : Math.max(0, round(at)) };
    }
    return null;
  }).filter((note): note is AudioNote => note !== null);
}

function deriveRiskFlags(raw: RawShot, characters: string[], dialogues: DialogueIR[], duration: number): ShotRiskFlag[] {
  const flags = new Set<ShotRiskFlag>((raw.riskFlags ?? []).filter((flag): flag is ShotRiskFlag => VALID_RISK.includes(flag as ShotRiskFlag)));
  const action = text(raw.action);
  if (characters.length >= 3) flags.add("multi_character");
  if (/打斗|连招|追逐|翻滚|搏斗|爆炸|法术|复杂动作|fight|chase|combat/i.test(action)) flags.add("complex_action");
  if (/破碎|坍塌|流体|布料|物理模拟|碎裂|physics|destruction|fluid/i.test(action)) flags.add("physics_simulation");
  const dialogueDuration = dialogues.reduce((sum, item) => sum + estimateDialogueDuration(item.text), 0);
  if (dialogueDuration > duration) flags.add("long_dialogue");
  return [...flags];
}

export function normalizeShotIR(raw: RawShot, base: ShotNormalizationBase): Omit<ShotIR, "id"> {
  const durationRaw = finite(raw.duration);
  const duration = durationRaw == null ? 3 : Math.max(1.5, Math.min(6, Math.round(durationRaw * 2) / 2));
  const characters = Array.isArray(raw.characters)
    ? [...new Set(raw.characters.map(text).map(item => item.trim()).filter(Boolean))]
    : [];
  const dialogues = normalizeDialogues(raw);
  const audioNotes = normalizeAudioNotes(raw);
  const firstDialogue = dialogues[0];
  const now = finite(raw.createdAt) ?? Date.now();
  const updatedAt = finite(raw.updatedAt) ?? now;
  const blockingCount = finite(raw.blocking?.count);
  return {
    ...base,
    shotIndex: finite(raw.shotIndex) ?? 1,
    framing: oneOf(raw.framing, VALID_FRAMING, "MS"),
    cameraMove: oneOf(raw.cameraMove, VALID_MOVE, "static"),
    duration,
    cameraAngle: oneOf<CameraAngle>(raw.cameraAngle, ["eye", "high", "low", "dutch", "top"], "eye"),
    narrativePov: oneOf<NarrativePov>(raw.narrativePov, ["objective", "character", "flashback"], "objective"),
    characters,
    action: text(raw.action),
    emotion: optionalText(raw.emotion),
    blocking: raw.blocking || blockingCount != null ? {
      count: Math.max(0, Math.round(blockingCount ?? characters.length)),
      positions: optionalText(raw.blocking?.positions),
      facing: optionalText(raw.blocking?.facing),
    } : undefined,
    depth: raw.depth ? {
      foreground: optionalText(raw.depth.foreground),
      midground: optionalText(raw.depth.midground),
      background: optionalText(raw.depth.background),
      focus: optionalText(raw.depth.focus),
    } : undefined,
    dialogues,
    /** Keep the first line mirrored while v1 UI/export code is being phased out. */
    dialogue: firstDialogue ? { character: firstDialogue.speaker, line: firstDialogue.text } : undefined,
    onScreenText: optionalText(raw.onScreenText),
    audioNotes,
    audioCue: raw.audioCue ?? (audioNotes.length ? audioNotes.map(note => note.kind === "music" ? `BGM: ${note.mood}` : `${note.kind === "sfx" ? "SFX" : "AMB"}: ${note.desc}`).join("；") : undefined),
    riskFlags: deriveRiskFlags(raw, characters, dialogues, duration),
    imagePrompt: optionalText(raw.imagePrompt),
    videoPrompt: optionalText(raw.videoPrompt),
    associatedAssetIds: Array.isArray(raw.associatedAssetIds) ? [...new Set(raw.associatedAssetIds.map(text))] : [],
    imageUrl: optionalText(raw.imageUrl),
    imageStatus: oneOf(raw.imageStatus, VALID_STATUS, "idle"),
    imageError: optionalText(raw.imageError),
    imageGeneratedAt: finite(raw.imageGeneratedAt),
    videoUrl: optionalText(raw.videoUrl),
    videoStatus: oneOf(raw.videoStatus, VALID_STATUS, "idle"),
    videoError: optionalText(raw.videoError),
    videoGeneratedAt: finite(raw.videoGeneratedAt),
    attempts: {
      image: Math.max(0, Math.round(finite(raw.attempts?.image) ?? 0)),
      video: Math.max(0, Math.round(finite(raw.attempts?.video) ?? 0)),
    },
    model: optionalText(raw.model),
    createdAt: now,
    updatedAt,
  };
}

/** Pure, idempotent v1 -> v2 migration. It never clears generated media or attempts. */
export function migrateShot(shot: Shot): ShotIR {
  const normalized = normalizeShotIR(shot, {
    projectId: shot.projectId,
    episodeId: shot.episodeId,
    episodeIndex: shot.episodeIndex,
    sceneIndex: shot.sceneIndex,
    sceneLocation: shot.sceneLocation,
    sceneTimeOfDay: shot.sceneTimeOfDay,
  });
  return { id: shot.id, ...normalized };
}
