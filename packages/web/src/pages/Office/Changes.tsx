import { X } from 'lucide-react';
import { useState } from 'react';
import {
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { ApiFailure } from '../../api/client.ts';
import { addChange, decideChange } from '../../api/office.ts';
import styles from '../../components/SetUpOffice/SetUpOffice.module.css';
import own from './Changes.module.css';

/**
 * Request a change to a signed-off stage (V4 o18). Small: one line in the change log. Big: a
 * change request with the stages it touches; approving it flags them as needing an update.
 */
export function ChangeDialog({
  projectId,
  stage,
  office,
  onClose,
}: {
  projectId: string;
  stage: OfficeStage;
  office: OfficeFile;
  onClose(): void;
}) {
  const cycle = office.cycles[office.cycles.length - 1]!;
  const setDraft = useChatDraft((s) => s.set);
  const [kind, setKind] = useState<'small' | 'big'>('small');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const from = OFFICE_STAGES.indexOf(stage);
  const [stages, setStages] = useState<OfficeStage[]>(
    OFFICE_STAGES.filter(
      (s, i) => i >= from && ['signed', 'update'].includes(cycle.stages[s].state),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = text.trim() && (kind === 'small' || (title.trim() && stages.length));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await addChange(
        projectId,
        kind === 'small'
          ? { kind: 'small', stage, text: text.trim() }
          : { kind: 'big', title: title.trim(), text: text.trim(), stages },
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save the change.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Request a change"
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) void submit();
        }}
      >
        <div className={styles.head}>
          <div>
            <h3>Request a change</h3>
            <p className={styles.hint}>
              {OFFICE_STAGE_LABEL[stage]} is signed off, so changes go through change control.
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
          <div className={styles.seg} role="radiogroup" aria-label="Size of the change">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'small'}
              onClick={() => setKind('small')}
            >
              Small change
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'big'}
              onClick={() => setKind('big')}
            >
              Big change
            </button>
          </div>
          <p className={styles.hint}>
            {kind === 'small'
              ? 'Wording, a label, a small field: one line in the change log. Ask the agent to make it.'
              : 'A new feature, data model or architecture: a change request. Once approved, the stages it touches need an update.'}
          </p>
          {kind === 'big' && (
            <label className={styles.field}>
              <span>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Family memberships"
              />
            </label>
          )}
          <label className={styles.field}>
            <span>What should change?</span>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {kind === 'big' && (
            <fieldset className={own.stages}>
              <legend>Stages it touches</legend>
              {OFFICE_STAGES.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={stages.includes(s)}
                    onChange={(e) =>
                      setStages(e.target.checked ? [...stages, s] : stages.filter((x) => x !== s))
                    }
                  />
                  {OFFICE_STAGE_LABEL[s]}
                </label>
              ))}
            </fieldset>
          )}
          {kind === 'big' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setDraft(
                  projectId,
                  `Write an impact note for this change: ${text.trim() || '(describe it)'}. Which documents, screens and code does it touch, and is it small or big?`,
                );
                onClose();
              }}
            >
              Ask the agent for an impact note first
            </button>
          )}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.foot}>
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-md" disabled={busy || !ok}>
            {kind === 'small' ? 'Log the change' : 'Make change request'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The change requests to decide, and the change log (project page, Changes). */
export function ChangesDialog({
  projectId,
  office,
  onClose,
}: {
  projectId: string;
  office: OfficeFile;
  onClose(): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const decide = (id: string, approve: boolean) =>
    decideChange(projectId, id, approve).catch((e: unknown) =>
      setError(e instanceof ApiFailure ? e.message : 'Could not decide.'),
    );
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Changes"
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h3>Changes</h3>
            <p className={styles.hint}>Change requests and the change log.</p>
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
        <h4 className={own.h}>Change requests</h4>
        {office.changes.length ? (
          <ul className={own.list}>
            {office.changes.map((c) => (
              <li key={c.id} aria-label={`${c.id} ${c.title}`}>
                <div className={own.cr}>
                  <b>
                    {c.id} {c.title}
                  </b>
                  <span className={own.status} data-status={c.status}>
                    {c.status}
                  </span>
                </div>
                <p>{c.text}</p>
                <p className={own.dim}>
                  Touches {c.stages.map((s) => OFFICE_STAGE_LABEL[s]).join(', ')}
                </p>
                {c.status === 'proposed' && (
                  <div className={own.actions}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void decide(c.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void decide(c.id, false)}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={own.dim}>None yet.</p>
        )}
        <h4 className={own.h}>Change log</h4>
        {office.changelog.length ? (
          <ul className={own.list}>
            {office.changelog.map((c) => (
              <li key={c.at}>
                <span className={own.dim}>{new Date(c.at).toLocaleDateString('en-GB')}</span>{' '}
                <b>{OFFICE_STAGE_LABEL[c.stage]}</b> {c.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className={own.dim}>No small changes yet.</p>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
