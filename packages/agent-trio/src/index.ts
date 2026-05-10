/**
 * @novelcut/agent-trio
 *
 * Three-layer agent loop:
 *
 *   DecisionAgent   — decomposes a high-level task into a plan
 *   ExecutionAgent  — runs each plan step, calling skills / vendors
 *   SupervisorAgent — reviews each step output, requests revision or accepts
 *
 * The trio runs to convergence or hits the configured retry budget.
 */

export interface Task<I = unknown> {
  id: string;
  kind: string;
  input: I;
  budget?: { maxRevisions: number; deadlineMs?: number };
}

export interface PlanStep {
  id: string;
  skill: string;
  args: Record<string, unknown>;
  dependsOn?: string[];
}

export interface StepResult<O = unknown> {
  stepId: string;
  output: O;
  artifacts?: { kind: string; uri: string }[];
}

export interface SupervisorVerdict {
  accept: boolean;
  reason?: string;
  /** when accept=false, suggest a focused revision prompt */
  revise?: { stepId: string; prompt: string };
}

export interface AgentTrioConfig {
  decide: (task: Task) => Promise<PlanStep[]>;
  execute: (step: PlanStep, ctx: TrioContext) => Promise<StepResult>;
  supervise: (step: PlanStep, result: StepResult) => Promise<SupervisorVerdict>;
}

export interface TrioContext {
  task: Task;
  prior: StepResult[];
  /** semantic memory access (see @novelcut/memory) */
  memory?: unknown;
}

export async function runTrio<I, O>(_task: Task<I>, _config: AgentTrioConfig): Promise<O> {
  throw new Error("runTrio() not yet implemented");
}
