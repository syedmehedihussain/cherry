import {
  ArrowRight,
  ArrowUp,
  CircleCheck,
  CircleDot,
  History,
  ListChecks,
  Plane,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  STAGE_LABEL,
  WORKSPACE_STAGES,
  type AutopilotEvent,
  type AutopilotStage,
  type AutopilotState,
  type WorkspaceStage,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
  askAutopilot,
  dismissAutopilot,
  reviewDecision,
  startAutopilot,
  stopAutopilot,
} from '../../api/autopilot.ts';
import { MagnetAvatar } from '../MagnetAvatar/MagnetAvatar.tsx';
import styles from './Autopilot.module.css';

const nnnn = (n: number) => String(n).padStart(4, '0');
const minutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const flying = (s: AutopilotState | undefined) =>
  s?.status === 'flying' || s?.status === 'stopping';

/** Which task Magnet is on: "3 of 8". */
export function taskCount(s: AutopilotState): string | null {
  const total = s.total ?? null;
  const done = s.tasks.filter((t) => t.status === 'done').length;
  const doing = s.tasks.some((t) => t.status === 'doing') ? 1 : 0;
  return total ? `${Math.min(total, done + doing || 1)} of ${total}` : null;
}

function Dots() {
  return (
    <span className={styles.dots} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * The Autopilot button in the top bar (ADR-0046): quiet when off, a filled pill while Magnet
 * waits or flies. A click on the pill stops him after the current step.
 */
export function AutopilotButton({
  projectId,
  stage,
  state,
}: {
  projectId: string;
  stage: AutopilotStage;
  state: AutopilotState | undefined;
}) {
  const [error, setError] = useState<string | null>(null);
  const act = (p: Promise<unknown>) =>
    void p.catch((e: unknown) =>
      setError(e instanceof ApiFailure ? e.message : 'Autopilot failed.'),
    );
  if (flying(state))
    return (
      <button
        type="button"
        className={styles.pill}
        aria-pressed="true"
        title="Magnet is flying this stage. Click (or Esc) to stop him after the current step."
        onClick={() => act(stopAutopilot(projectId, stage))}
      >
        <span className={styles.mg} data-working>
          <MagnetAvatar size={24} display={18} />
        </span>
        {state!.status === 'stopping' ? 'Landing' : 'Flying'}
        {taskCount(state!) && <span className={styles.n}>{taskCount(state!)}</span>}
        <Dots />
      </button>
    );
  if (state?.status === 'asking')
    return (
      <button
        type="button"
        className={styles.pill}
        aria-pressed="true"
        title="Magnet waits for the job. Click to cancel."
        onClick={() => act(dismissAutopilot(projectId, stage))}
      >
        <span className={styles.mg} data-working>
          <MagnetAvatar size={24} display={18} />
        </span>
        Autopilot<span className={styles.n}>waiting</span>
      </button>
    );
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed="false"
      title={error ?? 'Autopilot: Magnet takes over this stage'}
      onClick={() => {
        setError(null);
        act(askAutopilot(projectId, stage));
      }}
    >
      <Plane size={14} aria-hidden="true" />
      Autopilot
    </button>
  );
}

/** "What should I do, sir?" (artboard 08): nothing runs until the user answers. */
export function MagnetAsk({
  projectId,
  state,
  agent,
}: {
  projectId: string;
  state: AutopilotState;
  agent: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.ask} role="group" aria-label="Magnet asks">
      <span className={styles.mg} data-working>
        <MagnetAvatar size={48} display={44} />
      </span>
      <div>
        <div className={styles.q}>What should I do, sir?</div>
        <div className={styles.d}>
          Tell me once. I give the {agent} its orders, decide what the documents do not say, and
          report when I finish. I wait until you answer.
        </div>
        <div className={styles.chips}>
          {state.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void startAutopilot(projectId, state.stage, s)
                  .catch((e: unknown) =>
                    setError(e instanceof ApiFailure ? e.message : 'Could not start.'),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Magnet's order or answer, in place of the user's ">" line (artboard 09). */
export function MagnetOrder({
  text,
  role,
  source,
  agent,
}: {
  text: string;
  role?: 'order' | 'answer';
  source?: string;
  agent: string;
}) {
  return (
    <div className={styles.order}>
      <span className={styles.mg}>
        <MagnetAvatar size={16} display={16} />
      </span>
      <div>
        <span className={styles.who}>
          MAGNET → {agent.toUpperCase()}
          {role === 'answer' && source ? ` · from ${source}` : ''}
        </span>
        <span className={styles.orderText}>{text}</span>
      </div>
    </div>
  );
}

/** Magnet's own lines between the agent's turns: status, decisions, tasks, needs you. */
export function MagnetEvent({ event }: { event: AutopilotEvent }) {
  if (event.kind === 'status')
    return (
      <div className={styles.order}>
        <span className={styles.mg}>
          <MagnetAvatar size={16} display={16} />
        </span>
        <div>
          <span className={styles.who}>MAGNET</span>
          <span className={styles.orderText}>{event.text}</span>
        </div>
      </div>
    );
  if (event.kind === 'decision')
    return (
      <div className={styles.decision}>
        <span className={styles.tag}>Magnet decided</span>
        <span>
          {event.text}
          {event.adr && (
            <span className={styles.adr}> ADR-{nnnn(event.adr)}, for your review.</span>
          )}
        </span>
      </div>
    );
  if (event.kind === 'task')
    return (
      <div className={styles.task} data-ok={event.ok || undefined}>
        {event.ok ? (
          <CircleCheck size={14} aria-hidden="true" />
        ) : (
          <CircleDot size={14} aria-hidden="true" />
        )}
        <span>{event.text}</span>
        <span className={styles.taskMeta}>{event.ok ? 'tests pass' : 'failed'}</span>
      </div>
    );
  return (
    <div className={styles.decision} data-needs>
      <span className={styles.tag} data-warn>
        Needs you
      </span>
      <span>{event.text}</span>
    </div>
  );
}

/** While Magnet thinks: "Magnet is checking the result •••". */
export function MagnetBusy({ state, now }: { state: AutopilotState; now: number }) {
  return (
    <div className={styles.busy} role="status">
      <span className={styles.mg} data-working>
        <MagnetAvatar size={16} display={16} />
      </span>
      <span>
        {state.status === 'stopping' ? 'Magnet is landing' : 'Magnet is checking the result'}
      </span>
      <Dots />
      <span className={styles.grow} />
      <span className={styles.meta}>
        {state.startedAt ? minutes(now - state.startedAt) : ''} · esc to stop
      </span>
    </div>
  );
}

/** The report when Magnet lands (artboard 10), in ASD-STE100. */
export function AutopilotReport({
  projectId,
  state,
  onChange,
  onOpenStage,
  onNeedsYou,
}: {
  projectId: string;
  state: AutopilotState;
  /** "Change": a draft to the agent about this ADR. */
  onChange(adr: number, title: string): void;
  onOpenStage(stage: WorkspaceStage): void;
  onNeedsYou(item: string): void;
}) {
  const r = state.report;
  if (!r) return null;
  const nextStage = WORKSPACE_STAGES.find((s) =>
    new RegExp(`\\b${STAGE_LABEL[s]}\\b`).test(r.next),
  );
  return (
    <section className={styles.report} aria-label="Autopilot report">
      <header className={styles.reportHead}>
        <span className={styles.mg}>
          <MagnetAvatar size={24} display={24} />
        </span>
        <div>
          <div className={styles.headline}>{r.headline}</div>
          <div className={styles.meta}>
            {STAGE_LABEL[state.stage]} · {state.goal} · {minutes(r.durationMs)} · {r.orders} order
            {r.orders === 1 ? '' : 's'}
            {r.answers ? ` · ${r.answers} answer${r.answers === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Put the report away"
          onClick={() => void dismissAutopilot(projectId, state.stage)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.part}>
        <span className={styles.label}>Result</span>
        {r.result.map((line) => {
          const warn = /fail|need|stop|cannot|error/i.test(line);
          return (
            <div key={line} className={styles.line} data-warn={warn || undefined}>
              {warn ? (
                <TriangleAlert size={14} aria-hidden="true" />
              ) : (
                <CircleCheck size={14} aria-hidden="true" />
              )}
              {line}
            </div>
          );
        })}
      </div>
      {state.decisions.length > 0 && (
        <div className={styles.part}>
          <span className={styles.label}>Decisions Magnet made · {state.decisions.length}</span>
          {state.decisions.map((d) => (
            <div key={d.adr} className={styles.dec}>
              <span className={styles.adrN}>ADR-{nnnn(d.adr)}</span>
              <span className={styles.decText}>
                {d.title}. Reason: {d.reason}
              </span>
              {d.review === 'open' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void reviewDecision(projectId, state.stage, d.adr, 'kept')}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      void reviewDecision(projectId, state.stage, d.adr, 'changed').then(() =>
                        onChange(d.adr, d.title),
                      )
                    }
                  >
                    Change
                  </button>
                </>
              ) : (
                <span className={styles.reviewed}>{d.review === 'kept' ? 'Kept' : 'Changing'}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {state.needsYou.length > 0 && (
        <div className={styles.part}>
          <span className={styles.label}>Needs you · {state.needsYou.length}</span>
          {state.needsYou.map((n) => (
            <div key={n} className={styles.dec}>
              <ArrowUp size={14} aria-hidden="true" />
              <span className={styles.decText}>{n}. Magnet does not do this.</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onNeedsYou(n)}
              >
                {/^Push/.test(n) ? 'Push' : 'Open'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={styles.part}>
        <span className={styles.label}>Next</span>
        <div className={styles.dec}>
          <ArrowRight size={14} aria-hidden="true" />
          <span className={styles.decText}>{r.next}</span>
          {nextStage && nextStage !== state.stage && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenStage(nextStage)}
            >
              Open {STAGE_LABEL[nextStage]}
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <footer className={styles.reportFoot}>
        <span>
          <ListChecks size={13} aria-hidden="true" /> {state.tasks.length} task
          {state.tasks.length === 1 ? '' : 's'}
        </span>
        <span>
          <History size={13} aria-hidden="true" /> The full log is the chat above
        </span>
        <span className={styles.grow} />
        <span>ASD-STE100</span>
      </footer>
    </section>
  );
}
