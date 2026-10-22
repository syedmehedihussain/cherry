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

/** One error shape for every API failure (docs/api.md). */
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
