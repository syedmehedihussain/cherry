import type { ModelUse } from './claude/runner.ts';
import type { Db } from './db.ts';

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Counts a new session and the longest task per local day (Settings → Usage). */
export function recordUsage(db: Db, at: number, durationMs: number, newSession: boolean): void {
  db.prepare(
    `INSERT INTO usage_days (day, sessions, longest_ms) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET sessions = sessions + excluded.sessions, longest_ms = MAX(longest_ms, excluded.longest_ms)`,
  ).run(dayKey(at), newSession ? 1 : 0, Math.round(durationMs));
}

/**
 * One chat turn's tokens, cost and time, a row per model (V4 o12). The turn's time goes on the
 * first row, so a sum over rows is the time spent.
 */
export function recordTurn(
  db: Db,
  projectId: string,
  stage: string,
  durationMs: number,
  models: ModelUse[],
): void {
  if (!db.open) return;
  const insert = db.prepare(
    `INSERT INTO turn_usage (at, project_id, stage, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, duration_ms, first_row)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const at = Date.now();
  // The turn's time and count go on the main model: the one that read the most. A Haiku helper
  // call often comes first in modelUsage and took all the turns before (finding #18).
  const rows = models.length
    ? [...models].sort((a, b) => b.input + b.cacheRead - (a.input + a.cacheRead))
    : [{ model: 'unknown', input: 0, output: 0, cacheRead: 0, costUsd: 0 }];
  rows.forEach((m, i) =>
    insert.run(
      at,
      projectId,
      stage,
      m.model,
      m.input,
      m.output,
      m.cacheRead,
      m.costUsd,
      i === 0 ? Math.round(durationMs) : 0,
      i === 0 ? 1 : 0,
    ),
  );
}

export interface UsageRow {
  tokens: number;
  costUsd: number;
  turns: number;
  ms: number;
}

/** A project's chat turns added up, overall, by stage and by model (the Claude usage tab). */
export function projectUsage(db: Db, projectId: string) {
  const sum = `SUM(input_tokens + output_tokens) AS tokens, SUM(cost_usd) AS costUsd,
    SUM(first_row) AS turns, SUM(duration_ms) AS ms`;
  const clean = (r: Partial<UsageRow> | undefined): UsageRow => ({
    tokens: r?.tokens ?? 0,
    costUsd: Math.round((r?.costUsd ?? 0) * 100) / 100,
    turns: r?.turns ?? 0,
    ms: r?.ms ?? 0,
  });
  const total = db.prepare(`SELECT ${sum} FROM turn_usage WHERE project_id = ?`).get(projectId) as
    Partial<UsageRow> | undefined;
  const stages = db
    .prepare(`SELECT stage, ${sum} FROM turn_usage WHERE project_id = ? GROUP BY stage`)
    .all(projectId) as (Partial<UsageRow> & { stage: string })[];
  const models = db
    .prepare(
      `SELECT model, ${sum} FROM turn_usage WHERE project_id = ? AND model != 'unknown' GROUP BY model ORDER BY tokens DESC`,
    )
    .all(projectId) as (Partial<UsageRow> & { model: string })[];
  return {
    total: clean(total),
    stages: stages.map((r) => ({ stage: r.stage, ...clean(r) })),
    models: models.map((r) => ({ model: r.model, ...clean(r) })),
  };
}
