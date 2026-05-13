import { useState } from "react";
import { markWelcomeSeen } from "./store";
import type { Project } from "./types";

const STEPS = [
  {
    ico: "📕",
    title: "1. 导入小说",
    body: "把一部完整的小说原文上传 (推荐 5-20 万字)。NovelCut 会自动按「第一章/Chapter 1」等标记切分;没有标记会按段落自动分块。",
  },
  {
    ico: "⚡",
    title: "2. 抽取事件",
    body: "AI 把每章内容拆成 3-7 个结构化「故事事件」(谁/在哪/做了什么/节拍位置)。这是后续所有改编的原料。",
  },
  {
    ico: "✍️",
    title: "3. 编剧 Agent",
    body: "三层 Agent (决策/执行/监督) 读事件图谱,产出故事骨架 + 分集决策表。把原著事件分配到你设定的集数上。",
  },
  {
    ico: "🎬",
    title: "4. 剧本",
    body: "每集自动扩写为竖屏 9:16 短剧剧本(场景描述 + 人物 + 台词 + 节拍)。所有角色/道具/场景在底部可关联。",
  },
  {
    ico: "👥",
    title: "5. 资产",
    body: "AI 出图出角色、道具、场景的参考图,全局复用。后续每个镜头出图时自动引用一致的人物/场景特征。",
  },
  {
    ico: "📺",
    title: "6. 分镜 + 出片",
    body: "每集拆成镜头 (DAG 节点画布),逐镜头出图,图生视频,拼接成片。所有 AI 调用都在「任务」tab 留痕。",
  },
];

export function WelcomeTour({ project, onClose }: { project: Project; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const close = () => { markWelcomeSeen(); onClose(); };

  const targetMinutes = Math.round((project.episodeCount * 30) / 60);
  const targetWords = (project.episodeCount * 1500).toLocaleString();

  return (
    <div className="nc-modal-backdrop" onClick={close}>
      <div className="nc-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="nc-modal-head">
          <div>
            <div className="nc-modal-title">👋 欢迎来到「{project.name}」</div>
            <div className="nc-page-sub">
              你的目标:<strong>{project.episodeCount} 集</strong> × ~30 秒/集 ≈ <strong>{targetMinutes} 分钟成片</strong>。
              建议小说原文 ≥ <strong>{targetWords} 字</strong>。
            </div>
          </div>
          <button className="nc-modal-close" onClick={close}>×</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= step ? "var(--nc-cyan)" : "#ebe7df",
                transition: "background 0.18s",
              }}
            />
          ))}
        </div>

        <div style={{ minHeight: 160, padding: "8px 0 16px" }}>
          {(() => {
            const cur = STEPS[step]!;
            return (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{cur.ico}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-strong)", marginBottom: 8 }}>{cur.title}</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>{cur.body}</div>
              </>
            );
          })()}
        </div>

        <div className="nc-modal-foot">
          <button className="nc-btn nc-btn-ghost" onClick={close} style={{ marginRight: "auto" }}>
            我熟悉,跳过
          </button>
          {step > 0 && (
            <button className="nc-btn nc-btn-ghost" onClick={() => setStep(step - 1)}>← 上一步</button>
          )}
          {!last ? (
            <button className="nc-btn nc-btn-primary" onClick={() => setStep(step + 1)}>下一步 →</button>
          ) : (
            <button className="nc-btn nc-btn-primary" onClick={close}>开始制作</button>
          )}
        </div>
      </div>
    </div>
  );
}
