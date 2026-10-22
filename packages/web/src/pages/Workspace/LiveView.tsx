import { Check, ChevronRight } from 'lucide-react';
import { relativeTime, type ChatItem, type PlanItem } from '@cherry/shared';
import { useAgents } from '../../api/agents.ts';
import { useChat } from '../../api/chat.ts';
import { useStage } from '../../state/stage.ts';
import styles from './LiveView.module.css';

const VERB: Record<string, string> = { read: 'Reading', edit: 'Editing', run: 'Running' };

/** What Claude is doing now: the last tool that is still running in the chat. */
function nowDoing(items: ChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === 'turn-end' || it.kind === 'user') return null;
    if (it.kind === 'tool' && (it.status === 'running' || it.status === 'waiting')) {
      if (it.status === 'waiting') return `Waiting for your approval: ${it.target}`;
      return `${VERB[it.verb] ?? 'Using'} ${it.verb === 'other' ? it.tool : it.target}`;
    }
  }
  return null;
}

function Step({ step }: { step: PlanItem }) {
  return (
    <li className={styles.step} data-status={step.status}>
      <span className={styles.mark} aria-hidden="true">
        {step.status === 'completed' ? (
          <Check size={11} strokeWidth={3} />
        ) : step.status === 'in_progress' ? (
          <span className={styles.spin} />
        ) : null}
      </span>
      <span className={styles.stepText}>
        <span className={styles.stepTitle}>{step.title}</span>
        {step.status === 'in_progress' && step.activeForm && (
          <span className={styles.active}>{step.activeForm}…</span>
        )}
      </span>
      <span className="sr-only">
        {step.status === 'completed'
          ? 'done'
          : step.status === 'in_progress'
            ? 'in progress'
            : 'to do'}
      </span>
    </li>
  );
}

/** The Live view: Claude's plan as it works through it, what it is doing now, running agents. */
export function LiveView({
  projectId,
  now,
  onOpenAgents,
}: {
  projectId: string;
  now: number;
  onOpenAgents(): void;
}) {
  const stage = useStage(projectId);
  const chat = useChat(projectId, stage);
  const agents = useAgents(projectId);
  const state = chat.data;
  const plan = state?.plan ?? [];
  const running = !!state?.running;
  const done = plan.filter((s) => s.status === 'completed').length;
  const doing = running ? nowDoing(state?.items ?? []) : null;
  const busyAgents = (agents.data?.agents ?? []).filter(
    (a) => a.status === 'running' || a.status === 'waiting' || a.status === 'queued',
  );

  return (
    <div className={styles.live}>
      <section className={styles.card} aria-label="Claude">
        <div className={styles.head}>
          <span className={styles.state} data-running={running || undefined}>
            <span className={styles.dot} aria-hidden="true" />
            {running ? 'Claude is working' : 'Claude is idle'}
          </span>
          {state?.startedAt && (
            <span className={styles.muted}>chat started {relativeTime(state.startedAt, now)}</span>
          )}
        </div>
        {doing && <p className={styles.doing}>{doing}</p>}
      </section>

      <section className={styles.card} aria-label="Plan">
        <div className={styles.head}>
          <span className={styles.label}>Plan</span>
          {plan.length > 0 && (
            <span className={styles.muted}>
              {done} of {plan.length} done
            </span>
          )}
        </div>
        {plan.length === 0 ? (
          <p className={styles.empty}>
            When Claude works on something with more than one step, it writes the steps here and
            ticks them off one by one.
          </p>
        ) : (
          <>
            <div
              className={styles.track}
              role="progressbar"
              aria-label="Plan progress"
              aria-valuemin={0}
              aria-valuemax={plan.length}
              aria-valuenow={done}
            >
              <div className={styles.fill} style={{ width: `${(done / plan.length) * 100}%` }} />
            </div>
            <ol className={styles.steps}>
              {plan.map((s) => (
                <Step key={s.id} step={s} />
              ))}
            </ol>
          </>
        )}
      </section>

      {busyAgents.length > 0 && (
        <section className={styles.card} aria-label="Running agents">
          <div className={styles.head}>
            <span className={styles.label}>Agents</span>
            <button type="button" className={styles.link} onClick={onOpenAgents}>
              Open <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>
          <ul className={styles.agents}>
            {busyAgents.map((a) => (
              <li key={a.id}>
                <span className={styles.spin} aria-hidden="true" />
                <span className={styles.agentTask} title={a.task}>
                  {a.task}
                </span>
                <span className={styles.muted}>
                  {a.status === 'waiting' ? 'needs you' : a.status === 'queued' ? 'queued' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
