import type { VoicePresetId } from "../types";
import type { VoicePreset } from "./types";

/** Fixed server-side templates. LLM/user text is never interpolated into a filter. */
export const VOICE_PRESETS: Record<VoicePresetId, VoicePreset> = {
  clean: { id: "clean", ffmpegFilter: "anull" },
  phone: { id: "phone", ffmpegFilter: "highpass=f=300,lowpass=f=3400" },
  inner: { id: "inner", ffmpegFilter: "aecho=0.8:0.7:35:0.18", gainDb: -1 },
  flashback: { id: "flashback", ffmpegFilter: "aecho=0.8:0.65:60:0.25", gainDb: -2 },
  loudspeaker: { id: "loudspeaker", ffmpegFilter: "highpass=f=500,lowpass=f=3000" },
};

export function getVoicePreset(id: VoicePresetId | undefined): VoicePreset {
  return VOICE_PRESETS[id ?? "clean"] ?? VOICE_PRESETS.clean;
}
