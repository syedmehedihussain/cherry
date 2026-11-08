import {
  OFFICE_AGENT,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  localDay,
  stageWallTimes,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { Transcript } from '../claude/transcript.ts';
import type { Db } from '../db.ts';
import { projectUsage } from '../usage.ts';

export interface ReportRow {
  stage: OfficeStage;
  agent: string;
  prompts: number;
  turns: number;
  cards: number;
  approvals: number;
  tokens: number;
  cacheRead: number;
  costUsd: number;
  claudeMs: number;
  wallMs: number | null;
  signedOff: string;
}

/**
 * A run of the office in numbers (V4 section 4), to compare with plain Claude Code: per stage
 * the prompts sent, turns, decision cards and approvals answered, tokens, API value, Claude
 * time, wall time and the sign-off. Built from turn_usage, the chat transcripts and
 * office.json, with no model call.
 */
export function reportRows(db: Db, projectId: string, office: OfficeFile, now = Date.now()) {
  const usage = projectUsage(db, projectId);
  const walls = stageWallTimes(office, now);
  const cycle = office.cycles[office.cycles.length - 1]!;
  const sessions = db
    .prepare(`SELECT stage, transcript FROM sessions WHERE project_id = ? AND kind = 'chat'`)
    .all(projectId) as { stage: string; transcript: string | null }[];
  const count = new Map<string, { prompts: number; cards: number; approvals: number }>();
  for (const s of sessions) {
    if (!s.transcript) continue;
    const c = count.get(s.stage) ?? { prompts: 0, cards: 0, approvals: 0 };
    for (const i of new Transcript(s.transcript).load()) {
      if (i.kind === 'user') c.prompts++;
      else if (i.kind === 'decision' && i.status === 'confirmed') c.cards++;
      else if (i.kind === 'approval' && i.approval.status !== 'pending') c.approvals++;
    }
    count.set(s.stage, c);
  }
  const rows: ReportRow[] = OFFICE_STAGES.map((stage) => {
    const u = usage.stages.find((r) => r.stage === stage);
    const c = count.get(stage);
    const so = cycle.stages[stage].signOffs.at(-1);
    return {
      stage,
      agent: OFFICE_AGENT[stage],
      prompts: c?.prompts ?? 0,
      turns: u?.turns ?? 0,
      cards: c?.cards ?? 0,
      approvals: c?.approvals ?? 0,
      tokens: u?.tokens ?? 0,
      cacheRead: u?.cacheRead ?? 0,
      costUsd: u?.costUsd ?? 0,
      claudeMs: u?.ms ?? 0,
      wallMs: walls[stage] ?? null,
      signedOff: so ? `${so.date} (${so.internal ? 'internal' : so.by})` : '',
    };
  });
  return { rows, models: usage.models, version: cycle.version };
}

const min = (ms: number) => Math.round(ms / 60_000);
const sum = (
  rows: ReportRow[],
  k: 'prompts' | 'turns' | 'cards' | 'approvals' | 'tokens' | 'cacheRead',
) => rows.reduce((a, r) => a + r[k], 0);

export function reportCsv(rows: ReportRow[]): string {
  const head =
    'stage,agent,prompts,turns,cards_answered,approvals_answered,tokens,cache_read_tokens,api_value_usd,claude_min,calendar_min,signed_off';
  const cell = (v: string | number) =>
    /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return (
    [
      head,
      ...rows.map((r) =>
        [
          r.stage,
          r.agent,
          r.prompts,
          r.turns,
          r.cards,
          r.approvals,
          r.tokens,
          r.cacheRead,
          r.costUsd.toFixed(2),
          min(r.claudeMs),
          r.wallMs === null ? '' : min(r.wallMs),
          r.signedOff,
        ]
          .map(cell)
          .join(','),
      ),
    ].join('\n') + '\n'
  );
}

export function reportMarkdown(
  name: string,
  report: ReturnType<typeof reportRows>,
  now = new Date(),
): string {
  const { rows, models, version } = report;
  const cost = rows.reduce((a, r) => a + r.costUsd, 0);
  const claude = rows.reduce((a, r) => a + r.claudeMs, 0);
  const wall = rows.reduce((a, r) => a + (r.wallMs ?? 0), 0);
  return [
    `# Run report: ${name}`,
    '',
    `Version ${version}, made by Cherry on ${localDay(now)} from the chat turns and office.json.`,
    'The API value is what the same tokens would cost on the API. Calendar time runs from the sign-off before a stage to its own, nights and idle time included.',
    '',
    '| Stage | Agent | Prompts | Turns | Cards answered | Approvals | Tokens | Cache reads | API value | Claude time | Calendar time | Signed off |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows.map(
      (r) =>
        `| ${OFFICE_STAGE_LABEL[r.stage]} | ${r.agent} | ${r.prompts} | ${r.turns} | ${r.cards} | ${r.approvals} | ${r.tokens} | ${r.cacheRead} | $${r.costUsd.toFixed(2)} | ${min(r.claudeMs)} min | ${r.wallMs === null ? '-' : `${min(r.wallMs)} min`} | ${r.signedOff || '-'} |`,
    ),
    `| **Total** | | ${sum(rows, 'prompts')} | ${sum(rows, 'turns')} | ${sum(rows, 'cards')} | ${sum(rows, 'approvals')} | ${sum(rows, 'tokens')} | ${sum(rows, 'cacheRead')} | $${cost.toFixed(2)} | ${min(claude)} min | ${min(wall)} min | |`,
    '',
    ...(models.length
      ? [
          '## By model',
          '',
          '| Model | Turns | Tokens | API value |',
          '| --- | ---: | ---: | ---: |',
          ...models.map(
            (m) => `| ${m.model} | ${m.turns} | ${m.tokens} | $${m.costUsd.toFixed(2)} |`,
          ),
          '',
        ]
      : []),
  ].join('\n');
}
