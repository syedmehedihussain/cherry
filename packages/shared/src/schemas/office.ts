import { z } from 'zod';

/**
 * The office (V4, ADR-0052): seven gated stages, each with a staff agent. The state of one project
 * lives in `_project/office.json` (ADR-0054), never in git.
 */
export const OFFICE_STAGES = [
  'idea',
  'requirements',
  'plan',
  'design',
  'development',
  'testing',
  'deployment',
] as const;
export const OfficeStageSchema = z.enum(OFFICE_STAGES);
export type OfficeStage = z.infer<typeof OfficeStageSchema>;

export const OFFICE_STAGE_LABEL: Record<OfficeStage, string> = {
  idea: 'Idea',
  requirements: 'Requirements',
  plan: 'Plan',
  design: 'Design',
  development: 'Development',
  testing: 'Testing',
  deployment: 'Deployment',
};

export const OFFICE_AGENT: Record<OfficeStage, string> = {
  idea: 'Business Analyst',
  requirements: 'System Analyst',
  plan: 'System Architect',
  design: 'UI/UX Designer',
  development: 'Development Team',
  testing: 'QA Engineer',
  deployment: 'DevOps Engineer',
};

/** The agent's initials on its avatar. */
export const OFFICE_AGENT_MONO: Record<OfficeStage, string> = {
  idea: 'BA',
  requirements: 'SA',
  plan: 'AR',
  design: 'UX',
  development: 'DV',
  testing: 'QA',
  deployment: 'DO',
};

/** The name on the stage card (the plan sketch). */
export const OFFICE_CARD_NAME: Record<OfficeStage, string> = {
  ...OFFICE_STAGE_LABEL,
  design: 'UI/UX design',
};

/**
 * locked: not open yet. active: the agent works on the user's jobs. waiting: sent to the client.
 * signed: signed off. update: signed off, then a big change flagged it (ADR-0052).
 * carried: a later version took this stage over from the version before (Idea in v2.0).
 */
export const StageStateSchema = z.enum([
  'locked',
  'active',
  'waiting',
  'signed',
  'update',
  'carried',
]);
export type StageState = z.infer<typeof StageStateSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date as YYYY-MM-DD.');

/** One sign-off. `internal` is a sign-off without a client approval (always true for personal). */
export const SignOffSchema = z.object({
  by: z.string(),
  date: IsoDate,
  notes: z.string(),
  internal: z.boolean(),
  at: z.string(),
});
export type SignOff = z.infer<typeof SignOffSchema>;

export const StageRecordSchema = z.object({
  state: StageStateSchema,
  /** The agent said the stage is ready (V4: "The idea is clear. We can start Requirements."). */
  ready: z.boolean(),
  /** When the stage was sent to the client (state waiting). */
  sentAt: z.string().nullable(),
  /** Every sign-off, oldest first; the last one is the current one. */
  signOffs: z.array(SignOffSchema),
});
export type StageRecord = z.infer<typeof StageRecordSchema>;

/** The inside gate of Development: the client approves the prototype before the full build. */
export const DevGateSchema = z.enum(['build', 'sent', 'approved']);
export type DevGate = z.infer<typeof DevGateSchema>;

/** One run through the stages: v1.0, then v2.0 next to the live v1.0. */
export const CycleSchema = z.object({
  version: z.string(),
  title: z.string(),
  stages: z.record(OfficeStageSchema, StageRecordSchema),
  devGate: DevGateSchema,
  startedAt: z.string(),
  liveAt: z.string().nullable(),
});
export type Cycle = z.infer<typeof CycleSchema>;

export const ChangeRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  status: z.enum(['proposed', 'approved', 'rejected']),
  /** The stages the impact note names; approval flags the signed-off ones as `update`. */
  stages: z.array(OfficeStageSchema),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;

export const ChangeLogEntrySchema = z.object({
  at: z.string(),
  stage: OfficeStageSchema,
  text: z.string(),
});
export type ChangeLogEntry = z.infer<typeof ChangeLogEntrySchema>;

export const CostSchema = z.object({
  id: z.string(),
  item: z.string(),
  vendor: z.string(),
  period: z.string(),
  amount: z.number().nonnegative(),
  /** Passed on to the client on the invoice. Always false for a personal project. */
  bill: z.boolean(),
  addedAt: z.string(),
});
export type Cost = z.infer<typeof CostSchema>;

/** Manual time (meetings, calls). Session time comes from the chat history (o13). */
export const TimeEntrySchema = z.object({
  id: z.string(),
  stage: OfficeStageSchema.nullable(),
  hours: z.number().positive().max(24),
  note: z.string(),
  date: IsoDate,
});
export type TimeEntry = z.infer<typeof TimeEntrySchema>;

export const OfficeKindSchema = z.enum(['client', 'personal']);
export type OfficeKind = z.infer<typeof OfficeKindSchema>;

/** `_project/office.json`. */
export const OfficeFileSchema = z.object({
  schema: z.literal(1),
  kind: OfficeKindSchema,
  /** Null for a personal project (ADR-0057). */
  client: z.object({ name: z.string(), contact: z.string() }).nullable(),
  /** The invoice rate per hour and its currency. */
  rate: z.number().nonnegative(),
  currency: z.string(),
  /** The project's token budget (Claude usage tab). */
  budgetTokens: z.number().int().positive(),
  /** Oldest first; the last one is the cycle being built. */
  cycles: z.array(CycleSchema).min(1),
  changes: z.array(ChangeRequestSchema),
  changelog: z.array(ChangeLogEntrySchema),
  costs: z.array(CostSchema),
  time: z.array(TimeEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OfficeFile = z.infer<typeof OfficeFileSchema>;

/** GET /api/projects/:id/office. Null until the project's office is started. */
export const OfficeResponseSchema = z.object({ office: OfficeFileSchema.nullable() });

const Name = z.string().trim().min(1).max(120);

/** POST /api/projects/:id/office: start the office for a project. */
export const OfficeCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('client'),
    client: z.object({ name: Name, contact: z.string().trim().max(120).default('') }),
  }),
  z.object({ kind: z.literal('personal') }),
]);
export type OfficeCreate = z.input<typeof OfficeCreateSchema>;

/** PATCH /api/projects/:id/office: settings that are not stage moves. */
export const OfficeSettingsSchema = z
  .object({
    client: z.object({ name: Name, contact: z.string().trim().max(120) }),
    rate: z.number().nonnegative().max(100000),
    currency: z.string().trim().min(1).max(8),
    budgetTokens: z.number().int().positive().max(1e10),
  })
  .partial();

/** POST .../stages/:stage/sign-off. For a personal project only `notes` is used. */
export const SignOffInputSchema = z.object({
  by: z.string().trim().max(120).default(''),
  date: IsoDate.optional(),
  notes: z.string().trim().max(4000).default(''),
  internal: z.boolean().default(false),
});
export type SignOffInput = z.input<typeof SignOffInputSchema>;

/** POST .../changes: a small change is logged; a big one becomes a change request. */
export const ChangeInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('small'),
    stage: OfficeStageSchema,
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal('big'),
    title: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(4000),
    stages: z.array(OfficeStageSchema).min(1),
  }),
]);
export type ChangeInput = z.input<typeof ChangeInputSchema>;

export const CostInputSchema = z.object({
  item: z.string().trim().min(1).max(120),
  vendor: z.string().trim().max(80).default(''),
  period: z.string().trim().max(40).default(''),
  amount: z.number().nonnegative().max(1e7),
  bill: z.boolean().default(false),
});
export type CostInput = z.input<typeof CostInputSchema>;

export const TimeInputSchema = z.object({
  stage: OfficeStageSchema.nullable().default(null),
  hours: z.number().positive().max(24),
  note: z.string().trim().max(200).default(''),
  date: IsoDate.optional(),
});
export type TimeInput = z.input<typeof TimeInputSchema>;

export const NewVersionSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+(\.\d+)?$/, 'Use a version like 2.0.'),
  title: z.string().trim().min(1).max(120),
});

/** The stage being worked on in a cycle: the first one that is open and not signed off. */
export function currentStage(cycle: Cycle): OfficeStage | null {
  for (const s of OFFICE_STAGES) {
    const st = cycle.stages[s].state;
    if (st === 'active' || st === 'waiting') return s;
  }
  return null;
}

/** One document of a stage (ADR-0053). `legacy`: a V3 flat file read where it is. */
export const StageDocSchema = z.object({
  path: z.string(),
  title: z.string(),
  legacy: z.boolean(),
});
export type StageDoc = z.infer<typeof StageDocSchema>;

/** GET /api/projects/:id/office/docs?stage=: the stage's client and technical documents. */
export const StageDocsSchema = z.object({
  client: z.array(StageDocSchema),
  technical: z.array(StageDocSchema),
});
export type StageDocs = z.infer<typeof StageDocsSchema>;

/** The office on a project card (Projects page, V4 o5). */
export const OfficeSummarySchema = z.object({
  kind: OfficeKindSchema,
  client: z.string().nullable(),
  version: z.string(),
  /** The stage being worked on, null when every stage is signed off. */
  stage: OfficeStageSchema.nullable(),
  /** Each stage's state, in order. */
  stages: z.array(StageStateSchema),
  live: z.boolean(),
});
export type OfficeSummary = z.infer<typeof OfficeSummarySchema>;

export function officeSummary(office: OfficeFile): OfficeSummary {
  const live = office.cycles.find((c) => c.liveAt) ?? null;
  const cycle = office.cycles[office.cycles.length - 1]!;
  return {
    kind: office.kind,
    client: office.client?.name ?? null,
    version: cycle.version,
    stage: currentStage(cycle),
    stages: OFFICE_STAGES.map((s) => cycle.stages[s].state),
    live: !!live,
  };
}

/** One commit in the Version control tab (o11). */
export const HistoryCommitSchema = z.object({
  hash: z.string(),
  subject: z.string(),
  author: z.string(),
  at: z.number(),
  /** Tags on this commit, e.g. v1.0.0. */
  tags: z.array(z.string()),
  files: z.array(z.string()),
});
export type HistoryCommit = z.infer<typeof HistoryCommitSchema>;

/** GET /api/projects/:id/git/history?stage=: newest first. */
export const HistorySchema = z.object({ commits: z.array(HistoryCommitSchema) });

const UsageRowSchema = z.object({
  tokens: z.number(),
  costUsd: z.number(),
  turns: z.number(),
  ms: z.number(),
});

/** GET /api/projects/:id/usage (o12): every chat turn added up; cost is the API value. */
export const ProjectUsageSchema = z.object({
  total: UsageRowSchema,
  stages: z.array(UsageRowSchema.extend({ stage: z.string() })),
  models: z.array(UsageRowSchema.extend({ model: z.string() })),
});
export type ProjectUsage = z.infer<typeof ProjectUsageSchema>;

/** One document in the Docs tab (o14). Code is never listed. */
export const VaultDocSchema = z.object({
  path: z.string(),
  title: z.string(),
  headings: z.array(z.object({ level: z.number(), text: z.string() })),
  /** Paths of the documents it links to (Markdown links and [[wiki links]]). */
  links: z.array(z.string()),
  words: z.number(),
  mtime: z.number(),
  /** The plain text, for search (cut at 20 000 characters). */
  text: z.string(),
});
export type VaultDoc = z.infer<typeof VaultDocSchema>;

/** GET /api/projects/:id/office/vault. */
export const VaultSchema = z.object({ docs: z.array(VaultDocSchema), truncated: z.boolean() });
