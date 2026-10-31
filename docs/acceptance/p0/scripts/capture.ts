/**
 * Regenerates every snapshot under docs/acceptance/p0/.
 *
 * Run from the repo root:
 *   pnpm --dir apps/web exec tsx docs/acceptance/p0/scripts/capture.ts
 *
 * Why this script checks out a worktree: the "before" snapshot has to be
 * produced by the pre-P0 code, which no longer exists on this branch. The
 * baseline ref is pinned (P0_BASELINE_REF overrides it) so the comparison stays
 * stable even after main moves on, and the throwaway worktree is always removed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const OUT = resolve(REPO_ROOT, "docs/acceptance/p0");
const BASELINE_REF = process.env.P0_BASELINE_REF ?? "51dc195";

const STAMP = 1700000000000;

const load = (absolutePath: string) => import(pathToFileURL(absolutePath).href);

async function captureBefore(): Promise<Record<string, unknown>> {
  const worktree = mkdtempSync(join(tmpdir(), "novelcut-p0-baseline-"));
  try {
    execFileSync("git", ["worktree", "add", "--detach", worktree, BASELINE_REF], {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
    const { normalizeShot } = await load(
      join(worktree, "apps/web/src/novelcut/agent/runner.ts"),
    );
    const { legacyRawShot, shotBase } = await load(
      join(REPO_ROOT, "apps/web/tests/novelcut/fixtures.ts"),
    );

    const shot = {
      id: "shot_legacy",
      ...normalizeShot(legacyRawShot, shotBase),
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    mkdirSync(join(OUT, "before"), { recursive: true });
    writeFileSync(join(OUT, "before/normalized-shot.json"), JSON.stringify(shot, null, 2) + "\n");
    return shot as Record<string, unknown>;
  } finally {
    try {
      execFileSync("git", ["worktree", "remove", "--force", worktree], {
        cwd: REPO_ROOT,
        stdio: "pipe",
      });
    } catch {
      rmSync(worktree, { recursive: true, force: true });
    }
  }
}

async function captureAfter() {
  const { normalizeShotIR } = await load(join(REPO_ROOT, "apps/web/src/novelcut/agent/shotIR.ts"));
  const { compileEpisode } = await load(join(REPO_ROOT, "apps/web/src/novelcut/production/compiler.ts"));
  const { renderPlanToSrt } = await load(join(REPO_ROOT, "apps/web/src/novelcut/production/srt.ts"));
  const { legacyRawShot, modernRawShot, shotBase } = await load(
    join(REPO_ROOT, "apps/web/tests/novelcut/fixtures.ts"),
  );

  const legacy = {
    id: "shot_legacy",
    ...normalizeShotIR(legacyRawShot, shotBase),
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  const modern = {
    id: "shot_modern",
    ...normalizeShotIR(modernRawShot, shotBase),
    createdAt: STAMP,
    updatedAt: STAMP,
  };
  const plan = compileEpisode([legacy, modern]);

  mkdirSync(join(OUT, "after"), { recursive: true });
  writeFileSync(join(OUT, "after/normalized-legacy.json"), JSON.stringify(legacy, null, 2) + "\n");
  writeFileSync(join(OUT, "after/normalized-modern.json"), JSON.stringify(modern, null, 2) + "\n");
  writeFileSync(join(OUT, "after/render-plan.json"), JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(join(OUT, "after/scene.srt"), renderPlanToSrt(plan));

  const summary = {
    before: {
      dialogueFields: legacyRawShot.dialogue ? 1 : 0,
      audioFields: legacyRawShot.audioCue ? 1 : 0,
      separateVoiceClips: 0,
      separateAudioClips: 0,
      absoluteTimeline: false,
      riskFlags: 0,
    },
    after: {
      dialogueFields: legacy.dialogues.length,
      audioIntents: legacy.audioNotes.length,
      separateVoiceClips: plan.clips.filter((clip: { kind: string }) => clip.kind === "voice").length,
      separateAudioClips: plan.clips.filter(
        (clip: { kind: string }) => clip.kind === "sfx" || clip.kind === "ambience" || clip.kind === "music",
      ).length,
      absoluteTimeline: true,
      riskFlags: legacy.riskFlags?.length ?? 0,
      maxDialoguesPerShot: Math.max(legacy.dialogues.length, modern.dialogues.length),
      distinctVoiceModes: new Set(modern.dialogues.map((d: { voice: string }) => d.voice)).size,
      distinctAudioKinds: new Set(modern.audioNotes.map((n: { kind: string }) => n.kind)).size,
      renderTracks: plan.tracks.length,
      durationSec: plan.duration,
    },
  };
  writeFileSync(join(OUT, "after/comparison-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  return { legacy, plan };
}

async function main() {
  const before = await captureBefore();
  const { legacy, plan } = await captureAfter();
  console.log(
    `before: dialogues=${before.dialogue ? 1 : 0} audio=${before.audioCue ? 1 : 0}\n` +
    `after : dialogues=${legacy.dialogues.length} audio=${legacy.audioNotes.length} ` +
    `clips=${plan.clips.length} tracks=${plan.tracks.length} duration=${plan.duration}s`,
  );
}

await main();
