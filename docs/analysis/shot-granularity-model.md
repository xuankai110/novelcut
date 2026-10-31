# 短剧"最小颗粒度"模型 —— 吸收、勘误与落地

> 来源：与豆包的对话（2026-10-31，分享页 `x2rcbrheRxlPLFWKX`，3 轮）
> 第 1 轮：定义最小颗粒 + 五类全集（23 类）
> 第 2 轮：方案 A —— 完整枚举表 + 路由对照 + 参数预设（31 类）
> 第 3 轮：3D 动作/动画工具选型（本地 + 云端）
> 本文目的：把那套"制作层"的颗粒体系，与 NovelCut 的"文本层"镜头模型对齐，产出一个可编译的中间表示。

---

## 一、它的骨架（先还原原意）

### 1.1 判定标准：三要素同时满足才算 1 个最小颗粒

1. 归属**单一媒介类型**（不能一条里同时有对白 + 音效 + 3D 动作）
2. 有**统一的风格/混音/渲染参数要求**（内心独白固定混响，和现场对白参数不同 → 必须分开）
3. **交付链路唯一**：要么直接送视频大模型，要么交后期/配音/3D/音效单独制作

### 1.2 四条路由（这是整套体系的真正内核）

| 路由 | 接收方 | 输入 | 输出物 |
|---|---|---|---|
| `video_gen` | 文生视频模型 | 镜头/表演/美术/道具提示词 | 成片视频片段 |
| `post_audio` | TTS·配音·音效·混音 | 人声、音效、BGM | 带时码干声 WAV |
| `cg_vfx` | 3D 师·特效师·合成师 | 3D 资产动画、AE 特效描述 | 带 Alpha 序列、FBX |
| `edit_meta` | 剪辑软件·调度 Agent | 时码、字幕、层级 | SRT、剪辑标记、调度 JSON |

**红线：一个颗粒只能挂一条路由。**

### 1.3 类型全集（方案 A 版，31 个 ID）

- **V 画面**（→video_gen，5）：V01 运镜 / V02 表演 / V03 场景美术光影 / V04 静态道具 / V05 简单转场
- **A 人声**（→post_audio，8）：A01 现场同期 / A02 通讯 / A03 内心独白 / A04 回忆 / A05 旁白 / A06 喇叭广播 / A07 耳语 / A08 嘶吼畸变
- **S 音效音乐**（→post_audio，4）：S01 瞬态硬音效 / S02 持续氛围 / S03 能量拟音 / S04 BGM
- **C 3D**（→cg_vfx，5）：C01 角色复杂动作 / C02 法术粒子 / C03 物理模拟 / C04 静态 CG 资产 / C05 绑定带动画资产
- **E 合成特效**（→cg_vfx，6）：E01 光学 / E02 畸变 / E03 扫描 UI / E04 glitch / E05 蒙版遮罩 / E06 复杂转场
- **M 元数据**（→edit_meta，3）：M01 时间锚点 / M02 字幕 / M03 合成层级

### 1.4 三条落地规则

- **载荷与类型分离**：文本是 payload，类型决定路由。同一句话"我一定要杀了你"，现场说 / 心里想 / 电话里说 = 三个完全独立的颗粒。
- **粒度收敛**：交给同一岗位、同一工具、同一套参数、一次性生成、不需二次调度 → 停止拆分。5 秒雨声参数不变不拆；中间夹一声雷，雷单独成颗粒。
- **强制绑定**：`shot_id` + 时间锚点，无时码不进生产队列。

---

## 二、必须指出的勘误（这些会影响你直接照着实现）

### 2.1 数量对不上：23 → 31

第 1 轮说"画面 5 + 人声 8 + 音效 4 + 3D 特效 6 = **23**"。第 2 轮拆成 V5+A8+S4+C5+E6+M3 = **31**。

原因不是笔误，而是第 1 轮那个"3D 特效 6 个"是**混装**的：它把 C 组（角色动作、法术、物理、CG 资产）和 E 组（画面特效层、复杂转场）塞进了一类。第 2 轮按"是否解算几何"拆开才对。**结论：以 31 个为准，"23"作废。**

### 2.2 A02 的参数自相矛盾

> "EQ：切掉 250Hz 以下、5kHz 以上" …… 同时写 "高通 300Hz"

300Hz 高通已经砍掉了 250Hz 以下，两条重复且不一致。这类参数表是拼出来的，**不要当成可直接执行的工程规格**，它只适合当"意图描述"。

### 2.3 样板 JSON 已经字段漂移

三个示例里：`P001` 用 `content_text`，`P002`/`P003` 用 `content_desc`。同一个 schema 两种字段名 —— 说明这套模型在"不同颗粒类型有不同载荷"这件事上没有做类型约束。落到代码里必须用**判别联合**，不能让 31 种类型共用一个 `content` 字符串。

### 2.4 绝对时码是错的（最重要的一条）

示例用 `"time_in": "00:02:11.00"` 这种绝对时码。但短剧在分镜没剪定之前，镜头顺序和时长一直在变：改一个镜头的 duration，后面所有颗粒的绝对时码全部失效，需要全局重算甚至人工重修。

**正确做法：颗粒的时码相对所属 shot 起点（`tIn/tOut`，秒）；绝对时码是渲染/交付时由 `shot.startSec + tIn` 派生出来的产物，不是源数据。**

### 2.5 V05"简单转场"归 video_gen 是可疑的

转场在时间轴上位于**两个 shot 之间**，不属于任何一个 shot。让视频模型"生成一个淡入淡出"，等于为了一次叠化重算两段素材。转场应该归 `edit_meta`（剪辑层施加），或者单独设一个 transition 层，且它天然是"跨 shot"对象。已从下文 schema 中移除 V05。

### 2.6 post_audio 太粗，违背它自己的原则

判定标准第 3 条要求"交付链路唯一"，但 A 组（配音/TTS）和 S 组（音效师）都塞进 `post_audio`。这两个是不同岗位、不同工具、不同工时。建议路由细分到岗位级：`post_voice` / `post_sfx`（后期混音是合成层，不产素材，不必单列）。

### 2.7 参数表带着"真人实拍"的基因

A01 叫"现场同期对白，空间 = 同期声场"。**纯 AI 短剧没有同期声** —— 所有对白都是 TTS 生成后贴轨的。所以 A01 与 A05 的差别，在 AI 管线里退化为"混响预设不同"，不是"录制方式不同"。参数表可以沿用，但语义要重写。

---

## 三、与 NovelCut 的字段级对照（缺口在哪）

NovelCut 的 `Shot` 是**一个镜头一行记录**，把所有媒介压平。对照结果：

| 颗粒类别 | NovelCut 对应字段 | 覆盖度 |
|---|---|---|
| V01 运镜 | `framing` + `cameraMove` | 完整（9 景别 + 10 运镜） |
| V02 表演 | `action`（文字） | 部分（无表情/口型参数） |
| V03 美术光影 | `sceneLocation` + `timeOfDay` + `project.tone` | 部分（靠资产 prompt 注入） |
| V04 道具 | `Asset{kind:"prop"}` | 完整 |
| V05 转场 | — | **完全没有这个概念** |
| A01–A08 人声 | `dialogue{character, emotion, line}` | **只有 1 类**，无"声学空间"维度 |
| S01–S04 音效音乐 | `audioCue: string`（如 "BGM: 弦乐紧张"） | **4 类挤在 1 个自由字符串里** |
| C01–C05 3D | — | **完全没有** |
| E01–E06 特效 | — | **完全没有** |
| M01 时码 | `duration`（只有相对时长） | 部分（无绝对时码、无入出点） |
| M02 字幕 | `onScreenText: string` | 部分（无硬/软、无样式） |
| M03 层级 | — | **完全没有** |

一句话结论：**NovelCut 的 Shot 是"给图像模型看的镜头"，豆包的颗粒是"给生产线用的镜头"。前者缺三个维度：并轨、绝对时码、工种路由。**

具体地，`{"audioCue": "BGM: 弦乐紧张"}` 这一个字段，在制作层必须展开成 S04（BGM 片段，带起止时码与侧链避让）+ S03（能量嗡鸣，若有）+ 可能还有 S01（一击定音）。**一个字符串承载一条轨道，是这套架构真正的天花板** —— 它注定只能做"出图工具"，做不了"成片工厂"。

---

## 四、合并后的中间表示（可直接用的 TS）

核心设计决策：**不存 `route` 字段，用 `type → route` 常量表推导。** 这样"一个颗粒挂两条路由"在类型层面就不可表达 —— 把文档红线变成编译器约束。

```ts
export type RenderRoute = "video_gen" | "post_voice" | "post_sfx" | "cg_vfx" | "edit_meta";
export type Lane = "visual" | "voice" | "sfx" | "cg" | "meta";

export type ParticleType =
  | "V01" | "V02" | "V03" | "V04"
  | "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08"
  | "S01" | "S02" | "S03" | "S04"
  | "C01" | "C02" | "C03" | "C04" | "C05"
  | "E01" | "E02" | "E03" | "E04" | "E05" | "E06"
  | "M01" | "M02" | "M03";

export const ROUTE_OF: Record<ParticleType, RenderRoute> = {
  V01: "video_gen", V02: "video_gen", V03: "video_gen", V04: "video_gen",
  A01: "post_voice", A02: "post_voice", A03: "post_voice", A04: "post_voice",
  A05: "post_voice", A06: "post_voice", A07: "post_voice", A08: "post_voice",
  S01: "post_sfx", S02: "post_sfx", S03: "post_sfx", S04: "post_sfx",
  C01: "cg_vfx", C02: "cg_vfx", C03: "cg_vfx", C04: "cg_vfx", C05: "cg_vfx",
  E01: "cg_vfx", E02: "cg_vfx", E03: "cg_vfx", E04: "cg_vfx", E05: "cg_vfx", E06: "cg_vfx",
  M01: "edit_meta", M02: "edit_meta", M03: "edit_meta",
};

export const LANE_OF: Record<ParticleType, Lane> = {
  V01: "visual", V02: "visual", V03: "visual", V04: "visual",
  A01: "voice", A02: "voice", A03: "voice", A04: "voice",
  A05: "voice", A06: "voice", A07: "voice", A08: "voice",
  S01: "sfx", S02: "sfx", S03: "sfx", S04: "sfx",
  C01: "cg", C02: "cg", C03: "cg", C04: "cg", C05: "cg",
  E01: "cg", E02: "cg", E03: "cg", E04: "cg", E05: "cg", E06: "cg",
  M01: "meta", M02: "meta", M03: "meta",
};

/** 每种颗粒类型的载荷各不相同 —— 判别联合，不用统一 content 字段 */
export interface PayloadMap {
  V01: { framing: string; move: string };
  V02: { performance: string; emotion?: string };
  V03: { setDressing: string; lighting: string; palette?: string };
  V04: { prop: string; state: "static" | "in-use" };
  A03: { text: string; speaker: string };
  A01: { text: string; speaker: string };
  S04: { mood: string; bpm?: number };
  C02: { desc: string; layers?: string[] };
  M02: { text: string; burnIn: boolean; style: string };
  // …其余类型按同法补齐
}

export interface ParticleBase {
  id: string;
  shotId: string;
  type: ParticleType;
  /** 相对所属 shot 起点，秒。绝对时码由 shot.startSec 派生，不落库 */
  tIn: number;
  tOut: number;
  /** 参数预设 id（混响/压缩/粒子参数），不内联数值 */
  presetId?: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  assetUrl?: string;
  /** 生成失败时的降级类型，例：V02 打斗动作 → C01 */
  fallback?: ParticleType;
  cost?: { unit: "call" | "image" | "second"; amount: number };
  updatedAt: number;
}

export type ParticleOf<T extends ParticleType> =
  ParticleBase & { type: T; payload: PayloadMap[T] };

export type Particle = { [K in keyof PayloadMap]: ParticleOf<K> }[keyof PayloadMap];
```

### 必须成立的四条不变量

1. `tIn >= 0 && tOut <= shot.duration` —— 颗粒不能越出所属镜头
2. 同一 `lane` 内时间区间**不可重叠**（不同 lane 天然并行，这正是"并轨"的意义）
3. 任何 `A*` 颗粒必须有 `speaker`，且 `speaker` 必须在场（或属于画外/回忆等免责类型）
4. `M03 层级` 顺序固定：`E 特效层 > C 法术粒子层 > V 画面层 > 底图 > S 音频轨`

### 派生量（不存，算出来）

```
shot.startSec = Σ(前序 shot.duration)
particle.absIn = shot.startSec + particle.tIn
```

改任何镜头时长，全片绝对时码自动重算 —— 这是"相对时码"的真正收益。

---

## 五、落地顺序建议

不要一次上 31 类。按"能立刻提升成片质量"排序：

1. **先补 S 组（4 类）**。现在 `audioCue` 是一个字符串，等于没有音效轨。这是性价比最高的一步：有了 S01/S02/S04 的分类 + 时码，成片立刻从"配图幻灯片"变成"有节奏的片子"。
2. **再补 A 组（8 类）**。`dialogue` 加一个 `voiceType` 字段就能落地，不用改结构。内心独白和现场对白的混响差异，是观众"感觉专业"的第一来源。
3. **再补 M02 字幕分离**。硬/软字幕决定后期能不能改，现在 `onScreenText` 混在镜头里没法分层导出。
4. **C/E 组最后做**。它依赖 3D 工具链，且短剧里占比小（打斗/法术镜头约 10-20%）。先留 schema 位，实现可以先全部归为"外包手工项"。
5. **V05 转场单独建模**，做成 `Transition { fromShotId, toShotId, kind, duration }`，不要塞进 shot。

---

## 六、一句话

豆包那套的价值不在于"23 还是 31 个类型"（这个数字可以再争），而在于它提出了短剧生产真正的核心抽象：**颗粒 = 路由 + 时码 + 载荷**。

NovelCut 缺的正是"路由"这一维 —— 它的 Shot 是一条扁平的记录，所有媒介挤在一张表里，所以它只能停在"出图"这一步，永远接不上后期。**你的系统里，把 route 做成类型约束而不是文档规范，就已经赢过它了。**
