import { Check, ChevronDown, ChevronRight, Scale, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Adr, AdrApplyMode } from '@cherry/shared';
import { useAgents } from '../../api/agents.ts';
import { ApiFailure } from '../../api/client.ts';
import {
  applyDecision,
  approveDecision,
  markDecisionDone,
  rejectDecision,
  useDecisions,
  useLiveDecisions,
} from '../../api/decisions.ts';
import { Markdown } from '../Markdown/Markdown.tsx';
import styles from './Decisions.module.css';

const nnnn = (n: number) => String(n).padStart(4, '0');

const APPROVE: { id: AdrApplyMode; label: string; detail: string }[] = [
  { id: 'none', label: 'Approve only', detail: 'Accept it; make the change later' },
  { id: 'chat', label: 'Approve & apply in chat', detail: 'Claude makes the change in the chat' },
  {
    id: 'agent',
    label: 'Approve & start agent',
    detail: 'A background agent makes it in a worktree',
  },
];

/** Pending count for the side panel's pill; keeps the list current while any view is open. */
export function usePendingDecisions(projectId: string): number {
  useLiveDecisions(projectId);
  const list = useDecisions(projectId);
  return list.data?.decisions.filter((d) => d.state === 'pending').length ?? 0;
}

/** The Decisions view (ADR-0026): big project choices wait here for the user. */
export function Decisions({ projectId }: { projectId: string }) {
  const list = useDecisions(projectId);
  const [history, setHistory] = useState(false);
  const all = list.data?.decisions ?? [];
  const pending = all.filter((d) => d.state === 'pending');
  const approved = all.filter((d) => d.state === 'approved');
  const closed = all.filter((d) => d.state === 'done' || d.state === 'rejected');

  if (list.isPending) return <span className="shimmer" style={{ height: 120 }} />;
  if (list.isError)
    return <p className={styles.empty}>Could not read the decisions: {list.error.message}</p>;

  return (
    <div className={styles.wrap}>
      <section aria-label="Pending decisions">
        <h3 className={styles.heading}>
          Pending <span className={styles.count}>{pending.length}</span>
        </h3>
        {pending.length === 0 ? (
          <p className={styles.empty}>
            <Scale size={14} aria-hidden="true" />
            Nothing waiting. When Claude wants a big change (stack, database, a rename), it proposes
            it here instead of doing it.
          </p>
        ) : (
          pending.map((d) => <DecisionItem key={d.number} projectId={projectId} adr={d} />)
        )}
      </section>
      {approved.length > 0 && (
        <section aria-label="Approved decisions">
          <h3 className={styles.heading}>
            Approved, not done <span className={styles.count}>{approved.length}</span>
          </h3>
          {approved.map((d) => (
            <DecisionItem key={d.number} projectId={projectId} adr={d} />
          ))}
        </section>
      )}
      {closed.length > 0 && (
        <section aria-label="Decision history">
          <button
            type="button"
            className={styles.historyToggle}
            aria-expanded={history}
            onClick={() => setHistory(!history)}
          >
            {history ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            History <span className={styles.count}>{closed.length}</span>
          </button>
          {history && (
            <ul className={styles.history}>
              {closed.map((d) => (
                <li key={d.number} data-state={d.state}>
                  <span className={`mono ${styles.num}`}>{nnnn(d.number)}</span>
                  <Link to={docLink(projectId, d)} className={styles.historyTitle} title={d.title}>
                    {d.title}
                  </Link>
                  <span className={styles.state} data-state={d.state}>
                    {d.state === 'rejected'
                      ? 'Rejected'
                      : /^superseded/i.test(d.status)
                        ? 'Superseded'
                        : 'Done'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

const docLink = (projectId: string, d: Adr) => `/p/${encodeURIComponent(projectId)}/docs/${d.file}`;

function DecisionItem({ projectId, adr }: { projectId: string; adr: Adr }) {
  const [menu, setMenu] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const agents = useAgents(projectId);
  const agent =
    adr.applying?.kind === 'agent'
      ? agents.data?.agents.find((a) => a.id === adr.applying!.ref)
      : undefined;

  const run = async (fn: () => Promise<{ warning: string | null }>) => {
    setBusy(true);
    setNote(null);
    setMenu(false);
    try {
      const r = await fn();
      if (r.warning) setNote(r.warning);
    } catch (e) {
      setNote(e instanceof ApiFailure ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const applying =
    adr.applying?.kind === 'chat'
      ? 'Sent to the chat'
      : adr.applying?.kind === 'agent'
        ? agent
          ? `Agent ${agent.status === 'done' ? 'finished; accept its work to finish' : agent.status}`
          : 'Agent finished or removed'
        : 'Not applied yet';

  return (
    <article className={styles.card} aria-label={adr.title} data-state={adr.state}>
      <div className={styles.head}>
        <span className={`mono ${styles.num}`}>ADR-{nnnn(adr.number)}</span>
        {adr.proposedBy && <span className={styles.by}>{adr.proposedBy}</span>}
        {adr.date && <span className={styles.by}>{adr.date}</span>}
      </div>
      <Link to={docLink(projectId, adr)} className={styles.title}>
        {adr.title}
      </Link>
      {adr.context && <p className={styles.context}>{adr.context}</p>}
      {adr.decision && (
        <div className={styles.proposal}>
          <Markdown source={adr.decision} variant="chat" />
        </div>
      )}
      {adr.options.length > 1 && (
        <details className={styles.options}>
          <summary>{adr.options.length} options considered</summary>
          <Markdown
            source={adr.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}
            variant="chat"
          />
        </details>
      )}

      {adr.state === 'approved' && (
        <p className={styles.applying} data-kind={adr.applying?.kind ?? 'none'}>
          {applying}
        </p>
      )}
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}

      {rejecting ? (
        <form
          className={styles.reject}
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => rejectDecision(projectId, adr.number, { reason }));
          }}
        >
          <label className="sr-only" htmlFor={`reason-${adr.number}`}>
            Why not? (optional)
          </label>
          <input
            id={`reason-${adr.number}`}
            className={styles.input}
            placeholder="Why not? (optional)"
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={styles.actions}>
            <button type="submit" className="btn btn-danger btn-sm" disabled={busy}>
              Reject
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          {adr.state === 'pending' ? (
            <div className={styles.menuWrap}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                aria-haspopup="menu"
                aria-expanded={menu}
                disabled={busy}
                onClick={() => setMenu(!menu)}
              >
                <Check size={13} aria-hidden="true" />
                Approve
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {menu && (
                <div className={styles.menu} role="menu" aria-label="Approve">
                  {APPROVE.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        void run(() => approveDecision(projectId, adr.number, { apply: a.id }))
                      }
                    >
                      <span className={styles.menuLabel}>{a.label}</span>
                      <span className={styles.menuDetail}>{a.detail}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void run(() => markDecisionDone(projectId, adr.number))}
              >
                <Check size={13} aria-hidden="true" />
                Mark done
              </button>
              {!adr.applying && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() => applyDecision(projectId, adr.number, { apply: 'chat' }))
                    }
                  >
                    Apply in chat
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() => applyDecision(projectId, adr.number, { apply: 'agent' }))
                    }
                  >
                    Start agent
                  </button>
                </>
              )}
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            <X size={13} aria-hidden="true" />
            Reject
          </button>
        </div>
      )}
    </article>
  );
}
