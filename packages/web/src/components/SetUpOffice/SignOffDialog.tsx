import { X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  localDay,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { sendStage, signOffStage, useStageDocs } from '../../api/office.ts';
import styles from './SetUpOffice.module.css';

/**
 * Sign off a stage (V4 o8): the client's approval (who, date, notes), or internal only; or mark it
 * sent and waiting for the client. A personal project signs off with an optional note (ADR-0057).
 */
export function SignOffDialog({
  projectId,
  stage,
  office,
  onClose,
  onSigned,
}: {
  projectId: string;
  stage: OfficeStage;
  office: OfficeFile;
  onClose(): void;
  /** Runs after the sign-off is saved, in place of going back to the office. */
  onSigned?(): void;
}) {
  const navigate = useNavigate();
  const cycle = office.cycles[office.cycles.length - 1]!;
  const rec = cycle.stages[stage];
  const personal = office.kind === 'personal';
  const docs = useStageDocs(projectId, stage).data?.client ?? [];
  const [by, setBy] = useState(office.client?.contact || office.client?.name || '');
  const [date, setDate] = useState(() => localDay());
  const [notes, setNotes] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = OFFICE_STAGES[OFFICE_STAGES.indexOf(stage) + 1];
  const again = rec.state === 'update';
  const lead = again
    ? 'The needs-update flag clears.'
    : next
      ? `${OFFICE_STAGE_LABEL[next]} opens next.`
      : 'The project goes Live.';

  const run = async (fn: () => Promise<unknown>, back: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
      if (back) void navigate(`/p/${encodeURIComponent(projectId)}`);
      return true;
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the sign-off.');
      setBusy(false);
      return false;
    }
  };
  const signOff = () =>
    run(
      () => signOffStage(projectId, stage, personal ? { notes } : { by, date, notes, internal }),
      !onSigned,
    ).then((ok) => ok && onSigned?.());

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Sign off ${OFFICE_STAGE_LABEL[stage]}`}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void signOff();
        }}
      >
        <div className={styles.head}>
          <div>
            <h3>
              Sign off {OFFICE_STAGE_LABEL[stage]}
              {again ? ' again' : ''}
            </h3>
            <p className={styles.hint}>
              {personal
                ? `A personal project: you approve it yourself. ${lead}`
                : `Record the client's approval. ${lead}`}
            </p>
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
        <div className={styles.fields}>
          {!personal && docs.length > 0 && (
            <div className={styles.field}>
              <span>Client documents shown</span>
              <ul className={styles.docList}>
                {docs.map((d) => (
                  <li key={d.path}>
                    {d.title} <span className="mono">{d.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!personal && (
            <div className={styles.two} aria-disabled={internal || undefined}>
              <label className={styles.field}>
                <span>Approved by</span>
                <input value={by} disabled={internal} onChange={(e) => setBy(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
          )}
          <label className={styles.field}>
            <span>{personal ? 'Note (optional)' : 'Notes'}</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={personal ? 'What you decided' : 'What the client said'}
            />
          </label>
          {!personal && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
              />
              <span>
                Internal only
                <small>No client approval for this stage. It is still logged.</small>
              </span>
            </label>
          )}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.foot}>
          {!personal && rec.state === 'active' && (
            <button
              type="button"
              className="btn btn-secondary btn-md"
              style={{ marginRight: 'auto' }}
              disabled={busy}
              onClick={() => void run(() => sendStage(projectId, stage), false)}
            >
              Sent, waiting for client
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-md"
            disabled={busy || (!personal && !internal && !by.trim())}
          >
            {busy ? 'Signing off…' : 'Sign off'}
          </button>
        </div>
      </form>
    </div>
  );
}
