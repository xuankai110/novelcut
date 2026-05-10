/**
 * @novelcut/vendor
 *
 * Programmable vendor system. Each vendor is a TS module that
 * exports a default {@link VendorAdapter}. Vendors are loaded at
 * runtime from `data/vendor/` and can be edited via the settings
 * UI without restarting the daemon.
 *
 * Categories:
 *   - llm    (chat / completion / structured output)
 *   - image  (text->image, image->image)
 *   - video  (image->video, text->video)
 *   - voice  (text->speech, speech->text)
 *   - embed  (text->vector)
 */

export type VendorKind = "llm" | "image" | "video" | "voice" | "embed";

export interface VendorAdapter {
  id: string;
  kind: VendorKind;
  /** human label */
  label: string;
  /** initialize from raw config (api key, base url, etc) */
  init(config: Record<string, unknown>): Promise<void>;
  /** vendor-specific call. Caller passes a kind-specific payload. */
  call(payload: unknown): Promise<unknown>;
  /** optional: list models the vendor exposes */
  models?(): Promise<{ id: string; label: string }[]>;
}

export interface VendorRegistry {
  register(adapter: VendorAdapter): void;
  byKind(kind: VendorKind): VendorAdapter[];
  byId(id: string): VendorAdapter | undefined;
  /** hot-reload TS source from data/vendor/<id>.ts */
  reload(id: string): Promise<void>;
}

export const KNOWN_VENDORS = {
  // image
  "gpt-image-2": { kind: "image" as const, label: "OpenAI gpt-image-2" },
  "kling-image": { kind: "image" as const, label: "可灵 image" },
  "nano-banana": { kind: "image" as const, label: "Google nano-banana" },
  // video
  "kling": { kind: "video" as const, label: "可灵 video" },
  "seedance-2": { kind: "video" as const, label: "ByteDance Seedance 2.0" },
  "runway-gen3": { kind: "video" as const, label: "Runway Gen-3" },
};
