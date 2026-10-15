import { z } from 'zod';

/**
 * Where a project decision stands (ADR-0026). The ADR file is the record:
 * pending = Proposed, approved = Accepted with "Done: not yet", done = Accepted (or Superseded),
 * rejected = Rejected.
 */
export const AdrStateSchema = z.enum(['pending', 'approved', 'done', 'rejected']);
export type AdrState = z.infer<typeof AdrStateSchema>;

/** A chat turn or an agent that Cherry started to make an approved change. */
export const AdrApplyingSchema = z.object({
  kind: z.enum(['chat', 'agent']),
  /** The chat turn id or the agent id. */
  ref: z.string(),
  at: z.number(),
});
export type AdrApplying = z.infer<typeof AdrApplyingSchema>;

export const AdrSchema = z.object({
  number: z.number().int(),
  /** Path from the project folder, e.g. "docs/adr/0026-decisions-tab.md". */
  file: z.string(),
  title: z.string(),
  /** The Status line as written, e.g. "Superseded by 0014". */
  status: z.string(),
  state: AdrStateSchema,
  date: z.string().nullable(),
  /** The date the change was made, when done. */
  doneAt: z.string().nullable(),
  rejectedBecause: z.string().nullable(),
  /** "Claude (chat)" or "Claude (agent)" for proposals from Cherry; null otherwise. */
  proposedBy: z.string().nullable(),
  /** First paragraph of Context. */
  context: z.string(),
  /** The Decision section (what is proposed or was chosen). */
  decision: z.string(),
  /** Options as written, one per line. */
  options: z.array(z.string()),
  applying: AdrApplyingSchema.nullable(),
});
export type Adr = z.infer<typeof AdrSchema>;

export const AdrListSchema = z.object({
  /** ADR folder from the project folder (docs/adr unless project.json says otherwise). */
  dir: z.string(),
  decisions: z.array(AdrSchema),
});
export type AdrList = z.infer<typeof AdrListSchema>;

/** What Claude sends with propose_decision. */
export const AdrProposalSchema = z.object({
  title: z.string().trim().min(3).max(120),
  context: z.string().trim().min(1).max(3000),
  options: z
    .array(z.object({ title: z.string().trim().min(1).max(200), tradeoff: z.string().max(500) }))
    .max(5)
    .default([]),
  proposal: z.string().trim().min(1).max(3000),
  consequences: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
});
export type AdrProposal = z.infer<typeof AdrProposalSchema>;

/** Approve: record only, or also make the change in the chat or with a background agent. */
export const AdrApplyModeSchema = z.enum(['none', 'chat', 'agent']);
export type AdrApplyMode = z.infer<typeof AdrApplyModeSchema>;
export const AdrApproveSchema = z.object({ apply: AdrApplyModeSchema.default('none') });
export const AdrApplySchema = z.object({ apply: z.enum(['chat', 'agent']) });
export const AdrRejectSchema = z.object({ reason: z.string().trim().max(1000).default('') });
