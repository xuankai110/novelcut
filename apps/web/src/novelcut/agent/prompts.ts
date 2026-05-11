/** Prompts for 编剧 Agent — skeleton + episode plan + script + asset visual prompt. */
import type { Asset, Chapter, Episode, EpisodeBlueprint, Project, StorySkeleton } from "../types";

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

export const SCRIPT_SYSTEM = `你是一位资深竖屏短剧编剧,擅长把一集 blueprint 扩写成可拍摄的完整剧本。

约束:
- 每集 ~30 秒,~150-200 字台词,2-4 个场景
- 钩开场/钩结尾必须强力
- 台词竖屏短剧风格:**短、辣、直接、带身份感**
- 动作描述用 "△" 开头
- 严格用项目设定的语言写台词与动作

输出严格 JSON,只输出一个对象:
{
  "synopsis": "100-200 字本集梗概",
  "scenes": [
    {
      "index": "1-1",
      "location": "晚宴厅角落",
      "timeOfDay": "夜/内",
      "characters": ["苏晚", "弗拉基米尔"],
      "actions": ["△晚宴厅灯火辉煌..."],
      "dialogue": [
        {"character": "苏晚", "emotion": "颤抖", "line": "..."},
      ],
      "audioCues": ["BGM: 紧张弦乐"],
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
  if (prevHookEnd) parts.push(`=== 上一集结尾留白 (供你做承接) ===`, prevHookEnd, ``);
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

// =============== Asset visual prompt (Toonflow-style 视觉手册) ===============

const COMMON_RULES = `通用规则:
- 用英文写主体提示词 (image gen 模型对英文反应更稳定),少量专有名词可保留中文
- 严格用项目题材调性: 都市霸总用冷峻光影,玄幻仙侠用空灵雾气,古装宫斗用奢华色调,现代悬疑用冷色调高反差
- 严禁: NSFW / 品牌词 / 商标 / 文字水印 / 夸张表情 / 卡通风格 (除非项目要求)
- 必须 photorealistic + cinematic + 4K + sharp focus`;

const CHAR_RULES = `角色四视图标准规范 (这是行业铁律,严格遵守):

布局: 同一画面左到右并排 4 个视图
  视图 1 - 人像特写: 头顶到锁骨完整入画,五官清晰,占面板 60%+
  视图 2 - 正视图: 全身立像,正面 0°,面对镜头,双臂自然下垂
  视图 3 - 侧视图: 全身立像,右侧 90°,纯侧面轮廓清晰
  视图 4 - 后视图: 全身立像,后方 180°,后脑/背部/发尾/脚部清晰

硬约束:
  R1 背景: 素灰纯色 #B8B8B8 (干净,便于后续合成)
  R2 画面比例: 16:9 (4 视图横向并排)
  R3 站姿: 自然站立,双脚平行微分,双臂自然下垂
  R4 表情: 中性微表情,符合角色气质
  R5 光线: 均匀柔光,前方主光 + 双侧补光,无硬阴影
  R6 一致性: 4 视图的肤色/体型/发型/面容/服装完全一致
  R7 不裁切: 全身立像从头顶到脚底完整入画;特写从头顶到锁骨完整入画
  R8 头身比: 默认 7 头身 (女 160-170cm / 男 175-185cm),除非角色描述明确异于
  R9 服装: 基础打底 (女:素色长裙/简洁连衣裙,男:素色衬衫/西装/T恤),保留辨识度,无配饰水印

英文提示词必写关键词 (这些会被图像模型识别为 4-view 标准):
  "character design sheet, 4-view turnaround,
   left to right: portrait closeup + front view + side view + back view,
   neutral grey #B8B8B8 background, uniform soft lighting,
   consistent across all four views, full body head to toe (no cropping),
   16:9 wide composition, no text, no watermark"

写提示词时:
  必须包含: 性别+种族+年龄段 / 脸型 / 眼型 / 体型 / 头身比 / 肤色 / 发色发长 / 服装基础款 / 气质
  例: "young Chinese woman in her early 20s, oval face with sharp jawline, almond eyes, slim graceful build, 7 heads tall proportion, fair complexion, long straight black hair to waist, simple modern black dress, elegant aloof aura"`;

const SCENE_RULES = `场景设定图规范:

构图: establishing shot,展示空间全貌 + 氛围 + 纵深
  - 不出现具体人物 (人物在分镜出图阶段叠加)
  - 关键道具/陈设入画 (与剧情相关的酒杯、手机、桌椅、地标等)
  - 体现时段 / 内外 / 光线方向

硬约束:
  R1 画面比例: 16:9 横向 (资产参考图统一 16:9,实际分镜会按项目画幅再裁)
  R2 时段一致: 严格按描述 (清晨柔光 / 正午高反差 / 黄昏暖色 / 夜晚冷色霓虹)
  R3 内外区分: 内景注重材质纹理,外景注重天光地景
  R4 风格匹配: 都市 cinematic / 古风 ornate / 玄幻 ethereal
  R5 严禁: 文字标志 / 人物 / 品牌

英文提示词必写:
  "establishing shot of [location], [time of day], [atmosphere],
   no people, key props visible, cinematic composition,
   16:9 widescreen, photorealistic, 4K, sharp focus"`;

const PROP_RULES = `道具设定图规范:

布局: 同一画面左右两个状态并排
  状态 1 (左): 静态独立 — 道具单独陈列,无人物,无环境干扰
  状态 2 (右): 使用中 / 细节特写 — 体现该道具在剧中如何被使用 (如握在手里的角度、放在桌上的状态、近景特写)

硬约束:
  R1 画面比例: 16:9 (两状态横向并排)
  R2 背景: 素灰纯色 #B8B8B8
  R3 拍摄精度: product shot 级,材质/光泽/纹理/细节清晰
  R4 严禁: 文字 / 品牌 / Logo (除非该道具本身的设计就有,且必要)
  R5 比例参考: 如果道具有手柄/可握持部分,状态 2 中明确展示握持手势/场景

英文提示词必写:
  "product design sheet, 2 states side by side,
   left: standalone clean studio shot, neutral grey #B8B8B8 background,
   right: in-use or detail closeup,
   sharp focus, photorealistic, 4K, 16:9 layout, no text"`;

const MEDIA_RULES = `素材 (封面/海报/字卡) 规范:

布局: 单图,16:9 横向 (资产层统一 16:9)
  - 主体明确,留白考虑后续叠字幕
  - 颜色情绪与项目调性一致

硬约束:
  R1 比例: 16:9
  R2 风格匹配: 都市/古装/玄幻 各按风格
  R3 文字: 仅当 description 明确要求时输出文字,否则不出文字`;

export const ASSET_PROMPT_SYSTEMS = {
  char: `你是短剧美术指导,擅长写「角色四视图设定」的图像生成提示词。

${CHAR_RULES}

${COMMON_RULES}

输出严格 JSON: { "prompt": "..." } — 不要 markdown 代码块,不要任何解释文字,只输出 JSON。`,
  scene: `你是短剧美术指导,擅长写「场景设定图」的图像生成提示词。

${SCENE_RULES}

${COMMON_RULES}

输出严格 JSON: { "prompt": "..." }`,
  prop: `你是短剧美术指导,擅长写「道具设定图」的图像生成提示词。

${PROP_RULES}

${COMMON_RULES}

输出严格 JSON: { "prompt": "..." }`,
  media: `你是短剧美术指导,擅长写「视觉素材」的图像生成提示词。

${MEDIA_RULES}

${COMMON_RULES}

输出严格 JSON: { "prompt": "..." }`,
} as const;

/** Backwards-compat alias for any older code that imported the old name */
export const ASSET_PROMPT_SYSTEM = ASSET_PROMPT_SYSTEMS.char;

export function buildAssetPromptUser(project: Project, asset: Asset, skeleton: StorySkeleton | null): string {
  const parts: string[] = [
    `项目: ${project.name} · ${project.genre} · ${project.tone} · ${project.platform} 竖屏短剧`,
    `资产类型: ${kindLabel(asset.kind)}`,
    `资产名称: ${asset.name}`,
  ];
  if (asset.role) parts.push(`角色定位: ${asset.role}`);
  if (asset.description) parts.push(`描述: ${asset.description}`);
  if (skeleton) {
    parts.push(``, `=== 故事骨架 (供你定调) ===`,
      `一句话故事: ${skeleton.oneLiner}`,
      `改编原则: ${skeleton.adaptationPrinciples.slice(0, 3).join(" / ")}`);
    if (asset.kind === "char") {
      const match = skeleton.characterCores.find(c => c.name === asset.name);
      if (match) parts.push(`角色弧光: ${match.arc}`);
    }
  }
  parts.push(``);
  if (asset.kind === "char") {
    parts.push(
      `请写出此角色的「四视图设定图」提示词,严格遵循上面的角色四视图规范。`,
      `务必包含: 人像特写 / 正视图 / 侧视图 / 后视图 — 同画面左到右并排,16:9 比例。`,
      `务必声明: 性别+种族+年龄段 / 脸型 / 体型 / 头身比 / 肤色 / 发色发长 / 基础服装 / 气质。`,
    );
  } else if (asset.kind === "scene") {
    parts.push(`请写出此场景的「establishing shot 设定图」提示词,严格遵循上面的场景规范。`);
  } else if (asset.kind === "prop") {
    parts.push(`请写出此道具的「双状态设定图」提示词:左侧独立、右侧使用中。`);
  } else {
    parts.push(`请写出此素材的图像生成提示词。`);
  }
  parts.push(`输出 JSON: { "prompt": "..." }`);
  return parts.join("\n");
}

function kindLabel(k: string): string {
  return k === "char" ? "角色" : k === "scene" ? "场景" : k === "prop" ? "道具" : "素材";
}


// =============== Shotlist (per-scene shot decomposition) ===============

export const SHOTLIST_SYSTEM = `你是资深竖屏 9:16 短剧分镜师。给你一场戏 (action + dialogue),你要把它拆成 2-5 个可拍摄的镜头。

竖屏 9:16 短剧拆镜规范:
- 节奏:每镜 1.5-5 秒,平均 3 秒;1 镜 = 1 个 beat (一句台词或一个动作动作)
- 开场镜:必须有钩 — 视觉冲击 / 情绪反差 / 悬念,常用 ES/LS 建立空间或 ECU 切人
- 冲突镜:多用 CU/ECU/OTS — 拉情绪、突出对视、突出小动作
- 钩结尾镜:单独成镜,留白
- 长镜 (>4s) 慎用,只在情绪积累时使用
- 一场 2-3 镜偏紧凑,4-5 镜偏铺陈

镜头语言:
  framing 候选: ECU(极特,眼/唇) / CU(特写,脸) / MCU(中近,胸上) / MS(中景,腰上) / MLS(中远,膝上) / LS(远景,全身) / EWS(大全,场域) / INSERT(空镜,物件) / OTS(过肩)
  cameraMove 候选: static / dolly_in / dolly_out / pan_left / pan_right / tilt_up / tilt_down / tracking / handheld / crane

每镜对象字段 (严格遵守):
  shotIndex: 在本场内的镜次 (1 起始,递增)
  framing: 上面 9 个之一
  cameraMove: 上面 10 个之一
  duration: 1.5-5.0 秒,0.5 步进
  characters: 入镜人物数组,用原文姓名,空场景就空数组
  action: 这一镜里发生什么 (30-60 字,具体可拍,不写人物外貌细节)
  dialogue: 如果这镜对应一句台词,{character, line};没有则不写
  onScreenText: 屏幕字幕 (片名条 / 时间地点字幕 / 紧急插字),没有则不写
  audioCue: BGM/SFX 提示 (e.g. "BGM: 弦乐紧张") ,没有则不写
  imagePrompt: 这帧的英文图像 prompt seed (150-300 字符),**必须以镜头景别开头**,例如:
    - ECU 写: "Extreme close-up of [subject's] eyes wide with fear, [emotion/action detail], [lighting/color mood]. Frame fills with face only, no body visible."
    - CU  写: "Close-up of [subject's] face showing [emotion], [lighting]. Head and shoulders only, no body below."
    - MCU 写: "Medium close-up of [subject], chest-up framing, [action], [setting context]."
    - MS  写: "Medium shot of [subject] from waist up, [action/pose], [setting]."
    - LS  写: "Long shot full body of [subject] in [setting], [action], [atmosphere]."
    - INSERT 写: "Insert macro shot of [object/hand], [detail], [lighting]."
    - OTS 写: "Over-the-shoulder shot, foreground [character's] shoulder out of focus, [main subject] in middle facing camera, [action]."
    严格遵守"镜头景别开头 + 主体动作 + 氛围光线"的句式。**不要**写人物外貌细节(发色/身材/服装),人物特征会经资产参考自动注入。

输出严格 JSON: { "shots": [{...}, ...] }
不要 markdown 代码块,不要任何解释文字,只输出 JSON。`;

export interface ShotlistContext {
  project: Project;
  skeleton: StorySkeleton | null;
  episode: Episode;
  scene: {
    index: string;
    location: string;
    timeOfDay: string;
    characters: string[];
    actions: string[];
    dialogue: { character: string; emotion?: string; line: string }[];
    audioCues?: string[];
    onScreenText?: string;
  };
}

export function buildShotlistUser(ctx: ShotlistContext): string {
  const { project, skeleton, episode, scene } = ctx;
  const dialogueDump = scene.dialogue.length > 0
    ? scene.dialogue.map(d => `${d.character}${d.emotion ? `(${d.emotion})` : ""}: ${d.line}`).join("\n")
    : "(无对白)";
  const parts: string[] = [
    `项目: ${project.name} · ${project.genre} · ${project.tone} · ${project.platform} 竖屏 9:16`,
    `语言: ${project.language}`,
    ``,
  ];
  if (skeleton) {
    parts.push(`=== 故事骨架 (供你定调) ===`);
    parts.push(`一句话故事: ${skeleton.oneLiner}`);
    if (skeleton.adaptationPrinciples?.length) {
      parts.push(`改编原则: ${skeleton.adaptationPrinciples.slice(0, 3).join(" / ")}`);
    }
    parts.push(``);
  }
  parts.push(
    `=== 集与场 ===`,
    `EP${String(episode.index).padStart(2, "0")} · 「${episode.title}」`,
    `场号: ${scene.index} · 地点: ${scene.location} · ${scene.timeOfDay}`,
    `入场人物: ${scene.characters.join(" / ") || "(无)"}`,
    ``,
    `=== 场景动作 ===`,
    scene.actions.length ? scene.actions.join("\n") : "(无明确动作描述)",
    ``,
    `=== 场景台词 ===`,
    dialogueDump,
    ``,
  );
  if (scene.onScreenText) parts.push(`=== 屏幕字幕 ===`, scene.onScreenText, ``);
  if (scene.audioCues?.length) parts.push(`=== 音效提示 ===`, scene.audioCues.join("\n"), ``);
  parts.push(`请把这场拆为 2-5 个镜头,严格按上面输出格式给 JSON。`);
  return parts.join("\n");
}

// ---- shot image prompt assembly (framing-obedient version) ----

interface FramingDirective {
  pos: string;
  neg: string;
}

const FRAMING_DIRECTIVES: Record<string, FramingDirective> = {
  ECU: {
    pos: "EXTREME CLOSE-UP shot. Composition: tight crop on subject's eyes or specific facial feature only, face fills the entire frame, camera inches from skin. Only face/eyes visible",
    neg: "no body visible, no torso, no shoulders, no full body, no wide shot, no medium shot, no environment visible around subject",
  },
  CU: {
    pos: "CLOSE-UP shot. Composition: head fills frame from chin to forehead, only upper shoulders barely visible, face is the dominant element, camera close to face",
    neg: "no body visible below upper shoulders, no torso, no full body, no wide shot, no medium shot",
  },
  MCU: {
    pos: "MEDIUM CLOSE-UP shot from chest up. Composition: head and shoulders fully visible, top of chest visible, camera at eye level",
    neg: "no lower body visible, no waist, no legs, no full body shot, no wide shot",
  },
  MS: {
    pos: "MEDIUM shot from waist up. Composition: head, torso, hands visible, camera at chest height. About half the body in frame",
    neg: "no legs visible, no full body, no wide environment shot",
  },
  MLS: {
    pos: "MEDIUM LONG SHOT from knees up. Composition: most of body visible from knees to head, some environment around subject",
    neg: "no feet cropped from above ankle, no extreme close-up, no face-only shot",
  },
  LS: {
    pos: "LONG SHOT full body. Composition: subject from head to toe completely visible in frame, environment visible around. Subject takes about half the frame height",
    neg: "no close-up, no medium shot, no cropped feet, no face-only framing",
  },
  EWS: {
    pos: "EXTREME WIDE SHOT. Composition: subject very small in frame (less than 1/4 of frame height), environment dominates",
    neg: "no close-up, no face detail visible, no portrait framing",
  },
  INSERT: {
    pos: "INSERT shot. Composition: macro extreme detail of specific object or hand action, no person face, no full body. Object/detail fills frame",
    neg: "no full person, no face visible, no body, no portrait",
  },
  OTS: {
    pos: "OVER-THE-SHOULDER shot. Composition: foreground figure's shoulder and back of head visible (out of focus, takes ~1/3 of frame edge), main subject in middle distance facing camera (in focus)",
    neg: "no single isolated person, no centered close-up of one subject only, no full-body framing",
  },
};

function getFramingDirective(framing: string): FramingDirective {
  return FRAMING_DIRECTIVES[framing] ?? FRAMING_DIRECTIVES.MS;
}

const CAMERA_MOVE_DESCRIPTIONS: Record<string, string> = {
  static: "",  // no need to mention
  dolly_in: "camera dolly in, pushing toward subject for tension",
  dolly_out: "camera dolly out, pulling back to reveal",
  pan_left: "camera pan left, sweeping motion",
  pan_right: "camera pan right, sweeping motion",
  tilt_up: "camera tilts upward, revealing",
  tilt_down: "camera tilts downward, revealing",
  tracking: "tracking shot, camera follows subject in motion",
  handheld: "handheld camera shake, gritty unstable feel",
  crane: "crane shot, rising camera reveal",
};

/** Strip 4-view boilerplate AND keep only identity-defining sentences,
 *  drop body proportions / scene posture / lighting / composition language. */
function extractCharacterIdentity(charPrompt: string, maxChars = 180): string {
  let s = charPrompt;
  const stripPatterns = [
    /character design sheet[^.]*\.?/gi,
    /4-view turnaround[^.]*\.?/gi,
    /left to right[^.]*\.?/gi,
    /portrait closeup \+ front view[^.]*\.?/gi,
    /neutral grey [^.]*\.?/gi,
    /uniform soft lighting[^.]*\.?/gi,
    /consistent across all four views[^.]*\.?/gi,
    /full body head to toe[^.]*\.?/gi,
    /full body, head to toe[^.]*\.?/gi,
    /16:9[^.]*\.?/gi,
    /no text[^.]*\.?/gi,
    /no watermark[^.]*\.?/gi,
    /7 heads tall[^.,]*[.,]?/gi,
    /\d+\s*cm tall[^.,]*[.,]?/gi,
    /\d+\s*heads tall proportion[^.,]*[.,]?/gi,
    /standing in [^.]*\.?/gi,
    /portrait shot from [^.]*\.?/gi,
    /clean dark background[^.]*\.?/gi,
    /cinematic lighting[^.]*\.?/gi,
    /photorealistic[^.,]*[.,]?/gi,
    /4K[^.,]*[.,]?/gi,
    /shot on Sony[^.]*\.?/gi,
    /vertical composition[^.]*\.?/gi,
    /clean studio[^.]*\.?/gi,
    /product shot[^.]*\.?/gi,
    /sharp focus[^.,]*[.,]?/gi,
    /high contrast[^.,]*[.,]?/gi,
    /head to toe[^.,]*[.,]?/gi,
  ];
  for (const r of stripPatterns) s = s.replace(r, " ");
  s = s.replace(/\s+/g, " ").replace(/[,.]\s*[,.]/g, ".").replace(/^[\s,.]+/, "").trim();
  // Truncate
  if (s.length > maxChars) {
    // try cutting at sentence boundary
    const cut = s.slice(0, maxChars);
    const lastDot = Math.max(cut.lastIndexOf("."), cut.lastIndexOf(","));
    s = lastDot > maxChars * 0.6 ? cut.slice(0, lastDot) : cut;
  }
  return s.trim();
}

function extractSceneAtmosphere(scenePrompt: string, maxChars = 160): string {
  let s = scenePrompt;
  const stripPatterns = [
    /establishing shot of [^,]*,?/gi,
    /no people[^,]*,?/gi,
    /16:9[^.,]*[.,]?/gi,
    /cinematic composition[^.,]*[.,]?/gi,
    /photorealistic[^.,]*[.,]?/gi,
    /4K[^.,]*[.,]?/gi,
    /sharp focus[^.,]*[.,]?/gi,
    /widescreen[^.,]*[.,]?/gi,
    /no text[^.,]*[.,]?/gi,
    /no watermark[^.,]*[.,]?/gi,
  ];
  for (const r of stripPatterns) s = s.replace(r, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxChars) {
    const cut = s.slice(0, maxChars);
    const lastDot = Math.max(cut.lastIndexOf("."), cut.lastIndexOf(","));
    s = lastDot > maxChars * 0.6 ? cut.slice(0, lastDot) : cut;
  }
  return s.trim();
}

/** Assemble shot image-gen prompt with **framing-first, emphatic, negative-cued** layout. */
export function buildShotImageGenPrompt(args: {
  shot: {
    framing: string; cameraMove: string;
    characters: string[]; action: string;
    imagePrompt?: string;
    dialogue?: { character: string; line: string };
  };
  project: Project;
  characterAssets: { name: string; prompt?: string }[];
  sceneAsset?: { prompt?: string };
}): string {
  const { shot, project, characterAssets, sceneAsset } = args;
  const directive = getFramingDirective(shot.framing);

  const parts: string[] = [];

  // [1] FRAMING — first and bold
  parts.push(directive.pos);

  // [2] Camera move (only if not static)
  const moveDesc = CAMERA_MOVE_DESCRIPTIONS[shot.cameraMove];
  if (moveDesc) parts.push(moveDesc);

  // [3] Shot-specific imagePrompt from LLM (should already be framing-aware)
  if (shot.imagePrompt) parts.push(shot.imagePrompt);

  // [4] Action distilled
  if (shot.action) parts.push(`Action: ${shot.action}`);

  // [5] Subjects — identity only, NOT full description
  for (const charName of shot.characters) {
    const a = characterAssets.find(c => c.name === charName);
    if (a?.prompt) {
      const identity = extractCharacterIdentity(a.prompt);
      if (identity) parts.push(`Subject ${charName}: ${identity}`);
    } else {
      // no asset yet, just name
      parts.push(`Subject: ${charName}`);
    }
  }

  // [6] Setting — atmosphere only
  if (sceneAsset?.prompt) {
    const atmo = extractSceneAtmosphere(sceneAsset.prompt);
    if (atmo) parts.push(`Setting: ${atmo}`);
  }

  // [7] Style
  parts.push(`${project.tone}, ${project.genre} short drama mood, cinematic lighting`);

  // [8] Technical
  parts.push("9:16 vertical short drama frame, photorealistic, 4K");

  // [9] NEGATIVE — explicit constraint to enforce framing
  parts.push(directive.neg);
  parts.push("no text in image, no watermark, no caption overlay");

  return parts.join(". ");
}
