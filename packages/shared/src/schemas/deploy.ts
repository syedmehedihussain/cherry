import { z } from 'zod';

/** One row in the Deployment cockpit's checks (V3 r10). */
export const CheckSchema = z.object({
  id: z.enum(['typecheck', 'lint', 'test', 'build', 'audit']),
  label: z.string(),
  /** The command Cherry runs, e.g. "pnpm typecheck". */
  command: z.string(),
  status: z.enum(['idle', 'running', 'pass', 'fail']),
  /** One short fact: "7 passed", "214 KB", "0 high", "3 errors". */
  summary: z.string().nullable(),
  durationMs: z.number().nullable(),
  /** The last output, trimmed to the end (for the row's details and Fix in Development). */
  output: z.string(),
  finishedAt: z.number().nullable(),
});
export type Check = z.infer<typeof CheckSchema>;
export type CheckId = Check['id'];

export const ChecksSchema = z.object({
  checks: z.array(CheckSchema),
  /** Why there are no checks, when there are none. */
  none: z.string().nullable(),
});
export type Checks = z.infer<typeof ChecksSchema>;

/** Where the project deploys to and what was deployed last (V3 r10). */
export const DeployInfoSchema = z.object({
  target: z.object({
    kind: z.enum(['github-pages', 'vercel', 'netlify', 'npm', 'release']),
    label: z.string(),
    /** How Cherry knows: "workflow .github/workflows/pages.yml". */
    source: z.string(),
  }),
  repo: z.string().nullable(),
  version: z.string().nullable(),
  last: z.object({ tag: z.string(), at: z.number() }).nullable(),
  branch: z.string().nullable(),
  /** Uncommitted files; deploying with changes is allowed but said. */
  changes: z.number(),
});
export type DeployInfo = z.infer<typeof DeployInfoSchema>;

/** One step of the browser test, from the test plan (V3 r11). */
export const TestStepSchema = z.object({
  n: z.number(),
  name: z.string(),
  ok: z.boolean(),
  /** What Claude saw when it failed, or a short note. */
  detail: z.string(),
  /** The screenshot file under cherry/tests/<run>/, when Chrome took one. */
  shot: z.string().nullable(),
});
export type TestStep = z.infer<typeof TestStepSchema>;

/** The cockpit's browser test with Claude in Chrome (V3 r11). */
export const BrowserTestSchema = z.object({
  id: z.string().nullable(),
  status: z.enum(['idle', 'running', 'done', 'failed', 'stopped']),
  url: z.string().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  steps: z.array(TestStepSchema),
  summary: z.string().nullable(),
  /** The full log: what Claude did in Chrome, one line each. */
  log: z.array(z.string()),
  /** Why it cannot run (Chrome is off in Settings), when it cannot. */
  blocked: z.string().nullable(),
});
export type BrowserTest = z.infer<typeof BrowserTestSchema>;
