import { FolderOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api, ApiFailure } from '../../api/client.ts';
import { keys, queryClient, useConfig } from '../../api/queries.ts';
import { FolderPicker } from '../FolderPicker/FolderPicker.tsx';
import styles from './OpenFolder.module.css';

/** Opens a project folder from anywhere on disk, like VS Code's Open Folder (ADR-0032). */
export function openFolder(path: string): Promise<{ id: string }> {
  return api('POST', '/api/projects/open', { path }, z.object({ id: z.string() })).then((r) => {
    void queryClient.invalidateQueries({ queryKey: keys.projects });
    return r;
  });
}

/** Remove from Cherry: the project leaves the list; nothing on disk changes (ADR-0032). */
export function removeProject(id: string): Promise<unknown> {
  return api('POST', `/api/projects/${encodeURIComponent(id)}/remove`, undefined).then(() =>
    queryClient.invalidateQueries({ queryKey: keys.projects }),
  );
}

export function OpenFolderButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-lg" onClick={() => setOpen(true)}>
        <FolderOpen size={15} aria-hidden="true" />
        Open folder…
      </button>
      {open && <OpenFolderDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function OpenFolderDialog({ onClose }: { onClose(): void }) {
  const config = useConfig();
  const navigate = useNavigate();
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = dir ?? config.data?.home ?? '~';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await openFolder(value.trim());
      onClose();
      void navigate(`/p/${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not open that folder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Open folder"
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={styles.head}>
          <div>
            <h3>Open folder</h3>
            <p className={styles.hint}>
              Pick a project folder anywhere on this machine. It joins your projects in Cherry, and
              Claude can read and edit inside it. From a terminal:{' '}
              <span className="mono">cherry .</span>
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
        <FolderPicker
          value={value}
          onChange={setDir}
          label="Folder to open"
          missingNote="This folder does not exist."
          emptyNote="No folders inside."
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-md" disabled={busy || !value.trim()}>
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      </form>
    </div>
  );
}
