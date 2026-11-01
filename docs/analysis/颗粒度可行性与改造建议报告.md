# NbLabTV：短剧颗粒度可行性调研与 NovelCut 改造建议报告

> 日期：2026-10-31  
> 输入：豆包“最小颗粒方案 A”（31 类）、NovelCut v0.6.0 源码、2026 年主流 AI 短剧/漫剧工作流与工具调研  
> 目标：判断每一类是否可行、主流是否做到这个细分程度，并给出能落到现有源码的改造方案。

---

# 0. 结论先行

## 0.1 总体判断

**豆包的 31 类适合当“标签体系/检查清单”，不适合直接当 31 种独立生产对象。**

主流 AI 短剧的真实颗粒度是：

1. **分镜层：6～12 个字段的宽表**。镜号、景别、运镜、画面、时长、台词、音效是基本盘；专业级再加站位、朝向、人数、前中背景。
2. **资产层：角色/场景/道具独立管理**。一致性靠参考图槽位、角色 ID、LoRA/资产库，不靠每次重写外貌提示词。
3. **后期层：4～5 条轨道**。画面、角色配音、旁白/独白、BGM/音效、字幕；复杂项目再拆音效和音乐。
4. **参数层：预设模板**。电话滤波、内心独白混响、回忆、广播、转场、调色，大多不是单独“生产一种素材”，而是给素材套处理链。

所以正确方向不是“把 `Shot` 炸成 31 种 Particle”，而是：

> **ShotIR（镜头宽表） + TrackClip（独立交付素材） + RenderPreset（处理预设） + RenderPlan（时间线/合成图）**

这比我上一轮提出的“全量 Particle 模型”更贴近主流，也更适合 NovelCut 渐进改造。

## 0.2 对 2026 年原生音画模型的修正

上一轮我沿用了“视频模型只出画面，声音全部后期”的判断。**这在 2026 年已经不完全成立。**

Seedance 2.x、可灵 3.x、Vidu Q3/Q4、MiniMax H3 等已支持不同程度的原生音画：对白、口型、环境音、音效甚至 BGM 一次生成。Seedance 采用音画联合生成，公开资料称声画同步误差可到约 33ms；可灵 Omni 支持多镜头各自带时长、景别、台词和运镜。

但**原生音画更适合草稿/预演，不应直接取代精品剧的分轨音频**：

- 台词、音色、响度、混响、BGM 难以逐项替换；
- 系列剧需要同一角色跨集固定音色和发音词典；
- 模型可能随机生成不需要的 BGM、字幕或环境声；
- 错一句台词时，分轨只需重做一句，原生音画可能要重做整镜。

因此系统应支持两种项目模式：

| 模式 | 用途 | 画面 | 声音 |
|---|---|---|---|
| `native_av_draft` | 快速看表演、口型、节奏 | 视频模型 | 视频模型原生音画 |
| `separate_stems`（默认） | 正式成片、系列剧 | 视频模型/静帧 | TTS、音效、BGM 分轨生成后合成 |

## 0.3 改造优先级

- **P0：数据模型与分镜表升级**。不接新供应商也能做，收益最大。
- **P1：声音分轨 + 字幕/剪辑工程导出**。先把 `audioCue` 字符串变成真正可交付的音轨。
- **P2：图生视频 + FFmpeg 合成 + 原生音画草稿**。形成成片闭环。
- **P3：3D 预演和特效模板**。只做高价值少数场景，不做全量 CG 管线。

---

# 1. 主流到底拆多细

## 1.1 四种口径对照

| 口径 | 镜头信息 | 声音信息 | 资产/后期 | 评价 |
|---|---|---|---|---|
| NovelCut 当前 | 景别、运镜、时长、动作、单条台词、图像 prompt | `audioCue` 一个字符串；`onScreenText` 一个字符串 | 角色/场景/道具资产较完整；无后期 | 出图够用，成片不够 |
| Toonflow 教程实际使用 | 画面描述、时长、景别、运镜、台词、音效等 6 列 | 音效作为一列；配音、字幕、BGM 在成片阶段 | 资产库 + 3D 导演台 + 拼接导出 | 主流轻量生产级 |
| 通用 8 字段分镜表 | 镜号、景别、机位运镜、画面、台词旁白、时长、音效、备注 | 台词/旁白与音效分列 | 剪辑阶段多轨 | 主流工程文档级 |
| 商业化 12 字段分镜 API | 再加叙事视角、站位、朝向、人数、前中背景焦点 | 台词字幕、音效；支持画外音与长台词拆镜 | JSON 可对接视频模型 | 目前最接近“专业可执行 IR” |
| 豆包 31 颗粒 | 镜头信息被拆成多类对象 | 人声 8 类、音效 4 类 | C/E/M 全独立 | 分类完整，但对象过细 |

**关键答案：主流在“字段”上确实细分，在“独立对象”上没有拆到 31 类。**

电话、内心独白、回忆、广播这些，主流通常表现为：

- 分镜表里标“对白/旁白/独白/画外音”；
- 配音表里标角色、情绪、台词、时长；
- 后期通过效果器预设实现电话感、空洞感、朦胧感。

它们很少在剧本阶段就变成 8 种完全独立的生产单。

## 1.2 主流为什么不再往下拆

因为拆细有成本：

1. **对象数量爆炸**。一部 60 集剧，若每集 15 镜，共 900 镜；每镜 5～10 个颗粒，就是 4500～9000 个对象。状态、重试、版本、成本和 UI 都会膨胀。
2. **很多类型不产独立素材**。E01 光晕、A02 电话滤波、M03 层级，本质上只是处理参数。
3. **AI 生成仍需人工验收**。拆得再细，也不能省掉“这镜脸有没有崩、这句声音对不对”的人工检查。
4. **镜头时长与模型失败率强绑定**。主流更关心“一镜一个主动作、2～6 秒、一种运镜”，而不是无限增加元数据。

## 1.3 2026 年真正值得吸收的主流约束

这些比“31 类”更重要：

- **一镜一个主动作**。转身、抬头、哭、拉远不要塞进同一镜。
- **一镜一种运镜**。推 + 摇 + 环绕容易漂移。
- **图生视频提示词只写运动，不重复外貌**。外貌由资产参考负责。
- **一致性是资产管理问题**。角色参考图/主体槽位优先于提示词堆叠。
- **成本按“可用镜头”计算**：`单价 × 时长 × 抽取倍数`，而不是只看 API 调用金额。
- **多人群戏仍难**。三人以上同框、相似服装发型容易混脸，应在分镜校验阶段预警。
- **合规进入渲染管线**。AI 标识、人名/肖像/品牌检查应前置，而不是导出后手工补水印。

---

# 2. 31 类逐条可行性与处置建议

评级说明：

- **A：现在做**——技术成熟、主流高频、能直接自动化。
- **B：改层级后做**——可行，但应做成预设/派生数据/剪辑对象，而非独立素材颗粒。
- **C：半自动或特定题材做**——质量不稳定，需人工挑选或模板。
- **D：暂不做**——主流短剧不普遍使用，成本/复杂度不划算。

“主流细分”指在主流短剧生产里是否经常明确区分，不代表完全没有团队使用。

## 2.1 V 组：画面提示

| ID | 主流细分 | 自动化可行性 | 评级 | 处置建议 |
|---|---|---|---|---|
| V01 镜头运镜 | 高 | 高 | **A** | 保留现有 `framing/cameraMove`；补机位、视角、站立/朝向；坚持一镜一运镜 |
| V02 角色表演 | 高 | 中高 | **A** | `action` 拆成“主动作 + 表情/情绪”；复杂动作只标记，不强行生成 |
| V03 场景美术光影 | 高 | 高 | **A** | 现有场景资产可复用；补光线、色调、前中背景；全片 LUT 统一放后期 |
| V04 静态道具 | 中高 | 高 | **A** | 现有 prop 资产可复用；动态物理交互另标风险 |
| V05 简单转场 | 高，但在剪辑层 | 高 | **B** | 从 video_gen 移除，建 `Transition{from,to,kind,duration}`，FFmpeg/剪辑软件实现 |

**判断**：V 组基本成立，也是 NovelCut 当前最强的一部分。真正要补的是“站位/朝向/人数/景深”和独立的 `videoPrompt`，不是再发明更多视觉颗粒。

## 2.2 A 组：人声

| ID | 主流细分 | 自动化可行性 | 评级 | 处置建议 |
|---|---|---|---|---|
| A01 现场同期对白 | 高 | 高 | **A** | 改名“画内对白”；AI 管线没有同期声。TTS 或 native_av 均可 |
| A02 通讯人声 | 中 | 高 | **B** | 保留类型标签，但实现为 `voicePreset=phone`：带通滤波 + 轻失真，不必单独 TTS 模型 |
| A03 内心独白 | 高 | 高 | **A** | 独立 voice clip；角色不变，文本和音色可复用，只换混响/空间预设 |
| A04 回忆人声 | 中 | 高 | **B** | 做成 `flashback` 预设，常与回忆画面滤镜、闪白转场联动 |
| A05 叙事旁白 | 高 | 高 | **A** | 独立旁白轨；不要求口型；可与画面角色解耦 |
| A06 喇叭/广播 | 低中 | 高 | **B** | `loudspeaker` 预设，低频使用，不值得独立生产流程 |
| A07 耳语/气声 | 低 | 中 | **C** | 仅靠后期音量/EQ 做不出气声；依赖 TTS 是否支持 whisper/breathy 音色 |
| A08 嘶吼/重伤变声 | 低 | 中低 | **C** | 情绪 TTS 或人工配音更稳；失真只能辅助，不能替代表演 |

**判断**：A 组最值得做的不是 8 条生产线，而是：

```text
VoiceClip = 文本 + 说话人 + 发声方式 + 情绪 + 时码 + 音色
VoicePreset = 干声之后的滤波/混响/失真/空间处理
```

A02/A04/A06 主要是预设；A07/A08 主要是 TTS 表演能力；只有 A01/A03/A05 值得在 UI 中高频暴露。

## 2.3 S 组：音效与音乐

| ID | 主流细分 | 自动化可行性 | 评级 | 处置建议 |
|---|---|---|---|---|
| S01 瞬态硬音效 | 高 | 高 | **A** | 素材库或 ElevenLabs SFX 等生成；绑定相对时码；人工选一条 |
| S02 持续氛围底音 | 高 | 高 | **A** | 独立 ambience clip，可跨镜连续；雨/风/城市底噪优先级很高 |
| S03 能量特效拟音 | 中 | 中高 | **B** | 玄幻/科幻高频，其他题材可延后；AI 生成后需人工选 |
| S04 BGM 片段 | 高 | 高 | **A** | 独立音乐轨；支持侧链避让人声、情绪段落和授权信息 |

**判断**：S 组是最应该优先补的。2026 年工具链已经成熟：

- ElevenLabs SFX 支持文生音效；
- 混元 Foley 等支持看视频自动拟音；
- ElevenLabs 的视频配乐/音效接口可返回时间戳对齐的音效，并可用 `separate_tracks` 把音乐和 SFX 分开交付。

所以 `audioCue: "BGM: 弦乐紧张"` 完全应该升级为真实音频资产，而不是继续当提示文字。

## 2.4 C 组：3D 动画与资产

| ID | 主流细分 | 自动化可行性 | 评级 | 处置建议 |
|---|---|---|---|---|
| C01 角色复杂动作 | 中：白模预演较常见；正式 CG 较少 | 中 | **C** | 优先做“动作预演参考”，HY-Motion/Blender/3D 白模；不要默认走正式 CG |
| C02 法术/能量粒子 | 中，玄幻题材较高 | 中低 | **C** | 简单效果直接视频模型；复杂效果用 AE/素材模板；全自动 3D 解算不现实 |
| C03 物理模拟 | 低 | 低 | **D** | 主流常改剧情/换镜头/用素材规避；不做通用物理模拟管线 |
| C04 静态 CG 资产 | 低，3D 漫剧除外 | 低 | **D** | 保留“外部资产上传”入口即可 |
| C05 绑定带动画 CG 资产 | 低，3D 漫剧除外 | 低 | **D** | 同上，不纳入自动生产主链 |

**判断**：豆包把“打斗/法术难生成”直接推导成“需要 3D 资产生产线”，跨度过大。

主流更常见的顺序是：

1. 改写法：减少复杂动作，保留剧情结果；
2. 拆镜：一个连招拆成多个短镜；
3. 预演：白模/骨骼/3D 导演台给视频模型做参考；
4. 模板：用现成法术、破碎、光效素材；
5. 最后才是定制 CG。

HY-Motion 1.0 已开源，能由文本生成 SMPL-H 骨骼动作，并已有 ComfyUI 与重定向工具，也可作为视频生成控制信号。**这证明 C01 的“预演参考”可行，不证明 C01～C05 的正式 CG 全自动交付可行。**

## 2.5 E 组：合成特效

| ID | 主流细分 | 自动化可行性 | 评级 | 处置建议 |
|---|---|---|---|---|
| E01 镜头光学特效 | 中 | 中高 | **B** | 做成画面预设/AE 模板，不做独立 3D 任务 |
| E02 畸变扭曲 | 低 | 中 | **C** | 插件/模板，特定题材启用 |
| E03 扫描/数字 UI | 低，科幻题材除外 | 中 | **C** | 动态模板 + 文本替换，无需 3D |
| E04 色差/glitch | 低中 | 中高 | **C** | 转场/情绪预设即可 |
| E05 蒙版遮罩/画中画 | 中，电话/分屏有用 | 高 | **B** | 路由应改为剪辑合成，不是 cg_vfx；FFmpeg 可实现 |
| E06 复杂特效转场 | 低 | 中低 | **C** | 模板化，少量使用；不要视频模型重算 |

**判断**：E 组大多不是“生成任务”，而是**合成操作**。它们应该进入 RenderPlan 的节点图，而不是和 TTS/视频生成并列成素材任务。

## 2.6 M 组：剪辑元数据

| ID | 主流细分 | 自动化可行性 | 评级 | 处置建议 |
|---|---|---|---|---|
| M01 时间锚点 | 高 | 高 | **A** | 必须做，但作为派生时码，不做独立内容颗粒 |
| M02 字幕 | 高 | 高 | **A** | 从 voice clip 自动派生 SRT/ASS；`onScreenText` 只保留片名条/字卡 |
| M03 合成层级 | 中 | 高 | **B** | 做成项目级固定渲染图，不为每镜重复存储 |

---

# 3. 最终建议的数据架构

## 3.1 四层，而不是 31 种平铺颗粒

```text
Story / Episode / Scene
        │
        ▼
ShotIR                    镜头叙事与视听意图（人读、LLM 读写）
        │ compile
        ▼
TrackClip[]               真正需要生成/交付的独立素材
        │ + Preset[] + Transition[]
        ▼
RenderPlan                绝对时间线、轨道、合成顺序、字幕、AI 标识
        │
        ▼
MP4 / SRT / ASS / EDL / 素材包
```

### ShotIR：回答“这一镜要表达什么”

包含主流 12 字段，并保留 NovelCut 已有优势：

```ts
interface ShotIR {
  id: string;
  episodeId: string;
  sceneIndex: string;
  shotIndex: number;

  duration: number;              // 默认 1.5–6s；项目可放宽到模型上限
  framing: ShotFraming;
  cameraMove: ShotCameraMove;
  cameraAngle?: "eye" | "high" | "low" | "dutch" | "top";
  narrativePov?: "objective" | "character" | "flashback";

  action: string;                // 一个主动作
  emotion?: string;
  characters: string[];
  blocking?: {
    count: number;
    positions?: string;           // 左/中/右、前后关系
    facing?: string;              // 朝向、正反打关系
  };
  depth?: { foreground?: string; midground?: string; background?: string; focus?: string };

  imagePrompt?: string;           // 静帧：景别 + 构图 + 氛围
  videoPrompt?: string;           // 视频：只写动作与运镜，不重复外貌

  associatedAssetIds: string[];
  dialogues: DialogueIR[];
  audioNotes?: AudioNote[];       // LLM 提出的音效意图，不是最终素材
  riskFlags?: RiskFlag[];         // 多人同框/复杂动作/物理模拟/长台词等

  imageStatus: GenStatus;
  videoStatus: GenStatus;
}
```

### TrackClip：只装“独立交付物”

```ts
type ClipKind = "video" | "voice" | "sfx" | "ambience" | "music" | "cg" | "subtitle";

interface TrackClip {
  id: string;
  shotId: string;
  kind: ClipKind;

  /** 相对 shot 起点；跨镜 ambience/music 可绑定 scene/episode */
  tIn: number;
  tOut: number;

  payload: Record<string, unknown>; // 按 kind 做判别联合
  presetId?: string;                // phone / inner_voice / flashback ...
  provider?: string;
  model?: string;

  status: "idle" | "queued" | "running" | "done" | "error" | "accepted";
  attempts: number;                 // 抽卡次数，一等公民
  assetUrl?: string;
  error?: string;
  cost?: number;
}
```

**注意**：这里不再让 31 类都成为 Clip。A02/A04/A06 是 VoiceClip + Preset；E 组大多只是 RenderPlan 节点；M03 是项目级合成图。

### RenderPreset：处理链，不是内容

```ts
interface VoicePreset {
  id: "clean" | "phone" | "inner" | "flashback" | "loudspeaker" | "whisper" | "distorted";
  ffmpegFilter: string;       // 服务端固定模板，LLM 不可直接生成命令
  gainDb?: number;
}

interface VisualPreset {
  id: string;
  kind: "lut" | "glow" | "glitch" | "pip" | "mask" | "transition";
  params: Record<string, string | number>;
}
```

### RenderPlan：派生绝对时码

```ts
shot.startSec = Σ(前序 shot.duration)
clip.absIn = shot.startSec + clip.tIn
clip.absOut = shot.startSec + clip.tOut
```

改镜头时长或顺序，所有绝对时码自动更新。**绝对时码只出现在导出物，不作为源数据。**

## 3.2 人声与字幕的正确关系

- `dialogues[]` 是剧本层真源；
- 每条 dialogue 编译成一个 `voice` clip；
- 字幕从 voice clip 派生，不另写一遍台词；
- `onScreenText` 只保留“片名条、地点条、手机屏字、紧急插字”，不与台词字幕混用；
- 画外音/独白/旁白不需要口型，正式分轨模式下尤其简单。

## 3.3 转场与跨镜音频

- 转场是 `Transition`，连接两个 shot，不属于任一 shot；
- ambience/music 可绑定 scene 或 episode，跨多个 shot 连续；
- BGM 避让人声是渲染参数，不是让 LLM 为每镜重新决定。

---

# 4. NovelCut 逐文件改造建议

以下路径均相对 `repo/`。

## 4.1 `apps/web/src/novelcut/types.ts`

### 当前问题

- `Shot.dialogue` 只能有一条台词，无法表达多人对话、画外音、内心独白并存。
- `audioCue?: string` 把 BGM、环境音、动作音效挤在一起。
- `onScreenText` 同时承担字卡和字幕意图。
- 只有 `imagePrompt`，没有视频提示词。
- 没有站位、朝向、叙事视角、风险标记、视频状态、抽取次数。

### 改法

1. 保留现有 `Shot` 作为 v1 兼容类型，新增 `ShotIR`；不要一次性删除旧字段。
2. `dialogue` 迁移为 `dialogues: DialogueIR[]`：

```ts
interface DialogueIR {
  id: string;
  speaker: string;
  text: string;
  voice: "on_screen" | "off_screen" | "inner" | "narration" | "flashback";
  emotion?: string;
  presetId?: "clean" | "phone" | "inner" | "flashback" | "loudspeaker";
  tIn?: number;
  tOut?: number;
}
```

3. `audioCue` 改为 `audioNotes: AudioNote[]`，仅保存意图：

```ts
type AudioNote =
  | { kind: "sfx"; desc: string; at?: number }
  | { kind: "ambience"; desc: string }
  | { kind: "music"; mood: string };
```

4. 新增 `videoPrompt`、`videoStatus`、`videoUrl`、`attempts`。
5. 新增 `TrackClip`、`Transition`、`RenderPreset`、`RenderPlan` 类型文件，建议独立为 `production/types.ts`，不要继续塞满 `types.ts`。

## 4.2 `apps/web/src/novelcut/agent/prompts.ts`

### 当前问题

`SHOTLIST_SYSTEM` 只让 LLM 输出一个 `dialogue`、一个 `audioCue`、一个 `onScreenText`，从提示词层就决定了后面无法分轨。

### 改法

将拆镜输出升级为：

```json
{
  "shots": [{
    "shotIndex": 1,
    "framing": "CU",
    "cameraMove": "static",
    "duration": 3,
    "narrativePov": "objective",
    "characters": ["苏晚"],
    "blocking": {"count": 1, "positions": "画面中央", "facing": "正面3/4"},
    "depth": {"foreground": "虚化酒杯", "midground": "苏晚面部", "background": "晚宴人群", "focus": "眼睛"},
    "action": "苏晚抬眼看向画外，手指收紧",
    "emotion": "隐忍震惊",
    "dialogues": [
      {"speaker": "苏晚", "text": "原来是你。", "voice": "inner", "emotion": "压抑"}
    ],
    "audioNotes": [
      {"kind": "ambience", "desc": "晚宴低声交谈与杯盏声"},
      {"kind": "sfx", "desc": "一声轻微杯盏碰撞", "at": 1.8}
    ],
    "imagePrompt": "Close-up of ...",
    "videoPrompt": "She looks up; fingers tighten; camera holds static."
  }]
}
```

Prompt 必须增加以下硬约束：

- 每镜只有一个主动作、一种运镜；
- `videoPrompt` 不写发色、服装、脸型等静态外貌；
- `dialogues` 可有多条，明确 `on_screen/off_screen/inner/narration`；
- 不让 LLM 输出绝对时码、混响数值、FFmpeg 命令；
- 三人以上同框、复杂打斗、物理破碎、长台词超时长，写 `riskFlags`；
- 时长先按台词字数校验，中文可按约 4～5 字/秒估算，超限拆镜。

现有 `buildShotImageGenPrompt()` 的 framing-first、资产 prompt 脱壳继续保留，这是源码里很值得复用的部分。

## 4.3 `apps/web/src/novelcut/agent/runner.ts`

### 当前问题

- `normalizeShot()` 只规范化单条 dialogue 和自由 audioCue。
- 没有从叙事 IR 到生产素材的编译步骤。
- `runShotImage()` 里重复动态 import `projectMeta`，可清理。
- 所有生成串行，无统一任务模型。

### 改法

新增三个纯函数，并优先配测试：

```ts
normalizeShotIR(raw, context): ShotIR
compileShot(shot: ShotIR, assets: Asset[]): TrackClip[]
compileEpisode(shots: ShotIR[]): RenderPlan
```

`compileShot` 做：

- `dialogues[]` → voice clips；
- `audioNotes[]` → sfx/ambience/music clips；
- 字幕不在此复制文本，导出时从 voice clips 派生；
- `riskFlags` 只预警，不自动改剧情；
- 相对时码缺失时按台词长度和镜头时长估算，并标记 `estimated=true`。

`compileEpisode` 做：

- 计算镜头绝对起点；
- 合并跨镜 ambience/music；
- 生成固定层级：视频 → CG/特效 → 字卡 → 字幕 → AI 标识；声音独立混音；
- 输出 SRT/ASS/EDL/FFmpeg 所需中间 JSON。

## 4.4 `apps/web/src/novelcut/store.ts`

### 当前问题

- 全量 JSON 读写 localStorage，小说、剧本、分镜一大就撞 5MB。
- `writeJson` 不捕获 `QuotaExceededError`。
- 批量任务“断点续跑”只靠筛选未完成项，无法记录队列与抽取历史。

### 改法

分两步，不要一开始上大后端：

**第一步（兼容现有架构）**

- 新增 `clips:{projectId}`、`transitions:{projectId}`、`renderPlans:{projectId}`；
- 写迁移函数：旧 `dialogue → dialogues[0]`，旧 `audioCue → audioNotes`；
- `writeJson` 增加异常捕获、容量提示和导出备份；
- 任务记录从“只 append 日志”升级为可更新状态、attempts、cost。

**第二步（开始接音频/视频前）**

- 项目正文和结构化数据迁 IndexedDB（Dexie）或 SQLite；
- 图像/音频/视频继续走服务器内容寻址文件缓存；
- localStorage 只保留 UI 偏好和供应商配置。

**不建议**继续把 base64 音频/视频塞进项目 JSON。

## 4.5 `apps/web/src/novelcut/pages/Storyboard.tsx`

### 当前问题

Shot Drawer 是单镜头宽表单：单条台词、单个音效字符串、单个字幕字符串。出图之后没有“这一镜还有哪些素材没做”的概念。

### 改法

不要直接做复杂多轨剪辑器，先做两层 UI：

**镜头卡片区**

- 保留现有时间线网格；
- 增加状态点：图 / 视频 / 人声 / 音效 / 字幕；
- 有风险标记时显示“多人同框 / 动作复杂 / 台词超时”；
- 每镜显示 attempts 与最近一次失败原因。

**Shot Drawer 改为三个区块**

1. **镜头意图**：12 字段、imagePrompt、videoPrompt；
2. **素材轨**：voice/sfx/ambience/music clip 列表，每条可单独生成、重试、试听、采纳；
3. **连续性检查**：前后镜人物站位、道具状态、角色服装、台词时长。

这比一次跳成专业 NLE 更符合 NovelCut 当前体量。

## 4.6 `apps/web/src/novelcut/pages/Assets.tsx`

### 当前问题

角色资产只有视觉 prompt 和图片，没有“角色声音圣经”。

### 改法

角色资产增加：

```ts
voiceProfile?: {
  provider?: string;
  voiceId?: string;
  referenceAudioUrl?: string;
  speed?: number;
  style?: string;
  approvedSampleUrl?: string;   // 平静/冲突/低声基准样本
}
```

项目级增加发音词典：人名、地名、多音字、外语、品牌读法。

这与主流“角色固定音色 + 基准三句 + 发音词典”的做法一致，比给每种人声再做一套资产更实用。

## 4.7 `apps/web/src/novelcut/llm.ts` 与 `SettingsDialog.tsx`

### 当前问题

- 只有 LLM 与图像两类供应商；设置也只有两个 tab。
- LLM/图像都是同步请求，视频和音乐通常是“提交任务 → 轮询/回调”，不能照搬。
- 所有客户端逻辑继续塞进 `llm.ts` 会失控。

### 改法

拆成：

```text
providers/
  llm.ts
  image.ts
  video.ts        // submit/poll/cancel
  tts.ts
  sfx.ts
  music.ts
  types.ts
```

设置改为按能力配置：

- 文本模型；
- 图像模型；
- 视频模型（含 `nativeAudio` 开关）；
- 配音/TTS；
- 音效/音乐；
- 渲染与导出（ FFmpeg 路径、AI 标识、响度标准）。

每个能力独立测试连接；项目只选择“用哪套配置”，不重复填 key。

## 4.8 `apps/web/app/nc/*` 与服务端渲染

建议新增：

```text
/nc/video/generate      提交/查询视频任务
/nc/audio/tts
/nc/audio/sfx
/nc/audio/music
/nc/media/cache         图像/音频/视频统一内容寻址缓存
/nc/render/plan         校验 RenderPlan
/nc/render/export       SRT/ASS/EDL/素材包
/nc/render/video        FFmpeg 合成，后台任务
```

注意：

- Next.js 路由的 300 秒上限不适合长渲染；正式合成应交给常驻 worker/daemon。
- FFmpeg filter 只能来自服务端白名单预设，不能把 LLM 输出直接拼进 shell。
- 视频/音乐供应商多数为异步任务，客户端要保存 provider task id，支持刷新后恢复轮询。

## 4.9 合规与成本（当前完全缺失）

`Project` 增加 `renderSettings`：

```ts
{
  aiDisclosure: boolean;        // 每集明显位置 AI 标识
  loudnessPreset: string;
  subtitlePreset: string;
  burnInSubtitles: boolean;
  nativeAudioMode: "separate_stems" | "native_av_draft";
}
```

请求发出前做基础检查：真实演员姓名、品牌 Logo、知名 IP 角色、未授权声音克隆提示。

成本记录按 clip 统计：

```text
可用素材成本 = 单次价格 × 时长/张数 × attempts
```

Tasks 页不只显示“调用成功”，还要显示“生成了几次，最后哪一条被采纳”。

---

# 5. 分阶段实施路线

## P0：先把分镜变成可执行 IR（不接新模型）

交付：

- `ShotIR`、`dialogues[]`、`audioNotes[]`、`videoPrompt`、风险标记；
- 拆镜 prompt 升级与旧数据迁移；
- `compileShot/compileEpisode` 纯函数；
- Shot Drawer 新字段；
- 单测覆盖 normalize、迁移、相对/绝对时码、台词超时。

**这一步完成，NovelCut 就从“出图分镜”升级到“专业分镜表”，但不破坏现有出图功能。**

## P1：声音分轨与剪辑工程导出

交付：

- TTS、SFX、BGM provider；
- voice/sfx/ambience/music clips；
- 电话/独白/回忆等白名单预设；
- 角色 voiceProfile 与发音词典；
- SRT/ASS、分轨 WAV、RenderPlan JSON、素材包导出；
- 简单试听与逐条采纳。

**优先 S01/S02/S04 + A01/A03/A05；A07/A08 只做实验入口。**

## P2：视频与成片闭环

交付：

- 图生视频 submit/poll；
- `native_av_draft` 与 `separate_stems` 两种模式；
- FFmpeg 拼接、转场、字幕、BGM 避让、响度统一、AI 标识；
- 后台任务与刷新恢复；
- 按可用镜头统计成本。

## P3：高难镜头辅助，不做全量 CG

交付：

- C01 白模/骨骼预演参考入口（HY-Motion/Blender/外部导入）；
- E05 画中画/分屏合成；
- E01/E04 等少量视觉模板；
- C02～C05 仅保留外部资产上传和人工外包状态。

---

# 6. 测试与验收标准

## 6.1 必补的纯函数测试

当前 `novelcut/` 没有业务测试，改造时最先补：

1. 旧 Shot 迁移不丢台词、音效、图像 URL；
2. `normalizeShotIR` 非法景别/运镜/时长有默认值；
3. 一个 shot 多条 dialogue 能生成多条 voice clip；
4. 同轨 clip 不重叠，跨轨可重叠；
5. 改镜头时长后绝对时码正确重算；
6. SRT 时码、换行、标点、角色名正确；
7. 台词超时能标 risk，不静默截断；
8. phone/inner 等 preset 只能映射到白名单 filter；
9. 视频任务刷新后可按 provider task id 恢复；
10. attempts 和采纳状态不会在被重试时清零。

## 6.2 一场戏的端到端验收

不要一开始拿整部小说验收。选一场 60～90 秒戏，包含：

- 两个角色对话；
- 一句内心独白；
- 一通电话；
- 一个持续环境音；
- 一个瞬态音效；
- 一段 BGM；
- 一个字卡与正常台词字幕；
- 一次简单转场。

验收：

1. 可单独重生任一句台词而不重做整镜；
2. 可单独替换 BGM 不影响人声；
3. 改某镜时长后字幕、音效、成片仍对齐；
4. 导出 SRT 与分轨素材能被剪映/Premiere 使用；
5. native_av 草稿与分轨正式版可明确区分；
6. 能统计本场总生成次数与采纳率。

---

# 7. 最终建议

## 应该做

1. **采用“ShotIR + TrackClip + Preset + RenderPlan”四层模型**。
2. **先把声音从提示文字变成素材**，这是 NovelCut 当前最大的架构缺口。
3. **支持原生音画草稿，但正式生产默认分轨**。
4. **把 12 字段分镜、时码派生、成本 attempts、合规标识做成系统能力**。
5. **3D 只做预演参考，特效优先模板和合成，不建全量 CG 管线**。

## 不应该做

1. 不要直接实现 31 种平铺 Particle 页面和状态机。
2. 不要让 LLM 生成混响数值、FFmpeg 命令或绝对时码。
3. 不要把电话/回忆/广播都做成独立 TTS 生产线。
4. 不要把转场交给视频模型生成。
5. 不要一开始就上完整多轨剪辑器或三维资产系统。

**一句话：主流不是“颗粒越细越专业”，而是“镜头意图足够清楚、独立素材可分轨、处理参数可复用、任何一步都能单独返工”。NovelCut 应按这个方向改，而不是按 31 类目录逐项堆功能。**

---

# 8. 主要调研依据与可信度说明

以下来源用于判断工作流和工具能力；厂商效率、通过率、成本等宣传数据未作为改造方案的硬依据。

- 主流六段式流程、班组制、短镜/长镜与抽卡问题：腾讯新闻《夜读｜AI 造剧，一场永无止境的赛跑》  
  https://news.qq.com/rain/a/20260129A004D800
- 8 字段分镜表、一镜一动作、一镜一运镜：  
  https://m.toutiao.com/article/7690432636031861282
- 商业化 12 字段分镜 API（站位、朝向、人数、前中背景、画外音）：  
  https://market4service.aliyun.com/detail/cmapi00074579.html
- Toonflow 实际操作：6 列分镜、资产先行、单图视频、拼接导出：  
  https://github.com/HBAI-Ltd/Toonflow-app （及以上述公开教程为操作参考）
- 原生音画模型与 API 情况（Seedance/Kling/Vidu/MiniMax 等）：  
  https://www.clipspeed.ai/blog/ai-video-native-audio.html  
  https://news.dayoo.com/finance/202602/10/171077_54927234.htm
- 音效与分轨音乐能力：  
  https://elevenlabs.io/zh/blog/introducing-instant-soundtracks  
  https://join.elevenlabs.io/zh/sound-effects
- 配音工程习惯：角色声音圣经、发音词典、台词 ID、空间预设：  
  https://www.findaiverse.com/zh/blog/ai-short-drama-dubbing-china-2026
- 多轨剪辑与配音/BGM/字幕实际组织：  
  http://www.hqwc.cn/news/1592999.html
- HY-Motion 1.0 文本到 3D 动作、SMPL-H、ComfyUI 与视频控制参考：  
  https://github.com/Tencent-Hunyuan/HY-Motion-1.0  
  https://hub.baai.ac.cn/view/51904
- 一致性资产库、参考槽位与多人同框边界：  
  https://www.toutiao.com/article/7699323346630099506/
- 合规内建与可用镜头成本公式：  
  https://juejin.cn/post/7693824347870232576

> 注：2026 年模型版本与供应商能力变化很快，实施 P1/P2 前应对选定的具体 API 做一次小批量实测，尤其检查：是否支持分轨输出、音频能否关闭、参考素材槽位、异步任务恢复和商用授权。
