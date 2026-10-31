import type { RenderPlan } from "./types";

export function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Subtitles are derived from voice clips; dialogue text is never duplicated into another source object. */
export function renderPlanToSrt(plan: RenderPlan): string {
  const voices = plan.clips
    .filter((clip): clip is Extract<RenderPlan["clips"][number], { kind: "voice" }> => clip.kind === "voice")
    .sort((a, b) => a.absIn - b.absIn || a.id.localeCompare(b.id));
  return voices.map((clip, index) => {
    const speaker = clip.payload.speaker ? `${clip.payload.speaker}：` : "";
    return `${index + 1}\n${formatSrtTime(clip.absIn)} --> ${formatSrtTime(clip.absOut)}\n${speaker}${clip.payload.text}`;
  }).join("\n\n") + (voices.length ? "\n" : "");
}
