import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-static";

const CACHE_DIR = process.env.NOVELCUT_CACHE_DIR
  ?? path.join(os.homedir(), ".novelcut", "cache");

const MIME_FROM_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // strict: only [a-f0-9]{24}\.(png|jpe?g|webp)
  if (!/^[a-f0-9]{24}\.(png|jpe?g|webp)$/i.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }
  const filePath = path.join(CACHE_DIR, id);
  try {
    const data = await fs.readFile(filePath);
    const ext = id.split(".").pop()!.toLowerCase();
    const mime = MIME_FROM_EXT[ext] ?? "application/octet-stream";
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
