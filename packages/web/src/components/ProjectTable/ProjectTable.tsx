import { useState } from 'react';
import { Link } from 'react-router';
import { relativeTime, type ProjectCard } from '@cherry/shared';
import { PhaseBarCompact } from '../PhaseBar/PhaseBar.tsx';
import { GitChip } from '../Pill/Pill.tsx';
import { projectHref } from '../ProjectCard/ProjectCard.tsx';
import { closeFolder } from '../OpenFolder/OpenFolder.tsx';
import { tildify } from '../../lib/paths.ts';
import styles from './ProjectTable.module.css';

export function ProjectTable({
  cards,
  now,
  loading,
}: {
  cards: ProjectCard[];
  now: number;
  loading?: boolean;
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Phase</th>
            <th scope="col">Stack</th>
            <th scope="col">Last worked</th>
            <th scope="col">Git</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={i} aria-hidden="true">
                <td colSpan={6}>
                  <span className="shimmer" style={{ display: 'block', height: 28 }} />
                </td>
              </tr>
            ))}
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <div className={styles.project}>
                  <span className={styles.nameRow}>
                    <Link to={projectHref(c)} className={styles.name}>
                      {c.name}
                    </Link>
                    {c.opened && (
                      <span className="tag" title={tildify(c.path)}>
                        opened
                      </span>
                    )}
                  </span>
                  <span className={styles.summary}>{c.summary}</span>
                </div>
              </td>
              <td>
                <PhaseBarCompact phase={c.phase} width={110} />
              </td>
              <td>
                <div className={styles.stack}>
                  {c.stack.length ? (
                    c.stack.map((s) => (
                      <span key={s} className="tag">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="tag">—</span>
                  )}
                </div>
              </td>
              <td className={styles.last}>
                {c.lastWorked ? relativeTime(c.lastWorked, now) : '—'}
              </td>
              <td>
                <GitChip git={c.git} />
              </td>
              <td className={styles.action}>
                {c.draft ? (
                  <Link to={projectHref(c)} className="btn btn-secondary btn-sm">
                    Continue
                  </Link>
                ) : (
                  // Not set up in Cherry yet (no project.json): one click to calibrate it.
                  c.state !== 'ready' && (
                    <Link
                      to={`/p/${encodeURIComponent(c.id)}/calibrate`}
                      className="btn btn-secondary btn-sm"
                    >
                      Calibrate
                    </Link>
                  )
                )}
                {c.opened && <RemoveFromList id={c.id} name={c.name} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Opened folders only: Home forgets the folder; nothing on disk changes (ADR-0031). */
function RemoveFromList({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={`Remove ${name} from the list`}
      title="Remove from the list. The folder stays on disk."
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void closeFolder(id).finally(() => setBusy(false));
      }}
    >
      Remove from list
    </button>
  );
}
