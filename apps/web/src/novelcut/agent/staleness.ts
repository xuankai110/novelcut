import type { Chapter, StorySkeleton } from "../types";

export interface StalenessReport {
  stale: boolean;
  reason?: string;
  /** delta vs the snapshot embedded in skeleton.basedOn */
  newChapters: number;
  newWords: number;
  newEvents: number;
  removedChapters: number;
}

/** Detect whether the current chapters set has diverged from the snapshot
 *  the skeleton was generated from. */
export function checkSkeletonStaleness(
  skeleton: StorySkeleton | null, currentChapters: Chapter[],
): StalenessReport {
  const empty: StalenessReport = { stale: false, newChapters: 0, newWords: 0, newEvents: 0, removedChapters: 0 };
  if (!skeleton?.basedOn) return empty;
  const snap = skeleton.basedOn;
  const currentDone = currentChapters.filter(c => c.eventsStatus === "done");
  const currentIds = new Set(currentDone.map(c => c.id));
  const snapIds = new Set(snap.chapterIds);

  const newChapterList = currentDone.filter(c => !snapIds.has(c.id));
  const removedCount = snap.chapterIds.filter(id => !currentIds.has(id)).length;

  const newWords = newChapterList.reduce((s, c) => s + c.body.length, 0);
  const newEvents = newChapterList.reduce((s, c) => s + (c.eventCount ?? 0), 0);

  if (newChapterList.length === 0 && removedCount === 0) {
    return { ...empty, stale: false };
  }

  const parts: string[] = [];
  if (newChapterList.length > 0) parts.push(`新增 ${newChapterList.length} 章 / ${newWords.toLocaleString()} 字 / ${newEvents} 事件`);
  if (removedCount > 0) parts.push(`移除 ${removedCount} 章`);

  return {
    stale: true,
    reason: parts.join(" · "),
    newChapters: newChapterList.length,
    newWords,
    newEvents,
    removedChapters: removedCount,
  };
}

/** Coverage status used to label a skeleton as draft or full. */
export type CoverageStatus = "draft" | "ok" | "full";

export function coverageStatus(coverage: number | undefined): CoverageStatus {
  if (coverage == null) return "draft";
  if (coverage < 0.6) return "draft";
  if (coverage < 1.0) return "ok";
  return "full";
}

export function coverageLabel(coverage: number | undefined): { status: CoverageStatus; label: string; color: string } {
  const s = coverageStatus(coverage);
  const pct = coverage == null ? 0 : Math.round(coverage * 100);
  if (s === "draft") return { status: s, label: `草稿版 · ${pct}% 覆盖率`, color: "#f59e0b" };
  if (s === "ok") return { status: s, label: `初稿版 · ${pct}% 覆盖率`, color: "var(--nc-green)" };
  return { status: s, label: `完整版 · ${pct}% 覆盖率`, color: "var(--nc-cyan-strong)" };
}
