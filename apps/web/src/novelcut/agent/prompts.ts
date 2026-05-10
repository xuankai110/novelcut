/** Prompts for 编剧 Agent — skeleton + episode plan. */
import type { Chapter, Project, StorySkeleton } from "../types";

/** Compress all events from chapters into a compact textual form for the model.
 *  Format keeps chapter context + beat + characters + locations, drops excerpts to save tokens. */
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
- storyCore: 故事内核 (50-100 字,讲清主角的核心冲突/成长/价值观)
- hiddenPlot: 隐线 (30-80 字,贯穿全剧的暗线/反转点/悬念)
- characterCores: 主要人物数组,每人 { name, role, arc },role 用"女主/男主/反派/重要配角"等,arc 描述弧光 (40-80 字)
- threeActs: { act1, act2, act3 },每幕 { range, summary, keyBeats },range 形如 "1-20集",summary 50-80 字,keyBeats 3-5 条
- adaptationPrinciples: 改编原则数组 3-5 条,如「强化爽点节奏」「砍掉旁支线」「每集必有钩子」等具体方向

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

export const EPISODE_PLAN_SYSTEM = `你是一位资深短剧编剧。基于用户给的「故事骨架」和「事件列表」,把内容分配到指定数量的集数。

每集对象字段:
- index: 集号 (1 起始,递增)
- title: 集名 (8-15 字,带钩子感,不要写"第N集")
- summary: 本集梗概 (80-120 字,讲清这一集发生了什么、谁做了什么、走向哪里)
- beats: 关键节拍 3-5 条 (每条 10-25 字)
- hookOpen: 开场钩子 (10-20 字,本集开头第一帧的强吸引点)
- hookEnd: 结尾留白 (10-20 字,把观众拉到下一集的悬念)
- retainsEvents: 字符串数组,从输入事件列表里选这一集复用了哪些事件,直接用事件 summary
- newScenes: 字符串数组(可选),编剧新增的场景或情节,每条一句话

输出严格 JSON: { "episodes": [...] },不要 markdown,不要解释。`;

export function buildEpisodePlanUser(
  project: Project, chapters: Chapter[], skeleton: StorySkeleton, episodeCount: number,
): string {
  return [
    `项目: ${project.name} · ${project.genre} · ${project.tone} · ${project.platform} 竖屏 9:16`,
    `本次规划集数: ${episodeCount} 集 × ~30 秒`,
    ``,
    `=== 故事骨架 ===`,
    JSON.stringify(skeleton, null, 2),
    ``,
    `=== 章节事件列表 ===`,
    compressEvents(chapters),
    ``,
    `请把以上事件分配到 ${episodeCount} 集中,每集要么复用原著事件、要么编剧新增场景填补节奏。`,
    `集与集之间情绪曲线连贯,每集结尾必须有 hookEnd。`,
    `平均每集承载 2-4 个原著事件或新场景。`,
  ].join("\n");
}
