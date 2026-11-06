import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  OFFICE_AGENT,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  ProjectUsageSchema,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { api, ApiFailure } from '../../api/client.ts';
import { useChat } from '../../api/chat.ts';
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
  const now = useNow(60_000);
  const usage = useProjectUsage(projectId).data;
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
    <div className={styles.page}>
      <h2 className={styles.h}>Claude usage{stage ? `, ${OFFICE_STAGE_LABEL[stage]}` : ''}</h2>
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
              <th className={styles.num}>API value</th>
              <th className={styles.num}>Turns</th>
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
                  <td className={styles.num}>{r ? `$${r.costUsd.toFixed(2)}` : '-'}</td>
                  <td className={styles.num}>{r ? r.turns : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className={styles.num}>{fmtTokens(used)}</td>
              <td className={styles.num}>${(usage?.total.costUsd ?? 0).toFixed(2)}</td>
              <td className={styles.num}>{usage?.total.turns ?? 0}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      {usage && usage.models.length > 0 && (
        <section className={styles.sect} aria-label="By model">
          <h3>By model</h3>
          {usage.models.map((m) =>
            bar(
              m.model,
              used ? (m.tokens / used) * 100 : 0,
              `${fmtTokens(m.tokens)}, $${m.costUsd.toFixed(2)}`,
            ),
          )}
        </section>
      )}
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
