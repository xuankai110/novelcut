/**
 * Server-side proxy to OpenAI-compatible image generation endpoint.
 * Accepts the OpenAI Images API format and forwards to the user-configured provider.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  prompt?: string;
  size?: string;          // OpenAI: "1024x1024", "1024x1792", etc
  aspectRatio?: string;   // grsai-style: "1:1", "9:16"
  n?: number;
  responseFormat?: "url" | "b64_json";
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return jsonError(400, "invalid json body"); }

  if (!body.baseUrl || !body.apiKey || !body.model || !body.prompt) {
    return jsonError(400, "missing required fields: baseUrl / apiKey / model / prompt");
  }

  const base = body.baseUrl.replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/images/generations` : `${base}/v1/images/generations`;

  const payload: Record<string, unknown> = {
    model: body.model,
    prompt: body.prompt,
    n: body.n ?? 1,
  };
  if (body.size) payload.size = body.size;
  if (body.aspectRatio) payload.aspectRatio = body.aspectRatio;
  if (body.responseFormat) payload.response_format = body.responseFormat;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 290_000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await upstream.text();
    clearTimeout(timeoutId);
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    const aborted = controller.signal.aborted;
    const errMsg = e instanceof Error ? e.message : String(e);
    if (aborted) return jsonError(504, "图像生成超过 5 分钟未返回 — 试试换更快的模型或减小分辨率");
    return jsonError(502, `上游请求失败: ${errMsg}`);
  }
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status, headers: { "Content-Type": "application/json" },
  });
}
