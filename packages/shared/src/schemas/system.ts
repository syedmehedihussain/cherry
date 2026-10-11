import { z } from 'zod';
import { APP_NAME } from './common.ts';

export const HealthSchema = z.object({
  ok: z.literal(true),
  name: z.literal(APP_NAME),
  version: z.string(),
  claude: z.object({
    found: z.boolean(),
    loggedIn: z.boolean(),
    version: z.string().nullable(),
  }),
  git: z.object({ found: z.boolean(), version: z.string().nullable() }),
  gh: z.object({ found: z.boolean(), loggedIn: z.boolean() }),
});
export type Health = z.infer<typeof HealthSchema>;

/** `~/.cherry/config.json` (docs/data-model.md §5). */
export const ConfigSchema = z.object({
  schema: z.literal(1).default(1),
  projectsDir: z.string().default('~/Projects'),
  port: z.number().int().default(4317),
  scan: z.object({ ignore: z.array(z.string()).default([]) }).default({ ignore: [] }),
  claude: z
    .object({ bin: z.string().default('claude'), defaultModel: z.string().default('sonnet') })
    .default({ bin: 'claude', defaultModel: 'sonnet' }),
  agents: z
    .object({
      maxRunning: z.number().int().min(1).max(10).default(3),
      worktreeDir: z.string().default('~/Projects/.cherry-worktrees'),
    })
    .default({ maxRunning: 3, worktreeDir: '~/Projects/.cherry-worktrees' }),
  magnet: z.object({ readOnly: z.boolean().default(true) }).default({ readOnly: true }),
  /** False only on a fresh install, until the welcome screen is finished. */
  onboarded: z.boolean().default(true),
});
export type Config = z.infer<typeof ConfigSchema>;

export const ConfigPatchSchema = z.object({
  projectsDir: z.string().min(1).optional(),
  scan: z.object({ ignore: z.array(z.string()) }).optional(),
  claude: z.object({ defaultModel: z.string() }).partial().optional(),
  agents: z
    .object({ maxRunning: z.number().int().min(1).max(10) })
    .partial()
    .optional(),
  magnet: z.object({ readOnly: z.boolean() }).partial().optional(),
});
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

/** One level of folders for the welcome screen's folder picker. Names only, no hidden folders. */
export const FolderListSchema = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  exists: z.boolean(),
  dirs: z.array(z.string()),
});
export type FolderList = z.infer<typeof FolderListSchema>;

/** Finishes the welcome screen: the projects folder is created if missing. */
export const SetupBodySchema = z.object({ projectsDir: z.string().min(1).max(1000) });

export const LoginBodySchema = z.object({ code: z.string().min(1).max(200) });

const PlanWindowSchema = z.object({
  /** Share of the window used, 0-100. */
  usedPercent: z.number(),
  /** When the window resets (epoch ms), if known. */
  resetsAt: z.number().nullable(),
});
export type PlanWindow = z.infer<typeof PlanWindowSchema>;

/** GET /api/claude/usage: the claude.ai plan limits, as on Claude Code's `/usage`. */
export const PlanUsageSchema = z.object({
  /** False for API keys, other providers, or when Claude could not be asked. */
  available: z.boolean(),
  plan: z.string().nullable(),
  fiveHour: PlanWindowSchema.nullable(),
  week: PlanWindowSchema.nullable(),
  fetchedAt: z.number(),
});
export type PlanUsage = z.infer<typeof PlanUsageSchema>;
