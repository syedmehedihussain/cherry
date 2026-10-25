import { z } from 'zod';

/** Stages Autopilot can fly (ADR-0046): not Deployment, which leaves the machine. */
export const AUTOPILOT_STAGES = ['plan', 'design', 'development'] as const;
export const AutopilotStageSchema = z.enum(AUTOPILOT_STAGES);
export type AutopilotStage = z.infer<typeof AutopilotStageSchema>;

export const AutopilotTaskSchema = z.object({
  title: z.string(),
  status: z.enum(['doing', 'done', 'failed']),
  note: z.string(),
  tests: z.enum(['pass', 'fail', 'none']),
  /** How many times it failed; twice stops the run. */
  failures: z.number(),
});
export type AutopilotTask = z.infer<typeof AutopilotTaskSchema>;

/** Something Magnet did that shows in the chat between the agent's turns. */
export const AutopilotEventSchema = z.object({
  at: z.number(),
  kind: z.enum(['status', 'decision', 'task', 'needs', 'stop']),
  text: z.string(),
  adr: z.number().optional(),
  ok: z.boolean().optional(),
});
export type AutopilotEvent = z.infer<typeof AutopilotEventSchema>;

export const AutopilotDecisionSchema = z.object({
  adr: z.number(),
  title: z.string(),
  reason: z.string(),
  /** The user's review in the report: kept, changed, or not yet. */
  review: z.enum(['open', 'kept', 'changed']),
});
export type AutopilotDecision = z.infer<typeof AutopilotDecisionSchema>;

/** The report when Magnet lands, in ASD-STE100 (ADR-0015, ADR-0046). */
export const AutopilotReportSchema = z.object({
  headline: z.string(),
  result: z.array(z.string()),
  next: z.string(),
  durationMs: z.number(),
  orders: z.number(),
  answers: z.number(),
});
export type AutopilotReport = z.infer<typeof AutopilotReportSchema>;

export const AutopilotStateSchema = z.object({
  stage: AutopilotStageSchema,
  status: z.enum(['off', 'asking', 'flying', 'stopping', 'done', 'stopped', 'failed']),
  goal: z.string().nullable(),
  /** What Magnet offers when it asks "What should I do, sir?". */
  suggestions: z.array(z.string()),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  orders: z.number(),
  answers: z.number(),
  /** Planned tasks for the job (Magnet's count), for "3 of 8". */
  total: z.number().nullable(),
  tasks: z.array(AutopilotTaskSchema),
  events: z.array(AutopilotEventSchema),
  decisions: z.array(AutopilotDecisionSchema),
  needsYou: z.array(z.string()),
  report: AutopilotReportSchema.nullable(),
  /** Magnet is thinking about the next order. */
  magnetBusy: z.boolean(),
  error: z.string().nullable(),
});
export type AutopilotState = z.infer<typeof AutopilotStateSchema>;
