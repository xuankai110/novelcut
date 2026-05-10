/**
 * Server-side proxy that forwards OpenAI-compatible chat-completions calls.
 * Same-origin so the SPA sidesteps vendor CORS, and the API key never leaves
 * this process unencrypted across the wire.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;  // 5 min — Next.js route execution cap

interface Body {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  responseFormat?: "json_object";
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return jsonError(400, "invalid json body"); }

  if (!body.baseUrl || !body.apiKey || !body.model || !body.messages?.length) {
    return jsonError(400, "missing required fields: baseUrl / apiKey / model / messages");
  }

  const base = body.baseUrl.replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  const payload: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    temperature: body.temperature ?? 0.3,
    stream: false,
  };
  if (body.responseFormat === "json_object") {
    payload.response_format = { type: "json_object" };
  }

  // 5-minute upstream cap. Wrap the full request+body cycle so a stalled
  // body stream cannot escape as an unhandled rejection.
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
    if (aborted) {
      return jsonError(504, "上游模型响应超过 5 分钟未返回。试试:1) 减少分集数 (建议 ≤ 8 集 / 批) 2) 换更快的模型");
    }
    return jsonError(502, `上游请求失败: ${errMsg}`);
  }
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
