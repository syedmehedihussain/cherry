import { z } from 'zod';

/** Issues stage (ADR-0035): one file per issue in docs/issues/. */
export const IssueStatusSchema = z.enum(['open', 'planned', 'done']);
export const IssueTypeSchema = z.enum(['bug', 'improvement', 'idea']);
export const IssueSeveritySchema = z.enum(['blocks', 'annoying', 'cosmetic']);

export const IssueSchema = z.object({
  number: z.number(),
  /** Project-relative path, e.g. docs/issues/0007-chat-scroll-jumps.md. */
  file: z.string(),
  title: z.string(),
  status: IssueStatusSchema,
  type: IssueTypeSchema,
  severity: IssueSeveritySchema,
  cycle: z.string().nullable(),
  github: z.string().nullable(),
  body: z.string(),
  updatedAt: z.number(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const IssueInputSchema = z.object({
  title: z.string().trim().min(3, 'Give the issue a title.').max(140),
  type: IssueTypeSchema.default('bug'),
  severity: IssueSeveritySchema.default('annoying'),
  body: z.string().max(20_000).default(''),
});
export type IssueInput = z.input<typeof IssueInputSchema>;

export const IssuePatchSchema = z.object({ status: IssueStatusSchema });

export const GithubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  labels: z.array(z.string()),
  /** The local issue file that links to it, if any. */
  local: z.string().nullable(),
});
export type GithubIssue = z.infer<typeof GithubIssueSchema>;

export const IssueListSchema = z.object({
  issues: z.array(IssueSchema),
  /** Null when the project has no GitHub remote. */
  github: z.object({ issues: z.array(GithubIssueSchema), error: z.string().nullable() }).nullable(),
});
export type IssueList = z.infer<typeof IssueListSchema>;
