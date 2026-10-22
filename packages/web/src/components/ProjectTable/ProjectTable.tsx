import { useState } from 'react';
import { Link } from 'react-router';
import { relativeTime, type ProjectCard } from '@cherry/shared';
import { GitChip } from '../Pill/Pill.tsx';
import { projectHref } from '../ProjectCard/ProjectCard.tsx';
import { removeProject } from '../OpenFolder/OpenFolder.tsx';
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
                <td colSpan={5}>
                  <span className="shimmer" style={{ display: 'block', height: 28 }} />
                </td>
              </tr>
            ))}
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <div className={styles.project}>
                  <span className={styles.nameRow}>
                    {c.missing ? (
                      <span className={styles.name}>{c.name}</span>
                    ) : (
                      <Link to={projectHref(c)} className={styles.name} title={tildify(c.path)}>
                        {c.name}
                      </Link>
                    )}
                    {c.missing && <span className="tag">folder gone</span>}
                  </span>
                  <span className={styles.summary}>{c.summary}</span>
                </div>
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
                {/* Not set up in Cherry yet (no project.json): one click to calibrate it. */}
                {!c.missing && c.state !== 'ready' && (
                  <Link
                    to={`/p/${encodeURIComponent(c.id)}/calibrate`}
                    className="btn btn-secondary btn-sm"
                  >
                    Calibrate
                  </Link>
                )}
                <RemoveFromCherry id={c.id} name={c.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Takes the project out of Cherry's list; the folder stays on disk (ADR-0032). */
function RemoveFromCherry({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={`Remove ${name} from Cherry`}
      title="Remove from Cherry. The folder stays on disk."
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void removeProject(id).finally(() => setBusy(false));
      }}
    >
      Remove
    </button>
  );
}
