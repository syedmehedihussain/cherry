import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Stage } from '@cherry/shared';
import { frontMatter } from '../projects/status.ts';
import type { Db } from '../db.ts';
import { STAGES_DIR, stageProfile } from './profiles.ts';

/** A stage's specialist: an ECC agent the room's staff member hands work to (ADR-0061). */
export interface Specialist {
  name: string;
  description: string;
  /** The agent's own prompt (the file's body). */
  prompt: string;
  /** Tools it may use; undefined inherits the room's. */
  tools?: string[];
  /** As ECC sets it (opus, sonnet, haiku); the user chose ECC's models (2026-11-09). */
  model?: string;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const cache = new Map<Stage, Specialist[]>();

/**
 * `stages/<stage>/agents/*.md`: the specialists bundled for a stage. A docs-only stage's
 * specialists lose the edit tools; the stage guard and approvals apply to them as to the room.
 */
export function stageSpecialists(stage: Stage): Specialist[] {
  const hit = cache.get(stage);
  if (hit) return hit;
  const dir = path.join(STAGES_DIR, stage, 'agents');
  const docsOnly = stageProfile(stage).docsOnly;
  const list: Specialist[] = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .flatMap((f) => {
          const { fields, body } = frontMatter(readFileSync(path.join(dir, f), 'utf8'));
          const name = fields.name || f.replace(/\.md$/, '');
          if (!fields.description || !body.trim()) return [];
          const tools = fields.tools
            ?.split(',')
            .map((t) => t.trim())
            .filter((t) => t && !(docsOnly && EDIT_TOOLS.has(t)));
          return [
            {
              name,
              description: fields.description,
              prompt: body.trim(),
              ...(tools?.length ? { tools } : {}),
              ...(fields.model ? { model: fields.model } : {}),
            },
          ];
        })
    : [];
  cache.set(stage, list);
  return list;
}

/** Remembers a finished specialist run (ADR-0062); the tool use id keeps replays from counting twice. */
export function recordSpecialistRun(
  db: Db,
  run: { id: string; at: number; projectId: string; stage: Stage; agent: string },
): void {
  if (!db.open) return;
  db.prepare(
    'INSERT OR IGNORE INTO specialist_runs (id, at, project_id, stage, agent) VALUES (?, ?, ?, ?, ?)',
  ).run(run.id, run.at, run.projectId, run.stage, run.agent);
}

/** How often each specialist ran in a stage since `since` (the cycle's start). */
export function specialistRuns(
  db: Db,
  projectId: string,
  stage: Stage,
  since: number,
): Record<string, number> {
  if (!db.open) return {};
  const rows = db
    .prepare(
      'SELECT agent, COUNT(*) AS n FROM specialist_runs WHERE project_id = ? AND stage = ? AND at >= ? GROUP BY agent',
    )
    .all(projectId, stage, since) as { agent: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.agent, r.n]));
}

/** The stage's required checks, each with whether one of its specialists has run. */
export function requiredChecks(
  stage: Stage,
  runs: Record<string, number>,
): { any: string[]; done: boolean }[] {
  return stageProfile(stage).requires.map((any) => ({
    any,
    done: any.some((name) => (runs[name] ?? 0) > 0),
  }));
}

/** What stage_ready says when a required check has not run yet, or null. */
export function missingChecks(stage: Stage, runs: Record<string, number>): string | null {
  const missing = requiredChecks(stage, runs).filter((c) => !c.done);
  if (!missing.length) return null;
  return `Not ready yet: this stage needs ${missing
    .map((c) => c.any.join(' or '))
    .join(
      ', and ',
    )} to check the work first. Hand it to that specialist with the Agent tool (in the foreground), fix what it finds, then call stage_ready again.`;
}
