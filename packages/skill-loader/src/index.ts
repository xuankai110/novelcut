/**
 * @novelcut/skill-loader
 *
 * Discovers `skills/<name>/SKILL.md` at startup, parses front-matter,
 * builds a registry the daemon can resolve by skill id.
 *
 * Skill files follow Anthropic's SKILL.md convention:
 *
 *   ---
 *   name: episode-to-script
 *   description: ...
 *   nc:
 *     pipeline_stage: episode
 *     status: scaffold
 *   ---
 *   ...markdown body...
 */

export interface SkillFrontMatter {
  name: string;
  description: string;
  nc?: {
    pipeline_stage?: string;
    status?: "scaffold" | "alpha" | "stable";
  };
  triggers?: string[];
}

export interface Skill {
  id: string;
  dir: string;
  frontMatter: SkillFrontMatter;
  body: string;
  /** auxiliary files in the skill dir (e.g. assets/ references/) */
  files: string[];
}

export interface SkillRegistry {
  all(): Skill[];
  byId(id: string): Skill | undefined;
  byPipelineStage(stage: string): Skill[];
}

export async function loadSkills(_skillsDir: string): Promise<SkillRegistry> {
  throw new Error("loadSkills() not yet implemented");
}
