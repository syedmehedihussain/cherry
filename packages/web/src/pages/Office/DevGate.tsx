import { Check, Clock, Lock, Play, X } from 'lucide-react';
import { useState } from 'react';
import { localDay, type OfficeFile } from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { ApiFailure } from '../../api/client.ts';
import { setDevGate } from '../../api/office.ts';
import dialog from '../../components/SetUpOffice/SetUpOffice.module.css';
import styles from './StageRoom.module.css';

/**
 * Development's inside gate (ADR-0052, o10): the client approves the prototype before the full
 * build starts. A personal project approves it yourself.
 */
export function DevGate({ projectId, office }: { projectId: string; office: OfficeFile }) {
  const cycle = office.cycles[office.cycles.length - 1]!;
  const gate = cycle.devGate;
  // The Development Team's own signals tick the steps (#41, #48): the prototype it says is
  // ready, and the stage it marks ready after the full build.
  const prototypeDone = gate !== 'build' || cycle.prototypeReady;
  const buildDone = gate === 'approved' && cycle.stages.development.ready;
  const [approving, setApproving] = useState(false);
  const personal = office.kind === 'personal';
  const setDraft = useChatDraft((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const move = (g: 'build' | 'sent' | 'approved') =>
    setDevGate(projectId, g)
      .then(() => setError(null))
      .catch((e: unknown) =>
        setError(e instanceof ApiFailure ? e.message : 'Could not change the gate.'),
      );
  const step = (
    state: 'done' | 'now' | 'wait' | 'later',
    title: string,
    detail: string,
    actions?: React.ReactNode,
  ) => (
    <li className={styles.gstep} data-state={state}>
      <span className={styles.gdot}>
        {state === 'done' ? (
          <Check size={13} aria-hidden="true" />
        ) : state === 'wait' ? (
          <Clock size={13} aria-hidden="true" />
        ) : state === 'now' ? (
          <Play size={12} aria-hidden="true" />
        ) : (
          <Lock size={12} aria-hidden="true" />
        )}
      </span>
      <div>
        <div className={styles.gtitle}>{title}</div>
        <div className={styles.gdetail}>{detail}</div>
        {actions && <div className={styles.gactions}>{actions}</div>}
      </div>
    </li>
  );
  return (
    <div className={styles.extra}>
      <p className={styles.note}>
        {personal
          ? 'Try the prototype before the full build starts.'
          : 'The client approves the prototype before the full build starts.'}
      </p>
      <ol className={styles.gate} aria-label="Prototype gate">
        {step(
          prototypeDone ? 'done' : 'now',
          'First prototype',
          gate === 'build' && cycle.prototypeReady
            ? 'The Development Team says the prototype is ready to try.'
            : 'Project setup and a clickable prototype with sample data.',
          !prototypeDone ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setDraft(
                  projectId,
                  'Set up the project and build the first prototype from the design handoff.',
                )
              }
            >
              Ask for the prototype
            </button>
          ) : undefined,
        )}
        {step(
          gate === 'approved' ? 'done' : gate === 'sent' ? 'wait' : prototypeDone ? 'now' : 'later',
          personal ? 'You approve the prototype' : 'Client approves the prototype',
          gate === 'approved'
            ? 'Approved.'
            : gate === 'sent'
              ? 'Sent to the client. Waiting for the answer.'
              : personal
                ? 'Try it, then approve it.'
                : 'Send it to the client with a link to try it.',
          gate === 'build' ? (
            personal ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void move('approved')}
              >
                Approve prototype
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void move('sent')}
              >
                Sent to client
              </button>
            )
          ) : gate === 'sent' ? (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setApproving(true)}
              >
                Record approval
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void move('build')}
              >
                Client wants changes
              </button>
            </>
          ) : undefined,
        )}
        {step(
          buildDone ? 'done' : gate === 'approved' ? 'now' : 'later',
          'Full build and backend',
          buildDone
            ? 'The Development Team says the app is complete. Sign off Development.'
            : gate === 'approved'
              ? 'Build the rest of the roadmap. The Development Team says when the app is complete.'
              : 'Opens after the prototype is approved.',
          gate === 'approved' && !buildDone ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDraft(projectId, 'Build the next milestone of the roadmap.')}
            >
              Give the next job
            </button>
          ) : undefined,
        )}
      </ol>
      {error && <p className={styles.error}>{error}</p>}
      {approving && (
        <PrototypeApproval
          by={office.client?.contact || office.client?.name || ''}
          onClose={() => setApproving(false)}
          onApprove={async (approval) => {
            await setDevGate(projectId, 'approved', approval);
            setApproving(false);
          }}
        />
      )}
    </div>
  );
}

/** The client's approval of the prototype, like a stage sign-off: who, when, notes (#42). */
function PrototypeApproval({
  by: initialBy,
  onClose,
  onApprove,
}: {
  by: string;
  onClose(): void;
  onApprove(approval: { by: string; date: string; notes: string }): Promise<void>;
}) {
  const [by, setBy] = useState(initialBy);
  const [date, setDate] = useState(() => localDay());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={dialog.overlay} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Record the prototype approval"
        className={dialog.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          onApprove({ by: by.trim(), date, notes }).catch((err: unknown) => {
            setError(err instanceof ApiFailure ? err.message : 'Could not save the approval.');
            setBusy(false);
          });
        }}
      >
        <div className={dialog.head}>
          <div>
            <h3>Record the prototype approval</h3>
            <p className={dialog.hint}>The full build starts after this. It is logged.</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className={dialog.fields}>
          <div className={dialog.two}>
            <label className={dialog.field}>
              <span>Approved by</span>
              <input value={by} onChange={(e) => setBy(e.target.value)} autoFocus />
            </label>
            <label className={dialog.field}>
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label className={dialog.field}>
            <span>Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What the client said"
            />
          </label>
        </div>
        {error && <p className={dialog.error}>{error}</p>}
        <div className={dialog.foot}>
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-md" disabled={busy || !by.trim()}>
            {busy ? 'Saving…' : 'Record approval'}
          </button>
        </div>
      </form>
    </div>
  );
}
