import { z } from 'zod';

export const APP_NAME = 'cherry';
export const DEFAULT_PORT = 4317;
export const DEV_WEB_PORT = 5173;
export const LOOPBACK_HOST = '127.0.0.1';

export const PHASES = ['plan', 'design', 'preparation', 'development', 'deployment'] as const;
export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

export const PHASE_LABEL: Record<Phase, string> = {
  plan: 'Plan',
  design: 'Design',
  preparation: 'Preparation',
  development: 'Development',
  deployment: 'Deployment',
};

/**
 * The lifecycle stages (ADR-0034): tabs in the workspace, each with its own agent and chat.
 * A loop: Issues feeds the next Plan.
 */
export const STAGES = [
  'plan',
  'design',
  'preparation',
  'development',
  'deployment',
  'issues',
] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const STAGE_LABEL: Record<Stage, string> = { ...PHASE_LABEL, issues: 'Issues' };

/**
 * The four stages the V3 workspace shows (ADR-0045). Preparation and Issues stay in
 * `STAGES` so their old chats still load in History; they get no tab.
 */
export const WORKSPACE_STAGES = ['plan', 'design', 'development', 'deployment'] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];
export const isWorkspaceStage = (s: Stage): s is WorkspaceStage =>
  (WORKSPACE_STAGES as readonly Stage[]).includes(s);

/** Stages whose agent writes docs and notes only (ADR-0034); their chat opens in Auto. */
export const DOCS_ONLY_STAGES: ReadonlySet<Stage> = new Set(['plan', 'design', 'issues']);

/** A project's own slash command, from `.claude/commands/<name>.md` (V2.1 w7.1). */
export const ProjectCommandSchema = z.object({ name: z.string(), description: z.string() });
export type ProjectCommand = z.infer<typeof ProjectCommandSchema>;

/** A skill a stage agent can use (ADR-0034). */
export const StageSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** Shipped with Cherry, or the user's own in ~/.cherry/skills/<stage>/. */
  source: z.enum(['bundled', 'user']),
});
export type StageSkill = z.infer<typeof StageSkillSchema>;

/** What GET /api/stages returns per stage: the agent and its skills. */
export const StageInfoSchema = z.object({
  stage: StageSchema,
  label: z.string(),
  name: z.string(),
  summary: z.string(),
  docsOnly: z.boolean(),
  skills: z.array(StageSkillSchema),
});
export type StageInfo = z.infer<typeof StageInfoSchema>;

/** One line of the Preparation readiness check (ADR-0034). */
export const ReadinessItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  /** What was found, or what is missing. */
  detail: z.string(),
});
export type ReadinessItem = z.infer<typeof ReadinessItemSchema>;

/** GET /api/projects/:id/stage?stage=: the stage's files, and readiness for Preparation. */
export const StageFocusSchema = z.object({
  files: z.array(z.string()),
  readiness: z.array(ReadinessItemSchema).nullable(),
});
export type StageFocus = z.infer<typeof StageFocusSchema>;

/** One error shape for every API failure (docs/api.md). */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
