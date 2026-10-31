# P0 镜头 IR 改造验收记录

- 分支：`feat/shot-ir-p0`
- 改造前基线：`main@51dc195`
- 日期：2026-10-31
- 范围：镜头 IR、旧数据迁移、拆镜提示词、纯编译层、分镜抽屉、存储配额提示
- 不包含：TTS/SFX/BGM 供应商接入、视频生成、FFmpeg 成片（属于 P1/P2）

## 1. 结论

P0 通过验收。旧项目数据可无损读取并迁移；新分镜可以表达多人多台词、不同发声方式、结构化声音意图、站位/景深、视频提示词和风险标记；时间线和字幕由编译层派生，不再写死在镜头里。

| 指标 | 改造前 | 改造后 |
|---|---:|---:|
| 单镜台词容量 | 1 条 | 多条（验收样例 3 条） |
| 发声方式 | 无 | 画内/画外/独白/旁白/回忆 5 种 |
| 声音表达 | 1 个自由字符串 | SFX / 环境音 / 音乐 3 类结构化意图 |
| 独立声音素材 | 0 | 样例 9 个 clip（4 人声 + 5 声音） |
| 相对时码 | 无 | 每个 clip 独立 `tIn/tOut` |
| 绝对时码 | 无 | 由 `compileEpisode` 派生 |
| 同轨重叠检查 | 无 | 自动分轨，单轨不重叠 |
| 字幕 | 无可导出字幕 | 从 voice clip 派生 SRT |
| 风险提示 | 无 | 多人/复杂动作/物理/台词超时 |
| 旧数据媒体与重试 | 迁移后可能丢失（无机制） | `imageUrl`、状态、attempts 保留 |

机器可读摘要见 `after/comparison-summary.json`。

## 2. 前后快照

### 改造前

- `before/normalized-shot.json`
- 由 `main@51dc195` 的 `normalizeShot()` 对固定样例生成。
- 结果只有 `dialogue: {character,line}` 和 `audioCue: "BGM: 紧张弦乐；SFX: 杯盏轻碰"`。

### 改造后

- `after/normalized-legacy.json`：同一份旧输入迁移后的完整 v2 记录。
- `after/normalized-modern.json`：单镜 3 条台词、3 种音效意图的新模型样例。
- `after/render-plan.json`：9.345 秒时间线、绝对时码、轨道分配、合成层级。
- `after/scene.srt`：从 4 条 voice clip 派生的字幕。
- `after/comparison-summary.json`：前后指标对比。

改造后仍保留旧字段，方便 v1 页面和导出逻辑渐进迁移；新代码只读写 `dialogues[]` / `audioNotes[]`。

## 3. 自动化验收

执行命令：

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web exec vitest run tests/novelcut \
  -c vitest.config.ts --maxWorkers=1 --no-file-parallelism
```

结果：

- `typecheck`：通过。
- `vitest`：4 个测试文件、23 个测试全部通过。

覆盖项：

1. 旧单台词迁移到 `dialogues[]`，不丢文本、情绪和人物。
2. 旧 `audioCue` 按 BGM/环境音/SFX 拆成结构化意图。
3. 迁移幂等，已有图片 URL、状态和 attempts 不清零。
4. 多人多台词、画内/画外/独白、电话/独白预设。
5. 非法景别/运镜/视角/时长回退和 1.5–6 秒钳制。
6. 多人、复杂动作、物理模拟、台词超时风险标记，台词不被截断。
7. 每句台词编译为独立 voice clip，角色 `voiceProfile.voiceId` 可带入。
8. 同轨 clip 不重叠，跨轨可以同时开始。
9. 改镜头时长后，后续镜头和素材绝对时码自动重算。
10. 转场是独立剪辑对象，不写入镜头。
11. SRT 时间码、说话人、文本派生正确。
12. 声音预设只能映射固定白名单 FFmpeg filter。
13. localStorage 配额异常不再静默失败，给出可操作提示。
14. 原有 framing-first 出图 prompt、资产身份脱壳和 negative 约束未回归。
15. 台词 ID 去重；调整台词顺序后 voice clip ID 与内容仍稳定对应。

## 4. 生产构建

```bash
NEXT_TELEMETRY_DISABLED=1 OD_WEB_OUTPUT_MODE=standalone OD_WEB_DIST_DIR=.next-p0 \
  pnpm --dir apps/web build
```

结果：通过。Next.js 16.2.6 完成编译、TypeScript 检查和 6 条路由生成；`/nc/image/cache` 保留 1 条既有 NFT 追踪警告。

注意：不带 `OD_WEB_OUTPUT_MODE=standalone|server` 时，仓库默认静态导出会因既有的 `/nc/image/cache` `force-dynamic` 配置失败。该问题在 `main@51dc195` 已存在，与本次镜头 IR 改动无关，未在 P0 中顺手修改。

## 5. 已知边界与后续

- 分镜抽屉目前展示“素材轨预览”，clip 状态尚未持久化；独立生成、试听、采纳、重试在 P1 接入声音供应商后实现。
- `compileEpisode` 当前按传入镜头顺序计算时间线；跨镜环境音/BGM 合并、转场时长占用、响度归一化在 P1/P2 实现。
- localStorage 仍是 MVP 持久层，但已从“静默丢数据”改为明确报错。接入音视频前必须迁 IndexedDB/SQLite。
- 原生音画草稿与分轨正式模式尚未接入模型，本轮只固化数据与编译契约。
