/**
 * Server-side proxy that forwards OpenAI-compatible chat-completions calls
 * to the user-configured LLM endpoint. Same-origin from the SPA so we sidestep
 * vendor CORS gymnastics, and the API key never lives in URLs/logs visible
 * cross-origin.
 *
 * Request body:
 *   {
 *     baseUrl: string,       // e.g. "https://api.deepseek.com"
 *     apiKey: string,
 *     model: string,
 *     messages: ChatMessage[],
 *     temperature?: number,
 *     responseFormat?: "json_object" | undefined
 *   }
 *
 * Response: pass-through of provider response (status code preserved).
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError(400, "invalid json body");
  }

  if (!body.baseUrl || !body.apiKey || !body.model || !body.messages?.length) {
    return jsonError(400, "missing required fields: baseUrl / apiKey / model / messages");
  }

  const base = body.baseUrl.replace(/\/+$/, "");
  // Most OpenAI-compatible endpoints expose /v1/chat/completions.
  // If the user typed a base ending in /v1 we keep it; otherwise append.
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

  const ctl = AbortSignal.timeout(120_000);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ctl,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(502, `upstream fetch failed: ${msg}`);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
