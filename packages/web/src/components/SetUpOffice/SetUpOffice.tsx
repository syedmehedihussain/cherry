import { X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiFailure } from '../../api/client.ts';
import { createOffice } from '../../api/office.ts';
import { OfficeKindFields, type KindValue } from './OfficeKindFields.tsx';
import styles from './SetUpOffice.module.css';

/** Starts the office for a project that has none (V4): Idea opens with the Business Analyst. */
export function SetUpOffice({
  projectId,
  name,
  onClose,
}: {
  projectId: string;
  name: string;
  onClose(): void;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState<KindValue>({ kind: 'client', client: '', contact: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = value.kind === 'personal' || value.client.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await createOffice(
        projectId,
        value.kind === 'personal'
          ? { kind: 'personal' }
          : {
              kind: 'client',
              client: { name: value.client.trim(), contact: value.contact.trim() },
            },
      );
      onClose();
      void navigate(`/p/${encodeURIComponent(projectId)}`);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not set up the office.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Set up the office for ${name}`}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) void submit();
        }}
      >
        <div className={styles.head}>
          <div>
            <h3>Set up the office for {name}</h3>
            <p className={styles.hint}>
              The project starts in Idea, with the Business Analyst. Nothing runs until you write to
              it. Your files stay as they are.
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
        <OfficeKindFields value={value} onChange={setValue} />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.foot}>
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-md" disabled={busy || !ok}>
            {busy ? 'Setting up…' : 'Set up office'}
          </button>
        </div>
      </form>
    </div>
  );
}
