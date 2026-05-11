/**
 * Server-side image cache. Accepts either:
 *   { b64: string, mimeType?: string }     -- raw base64 from b64_json response
 *   { remoteUrl: string }                  -- URL we re-fetch and store
 *
 * Returns: { url: "/nc/image/cache/<hash>.<ext>" }  -- stable, immutable
 *
 * Storage path: $NOVELCUT_CACHE_DIR or ~/.novelcut/cache/
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_DIR = process.env.NOVELCUT_CACHE_DIR
  ?? path.join(os.homedir(), ".novelcut", "cache");

const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

interface Body {
  b64?: string;
  remoteUrl?: string;
  mimeType?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return jsonError(400, "invalid json body"); }

  let buf: Buffer;
  let mime = body.mimeType ?? "image/png";

  if (body.b64) {
    try { buf = Buffer.from(body.b64, "base64"); }
    catch { return jsonError(400, "invalid base64"); }
  } else if (body.remoteUrl) {
    if (!/^https?:\/\//i.test(body.remoteUrl)) return jsonError(400, "remoteUrl must be http(s)");
    try {
      const r = await fetch(body.remoteUrl, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) return jsonError(502, `upstream fetch ${r.status}`);
      const ct = r.headers.get("content-type") ?? "image/png";
      mime = ct.split(";")[0].trim();
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      return jsonError(502, `remoteUrl fetch failed: ${m}`);
    }
  } else {
    return jsonError(400, "expected `b64` or `remoteUrl`");
  }

  if (buf.byteLength === 0) return jsonError(400, "empty image");
  if (buf.byteLength > 20 * 1024 * 1024) return jsonError(413, "image too large (>20MB)");

  const ext = ALLOWED_MIME[mime] ?? "png";
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 24);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const filename = `${hash}.${ext}`;
  const filePath = path.join(CACHE_DIR, filename);
  // skip write if already exists (idempotent)
  try { await fs.access(filePath); }
  catch { await fs.writeFile(filePath, buf); }

  return new Response(JSON.stringify({
    url: `/nc/image/cache/${filename}`,
    bytes: buf.byteLength,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status, headers: { "Content-Type": "application/json" },
  });
}
