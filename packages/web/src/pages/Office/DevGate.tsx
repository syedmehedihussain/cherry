import { Check, Clock, Lock, Play } from 'lucide-react';
import { useState } from 'react';
import type { OfficeFile } from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { ApiFailure } from '../../api/client.ts';
import { setDevGate } from '../../api/office.ts';
import styles from './StageRoom.module.css';

/**
 * Development's inside gate (ADR-0052, o10): the client approves the prototype before the full
 * build starts. A personal project approves it yourself.
 */
export function DevGate({ projectId, office }: { projectId: string; office: OfficeFile }) {
  const gate = office.cycles[office.cycles.length - 1]!.devGate;
  const personal = office.kind === 'personal';
  const setDraft = useChatDraft((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const move = (g: 'build' | 'sent' | 'approved') =>
    setDevGate(projectId, g).catch((e: unknown) =>
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
          gate === 'build' ? 'now' : 'done',
          'First prototype',
          'Project setup and a clickable prototype with sample data.',
          gate === 'build' ? (
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
          gate === 'approved' ? 'done' : gate === 'sent' ? 'wait' : 'later',
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
                onClick={() => void move('approved')}
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
          gate === 'approved' ? 'now' : 'later',
          'Full build and backend',
          gate === 'approved'
            ? 'Build the rest of the roadmap. The Development Team says when the app is complete.'
            : 'Opens after the prototype is approved.',
          gate === 'approved' ? (
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
    </div>
  );
}
