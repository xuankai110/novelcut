import { describe, expect, it } from "vitest";
import {
  migrateShot, normalizeShotIR, parseLegacyAudioCue,
} from "../../src/novelcut/agent/shotIR";
import { legacyRawShot, modernRawShot, persistedShot, shotBase } from "./fixtures";

describe("normalizeShotIR", () => {
  it("migrates a v1 single dialogue and free-form audio cue without losing fields", () => {
    const shot = normalizeShotIR(legacyRawShot, shotBase);
    expect(shot.dialogues).toEqual([{
      id: "dialogue_1",
      speaker: "苏晚",
      text: "原来是你。",
      voice: "on_screen",
      emotion: undefined,
      presetId: "clean",
      tIn: undefined,
      tOut: undefined,
    }]);
    expect(shot.dialogue).toEqual({ character: "苏晚", line: "原来是你。" });
    expect(shot.audioNotes).toEqual([
      { kind: "music", mood: "紧张弦乐" },
      { kind: "sfx", desc: "杯盏轻碰" },
    ]);
    expect(shot.imagePrompt).toContain("Close-up");
    expect(shot.videoStatus).toBe("idle");
    expect(shot.attempts).toEqual({ image: 0, video: 0 });
  });

  it("keeps multiple dialogue voices, blocking, depth and structured audio", () => {
    const shot = normalizeShotIR(modernRawShot, shotBase);
    expect(shot.dialogues.map(item => item.voice)).toEqual(["on_screen", "inner", "off_screen"]);
    expect(shot.dialogues[1]?.presetId).toBe("inner");
    expect(shot.dialogues[2]?.presetId).toBe("phone");
    expect(shot.blocking).toEqual({ count: 2, positions: "苏晚左前，弗拉基米尔右后", facing: "正反打" });
    expect(shot.depth?.focus).toBe("苏晚眼睛");
    expect(shot.audioNotes.map(note => note.kind)).toEqual(["ambience", "sfx", "music"]);
    expect(shot.videoPrompt).toContain("steps back");
    expect(shot.duration).toBe(5);
  });

  it("falls back on invalid enums and clamps duration instead of silently accepting bad data", () => {
    const shot = normalizeShotIR({
      framing: "WIDE",
      cameraMove: "orbit",
      cameraAngle: "worm",
      narrativePov: "god",
      duration: 99,
      characters: ["A", "", "A"],
    }, shotBase);
    expect(shot.framing).toBe("MS");
    expect(shot.cameraMove).toBe("static");
    expect(shot.cameraAngle).toBe("eye");
    expect(shot.narrativePov).toBe("objective");
    expect(shot.duration).toBe(6);
    expect(shot.characters).toEqual(["A"]);
  });

  it("flags long dialogue, multi-character, complex action and physics risks without truncating text", () => {
    const longLine = "这".repeat(60);
    const shot = normalizeShotIR({
      shotIndex: 3,
      duration: 1.5,
      characters: ["A", "B", "C"],
      action: "三人在爆炸中打斗，玻璃破碎",
      dialogues: [{ speaker: "A", text: longLine, voice: "on_screen" }],
    }, shotBase);
    expect(shot.riskFlags).toEqual(expect.arrayContaining([
      "multi_character", "complex_action", "physics_simulation", "long_dialogue",
    ]));
    expect(shot.dialogues[0]?.text).toHaveLength(60);
  });

  it("deduplicates dialogue ids emitted by an inconsistent model", () => {
    const shot = normalizeShotIR({
      dialogues: [
        { id: "same", speaker: "A", text: "第一句" },
        { id: "same", speaker: "B", text: "第二句" },
      ],
    }, shotBase);
    expect(new Set(shot.dialogues.map(item => item.id)).size).toBe(2);
  });

  it("splits legacy audio cues by prefix", () => {
    expect(parseLegacyAudioCue("BGM：压抑弦乐；环境音：雨声；杯子落地")).toEqual([
      { kind: "music", mood: "压抑弦乐" },
      { kind: "ambience", desc: "雨声" },
      { kind: "sfx", desc: "杯子落地" },
    ]);
    expect(parseLegacyAudioCue()).toEqual([]);
  });
});

describe("migrateShot", () => {
  it("preserves generated media and retry counts", () => {
    const migrated = migrateShot(persistedShot({
      dialogue: { character: "苏晚", line: "原来是你。" },
      audioCue: "SFX: 杯盏碰撞",
      attempts: { image: 3, video: 1 },
    }));
    expect(migrated.id).toBe("shot_01");
    expect(migrated.imageUrl).toBe("https://cdn.example.test/shot-01.png");
    expect(migrated.imageStatus).toBe("done");
    expect(migrated.attempts).toEqual({ image: 3, video: 1 });
    expect(migrated.dialogues[0]?.text).toBe("原来是你。");
    expect(migrated.audioNotes).toEqual([{ kind: "sfx", desc: "杯盏碰撞" }]);
  });

  it("is idempotent", () => {
    const once = migrateShot(persistedShot({
      dialogue: { character: "苏晚", line: "原来是你。" },
      audioCue: "BGM: 紧张弦乐",
    }));
    const twice = migrateShot(once);
    expect(twice.dialogues).toEqual(once.dialogues);
    expect(twice.audioNotes).toEqual(once.audioNotes);
    expect(twice.riskFlags).toEqual(once.riskFlags);
  });
});
