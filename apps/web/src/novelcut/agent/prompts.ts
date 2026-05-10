/** Prompts for 编剧 Agent — skeleton + episode plan + script. */
import type { Chapter, Episode, EpisodeBlueprint, Project, StorySkeleton } from "../types";

export function compressEvents(chapters: Chapter[]): string {
  const lines: string[] = [];
  let n = 0;
  for (const ch of chapters) {
    if (!ch.events || ch.events.length === 0) continue;
    for (const e of ch.events) {
      n++;
      const chars = e.characters.length ? ` [人物:${e.characters.join("/")}]` : "";
      const locs = e.locations.length ? ` [地点:${e.locations.join("/")}]` : "";
      lines.push(`#${n} ${ch.title}·beat${e.beat}: ${e.summary}${chars}${locs}`);
    }
  }
  return lines.join("\n");
}

export const SKELETON_SYSTEM = `你是一位资深短剧编剧。给你一部小说所有章节的"故事事件"列表,你要从中提炼出适合改编为竖屏短剧的「故事骨架」。

输出严格 JSON,字段:
- oneLiner: 一句话故事 (20-40 字)
- storyCore: 故事内核 (50-100 字)
- hiddenPlot: 隐线 (30-80 字)
- characterCores: 主要人物数组,每人 { name, role, arc },role 用"女主/男主/反派/重要配角"等
- threeActs: { act1, act2, act3 },每幕 { range, summary, keyBeats },range 形如 "1-20集"
- adaptationPrinciples: 改编原则数组 3-5 条

只输出 JSON,不要 markdown 代码块,不要任何额外文字。`;

export function buildSkeletonUser(project: Project, chapters: Chapter[]): string {
  return [
    `项目设定:`,
    `- 标题: ${project.name}`,
    `- 题材: ${project.genre}`,
    `- 风格基调: ${project.tone}`,
    `- 发布平台: ${project.platform} (竖屏 9:16)`,
    `- 计划集数: ${project.episodeCount} 集 × 30 秒/集`,
    project.synopsis ? `- 故事核(用户提供): ${project.synopsis}` : "",
    ``,
    `共 ${chapters.length} 章,以下是按章节顺序的事件列表:`,
    ``,
    compressEvents(chapters),
  ].filter(Boolean).join("\n");
}

export const EPISODE_PLAN_SYSTEM = `你是一位资深短剧编剧。基于「故事骨架」和「事件列表」,把内容分配到指定的集数区间。

每集对象字段:
- index: 集号 (1 起始,严格按用户要求的区间生成)
- title: 集名 (8-15 字,带钩子感,不要写"第N集")
- summary: 本集梗概 (80-120 字)
- beats: 关键节拍 3-5 条
- hookOpen: 开场钩子 (10-20 字)
- hookEnd: 结尾留白 (10-20 字)
- retainsEvents: 数组,从输入事件列表里选这一集复用的事件 summary
- newScenes: 数组(可选),编剧新增的场景

输出严格 JSON: { "episodes": [...] },不要 markdown,不要解释。`;

export function buildEpisodePlanUser(
  project: Project, chapters: Chapter[], skeleton: StorySkeleton,
  rangeStart: number, rangeEnd: number, totalEpisodes: number,
  prevEpisodes: EpisodeBlueprint[] = [],
): string {
  const parts: string[] = [
    `项目: ${project.name} · ${project.genre} · ${project.tone} · ${project.platform} 竖屏 9:16`,
    `本剧总集数: ${totalEpisodes} 集 × ~30 秒`,
    `本次只生成第 ${rangeStart} 集到第 ${rangeEnd} 集 (共 ${rangeEnd - rangeStart + 1} 集),其余集次不要输出。`,
    ``,
    `=== 故事骨架 ===`,
    JSON.stringify(skeleton, null, 2),
    ``,
    `=== 章节事件列表 ===`,
    compressEvents(chapters),
    ``,
  ];
  if (prevEpisodes.length > 0) {
    parts.push(`=== 已生成的前序集次 (供你保持连贯,不要重复输出) ===`);
    for (const ep of prevEpisodes) {
      parts.push(`EP${String(ep.index).padStart(2, "0")} 「${ep.title}」 ${ep.summary} | 钩尾: ${ep.hookEnd}`);
    }
    parts.push(``);
  }
  parts.push(
    `请生成第 ${rangeStart} 集到第 ${rangeEnd} 集的 blueprint,index 字段必须是这个区间的数字。`,
    `集与集之间情绪曲线连贯,每集结尾必须有 hookEnd。`,
    `平均每集承载 2-4 个原著事件或新场景。`,
    `输出严格 JSON: { "episodes": [{...}, {...}, ...] }`,
  );
  return parts.join("\n");
}

// =============== Script (per-episode) ===============

export const SCRIPT_SYSTEM = `你是一位资深竖屏短剧编剧,擅长把一集 blueprint 扩写成可拍摄的完整剧本。

约束:
- 每集 ~30 秒,~150-200 字台词,2-4 个场景 (一个场景就是一个机位/空间切换)
- 钩开场:第一帧必须吸引滑动观众停下
- 钩结尾:最后 3 秒必须留悬念,让观众点下一集
- 台词竖屏短剧风格:**短、辣、直接、带身份感**,避免文绉绉的旁白
- 动作描述用 "△" 开头 (如 "△伊万端着高脚杯逼近,西装笔挺")
- 严格用项目设定的语言写台词与动作 (zh-CN 简体中文 / ru-RU 俄语 / en-US 英文 等)

输出严格 JSON,只输出一个对象:
{
  "synopsis": "100-200 字本集梗概",
  "scenes": [
    {
      "index": "1-1",                   // 场号-镜次
      "location": "晚宴厅角落",
      "timeOfDay": "夜/内",             // 日/夜 + 内/外
      "characters": ["苏晚", "弗拉基米尔"],
      "actions": ["△晚宴厅灯火辉煌...", "△伊万端着高脚杯..."],
      "dialogue": [
        {"character": "苏晚", "emotion": "颤抖", "line": "..."},
        {"character": "伊万", "emotion": "冷笑", "line": "..."}
      ],
      "audioCues": ["BGM: 紧张弦乐", "SFX: 杯口轻碰"],
      "onScreenText": "莫斯科 · 顶级晚宴"
    }
  ]
}

不要 markdown 代码块,不要任何解释文字。`;

export function buildScriptUser(
  project: Project, skeleton: StorySkeleton, episode: Episode,
  prevHookEnd?: string,
): string {
  const bp = episode.blueprint;
  const parts: string[] = [
    `项目: ${project.name} · ${project.genre} · ${project.tone}`,
    `语言: ${project.language} (台词与动作必须用此语言书写)`,
    `平台: ${project.platform} 竖屏 9:16`,
    ``,
    `=== 主要人物核 (供你保持人物一致) ===`,
    skeleton.characterCores.map(c => `- ${c.role} ${c.name}: ${c.arc}`).join("\n"),
    ``,
    `=== 改编原则 ===`,
    skeleton.adaptationPrinciples.map(p => `- ${p}`).join("\n"),
    ``,
  ];
  if (prevHookEnd) {
    parts.push(`=== 上一集结尾留白 (供你做承接) ===`, prevHookEnd, ``);
  }
  parts.push(
    `=== 本集 blueprint ===`,
    `EP${String(episode.index).padStart(2, "0")} · 「${episode.title}」`,
    bp ? `开场钩子: ${bp.hookOpen}` : "",
    bp ? `结尾留白: ${bp.hookEnd}` : "",
    bp ? `本集梗概: ${bp.summary}` : "",
    bp?.beats?.length ? `关键节拍:\n${bp.beats.map((b, i) => `  ${i + 1}. ${b}`).join("\n")}` : "",
    bp?.retainsEvents?.length ? `复用原著事件:\n${bp.retainsEvents.map(e => `  - ${e}`).join("\n")}` : "",
    bp?.newScenes?.length ? `编剧新增场景:\n${bp.newScenes.map(s => `  - ${s}`).join("\n")}` : "",
    ``,
    `请按 SCRIPT_SYSTEM 的格式扩写出本集完整剧本 JSON。`,
  );
  return parts.filter(Boolean).join("\n");
}
