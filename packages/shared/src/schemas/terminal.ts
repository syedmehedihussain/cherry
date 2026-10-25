import { z } from 'zod';

/** A shell in the project folder, shown as a Development tab (V3 r6, ADR-0049). */
export const TerminalInfoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  /** False once the shell has exited; the tab stays until closed. */
  alive: z.boolean(),
  exitCode: z.number().nullable(),
  createdAt: z.number(),
});
export type TerminalInfo = z.infer<typeof TerminalInfoSchema>;

export const NewTerminalSchema = z.object({
  cols: z.number().int().min(2).max(1000).default(80),
  rows: z.number().int().min(2).max(500).default(24),
});

/** Browser → daemon on the terminal socket. */
export const TerminalClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('in'), d: z.string().max(65_536) }),
  z.object({
    t: z.literal('resize'),
    cols: z.number().int().min(2).max(1000),
    rows: z.number().int().min(2).max(500),
  }),
]);
export type TerminalClientMessage = z.infer<typeof TerminalClientMessageSchema>;

/** Daemon → browser: output (and the kept scrollback first), then exit. */
export type TerminalServerMessage = { t: 'out'; d: string } | { t: 'exit'; code: number | null };
