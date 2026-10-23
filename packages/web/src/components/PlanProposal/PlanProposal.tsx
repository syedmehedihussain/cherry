import { ArrowRight, Check, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { ChatItem } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import styles from './PlanProposal.module.css';

type Plan = Extract<ChatItem, { kind: 'plan' }>;

/**
 * The Planner's finished plan (ADR-0041): its tasks, the spec, and Approve plan, which opens
 * Development and starts the Builder in Auto. Keep planning closes the card.
 */
export function PlanProposal({
  plan,
  projectId,
  onApprove,
  onDismiss,
}: {
  plan: Plan;
  projectId: string;
  onApprove(): Promise<void>;
  onDismiss(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.card} aria-label={`Plan: ${plan.title}`} data-status={plan.status}>
      <div className={styles.head}>
        <ListChecks size={15} aria-hidden="true" />
        <span className={styles.kicker}>Plan ready</span>
        <h3 className={styles.title}>{plan.title}</h3>
      </div>
      {plan.summary && <p className={styles.summary}>{plan.summary}</p>}
      <ol className={styles.tasks}>
        {plan.tasks.map((t, i) => (
          <li key={i}>
            {plan.taskIds[i] && <span className={styles.id}>{plan.taskIds[i]}</span>}
            {t}
          </li>
        ))}
      </ol>
      {plan.spec && (
        <Link className={styles.spec} to={`/p/${encodeURIComponent(projectId)}/files/${plan.spec}`}>
          {plan.spec}
        </Link>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.foot}>
        {plan.status === 'open' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              disabled={busy}
              onClick={() => void act(onDismiss)}
            >
              Keep planning
            </button>
            <button
              type="button"
              className="btn btn-primary btn-md"
              disabled={busy}
              onClick={() => void act(onApprove)}
            >
              {busy ? 'Starting…' : 'Approve plan'}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </>
        ) : plan.status === 'approved' ? (
          <span className={styles.done}>
            <Check size={13} aria-hidden="true" /> Approved · {plan.tasks.length} tasks in
            Development
          </span>
        ) : (
          <span className={styles.muted}>Kept planning</span>
        )}
      </div>
    </section>
  );
}
