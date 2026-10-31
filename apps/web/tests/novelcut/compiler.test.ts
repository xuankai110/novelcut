import { describe, expect, it } from "vitest";
import { normalizeShotIR } from "../../src/novelcut/agent/shotIR";
import type { Asset, Shot } from "../../src/novelcut/types";
import { compileEpisode, compileShot } from "../../src/novelcut/production/compiler";
import { getVoicePreset, VOICE_PRESETS } from "../../src/novelcut/production/presets";
import { formatSrtTime, renderPlanToSrt } from "../../src/novelcut/production/srt";
import { legacyRawShot, modernRawShot, shotBase } from "./fixtures";
import type { RawShot } from "../../src/novelcut/agent/shotIR";

function makeShot(raw: RawShot, id: string, patch: Partial<Shot> = {}): Shot {
  return {
    id,
    ...normalizeShotIR(raw, shotBase),
    ...patch,
  };
}

const suWanAsset: Asset = {
  id: "asset_su_wan",
  projectId: "project_demo",
  kind: "char",
  name: "苏晚",
  voiceProfile: { provider: "elevenlabs", voiceId: "voice_su_wan" },
  createdAt: 1,
};

describe("compileShot", () => {
  it("turns each dialogue into its own voice clip and carries the character voice profile", () => {
    const shot = makeShot(modernRawShot, "shot_modern");
    const clips = compileShot(shot, [suWanAsset]);
    const voices = clips.filter(clip => clip.kind === "voice");
    expect(voices).toHaveLength(3);
    expect(voices.map(clip => clip.payload.speaker)).toEqual(["苏晚", "苏晚", "弗拉基米尔"]);
    expect(voices[0]).toMatchObject({
      id: "shot_modern:voice:dialogue_1",
      presetId: "clean",
      status: "idle",
      attempts: 0,
    });
    if (voices[0]?.kind === "voice") expect(voices[0].payload.voiceId).toBe("voice_su_wan");
    expect(clips.filter(clip => clip.kind === "sfx")).toHaveLength(1);
    expect(clips.filter(clip => clip.kind === "ambience")).toHaveLength(1);
    expect(clips.filter(clip => clip.kind === "music")).toHaveLength(1);
  });

  it("keeps clip identity stable when dialogue order changes", () => {
    const firstOrder = makeShot({
      duration: 4,
      dialogues: [
        { id: "line_a", speaker: "A", text: "第一句" },
        { id: "line_b", speaker: "B", text: "第二句" },
      ],
    }, "shot_order");
    const secondOrder = makeShot({
      ...firstOrder,
      dialogues: [...(firstOrder.dialogues ?? [])].reverse(),
    }, "shot_order");
    const identity = (shot: Shot) => Object.fromEntries(compileShot(shot)
      .filter(clip => clip.kind === "voice")
      .map(clip => [clip.id, clip.kind === "voice" ? clip.payload.text : ""]));
    expect(identity(firstOrder)).toEqual(identity(secondOrder));
  });

  it("estimates relative voice timing sequentially and never silently drops long text", () => {
    const shot = makeShot({
      duration: 2,
      dialogues: [
        { speaker: "A", text: "第一句" },
        { speaker: "B", text: "第二句", tIn: 0, tOut: 0.5 },
      ],
    }, "shot_long");
    const voices = compileShot(shot).filter(clip => clip.kind === "voice");
    expect(voices[0]!.tIn).toBe(0);
    expect(voices[1]!.tIn).toBeGreaterThanOrEqual(voices[0]!.tOut);
    expect(voices[1]!.estimated).toBe(true);
  });
});

describe("compileEpisode", () => {
  const first = makeShot(legacyRawShot, "shot_a");
  const second = makeShot(modernRawShot, "shot_b");

  it("derives absolute times and keeps clips on one track from overlapping", () => {
    const plan = compileEpisode([first, second]);
    expect(plan.duration).toBe(Math.max(...plan.clips.map(clip => clip.absOut)));
    expect(plan.duration).toBeGreaterThanOrEqual(9);
    expect(plan.shots.map(shot => shot.startSec)).toEqual([0, 4]);
    expect(plan.shots[1]?.endSec).toBe(9);
    expect(second.riskFlags).toContain("long_dialogue");
    expect(plan.layers).toEqual(["video", "cg", "on_screen_text", "subtitle", "ai_disclosure"]);
    for (const track of plan.tracks) {
      const clips = plan.clips.filter(clip => clip.trackId === track.id).sort((a, b) => a.absIn - b.absIn);
      for (let i = 1; i < clips.length; i++) {
        expect(clips[i]!.absIn).toBeGreaterThanOrEqual(clips[i - 1]!.absOut);
      }
    }
    const voice = plan.clips.find(clip => clip.kind === "voice");
    const ambience = plan.clips.find(clip => clip.kind === "ambience");
    expect(voice?.trackId).not.toBe(ambience?.trackId);
  });

  it("recomputes every downstream absolute time when one shot duration changes", () => {
    const original = compileEpisode([first, second]);
    const stretchedFirst = { ...first, duration: 5.5 };
    const changed = compileEpisode([stretchedFirst, second]);
    expect(original.shots[1]?.startSec).toBe(4);
    expect(changed.shots[1]?.startSec).toBe(5.5);
    const originalVoice = original.clips.find(clip => clip.shotId === "shot_b" && clip.kind === "voice")!;
    const changedVoice = changed.clips.find(clip => clip.shotId === "shot_b" && clip.kind === "voice")!;
    expect(changedVoice.absIn - originalVoice.absIn).toBeCloseTo(1.5, 5);
    expect(changed.duration - original.duration).toBeCloseTo(1.5, 5);
  });

  it("preserves transitions as edit-layer objects rather than shot fields", () => {
    const plan = compileEpisode([first, second], [{
      id: "transition_1", fromShotId: "shot_a", toShotId: "shot_b", kind: "dissolve", duration: 0.4,
    }]);
    expect(plan.transitions[0]).toMatchObject({ fromShotId: "shot_a", toShotId: "shot_b", kind: "dissolve" });
  });

  it("rejects an empty episode instead of producing a misleading plan", () => {
    expect(() => compileEpisode([])).toThrow(/at least one shot/);
  });
});

describe("subtitles and presets", () => {
  it("derives SRT from voice clips with correct timestamps and speaker names", () => {
    const plan = compileEpisode([makeShot(legacyRawShot, "shot_a")]);
    const srt = renderPlanToSrt(plan);
    expect(srt).toContain("1\n00:00:00,000 -->");
    expect(srt).toContain("苏晚：原来是你。");
    expect(formatSrtTime(3661.234)).toBe("01:01:01,234");
  });

  it("only allows fixed preset filters", () => {
    expect(getVoicePreset("phone").ffmpegFilter).toBe("highpass=f=300,lowpass=f=3400");
    expect(getVoicePreset(undefined).ffmpegFilter).toBe("anull");
    expect(Object.keys(VOICE_PRESETS)).toEqual(["clean", "phone", "inner", "flashback", "loudspeaker"]);
  });
});
