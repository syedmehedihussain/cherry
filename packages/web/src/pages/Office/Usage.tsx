import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  stageWallTimes as wallTimes,
  OFFICE_AGENT,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  ProjectUsageSchema,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { api, ApiFailure } from '../../api/client.ts';
import { useChat, useLiveChat } from '../../api/chat.ts';
import { officeSettings } from '../../api/office.ts';
import { usePlanUsage } from '../../api/queries.ts';
import { resetText } from '../../components/PlanUsage/PlanUsage.tsx';
import { useNow } from '../../lib/useNow.ts';
import styles from './Usage.module.css';

export const fmtTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`;
export const fmtHours = (ms: number) => `${(ms / 3_600_000).toFixed(1)}h`;

/** "Opus 5.5" for claude-opus-5-5, "Haiku 4.5" for claude-haiku-4-5-20251001 (finding #16). */
export function shortModel(id: string): string {
  const name = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2})(?!\d))?/.exec(id) ?? null;
  if (m) return `${name(m[1]!)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
  const old = /^claude-(\d+)(?:-(\d))?-(opus|sonnet|haiku)/.exec(id);
  if (old) return `${name(old[3]!)} ${old[1]}${old[2] ? `.${old[2]}` : ''}`;
  return id;
}

/** "45 min", "2.3 h", "3 d": a stage's time. */
export function fmtSpan(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `${Math.max(0, Math.round(min))} min`;
  const h = min / 60;
  return h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} d`;
}

/** The turn running now in each stage's chat, with when it started (finding #17). */
function useRunning(projectId: string): Partial<Record<OfficeStage, number>> {
  const out: Partial<Record<OfficeStage, number>> = {};
  for (const s of OFFICE_STAGES) {
    // A fixed list: the hooks run in the same order every time.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const chat = useChat(projectId, s).data;
    const since = chat?.startedAt ?? chat?.items.findLast((i) => i.kind === 'user')?.at;
    if (chat?.running && since) out[s] = since;
  }
  return out;
}

export const useProjectUsage = (projectId: string) =>
  useQuery({
    queryKey: ['usage', projectId],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/usage`,
        undefined,
        ProjectUsageSchema,
      ),
  });

/**
 * The Claude usage tab (V4 o12): the plan's limits, the project's token budget, and the chat
 * turns by stage and model. The cost is what the API would charge; the plan covers it. In a
 * stage room the stage's row is marked and its numbers come first.
 */
export function Usage({
  projectId,
  office,
  stage,
}: {
  projectId: string;
  office: OfficeFile;
  stage?: OfficeStage;
}) {
  useLiveChat(projectId);
  const running = useRunning(projectId);
  const busy = Object.keys(running).length > 0;
  const now = useNow(busy ? 5_000 : 60_000);
  const usageQuery = useProjectUsage(projectId);
  const usage = usageQuery.data;
  // A turn ends: its tokens arrive with the next read.
  const { refetch } = usageQuery;
  const busyKey = Object.keys(running).sort().join();
  useEffect(() => {
    void refetch();
  }, [busyKey, refetch]);
  const walls = wallTimes(office, now);
  const plan = usePlanUsage().data;
  const chat = useChat(projectId, stage ?? 'idea').data;
  const end = stage ? chat?.items.findLast((i) => i.kind === 'turn-end') : undefined;
  const ctx = end?.kind === 'turn-end' ? end.context : undefined;
  const used = usage?.total.tokens ?? 0;
  const budget = office.budgetTokens;
  const row = (s: OfficeStage) => usage?.stages.find((r) => r.stage === s);
  const mine = stage ? row(stage) : undefined;
  const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const bar = (label: string, value: number, right: string, warn = false) => (
    <div className={styles.bar}>
      <span>{label}</span>
      <span className={styles.track}>
        <i style={{ width: `${pct(value)}%` }} data-warn={warn || undefined} />
      </span>
      <span className={styles.value}>{right}</span>
    </div>
  );
  return (
    <div className={styles.scroll}>
      <div className={styles.page}>
        <div className={styles.headRow}>
          <h2 className={styles.h}>Claude usage{stage ? `, ${OFFICE_STAGE_LABEL[stage]}` : ''}</h2>
          {/* The run in numbers, to compare with plain Claude Code (V4 section 4). */}
          <span className={styles.exports}>
            Run report
            {(['md', 'csv'] as const).map((f) => (
              <a
                key={f}
                className="btn btn-ghost btn-sm"
                href={`/api/projects/${encodeURIComponent(projectId)}/report?format=${f}`}
                download
              >
                <Download size={13} aria-hidden="true" />
                {f === 'md' ? 'Markdown' : 'CSV'}
              </a>
            ))}
          </span>
        </div>
        <p className={styles.sub}>
          The cost is what the same tokens would cost on the API; your plan covers it. It keeps a
          budget per project. Nothing runs unless you give a job.
        </p>
        <section className={styles.sect} aria-label="Limits">
          <h3>Limits now</h3>
          {plan?.available &&
            plan.fiveHour &&
            bar(
              '5-hour window',
              plan.fiveHour.usedPercent,
              `${pct(plan.fiveHour.usedPercent)}%${plan.fiveHour.resetsAt !== null ? `, ${resetText(plan.fiveHour.resetsAt, now)}` : ''}`,
              plan.fiveHour.usedPercent > 80,
            )}
          {plan?.available &&
            plan.week &&
            bar(
              'This week',
              plan.week.usedPercent,
              `${pct(plan.week.usedPercent)}%`,
              plan.week.usedPercent > 80,
            )}
          {ctx &&
            ctx.window > 0 &&
            bar(
              'Context, this chat',
              (ctx.used / ctx.window) * 100,
              `${fmtTokens(ctx.used)} of ${fmtTokens(ctx.window)}`,
              ctx.used / ctx.window > 0.75,
            )}
          {bar(
            'Project budget',
            (used / budget) * 100,
            `${fmtTokens(used)} of ${fmtTokens(budget)}`,
            used / budget > 0.8,
          )}
          <Budget projectId={projectId} budget={budget} />
        </section>
        {stage && (
          <section className={styles.sect} aria-label={OFFICE_AGENT[stage]}>
            <h3>{OFFICE_AGENT[stage]}</h3>
            <div className={styles.stats}>
              <Stat v={fmtTokens(mine?.tokens ?? 0)} l="tokens" />
              <Stat v={`$${(mine?.costUsd ?? 0).toFixed(2)}`} l="API value" />
              <Stat v={`${mine?.turns ?? 0}`} l="turns" />
              <Stat v={fmtHours(mine?.ms ?? 0)} l="Claude working" />
            </div>
          </section>
        )}
        <section className={styles.sect} aria-label="By stage">
          <h3>By stage</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Agent</th>
                <th className={styles.num}>Tokens</th>
                <th
                  className={styles.num}
                  title="Input read again from the prompt cache: a long session re-reads its context on every reply"
                >
                  Cache reads
                </th>
                <th className={styles.num}>API value</th>
                <th className={styles.num}>Turns</th>
                <th className={styles.num} title="Claude working on this stage's turns">
                  Claude time
                </th>
                <th
                  className={styles.num}
                  title="From the sign-off before it to its own sign-off, nights and idle time included"
                >
                  Calendar time
                </th>
              </tr>
            </thead>
            <tbody>
              {OFFICE_STAGES.map((s) => {
                const r = row(s);
                return (
                  <tr key={s} data-current={s === stage || undefined}>
                    <td>{OFFICE_STAGE_LABEL[s]}</td>
                    <td className={styles.dim}>{OFFICE_AGENT[s]}</td>
                    <td className={styles.num}>{r ? fmtTokens(r.tokens) : '-'}</td>
                    <td className={styles.num}>{r ? fmtTokens(r.cacheRead) : '-'}</td>
                    <td className={styles.num}>{r ? `$${r.costUsd.toFixed(2)}` : '-'}</td>
                    <td className={styles.num}>
                      {r ? r.turns : running[s] ? 0 : '-'}
                      {running[s] !== undefined && <span className={styles.live}> +1 running</span>}
                    </td>
                    <td className={styles.num}>
                      {r || running[s] !== undefined
                        ? fmtSpan((r?.ms ?? 0) + (running[s] !== undefined ? now - running[s] : 0))
                        : '-'}
                    </td>
                    <td className={styles.num}>
                      {walls[s] !== undefined ? fmtSpan(walls[s]) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className={styles.num}>{fmtTokens(used)}</td>
                <td className={styles.num}>{fmtTokens(usage?.total.cacheRead ?? 0)}</td>
                <td className={styles.num}>${(usage?.total.costUsd ?? 0).toFixed(2)}</td>
                <td className={styles.num}>{usage?.total.turns ?? 0}</td>
                <td className={styles.num}>{fmtSpan(usage?.total.ms ?? 0)}</td>
                <td className={styles.num}>
                  {fmtSpan(Object.values(walls).reduce((a, b) => a + b, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
        {usage && usage.models.length > 0 && (
          <section className={styles.sect} aria-label="By model">
            <h3>By model</h3>
            {usage.models.map((m) =>
              bar(
                shortModel(m.model),
                used ? (m.tokens / used) * 100 : 0,
                `${fmtTokens(m.tokens)} + ${fmtTokens(m.cacheRead)} cached, $${m.costUsd.toFixed(2)}`,
              ),
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.v}>{v}</div>
      <div className={styles.l}>{l}</div>
    </div>
  );
}

/** Change the project's token budget, in millions. */
function Budget({ projectId, budget }: { projectId: string; budget: number }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const m = Number(edit);
    if (!Number.isFinite(m) || m <= 0) {
      setError('Give the budget in millions of tokens, for example 6.');
      return;
    }
    try {
      await officeSettings(projectId, { budgetTokens: Math.round(m * 1_000_000) });
      setEdit(null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the budget.');
    }
  };
  return (
    <div className={styles.budget}>
      {edit === null ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setEdit(String(budget / 1_000_000))}
        >
          Change budget
        </button>
      ) : (
        <>
          <label>
            Budget, millions of tokens{' '}
            <input value={edit} onChange={(e) => setEdit(e.target.value)} inputMode="decimal" />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()}>
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>
            Cancel
          </button>
        </>
      )}
      <span className={styles.dim}>Alert at 80%.</span>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
