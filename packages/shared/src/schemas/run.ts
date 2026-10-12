import { z } from 'zod';

/**
 * The project's own app, run on this machine from the Run button (ADR-0024). Cherry finds the
 * command from the project's files; the output is kept in memory only.
 */
export const RunStateSchema = z.object({
  /** The command Cherry would run, or null when it cannot tell how to run this project. */
  command: z.string().nullable(),
  /** Where the command came from, e.g. "package.json script dev". */
  source: z.string().nullable(),
  running: z.boolean(),
  /** The first local address the app printed (http://localhost:5173/). */
  url: z.string().nullable(),
  startedAt: z.number().nullable(),
  /** Exit code of the last run once it stopped; null while running or never run. */
  exitCode: z.number().nullable(),
  /** Recent output, ANSI colours removed, capped. */
  output: z.string(),
});
export type RunState = z.infer<typeof RunStateSchema>;
