import { estimateDialogueDuration, migrateShot } from "../agent/shotIR";
import type { Asset, Shot } from "../types";
import type {
  ClipKind, RenderClip, RenderPlan, RenderTrack, TrackClip, Transition,
} from "./types";

type WithoutTrack<T> = T extends unknown ? Omit<T, "trackId"> : never;
type UnassignedClip = WithoutTrack<RenderClip>;

const round = (value: number) => Math.round(value * 1000) / 1000;
const validTime = (value: number | undefined) => value != null && Number.isFinite(value) && value >= 0;

/**
 * Compile narrative intent into independent deliverables. No provider calls and no mutation.
 * Voice clips are laid out sequentially; missing timings remain explicitly marked estimated.
 */
export function compileShot(input: Shot, assets: Asset[] = []): TrackClip[] {
  const shot = migrateShot(input);
  const clips: TrackClip[] = [];
  let voiceCursor = 0;

  shot.dialogues.forEach((dialogue) => {
    const estimatedStart = !validTime(dialogue.tIn);
    const requestedStart = estimatedStart ? voiceCursor : Math.max(0, dialogue.tIn!);
    const start = Math.max(voiceCursor, requestedStart);
    const estimatedDuration = estimateDialogueDuration(dialogue.text);
    const requestedEnd = validTime(dialogue.tOut) && dialogue.tOut! > start
      ? dialogue.tOut!
      : start + estimatedDuration;
    const end = Math.max(start + 0.1, requestedEnd);
    const voiceAsset = assets.find(asset => asset.kind === "char" && asset.name === dialogue.speaker);
    clips.push({
      id: `${shot.id}:voice:${dialogue.id}`,
      shotId: shot.id,
      kind: "voice",
      tIn: round(start),
      tOut: round(end),
      payload: {
        speaker: dialogue.speaker,
        text: dialogue.text,
        voice: dialogue.voice,
        emotion: dialogue.emotion,
        voiceId: voiceAsset?.voiceProfile?.voiceId,
      },
      presetId: dialogue.presetId ?? "clean",
      status: "idle",
      attempts: 0,
      estimated: estimatedStart || !validTime(dialogue.tOut) || start !== requestedStart,
    });
    voiceCursor = end;
  });

  shot.audioNotes.forEach((note, index) => {
    const base = {
      shotId: shot.id,
      status: "idle" as const,
      attempts: 0,
      estimated: true,
    };
    if (note.kind === "sfx") {
      const start = validTime(note.at) ? note.at! : 0;
      clips.push({
        ...base,
        id: `${shot.id}:sfx:${index + 1}`,
        kind: "sfx",
        tIn: round(start),
        tOut: round(start + 1),
        payload: { desc: note.desc },
        estimated: !validTime(note.at),
      });
    } else if (note.kind === "ambience") {
      clips.push({
        ...base,
        id: `${shot.id}:ambience:${index + 1}`,
        kind: "ambience",
        tIn: 0,
        tOut: shot.duration,
        payload: { desc: note.desc },
      });
    } else {
      clips.push({
        ...base,
        id: `${shot.id}:music:${index + 1}`,
        kind: "music",
        tIn: 0,
        tOut: shot.duration,
        payload: { mood: note.mood },
      });
    }
  });
  return clips;
}

function assignTracks(clips: UnassignedClip[]): { clips: RenderClip[]; tracks: RenderTrack[] } {
  const tracks: RenderTrack[] = [];
  const trackEnds = new Map<string, number>();
  const rendered: RenderClip[] = [];
  const ordered = [...clips].sort((a, b) => a.absIn - b.absIn || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  for (const clip of ordered) {
    let track = tracks.find(candidate => candidate.kind === clip.kind && (trackEnds.get(candidate.id) ?? 0) <= clip.absIn + 1e-9);
    if (!track) {
      const number = tracks.filter(candidate => candidate.kind === clip.kind).length + 1;
      track = { id: `${clip.kind}_${number}`, kind: clip.kind, clipIds: [] };
      tracks.push(track);
    }
    track.clipIds.push(clip.id);
    trackEnds.set(track.id, clip.absOut);
    rendered.push({ ...clip, trackId: track.id });
  }
  return { clips: rendered, tracks };
}

/**
 * Compile the episode in the supplied shot order. Absolute times are derived only here;
 * changing a duration or reordering shots therefore cannot stale the source IR.
 */
export function compileEpisode(inputShots: Shot[], transitions: Transition[] = [], assets: Asset[] = []): RenderPlan {
  if (inputShots.length === 0) throw new Error("compileEpisode requires at least one shot");
  const shots = inputShots.map(migrateShot);
  const projectId = shots[0]!.projectId;
  const episodeId = shots[0]!.episodeId;
  let cursor = 0;
  const planShots: RenderPlan["shots"] = [];
  const unassigned: UnassignedClip[] = [];

  for (const shot of shots) {
    const clips = compileShot(shot, assets);
    const startSec = round(cursor);
    const endSec = round(startSec + shot.duration);
    planShots.push({ shotId: shot.id, startSec, endSec, duration: shot.duration, clipIds: clips.map(clip => clip.id) });
    for (const clip of clips) {
      unassigned.push({ ...clip, absIn: round(startSec + clip.tIn), absOut: round(startSec + clip.tOut) });
    }
    cursor = endSec;
  }

  const { clips, tracks } = assignTracks(unassigned);
  /** Long dialogue may overhang its shot by design; the render must still contain every clip. */
  const duration = Math.max(cursor, ...clips.map(clip => clip.absOut));
  return {
    version: 1,
    projectId,
    episodeId,
    duration: round(duration),
    shots: planShots,
    clips,
    tracks,
    transitions,
    layers: ["video", "cg", "on_screen_text", "subtitle", "ai_disclosure"],
  };
}

export function clipsOfKind(plan: RenderPlan, kind: ClipKind): RenderClip[] {
  return plan.clips.filter(clip => clip.kind === kind);
}
