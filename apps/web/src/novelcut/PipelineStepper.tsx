import type { Project } from "./types";
import { listChapters, listEpisodes, listAssets } from "./store";

interface Stage {
  id: string;
  ico: string;
  label: string;
  /** "done" | "active" | "pending" | "error" */
  state: "done" | "active" | "pending";
  hint: string;
  href: string;
}

export function PipelineStepper({ project, currentTab }: { project: Project; currentTab: string }) {
  const chapters = listChapters(project.id);
  const episodes = listEpisodes(project.id);
  const assets = listAssets(project.id);
  const totalEvents = chapters.reduce((s, c) => s + (c.eventCount ?? 0), 0);
  const eventsExtracted = chapters.filter(c => c.eventsStatus === "done").length;

  // Recommendations driven by project.episodeCount
  const minWordsForEpisodes = project.episodeCount * 1500; // ~1.5k source words / episode
  const wordCount = chapters.reduce((s, c) => s + c.body.length, 0);
  const minEventsForEpisodes = project.episodeCount * 2;  // ~2 events per episode

  const stages: Stage[] = [
    {
      id: "novel",
      ico: "📕",
      label: "导入",
      state: chapters.length === 0 ? "active" : (wordCount >= minWordsForEpisodes ? "done" : "active"),
      hint: chapters.length === 0
        ? "上传或粘贴小说原文"
        : `${chapters.length} 章 · ${wordCount.toLocaleString()} 字`,
      href: `#/p/${project.id}/novel`,
    },
    {
      id: "events",
      ico: "⚡",
      label: "抽事件",
      state: chapters.length === 0 ? "pending"
        : eventsExtracted === 0 ? "active"
        : eventsExtracted < chapters.length ? "active"
        : "done",
      hint: chapters.length === 0
        ? "等待小说"
        : `${eventsExtracted}/${chapters.length} 章 · ${totalEvents} 事件`,
      href: `#/p/${project.id}/novel`,
    },
    {
      id: "agent",
      ico: "✍️",
      label: "编剧",
      state: totalEvents < minEventsForEpisodes ? "pending"
        : episodes.length === 0 ? "active"
        : "done",
      hint: totalEvents < minEventsForEpisodes
        ? `需 ≥${minEventsForEpisodes} 事件`
        : episodes.length === 0
          ? "运行编剧 Agent 出分集表"
          : `${episodes.length} 集已规划`,
      href: `#/p/${project.id}/agent`,
    },
    {
      id: "scripts",
      ico: "🎬",
      label: "剧本",
      state: episodes.length === 0 ? "pending" : "active",
      hint: episodes.length === 0 ? "需先有分集" : `${episodes.filter(e => e.status !== "draft").length}/${episodes.length} 集成稿`,
      href: `#/p/${project.id}/scripts`,
    },
    {
      id: "assets",
      ico: "👥",
      label: "资产",
      state: episodes.length === 0 ? "pending" : assets.length === 0 ? "active" : "done",
      hint: assets.length === 0 ? "角色 / 道具 / 场景" : `${assets.length} 个资产`,
      href: `#/p/${project.id}/assets`,
    },
    {
      id: "storyboard",
      ico: "📺",
      label: "分镜",
      state: episodes.length === 0 ? "pending" : "pending",
      hint: "镜头编排 + 出图出片",
      href: `#/p/${project.id}/storyboard`,
    },
  ];

  return (
    <div className="nc-stepper">
      <div className="nc-stepper-track">
        {stages.map((s, idx) => (
          <div
            key={s.id}
            className="nc-stepper-step"
            data-state={s.state}
            data-current={s.id === currentTab || (s.id === "events" && currentTab === "novel" && chapters.length > 0)}
            onClick={() => (window.location.hash = s.href.slice(1))}
            title={s.hint}
          >
            <div className="nc-stepper-dot">
              {s.state === "done" ? <span style={{ fontSize: 12 }}>✓</span> : <span>{s.ico}</span>}
            </div>
            <div className="nc-stepper-meta">
              <div className="nc-stepper-label">{s.label}</div>
              <div className="nc-stepper-hint">{s.hint}</div>
            </div>
            {idx < stages.length - 1 && <div className="nc-stepper-arrow" />}
          </div>
        ))}
      </div>
    </div>
  );
}
