import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileDiff } from 'lucide-react';
import { useState } from 'react';
import { HistorySchema, OFFICE_STAGE_LABEL, relativeTime, type OfficeStage } from '@cherry/shared';
import { api } from '../../api/client.ts';
import { GitPanel } from '../../components/GitHubBox/GitPanel.tsx';
import { SourceControl } from '../../components/SourceControl/SourceControl.tsx';
import { useNow } from '../../lib/useNow.ts';
import styles from './VersionControl.module.css';

/**
 * The Version control tab (V4 o11), on the project page and in each stage room: the changes and
 * a commit as the user (Write message only on a click), pull and push (push asks), and the
 * history. In a stage room the history shows that stage's commits, or all.
 */
export function VersionControl({ projectId, stage }: { projectId: string; stage?: OfficeStage }) {
  const now = useNow(60_000);
  const [all, setAll] = useState(false);
  const only = stage && !all ? stage : undefined;
  const history = useQuery({
    queryKey: ['history', projectId, only ?? 'all'],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/git/history${only ? `?stage=${only}` : ''}`,
        undefined,
        HistorySchema,
      ),
  });
  const [open, setOpen] = useState<string | null>(null);
  const commits = history.data?.commits ?? [];
  return (
    <div className={styles.vc}>
      <aside className={styles.left} aria-label="Changes">
        <GitPanel projectId={projectId} now={now} compact />
        <SourceControl projectId={projectId} />
      </aside>
      <section className={styles.right} aria-label="History">
        <div className={styles.head}>
          <h2>History</h2>
          {stage && (
            <div className={styles.seg} role="radiogroup" aria-label="Which commits">
              <button type="button" role="radio" aria-checked={!all} onClick={() => setAll(false)}>
                {OFFICE_STAGE_LABEL[stage]}
              </button>
              <button type="button" role="radio" aria-checked={all} onClick={() => setAll(true)}>
                All
              </button>
            </div>
          )}
          <span className={styles.count}>
            {commits.length} commit{commits.length === 1 ? '' : 's'}
          </span>
        </div>
        {history.isSuccess && commits.length === 0 && (
          <p className={styles.empty}>
            No commits{only ? ` for ${OFFICE_STAGE_LABEL[only]}` : ''} yet.
          </p>
        )}
        <ol className={styles.list}>
          {commits.map((c, i) => (
            <li key={c.hash} className={styles.commit} data-head={i === 0 || undefined}>
              <button
                type="button"
                className={styles.row}
                aria-expanded={open === c.hash}
                onClick={() => setOpen(open === c.hash ? null : c.hash)}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.main}>
                  <span className={styles.subject}>{c.subject}</span>
                  <span className={styles.meta}>
                    <span className="mono">{c.hash}</span>
                    <span>{c.author}</span>
                    <span>{relativeTime(c.at, now)}</span>
                    {c.tags.map((t) => (
                      <span key={t} className={styles.tag}>
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
                {open === c.hash ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
              </button>
              {open === c.hash && (
                <ul className={styles.files} aria-label={`Files in ${c.hash}`}>
                  {c.files.map((f) => (
                    <li key={f}>
                      <FileDiff size={13} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
