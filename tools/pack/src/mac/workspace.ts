import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { ensureWorkspaceBuildArtifacts } from "../workspace-build.js";
import { runPnpm } from "./commands.js";

async function buildWorkspaceArtifacts(config: ToolPackConfig): Promise<void> {
  const webNextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousWebNextEnv = await readFile(webNextEnvPath, "utf8").catch(() => null);

  await runPnpm(config, ["--filter", "@novelcut/contracts", "build"]);
  await runPnpm(config, ["--filter", "@novelcut/sidecar-proto", "build"]);
  await runPnpm(config, ["--filter", "@novelcut/sidecar", "build"]);
  await runPnpm(config, ["--filter", "@novelcut/platform", "build"]);
  await runPnpm(config, ["--filter", "@novelcut/daemon", "build"]);
  try {
    await runPnpm(config, ["--filter", "@novelcut/web", "build"], {
      OD_WEB_OUTPUT_MODE: config.webOutputMode,
    });
    await runPnpm(config, ["--filter", "@novelcut/web", "build:sidecar"]);
  } finally {
    if (previousWebNextEnv == null) {
      await rm(webNextEnvPath, { force: true });
    } else {
      await writeFile(webNextEnvPath, previousWebNextEnv, "utf8");
    }
  }
  await runPnpm(config, ["--filter", "@novelcut/desktop", "build"]);
  await runPnpm(config, ["--filter", "@novelcut/packaged", "build"]);
}

export async function ensureMacWorkspaceBuild(config: ToolPackConfig, cache: ToolPackCache): Promise<void> {
  await ensureWorkspaceBuildArtifacts(config, cache, async () => {
    await buildWorkspaceArtifacts(config);
  });
}
