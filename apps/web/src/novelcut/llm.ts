/** NovelCut LLM client — talks to /nc/llm/chat (chat) and /nc/image/generate (images). */
export type ProviderId = "openai" | "deepseek" | "anthropic" | "siliconflow" | "newapi" | "custom";

export interface LLMConfig {
  provider: ProviderId; baseUrl: string; apiKey: string; model: string;
}

export interface ProviderPreset {
  id: ProviderId; label: string; defaultBaseUrl: string; defaultModel: string; hint?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  { id: "openai",      label: "OpenAI",                defaultBaseUrl: "https://api.openai.com/v1",   defaultModel: "gpt-4o-mini" },
  { id: "deepseek",    label: "DeepSeek",              defaultBaseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
  { id: "anthropic",   label: "Anthropic (兼容路由)", defaultBaseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-6", hint: "需 v1/messages 兼容路由,或经 new-api 转换" },
  { id: "siliconflow", label: "硅基流动",               defaultBaseUrl: "https://api.siliconflow.cn/v1", defaultModel: "deepseek-ai/DeepSeek-V3" },
  { id: "newapi",      label: "new-api 网关 (本机)",    defaultBaseUrl: "http://127.0.0.1:3000/v1",     defaultModel: "deepseek-chat", hint: "用服务器本机 new-api 时填这个" },
  { id: "custom",      label: "自定义 OpenAI 兼容",     defaultBaseUrl: "",                             defaultModel: "" },
];

export type ImageProviderId = "openai" | "grsai" | "newapi" | "kling" | "custom";

export interface ImageConfig {
  provider: ImageProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** preferred size string for OpenAI-style providers, e.g. "1024x1024" */
  defaultSize?: string;
  /** alternative aspect-ratio for grsai-style providers, e.g. "1:1" */
  useAspectRatio?: boolean;
}

export interface ImageProviderPreset {
  id: ImageProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  useAspectRatio: boolean;
  hint?: string;
}

export const IMAGE_PROVIDERS: ImageProviderPreset[] = [
  { id: "openai",  label: "OpenAI (gpt-image-2)",  defaultBaseUrl: "https://api.openai.com/v1",   defaultModel: "gpt-image-2", useAspectRatio: false },
  { id: "grsai",   label: "grsai (gpt-image-2)",   defaultBaseUrl: "https://grsaiapi.com/v1",     defaultModel: "gpt-image-2", useAspectRatio: true,  hint: "grsai 用 aspectRatio (1:1 / 9:16) 而不是 size" },
  { id: "newapi",  label: "new-api 网关 (本机)",   defaultBaseUrl: "http://127.0.0.1:3000/v1",    defaultModel: "gpt-image-2", useAspectRatio: false },
  { id: "kling",   label: "可灵 image",            defaultBaseUrl: "",                            defaultModel: "kling-image-v1", useAspectRatio: true },
  { id: "custom",  label: "自定义 OpenAI 兼容",    defaultBaseUrl: "",                            defaultModel: "", useAspectRatio: false },
];

const STORE_KEY_LLM = "novelcut:v1:llm";
const STORE_KEY_IMG = "novelcut:v1:image";

export function loadLLMConfig(): LLMConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY_LLM);
    return raw ? (JSON.parse(raw) as LLMConfig) : null;
  } catch { return null; }
}
export function saveLLMConfig(cfg: LLMConfig): void { window.localStorage.setItem(STORE_KEY_LLM, JSON.stringify(cfg)); }
export function clearLLMConfig(): void { window.localStorage.removeItem(STORE_KEY_LLM); }

export function loadImageConfig(): ImageConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY_IMG);
    return raw ? (JSON.parse(raw) as ImageConfig) : null;
  } catch { return null; }
}
export function saveImageConfig(cfg: ImageConfig): void { window.localStorage.setItem(STORE_KEY_IMG, JSON.stringify(cfg)); }
export function clearImageConfig(): void { window.localStorage.removeItem(STORE_KEY_IMG); }

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface ChatOptions { messages: ChatMessage[]; temperature?: number; json?: boolean; signal?: AbortSignal; }
export interface ChatResult { content: string; raw: unknown; }

export class LLMError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message); this.status = status; this.name = "LLMError";
  }
}

export async function chat(cfg: LLMConfig, opts: ChatOptions): Promise<ChatResult> {
  const resp = await fetch("/nc/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      responseFormat: opts.json ? "json_object" : undefined,
    }),
    signal: opts.signal,
  });
  const text = await resp.text();
  if (!resp.ok) {
    let msg = text || `(空响应)`;
    try { const j = JSON.parse(text); msg = j?.error?.message || j?.error?.msg || j?.message || msg; } catch {}
    if (resp.status === 504) msg = msg || "上游模型响应超时";
    else if (!msg || msg === "(空响应)") msg = `HTTP ${resp.status}`;
    throw new LLMError(resp.status, msg);
  }
  let json: any;
  try { json = JSON.parse(text); } catch { throw new LLMError(500, "供应商返回了非 JSON 响应"); }
  if (json?.error) throw new LLMError(200, `供应商内部错误: ${json.error.message ?? JSON.stringify(json.error)}`);
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new LLMError(500, "供应商响应中没有内容字段");
  return { content, raw: json };
}

export function extractJson<T = unknown>(content: string): T {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch {} }
  throw new Error("LLM 返回内容中找不到合法 JSON");
}

export interface ImageOptions {
  prompt: string;
  size?: string;
  aspectRatio?: string;
  signal?: AbortSignal;
}
export interface ImageResult { url?: string; b64?: string; raw: unknown; }

export async function imageGenerate(cfg: ImageConfig, opts: ImageOptions): Promise<ImageResult> {
  const resp = await fetch("/nc/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model,
      prompt: opts.prompt,
      size: opts.size,
      aspectRatio: opts.aspectRatio,
      n: 1,
    }),
    signal: opts.signal,
  });
  const text = await resp.text();
  if (!resp.ok) {
    let msg = text || `(空响应)`;
    try { const j = JSON.parse(text); msg = j?.error?.message || j?.error?.msg || j?.message || msg; } catch {}
    throw new LLMError(resp.status, msg);
  }
  let json: any;
  try { json = JSON.parse(text); } catch { throw new LLMError(500, "图像供应商返回了非 JSON"); }
  if (json?.error) throw new LLMError(200, `图像供应商内部错误: ${json.error.message ?? JSON.stringify(json.error)}`);
  const data = json?.data?.[0];
  if (!data) throw new LLMError(500, "图像响应中无 data[0]");
  const url = typeof data.url === "string" ? data.url : undefined;
  const b64 = typeof data.b64_json === "string" ? data.b64_json : undefined;
  if (!url && !b64) throw new LLMError(500, "图像响应中既无 url 也无 b64_json");
  return { url, b64, raw: json };
}
