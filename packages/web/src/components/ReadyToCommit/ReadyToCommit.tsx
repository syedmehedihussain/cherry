import { Check, ChevronRight, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { CommitFile, CommitSuggestion } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { queryClient } from '../../api/queries.ts';
import {
  commitFiles,
  commitPlanKey,
  refreshCommitPlan,
  useCommitPlan,
  useGitInfo,
  wk,
} from '../../api/workspace.ts';
import styles from './ReadyToCommit.module.css';

/**
 * The GitHub view's list of commits to make. Claude groups the changes and explains each
 * group; the commit is a plain `git commit` as the user.
 */
export function ReadyToCommit({ projectId }: { projectId: string }) {
  const plan = useCommitPlan(projectId);
  const git = useGitInfo(projectId);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState<{ hash: string; message: string } | null>(null);
  const data = plan.data;
  const loading = plan.isPending || refreshing;
  const stale = !!data && !!git.data && git.data.changes !== data.files.length + data.hidden.length;

  const refresh = async () => {
    setRefreshing(true);
    setDone(null);
    try {
      await refreshCommitPlan(projectId);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className={styles.box} aria-label="Ready to commit">
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.label}>Ready to commit</span>
          {data?.author && (
            <span className={styles.author} title={data.author.email}>
              as {data.author.name}
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.icon}
          aria-label="Group the changes again"
          title="Group the changes again"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            className={refreshing ? styles.spinning : undefined}
          />
        </button>
      </div>

      {loading && (
        <div className={styles.loading}>
          <span className="spinner" style={{ width: 12, height: 12 }} />
          Claude is grouping your changes. This can take up to a minute.
        </div>
      )}
      {plan.isError && !loading && (
        <p className={styles.error}>
          {plan.error instanceof ApiFailure ? plan.error.message : 'Could not read the changes.'}
        </p>
      )}

      {data && !loading && (
        <>
          {!data.author && (
            <p className={styles.warn}>
              Git does not know your name yet. Run{' '}
              <span className="mono">git config --global user.name "Your Name"</span> and{' '}
              <span className="mono">user.email</span>, then refresh.
            </p>
          )}
          {done && (
            <p className={styles.done} role="status">
              <Check size={13} aria-hidden="true" /> Committed{' '}
              <span className="mono">{done.hash}</span> {done.message}
            </p>
          )}
          {stale && (
            <button type="button" className={styles.stale} onClick={() => void refresh()}>
              Files changed since this list was made. Refresh
            </button>
          )}
          {data.error && <p className={styles.warn}>{data.error} All files are in one commit.</p>}
          {data.commits.length === 0 ? (
            <p className={styles.empty}>Nothing to commit. Your working tree is clean.</p>
          ) : (
            <ul className={styles.list}>
              {data.commits.map((c) => (
                <CommitRow
                  key={c.id + c.files.join()}
                  projectId={projectId}
                  commit={c}
                  files={data.files}
                  canCommit={!!data.author}
                  author={data.author?.name ?? ''}
                  open={open === c.id}
                  onToggle={() => setOpen(open === c.id ? null : c.id)}
                  onDone={(r) => {
                    setDone(r);
                    setOpen(null);
                  }}
                />
              ))}
            </ul>
          )}
          {data.hidden.length > 0 && (
            <p className={styles.note}>
              Not offered (secret files): <span className="mono">{data.hidden.join(', ')}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function CommitRow({
  projectId,
  commit,
  files,
  canCommit,
  author,
  open,
  onToggle,
  onDone,
}: {
  projectId: string;
  commit: CommitSuggestion;
  files: CommitFile[];
  canCommit: boolean;
  author: string;
  open: boolean;
  onToggle(): void;
  onDone(r: { hash: string; message: string }): void;
}) {
  const [message, setMessage] = useState(
    commit.body ? `${commit.message}\n\n${commit.body}` : commit.message,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const letter = new Map(files.map((f) => [f.path, f.letter]));
  const panelId = `commit-${commit.id}`;

  const commitNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await commitFiles(projectId, message.trim(), commit.files);
      await queryClient.invalidateQueries({ queryKey: commitPlanKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: wk.all(projectId) });
      onDone(r);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'The commit failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.row} data-open={open || undefined}>
      <button
        type="button"
        className={styles.rowHead}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <ChevronRight size={13} aria-hidden="true" className={styles.chev} />
        <span className={styles.message}>{commit.message}</span>
        <span className={styles.count}>
          {commit.files.length} file{commit.files.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <div id={panelId} className={styles.panel}>
          <div className={styles.about}>
            <span className={styles.aboutLabel}>What this commit does</span>
            <p>{commit.explanation}</p>
          </div>
          <ul className={styles.files} aria-label="Files in this commit">
            {commit.files.map((f) => (
              <li key={f}>
                <span className={styles.letter} data-letter={letter.get(f)}>
                  {letter.get(f)}
                </span>
                <span className={styles.path} title={f}>
                  {f}
                </span>
              </li>
            ))}
          </ul>
          <label className={styles.msgLabel}>
            Commit message
            <textarea
              className={styles.msg}
              value={message}
              rows={message.includes('\n') ? 4 : 2}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="button"
            className="btn btn-primary btn-md"
            disabled={!canCommit || busy || !message.trim()}
            onClick={() => void commitNow()}
          >
            <GitCommitHorizontal size={14} aria-hidden="true" />
            {busy ? 'Committing…' : `Commit as ${author || 'you'}`}
          </button>
        </div>
      )}
    </li>
  );
}
