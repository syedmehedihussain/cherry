import { useState } from 'react';
import { Link } from 'react-router';
import { Clock, Globe } from 'lucide-react';
import { OFFICE_STAGE_LABEL, relativeTime, type ProjectCard } from '@cherry/shared';
import { removeProject } from '../OpenFolder/OpenFolder.tsx';
import { projectHref } from '../ProjectCard/ProjectCard.tsx';
import { SetUpOffice } from '../SetUpOffice/SetUpOffice.tsx';
import { tildify } from '../../lib/paths.ts';
import styles from './OfficeTable.module.css';

/**
 * One list on the Projects page (V4 o5): client projects, personal projects, or the folders
 * that have no office yet. A row opens the project.
 */
export function OfficeTable({
  cards,
  kind,
  now,
}: {
  cards: ProjectCard[];
  kind: 'client' | 'personal' | 'none';
  now: number;
}) {
  const second = kind === 'client' ? 'Client' : kind === 'personal' ? 'Type' : 'Folder';
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">{second}</th>
            <th scope="col">Status</th>
            <th scope="col">Stages</th>
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <div className={styles.project}>
                  {c.missing ? (
                    <span className={styles.name}>{c.name}</span>
                  ) : (
                    <Link to={projectHref(c)} className={styles.name} title={tildify(c.path)}>
                      {c.name}
                    </Link>
                  )}
                  <span className={styles.summary}>
                    {c.missing ? 'The folder is gone. It was moved or deleted.' : c.summary}
                  </span>
                </div>
              </td>
              <td className={styles.muted}>
                {kind === 'client'
                  ? (c.office?.client ?? '')
                  : kind === 'personal'
                    ? 'Personal'
                    : tildify(c.path)}
              </td>
              <td>
                <Status card={c} />
              </td>
              <td>{c.office ? <Track stages={c.office.stages} live={c.office.live} /> : null}</td>
              <td className={styles.muted}>
                {c.lastWorked ? relativeTime(c.lastWorked, now) : ''}
              </td>
              <td className={styles.actions}>
                {/* Not set up in Cherry yet (no project.json): calibrate it (V3). */}
                {kind === 'none' && !c.missing && c.state !== 'ready' && (
                  <Link
                    to={`/p/${encodeURIComponent(c.id)}/calibrate`}
                    className="btn btn-ghost btn-sm"
                  >
                    Calibrate
                  </Link>
                )}
                {kind === 'none' && !c.missing && <SetUpButton id={c.id} name={c.name} />}
                <RemoveButton id={c.id} name={c.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Status({ card }: { card: ProjectCard }) {
  const o = card.office;
  if (!o) return <span className="tag">{card.missing ? 'folder gone' : 'no office'}</span>;
  if (o.live && !o.stage)
    return (
      <span className={styles.live}>
        <Globe size={12} aria-hidden="true" />
        Live
      </span>
    );
  if (!o.stage) return <span className="tag">Signed off</span>;
  const waiting = o.stages.includes('waiting');
  return waiting ? (
    <span className={styles.waiting}>
      <Clock size={12} aria-hidden="true" />
      {OFFICE_STAGE_LABEL[o.stage]}, waiting for client
    </span>
  ) : (
    <span className="tag">{OFFICE_STAGE_LABEL[o.stage]}</span>
  );
}

/** Seven small bars, one per stage: red signed off, white the current one; green when Live. */
export function Track({ stages, live }: { stages: string[]; live: boolean }) {
  return (
    <span
      className={styles.track}
      aria-label={`${stages.filter((s) => s === 'signed' || s === 'carried').length} of 7 stages signed off${live ? ', live' : ''}`}
    >
      {stages.map((s, i) => (
        <i key={i} data-state={s === 'carried' ? 'signed' : s === 'update' ? 'signed' : s} />
      ))}
      {live && <i data-state="live" />}
    </span>
  );
}

function SetUpButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Set up office
      </button>
      {open && <SetUpOffice projectId={id} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Takes the project out of Cherry's list; the folder stays on disk (ADR-0032). */
function RemoveButton({ id, name }: { id: string; name: string }) {
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
