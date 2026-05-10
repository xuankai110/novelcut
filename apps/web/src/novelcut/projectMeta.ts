/** Helpers that resolve Toonflow-style project-level imaging defaults
 *  with sensible fallbacks for legacy projects (videoRatio not set). */
import type { Project, VideoRatio, ImageQuality, Platform } from "./types";

const VERTICAL_PLATFORMS: Platform[] = ["抖音", "小红书", "快手", "TikTok", "YouTube Shorts"];

export function defaultRatioForPlatform(platform: Platform): VideoRatio {
  return VERTICAL_PLATFORMS.includes(platform) ? "9:16" : "16:9";
}

export function getVideoRatio(project: Project): VideoRatio {
  return project.videoRatio ?? defaultRatioForPlatform(project.platform);
}

export function getImageQuality(project: Project): ImageQuality {
  return project.imageQuality ?? "1K";
}

/** Map (quality, ratio) to a concrete OpenAI-style pixel size string.
 *  Used when the image provider uses `size` parameter (not aspectRatio). */
export function ratioToPixelSize(ratio: VideoRatio, quality: ImageQuality): string {
  // gpt-image-2 supports 1024x1024, 1024x1536, 1536x1024 reliably.
  // 2K/4K may not be supported by all providers; we double the 1K dims.
  const scale = quality === "4K" ? 4 : quality === "2K" ? 2 : 1;
  const baseTable: Record<VideoRatio, [number, number]> = {
    "1:1":   [1024, 1024],
    "9:16":  [1024, 1536],   // gpt-image-2 portrait
    "16:9":  [1536, 1024],
    "3:4":   [1024, 1280],   // approximate, providers usually accept 1024x1280
    "4:3":   [1280, 1024],
  };
  const [w, h] = baseTable[ratio];
  return `${w * scale}x${h * scale}`;
}

export const RATIO_OPTIONS: { value: VideoRatio; label: string; hint: string }[] = [
  { value: "9:16", label: "9:16 竖屏", hint: "抖音/小红书/快手/TikTok/Shorts (默认)" },
  { value: "16:9", label: "16:9 横屏", hint: "横版长视频 / B站 / YouTube" },
  { value: "1:1",  label: "1:1 正方", hint: "Instagram / 小红书图文" },
  { value: "3:4",  label: "3:4 略竖", hint: "杂志/海报封面" },
  { value: "4:3",  label: "4:3 略横", hint: "传统电视/电脑画幅" },
];

export const QUALITY_OPTIONS: { value: ImageQuality; label: string; hint: string }[] = [
  { value: "1K", label: "1K · 标清", hint: "1024x1536 · 最快/最便宜 (默认)" },
  { value: "2K", label: "2K · 高清", hint: "2048x3072 · 慢一倍/价钱翻倍" },
  { value: "4K", label: "4K · 超清", hint: "4096x6144 · 部分供应商不支持" },
];
