import { Check, CircleCheck, Clock, FileDiff, History, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  OFFICE_AGENT,
  OFFICE_AGENT_MONO,
  OFFICE_CARD_NAME,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  currentStage,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { LiveCard, StageCard } from '../../components/StageCard/StageCard.tsx';
import { ChangesDialog } from './Changes.tsx';
import styles from './Office.module.css';

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The Stages tab of the project page (V4 o6): the seven stage cards, then what waits on you. */
export function StagesTab({
  projectId,
  name,
  office,
}: {
  projectId: string;
  name: string;
  office: OfficeFile;
}) {
  const navigate = useNavigate();
  const [changes, setChanges] = useState(false);
  const cycle = office.cycles[office.cycles.length - 1]!;
  const live = !!office.cycles.find((c) => c.liveAt);
  const cur = currentStage(cycle);
  const open = (s: OfficeStage) => void navigate(`/p/${encodeURIComponent(projectId)}/s/${s}`);
  const personal = office.kind === 'personal';

  const meta = (s: OfficeStage, i: number): string => {
    const r = cycle.stages[s];
    if (r.state === 'locked')
      return `Opens when ${OFFICE_STAGE_LABEL[OFFICE_STAGES[i - 1] ?? 'idea']} is signed off`;
    const last = r.signOffs[r.signOffs.length - 1];
    return last
      ? `Signed off ${fmtDate(last.date)}`
      : r.ready
        ? 'Ready for sign-off'
        : 'In progress';
  };

  const waiting: React.ReactNode[] = [];
  for (const s of OFFICE_STAGES) {
    const r = cycle.stages[s];
    if (r.state === 'active' && r.ready)
      waiting.push(
        <Row key={s} icon={<CircleCheck size={15} className={styles.acc} aria-hidden="true" />}>
          <b>{OFFICE_AGENT[s]}</b> says {OFFICE_STAGE_LABEL[s]} is ready.{' '}
          {personal ? 'Review it and sign off.' : 'Show it to the client and sign off.'}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(s)}>
            Open
          </button>
        </Row>,
      );
    if (r.state === 'waiting')
      waiting.push(
        <Row key={s} icon={<Clock size={15} className={styles.warn} aria-hidden="true" />}>
          <b>{OFFICE_STAGE_LABEL[s]}</b> was sent to{' '}
          {office.client?.contact || office.client?.name || 'the client'}. Record the approval when
          it comes.
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(s)}>
            Open
          </button>
        </Row>,
      );
    if (r.state === 'update')
      waiting.push(
        <Row key={s} icon={<TriangleAlert size={15} className={styles.warn} aria-hidden="true" />}>
          <b>{OFFICE_STAGE_LABEL[s]}</b> needs an update for an approved change.
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(s)}>
            Open
          </button>
        </Row>,
      );
  }

  const recent = OFFICE_STAGES.flatMap((s) => cycle.stages[s].signOffs.map((so) => ({ s, so })))
    .sort((a, b) => b.so.at.localeCompare(a.so.at))
    .slice(0, 4);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.name}>{name}</h1>
        {office.cycles.length > 1 && <span className="tag">v{cycle.version}</span>}
        <span className={styles.grow} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChanges(true)}>
          <FileDiff size={14} aria-hidden="true" />
          Changes
          {office.changes.filter((c) => c.status === 'proposed').length > 0 && (
            <span className={styles.badge}>
              {office.changes.filter((c) => c.status === 'proposed').length}
            </span>
          )}
        </button>
      </header>
      {changes && (
        <ChangesDialog projectId={projectId} office={office} onClose={() => setChanges(false)} />
      )}
      <ol className={styles.track} aria-label="Project status">
        {OFFICE_STAGES.map((s) => {
          const st = cycle.stages[s].state;
          const done = st === 'signed' || st === 'carried';
          return (
            <li key={s} data-done={done || undefined} data-current={s === cur || undefined}>
              {done && <Check size={12} aria-hidden="true" />}
              {OFFICE_STAGE_LABEL[s]}
            </li>
          );
        })}
        <li data-live={live || undefined}>Live</li>
      </ol>
      <div className={styles.grid}>
        {OFFICE_STAGES.map((s, i) => (
          <StageCard
            key={s}
            name={OFFICE_CARD_NAME[s]}
            agent={OFFICE_AGENT[s]}
            mono={OFFICE_AGENT_MONO[s]}
            state={cycle.stages[s].state}
            ready={cycle.stages[s].ready}
            meta={meta(s, i)}
            onOpen={() => open(s)}
          />
        ))}
        <LiveCard
          live={live}
          label={
            live ? `v${office.cycles.find((c) => c.liveAt)!.version} is live` : 'after Deployment'
          }
          onOpen={() => void navigate(`/p/${encodeURIComponent(projectId)}/maintenance`)}
        />
      </div>
      <div className={styles.below}>
        <section className={styles.panel} aria-label="Waiting on you">
          <h2>
            <Clock size={15} aria-hidden="true" />
            Waiting on you
          </h2>
          {waiting.length ? (
            waiting
          ) : (
            <p className={styles.empty}>
              Nothing right now.{' '}
              {cur ? `Give the ${OFFICE_AGENT[cur]} a job in ${OFFICE_STAGE_LABEL[cur]}.` : ''}
            </p>
          )}
        </section>
        <section className={styles.panel} aria-label="Recent">
          <h2>
            <History size={15} aria-hidden="true" />
            Recent
          </h2>
          {recent.length ? (
            recent.map(({ s, so }) => (
              <Row key={so.at} icon={<span className={styles.av}>{OFFICE_AGENT_MONO[s]}</span>}>
                <b>{OFFICE_STAGE_LABEL[s]}</b> signed off
                {personal ? ' by you' : so.internal ? ' (internal only)' : ` by ${so.by}`}
                <span className={styles.when}>{fmtDate(so.date)}</span>
              </Row>
            ))
          ) : (
            <p className={styles.empty}>No sign-offs yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      {icon}
      <span className={styles.rowText}>{children}</span>
    </div>
  );
}
