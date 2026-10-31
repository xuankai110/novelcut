import { describe, expect, it } from "vitest";
import type { Project } from "../../src/novelcut/types";
import {
  SHOTLIST_SYSTEM, buildShotImageGenPrompt, buildShotlistUser,
} from "../../src/novelcut/agent/prompts";

const project: Project = {
  id: "project_demo",
  name: "晚宴",
  genre: "悬疑推理",
  language: "中文",
  platform: "抖音",
  tone: "悬疑紧张",
  episodeCount: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe("shotlist prompt contract", () => {
  it("asks for multi-dialogue, structured audio, video motion and risks", () => {
    expect(SHOTLIST_SYSTEM).toContain("dialogues:");
    expect(SHOTLIST_SYSTEM).toContain("audioNotes:");
    expect(SHOTLIST_SYSTEM).toContain("videoPrompt:");
    expect(SHOTLIST_SYSTEM).toContain("long_dialogue");
    expect(SHOTLIST_SYSTEM).toContain("一镜只保留一个主动作");
    expect(SHOTLIST_SYSTEM).toContain("不输出绝对时码");
    expect(SHOTLIST_SYSTEM).not.toContain("audioCue:");
  });

  it("passes scene audio and dialogue into the user prompt", () => {
    const body = buildShotlistUser({
      project,
      skeleton: null,
      episode: { id: "ep1", projectId: "project_demo", index: 1, title: "晚宴", status: "scripted" },
      scene: {
        index: "1-1",
        location: "晚宴厅",
        timeOfDay: "夜/内",
        characters: ["苏晚"],
        actions: ["苏晚抬眼。"],
        dialogue: [{ character: "苏晚", emotion: "震惊", line: "原来是你。" }],
        audioCues: ["BGM: 紧张弦乐"],
      },
    });
    expect(body).toContain("苏晚(震惊): 原来是你。");
    expect(body).toContain("BGM: 紧张弦乐");
    expect(body).toContain("场号: 1-1");
  });
});

describe("shot image prompt regression", () => {
  it("still starts with framing and ends with framing negatives", () => {
    const prompt = buildShotImageGenPrompt({
      shot: {
        framing: "ECU",
        cameraMove: "static",
        characters: ["苏晚"],
        action: "她抬眼。",
        imagePrompt: "Close-up of her eyes, restrained shock.",
      },
      project,
      characterAssets: [{ name: "苏晚", prompt: "Su Wan, 25, black hair, red dress, front view, side view" }],
      sceneAsset: { prompt: "Banquet hall at night, warm chandelier glow" },
    });
    expect(prompt).toMatch(/^(EXTREME CLOSE-UP|ECU)/i);
    expect(prompt).toContain("Subject 苏晚:");
    expect(prompt).toContain("no torso");
    expect(prompt).toContain("9:16 vertical short drama frame");
  });
});
