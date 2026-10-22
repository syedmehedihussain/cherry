import { Check, GitCommitHorizontal, Minus, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { CommitFile } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { queryClient } from '../../api/queries.ts';
import {
  commitStaged,
  setAutoCommit,
  stageFiles,
  unstageFiles,
  useSourceControl,
  wk,
  writeCommitMessage,
} from '../../api/workspace.ts';
import { Switch } from '../Switch/Switch.tsx';
import styles from './SourceControl.module.css';

/**
 * The GitHub view's commits (ADR-0030). Auto commit on: Claude commits after each finished
 * piece of work. Either way, a VS Code style list: stage, unstage, a message, Commit as you.
 */
export function SourceControl({ projectId }: { projectId: string }) {
  const sc = useSourceControl(projectId);
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; message: string } | null>(null);
  const data = sc.data;

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };
  const open = (f: string) =>
    void navigate(
      `/p/${encodeURIComponent(projectId)}/files/${f.split('/').map(encodeURIComponent).join('/')}`,
    );
  const commit = () =>
    run('commit', async () => {
      const r = await commitStaged(projectId, message.trim());
      setDone(r);
      setMessage('');
      await queryClient.invalidateQueries({ queryKey: wk.all(projectId) });
    });

  return (
    <section className={styles.box} aria-label="Source control">
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.label}>Commits</span>
          {data?.author && (
            <span className={styles.author} title={data.author.email}>
              as {data.author.name}
            </span>
          )}
        </div>
        {data && (
          <span title="Claude commits after each finished piece of work in the chat, as you. Push still asks.">
            <Switch
              label="Auto commit"
              checked={data.autoCommit}
              disabled={!!busy}
              onChange={(on) =>
                void run('auto', async () => {
                  await setAutoCommit(projectId, on);
                  await queryClient.invalidateQueries({ queryKey: wk.sourceControl(projectId) });
                })
              }
            />
          </span>
        )}
      </div>

      {sc.isPending && <span className="shimmer" style={{ height: 60 }} />}
      {sc.isError && (
        <p className={styles.error}>
          {sc.error instanceof ApiFailure ? sc.error.message : 'Could not read the changes.'}
        </p>
      )}

      {data && (
        <>
          {data.autoCommit && (
            <p className={styles.note}>
              Auto commit is on: Claude commits its work in small steps. You can still commit your
              own changes below.
            </p>
          )}
          {!data.author && (
            <p className={styles.warn}>
              Git does not know your name yet. Run{' '}
              <span className="mono">git config --global user.name "Your Name"</span> and{' '}
              <span className="mono">user.email</span>.
            </p>
          )}
          {done && (
            <p className={styles.done} role="status">
              <Check size={13} aria-hidden="true" /> Committed{' '}
              <span className="mono">{done.hash}</span> {done.message}
            </p>
          )}

          {data.staged.length + data.changes.length === 0 ? (
            <p className={styles.empty}>Nothing to commit. Your working tree is clean.</p>
          ) : (
            <>
              <div className={styles.compose}>
                <label className="sr-only" htmlFor={`msg-${projectId}`}>
                  Commit message
                </label>
                <textarea
                  id={`msg-${projectId}`}
                  className={styles.msg}
                  rows={message.includes('\n') ? 4 : 2}
                  placeholder="Commit message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && message.trim()) {
                      e.preventDefault();
                      void commit();
                    }
                  }}
                />
                <div className={styles.composeRow}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!!busy || !data.staged.length}
                    title="Haiku writes a message for the staged changes"
                    onClick={() =>
                      void run('message', async () =>
                        setMessage((await writeCommitMessage(projectId)).message),
                      )
                    }
                  >
                    <Sparkles size={12} aria-hidden="true" />
                    {busy === 'message' ? 'Writing…' : 'Write message'}
                  </button>
                  <span className={styles.spacer} />
                  <button
                    type="button"
                    className={`btn btn-primary btn-sm ${styles.commitBtn}`}
                    disabled={!!busy || !data.author || !data.staged.length || !message.trim()}
                    title={
                      data.author
                        ? `Commit as ${data.author.name} <${data.author.email}>`
                        : undefined
                    }
                    onClick={() => void commit()}
                  >
                    <GitCommitHorizontal size={13} aria-hidden="true" style={{ flex: 'none' }} />
                    <span className={styles.commitLabel}>
                      {busy === 'commit'
                        ? 'Committing…'
                        : `Commit as ${data.author?.name ?? 'you'}`}
                    </span>
                  </button>
                </div>
              </div>
              {error && <p className={styles.error}>{error}</p>}

              <FileList
                title="Staged"
                files={data.staged}
                action="Unstage"
                busy={!!busy}
                onOpen={open}
                onOne={(f) => void run('unstage', () => unstageFiles(projectId, { files: [f] }))}
                onAll={() => void run('unstage', () => unstageFiles(projectId, { all: true }))}
              />
              <FileList
                title="Changes"
                files={data.changes}
                action="Stage"
                busy={!!busy}
                onOpen={open}
                onOne={(f) => void run('stage', () => stageFiles(projectId, { files: [f] }))}
                onAll={() => void run('stage', () => stageFiles(projectId, { all: true }))}
              />
            </>
          )}
          {data.hidden.length > 0 && (
            <p className={styles.note}>
              Never staged (secret files): <span className="mono">{data.hidden.join(', ')}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FileList({
  title,
  files,
  action,
  busy,
  onOpen,
  onOne,
  onAll,
}: {
  title: string;
  files: CommitFile[];
  action: 'Stage' | 'Unstage';
  busy: boolean;
  onOpen(path: string): void;
  onOne(path: string): void;
  onAll(): void;
}) {
  if (!files.length) return null;
  const Icon = action === 'Stage' ? Plus : Minus;
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <span>
          {title} <span className={styles.count}>{files.length}</span>
        </span>
        <button type="button" className={styles.groupBtn} disabled={busy} onClick={onAll}>
          {action} all
        </button>
      </div>
      <ul className={styles.files} aria-label={title}>
        {files.map((f) => (
          <li key={f.path}>
            <span className={styles.letter} data-letter={f.letter}>
              {f.letter}
            </span>
            <button
              type="button"
              className={styles.path}
              title={f.origPath ? `${f.path} (renamed from ${f.origPath})` : f.path}
              onClick={() => onOpen(f.path)}
            >
              {f.path}
            </button>
            <button
              type="button"
              className={styles.fileBtn}
              aria-label={`${action} ${f.path}`}
              title={action}
              disabled={busy}
              onClick={() => onOne(f.path)}
            >
              <Icon size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
