import { beforeEach, describe, expect, it } from "vitest";
import type { Shot } from "../../src/novelcut/types";
import { listShots, setShots } from "../../src/novelcut/store";

const memory = new Map<string, string>();
let quotaExceeded = false;

function installLocalStorage() {
  const localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (quotaExceeded) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      memory.set(key, value);
    },
    removeItem: (key: string) => { memory.delete(key); },
    clear: () => { memory.clear(); },
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
    writable: true,
  });
}

const legacyStoredShot = {
  id: "shot_legacy",
  projectId: "project_demo",
  episodeId: "episode_01",
  episodeIndex: 1,
  sceneIndex: "1-1",
  sceneLocation: "晚宴厅",
  sceneTimeOfDay: "夜/内",
  shotIndex: 1,
  framing: "CU",
  cameraMove: "static",
  duration: 4,
  characters: ["苏晚"],
  action: "苏晚抬眼。",
  dialogue: { character: "苏晚", line: "原来是你。" },
  audioCue: "BGM: 紧张弦乐；SFX: 杯盏轻碰",
  imageUrl: "https://cdn.example.test/legacy.png",
  imageStatus: "done",
  associatedAssetIds: ["asset_su_wan"],
  attempts: { image: 2, video: 0 },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

describe("shot persistence migration", () => {
  beforeEach(() => {
    memory.clear();
    quotaExceeded = false;
    installLocalStorage();
  });

  it("reads legacy localStorage records through the v2 migration without losing media", () => {
    memory.set("novelcut:v1:shots:project_demo", JSON.stringify([legacyStoredShot]));
    const [shot] = listShots("project_demo");
    expect(shot?.dialogues?.[0]?.text).toBe("原来是你。");
    expect(shot?.audioNotes).toEqual([
      { kind: "music", mood: "紧张弦乐" },
      { kind: "sfx", desc: "杯盏轻碰" },
    ]);
    expect(shot?.imageUrl).toBe("https://cdn.example.test/legacy.png");
    expect(shot?.attempts).toEqual({ image: 2, video: 0 });
  });

  it("writes normalized v2 records and keeps retry counters", () => {
    const shot: Shot = {
      ...(legacyStoredShot as unknown as Shot),
      attempts: { image: 4, video: 2 },
      dialogues: [{
        id: "dialogue_1", speaker: "苏晚", text: "别过来。", voice: "inner", presetId: "inner",
      }],
      audioNotes: [{ kind: "ambience", desc: "雨声" }],
    };
    setShots("project_demo", [shot]);
    const stored = JSON.parse(memory.get("novelcut:v1:shots:project_demo") ?? "[]") as Shot[];
    expect(stored[0]?.dialogues?.[0]).toMatchObject({ voice: "inner", text: "别过来。" });
    expect(stored[0]?.audioNotes).toEqual([{ kind: "ambience", desc: "雨声" }]);
    expect(stored[0]?.attempts).toEqual({ image: 4, video: 2 });
  });

  it("surfaces quota exhaustion instead of pretending the save succeeded", () => {
    quotaExceeded = true;
    expect(() => setShots("project_demo", [legacyStoredShot as unknown as Shot]))
      .toThrow(/存储空间不足/);
  });
});
