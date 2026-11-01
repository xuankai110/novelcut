# NovelCut 深读笔记

> 源码：https://github.com/xuankai110/novelcut （v0.6.0，Apache-2.0）
> 阅读范围：apps/web/src/novelcut 全量 7.3k 行 + 三个 Next.js 路由 + README/docs/package.json
> 结论一句话：**这不是一个"AI 视频工具"，而是一条把"文本资产"逐层降维的编译器流水线**；工程上 80% 的功力花在"让 LLM 在长流程里不出错、不漂移、不丢进度"上。

---

## 1. 项目定位与血统

| 项 | 实际情况 |
|---|---|
| 业务 | 小说 → 事件 → 骨架 → 分集 → 剧本 → 资产 → 分镜（→ 视频，roadmap） |
| 形态 | Next.js 16 SPA + 3 个同源 BFF 路由，本地跑，单用户 |
| 血统 | **fork 自 open-design（OD）**。`packages/`(contracts/sidecar/platform)、`apps/daemon`、`design-systems/`、`craft/`、`e2e/specs/mac.spec.ts` 全是上游遗留，novelcut 并不依赖 |
| 真实代码量 | 业务逻辑 **全部**在 `apps/web/src/novelcut/`（约 7,300 行，含 1,135 行 CSS） |
| 依赖极轻 | 前端只用到 react/react-dom/next；`@xyflow/react`（画布）和 `openai`/`@anthropic-ai/sdk` 装了但业务代码没直接用——LLM 调用是手写 fetch |

值得学的一点：README 里有一段自我纠错，明确写了"之前画的 6 个 `@novelcut/*` 预埋包其实没实现，是设计占位，已删除避免误导"。**这种把"设计意图"和"已落地实现"分开标注的习惯**，比代码本身更值钱。

---

## 2. 七阶段流水线的数据契约

每个阶段是一个"垂直切片"：有独立输入、独立产物、独立状态机，可以单步重跑。

```
Chapter ──(LLM, 每章一次)──► ChapterEvent[]
   │                            │
   │                            ▼  compressEvents() 压成一行一条的文本索引
   │                       StorySkeleton（+basedOn 快照）
   │                            │
   │                            ▼  分批 5 集，带前序承接锚点
   │                       EpisodeBlueprint[]
   │                            │
   │                            ▼  每集一次，带 prevHookEnd
   │                       EpisodeScript（scenes/actions/dialogue）
   │                            │
   │              ┌─────────────┴──────────────┐
   │              ▼                            ▼
   │        Asset（char/prop/scene/media）   Shot（framing/cameraMove/duration）
   │        16:9 参考层                        项目画幅 9:16 输出层
   └──────────────────────────────────────────────────────┘
```

关键类型（`types.ts`，160 行定义整个领域模型）：

- `Chapter.eventsStatus: idle | running | done | error` — **章节级状态机**，失败单章重试不影响其他章。
- `ChapterEvent { summary, characters[], locations[], beat(1-10), excerpt }` — `beat` 是"该事件在本章的叙事位置"，后面分集时用来判断节奏。
- `StorySkeleton.basedOn: SkeletonProvenance { chapterIds[], chapterCount, eventCount, wordCount, targetEpisodes, coverage }` — **把"生成时的原料快照"写进产物里**。这是整个仓库最聪明的一个设计，见 §4.3。
- `EpisodeBlueprint { title, summary, beats[], hookOpen, hookEnd, retainsEvents[], newScenes[] }` — `retainsEvents` 是"这集复用了原著哪几个事件"，`newScenes` 是"编剧新增的"，**显式区分改编与原创**。
- `Shot { framing(9种), cameraMove(10种), duration(1.5-5s, 0.5 步进), characters[], action, dialogue, imagePrompt, associatedAssetIds[] }`

---

## 3. 七个阶段的实现要点

### 3.1 导入（Novel.tsx + store.ts）

- 章节切分靠一条正则：`/^(?:第[一二三四五六七八九十百千万0-9０-９]+[章回节卷]|Chapter\s+\d+|序章|楔子|尾声|后记)/i`。覆盖中英 + 全角数字。
- 无标记时降级到 `autoSplitByLength`：按空行切段，累计 3000 字成章。
- 导入是 `appendChapters`，序号自动接续 —— 支持"先做 20 章，再追加 30 章"。
- `CapacityBar` 用 `episodeCount × 1500 字` 反推"原料够不够"，<50% 标"原料不足"。**把模糊的"素材是否充足"变成一个可算的数字**，是很典型的好产品设计。

### 3.2 抽事件（Novel.tsx，唯一没放进 prompts.ts 的 prompt）

- 每章一次调用，`body.slice(0, 8000)`，temperature **0.2**（结构化抽取要低温度）。
- 产出 3-7 个事件，`beat` 强制 clamp 到 1-10。

### 3.3 故事骨架（ScriptAgent.tsx + runner.runSkeleton）

- 输入**不是原文**，是 `compressEvents()` 的输出：`#12 第三章·beat4: 事件摘要 [人物:苏晚/弗拉基米尔] [地点:晚宴厅]`。
- 这一步是全部设计的枢纽：**原文（十万字）→ 事件索引（几千字）→ 骨架（几百字）**。LLM 每一步只看得到上一层，上下文恒定可控，成本线性可预测。
- 产出：一句话故事 / 内核 / 隐线 / 人物核(含 arc) / 三幕(带集数 range) / 改编原则 3-5 条 / 覆盖率快照。

### 3.4 分集决策（runEpisodePlan）

- 智能默认值：`Math.max(3, Math.min(episodeCount, Math.floor(eventCount / 2.5)))` —— 用"事件密度"反推合理集数，而不是让用户凭感觉填。
- **>5 集自动分批**，每批把已生成集的 `EP01 「标题」 梗概 | 钩尾: xxx` 作为"承接锚点"塞进下一次请求。理由写在 README：单次请求超过 2 分钟会被网关掐断。
- 收到结果后 `filter(b => b.index >= cursor && b.index <= end)` —— 防御 LLM 不听话多输出/错号。

### 3.5 剧本扩写（runEpisodeScript）

- 每集独立调用，temperature **0.55**（创作要放开发挥）。
- 唯一跨集上下文是 `prevHookEnd`（上一集结尾留白），保证"钩子接钩子"。
- 多语言不靠翻译，靠把 `project.language` 写进 prompt 约束"台词与动作必须用此语言书写"。

### 3.6 资产中心（Assets.tsx 870 行 + ASSET_PROMPT_SYSTEMS）

四类资产各有"行业规范"级 system prompt，这是全仓最厚的领域知识：

- **角色**：4 视图并排（人像特写/正/侧/后），灰底 `#B8B8B8`，7 头身，16:9，均匀柔光，四视图完全一致，不裁切。还列了 R1-R9 九条硬约束。
- **道具**：双状态并排（独立 studio shot + 使用中特写）。
- **场景**：establishing shot，**明确不出现人物**（人物在分镜阶段叠加）。
- **素材**：封面/海报，留白给字幕。

`COMMON_RULES` 强调：prompt 用英文写（模型对英文更稳），但题材调性映射成光影语言（都市=冷峻、仙侠=空灵雾气、宫斗=奢华色调）。

批量执行模式（可复用的模板）：
```
targets = filtered.filter(只挑未完成的)      // 断点续跑靠"筛选"，不靠 job 队列
for (逐个) {
  if (ac.signal.aborted) break;              // 可中断
  try { prompt → image } catch { /* 继续下一个 */ }   // 单点失败不炸整批
  setBatchProgress({done,total,label})       // 细粒度进度
}
```

### 3.7 分镜（Storyboard.tsx + SHOTLIST_SYSTEM + buildShotImageGenPrompt）

这是工程含量最高的一段，解决"文生图不听话"的经典问题：

1. **拆镜 prompt 里就把 framing 语义化**：9 种景别各有"怎么写"的范例句式，并强制 `imagePrompt` **以景别开头**。
2. **组装时 framing-first + 双段指令**：`FRAMING_DIRECTIVES` 给每个景别一对 `pos`（"ECU，脸填满整个画面"）+ `neg`（"no torso, no shoulders, no full body, no wide shot"）。模型天生爱出全身像，所以正面强调 + 负面封锁双管齐下。
3. **身份注入要"脱壳"**：资产 prompt 是四视图设定，直接拼进分镜会带上"4-view turnaround / grey background / 7 heads tall"这些污染。`extractCharacterIdentity()` 用近 30 条正则把这些 boilerplate 全剥掉，只留 ≤180 字符的"脸部/体型/发型/气质"句子；场景同理只留 ≤160 字符氛围。**这是"参考图 prompt"与"成片 prompt"必须分层**的实证。
4. 最终 prompt 顺序固定为 9 段：framing → camera move → LLM 的 imagePrompt → action → subject identity → setting → 风格 → 技术参数 → negative。

---

## 4. 五个真正值得抄的工程决策

### 4.1 同源 BFF 代理（/nc/llm/chat, /nc/image/generate）

前端只跟自己的 Next.js 说话，绕开所有供应商 CORS。路由里做了三件脏活：

- URL 归一：`base.endsWith("/v1") ? base+"/chat/completions" : base+"/v1/chat/completions"` —— 用户填 `https://api.x.com` 或 `https://api.x.com/v1` 都能跑。
- 超时：`AbortController` 290s < `maxDuration 300`，且**超时要早于平台掐断**才能返回人话错误。
- **HTML 错误页翻译**：网关挂了会返回 nginx 的 HTML。`extractHumanReadable()` 抠 `<title>/<h1>/<center>`，把"502 Bad Gateway"变成"图像供应商 502 — xxx（上游暂时不可达，建议过 30 秒重试）"。

### 4.2 "非标"重试策略（llm.ts）

```ts
if ([429,502,503,504].includes(status)) return true;
if (status === 400 || 422 || 500) return RETRYABLE_BODY_PATTERNS.some(...)
// 匹配 "excessive system load" / "queue full" / "model busy" / "concurrent limit" ...
```
国内中转网关习惯用 **400 表示"我太忙了"**，标准 HTTP 语义在这里是失效的。只重试一次（等 8s），不搞指数退避 —— 因为图像生成慢、用户等不起。

### 4.3 覆盖率 + 过时检测（staleness.ts）

`coverage = wordCount / (episodeCount × 1500)`，截断到 2：
- <0.6 → "草稿版 · 42% 覆盖率"（黄）
- <1.0 → "初稿版"（绿）
- ≥1.0 → "完整版"（青）

配合 `basedOn.chapterIds` 快照做差集：新增/删除章节 → 顶部黄条 "新增 3 章 / 12,000 字 / 18 事件，骨架可能已过时"。

**这套东西的本质是：给 LLM 产物加"血液检测报告"。** 用户永远知道"这份骨架是基于多少原料生成的、现在还算不算数"，而不是面对一个黑盒结果猜。任何长链条 AI 产品都该抄这个。

### 4.4 图像落盘缓存（/nc/image/cache）

- 优先要 `b64_json` 而不是 `url`（供应商 CDN URL 会过期，项目里就有 `SafeImg` 兜底破图）。
- 收到 bytes 后 `sha256 → 前 24 hex` 当文件名，写 `~/.novelcut/cache/`，幂等（存在就跳）。
- 返回 `/nc/image/cache/<hash>.png`，**内容寻址 = 天然可永久缓存**。
- 失败则降级用原始 URL 或 data URI（`resolveStableImageUrl` 里 try/catch），不阻断主流程。

### 4.5 任务日志即可观测性

每个异步操作都 `appendTask()` 写两条：`running` 一条 + `done|error` 一条（`taskId` / `taskId+"_done"`）。Tasks tab 就是一个"人类可读的 trace"。没有 OpenTelemetry，但对单机产品足够，且**用户能自己看懂发生了什么**。

---

## 5. 明显的问题（code review 视角）

按严重程度：

1. **业务代码零测试**。`apps/web/tests/` 和 `e2e/specs/` 全是上游 open-design 的（artifacts / sidecar / critique），`novelcut/` 目录下没有任何 `*.test.*`。7,300 行纯手测，而 README 写着 "GitHub Actions CI" 在进行中。
2. **localStorage 会爆**。`writeJson` 没有 try/catch，`QuotaExceededError` 会直接冒泡。一部 60 万字小说 + 60 集剧本 + 几百个分镜 JSON，5MB 上限很容易撞穿。这是"本地优先、零部署"路线的根本天花板。
3. **.docx 其实不支持**。UI `accept=".txt,.docx,.md"`，README 也写了支持 docx，但 `onFile` 用的是 `fileReader.readAsText()`，全仓搜不到 `jszip`/`readAsArrayBuffer`。二进制当文本读 = 乱码。
4. **API Key 存 localStorage 并明文过代理**。本机自用没问题，但 `baseUrl` 由前端任意传、代理无鉴权无限流 —— 一旦按 README 的 roadmap 做"云端协作/多用户"，这就是开放代理 + SSRF。
5. **批量完全串行**。20 张图 = 20 次串行生成，没有并发池。对限流友好，但用户等待时间线性叠加，且中断后要靠手动再点。
6. **骨架重生成与分集无强一致**。`handleRegenSkeleton` 只 `clearSkeleton` + confirm 提示，episodes 原样留着；`staleness` 只比对"章节增删"，不比对"骨架 vs 现存 blueprint"。
7. **超长章节静默截断**。`body.slice(0, 8000)` 无任何提示，一本 2 万字的大章会被砍掉一大半，事件抽取必然漏。
8. 小冗余：`runShotImage` 里在函数内 `await import("../projectMeta")` 重复导入；缓存目录无 GC 策略；`packages/apps-daemon` 等上游代码约 3 万行是死重。

---

## 6. 如果用来做自己的短剧平台，我会怎么改

保留（直接抄）：

- 分层降维的 prompt 链 + `compressEvents` 的索引化思路（省 token、可控上下文）
- 产物内嵌 `basedOn` 快照 + 覆盖率/过时徽章
- framing pos/neg 双段指令 + 资产 prompt 脱壳函数
- 资产 16:9 参考层 / 成片 9:16 输出层分离
- 同源 BFF + HTML 错误翻译 + 非标重试

必须换掉：

- **持久化**：localStorage → SQLite/Postgres。前端仍可保留本地缓存，但真身入库。这是从"玩具"到"产品"的分水岭。
- **执行模型**：串行 for 循环 → 任务队列 + 并发池 + 真正的 resume（现在靠"筛选未完成项"勉强够用，一旦多端就崩）。
- **密钥**：浏览器存储 → 服务端加密存储，前端只拿"配置是否已设置"。
- **实时性**：JSON 阻塞 → SSE 流式（`packages/contracts/src/sse` 上游其实已有实现，可以直接捡）。

再加（NovelCut 没有的）：

- 分镜 → 图生视频 → 拼接 → 字幕，这一段它还是 roadmap，也是真正的护城河所在
- 同一角色多状态派生（换装/换表情），现在只能靠重跑资产
- 成本预估：生成前就告诉用户"这条片子大概烧多少 token / 多少张图 / 多少钱"

---

## 7. 一句话总结

NovelCut 的核心洞察不是"用 AI 生成视频"，而是：**把一部小说编译成一部短剧，本质上是一次七趟的多级编译器，每一级都要有独立的中间表示（IR）、独立的状态机、可校验的产物契约。** 它把 LLM 当成一个"不稳定的函数"，然后用快照、覆盖率、negative prompt、分批、重试、断点续跑这一整套工程手段把它焊成流水线。

它的代码不优雅（1,135 行 CSS、`window.__nc_proposed` 这种全局变量、零测试），但它对**"AI 长流程产品到底难在哪"**的回答非常诚实：难的不是单点生成质量，是**跨阶段的上下文衰减、一致性漂移和失败恢复**。
