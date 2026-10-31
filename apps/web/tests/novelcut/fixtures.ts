import type { RawShot } from "../../src/novelcut/agent/runner";
import type { Shot } from "../../src/novelcut/types";

export const shotBase = {
  projectId: "project_demo",
  episodeId: "episode_01",
  episodeIndex: 1,
  sceneIndex: "1-1",
  sceneLocation: "晚宴厅",
  sceneTimeOfDay: "夜/内",
};

/** Same legacy-model output is used for the checked-in before/after snapshots. */
export const legacyRawShot: RawShot = {
  shotIndex: 1,
  framing: "CU",
  cameraMove: "static",
  duration: 4,
  characters: ["苏晚"],
  action: "苏晚抬眼看向画外，手指收紧。",
  dialogue: { character: "苏晚", line: "原来是你。" },
  audioCue: "BGM: 紧张弦乐；SFX: 杯盏轻碰",
  onScreenText: "莫斯科 · 顶级晚宴",
  imagePrompt: "Close-up of Su Wan, restrained shock, warm banquet light.",
};

export const modernRawShot: RawShot = {
  shotIndex: 2,
  framing: "OTS",
  cameraMove: "dolly_in",
  duration: 5,
  cameraAngle: "eye",
  narrativePov: "objective",
  characters: ["苏晚", "弗拉基米尔"],
  blocking: { count: 2, positions: "苏晚左前，弗拉基米尔右后", facing: "正反打" },
  depth: { foreground: "弗拉基米尔肩部", midground: "苏晚面部", background: "晚宴人群", focus: "苏晚眼睛" },
  action: "苏晚后退半步，握紧酒杯。",
  emotion: "压抑震惊",
  dialogues: [
    { speaker: "苏晚", text: "你一直在骗我。", voice: "on_screen", emotion: "颤抖" },
    { speaker: "苏晚", text: "原来你早就知道。", voice: "inner", presetId: "inner" },
    { speaker: "弗拉基米尔", text: "听我解释。", voice: "off_screen", presetId: "phone" },
  ],
  audioNotes: [
    { kind: "ambience", desc: "晚宴低声交谈与杯盏声" },
    { kind: "sfx", desc: "一声轻微杯盏碰撞", at: 1.5 },
    { kind: "music", mood: "压抑弦乐渐强" },
  ],
  imagePrompt: "Over-the-shoulder shot, Su Wan in focus, restrained shock, warm banquet light.",
  videoPrompt: "Su Wan steps back half a pace and tightens her grip; camera slowly pushes in.",
};

export function persistedShot(patch: Partial<Shot> = {}): Shot {
  return {
    id: "shot_01",
    ...shotBase,
    shotIndex: 1,
    framing: "CU",
    cameraMove: "static",
    duration: 4,
    characters: ["苏晚"],
    action: "苏晚抬眼。",
    associatedAssetIds: ["asset_su_wan"],
    imageStatus: "done",
    imageUrl: "https://cdn.example.test/shot-01.png",
    imageGeneratedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...patch,
  };
}
