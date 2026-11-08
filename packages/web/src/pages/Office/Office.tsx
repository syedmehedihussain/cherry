import {
  Check,
  CircleCheck,
  Clock,
  Compass,
  FileDiff,
  History,
  Scale,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  OFFICE_AGENT,
  OFFICE_AGENT_MONO,
  OFFICE_CARD_NAME,
  OFFICE_STAGES,
  OFFICE_STAGE_LABEL,
  MODELS,
  currentStage,
  type OfficeFile,
  type OfficeStage,
  type WaitingItem,
} from '@cherry/shared';
import { useWaiting } from '../../api/office.ts';
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
  // The Live card is the cycle being built: v2.0 goes live after its own Deployment (o20).
  const live = !!cycle.liveAt;
  const liveOld = office.cycles.find((c) => c.liveAt && c !== cycle);
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

  // One list of what waits for you (finding #26): stage gates, approvals, decision cards and
  // ADRs, from the daemon, each with its room.
  const waitingItems = useWaiting(projectId).data ?? [];
  const perStage = (s: OfficeStage) => waitingItems.filter((w) => w.stage === s).length;
  const ICON: Record<WaitingItem['kind'], React.ReactNode> = {
    'sign-off': <CircleCheck size={15} className={styles.acc} aria-hidden="true" />,
    client: <Clock size={15} className={styles.warn} aria-hidden="true" />,
    update: <TriangleAlert size={15} className={styles.warn} aria-hidden="true" />,
    approval: <ShieldAlert size={15} className={styles.warn} aria-hidden="true" />,
    decision: <Compass size={15} className={styles.acc} aria-hidden="true" />,
    adr: <Scale size={15} className={styles.acc} aria-hidden="true" />,
  };
  const waiting = waitingItems.map((w, i) => (
    <Row key={`${w.kind}-${w.stage}-${i}`} icon={ICON[w.kind]}>
      {w.stage && <b>{OFFICE_STAGE_LABEL[w.stage]}: </b>}
      {w.title}
      {w.kind === 'client' && ` (${office.client?.contact || office.client?.name || 'the client'})`}
      {w.stage && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(w.stage!)}>
          Open
        </button>
      )}
    </Row>
  ));

  const recent = OFFICE_STAGES.flatMap((s) => cycle.stages[s].signOffs.map((so) => ({ s, so })))
    .sort((a, b) => b.so.at.localeCompare(a.so.at))
    .slice(0, 4);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.name}>{name}</h1>
        {office.cycles.length > 1 && <span className="tag">v{cycle.version}</span>}
        {liveOld && (
          <Link to={`/p/${encodeURIComponent(projectId)}/maintenance`} className={styles.liveOld}>
            v{liveOld.version} live, in maintenance
          </Link>
        )}
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
            agent={
              office.models[s]
                ? `${OFFICE_AGENT[s]} · ${MODELS.find((m) => m.id === office.models[s])?.label}`
                : OFFICE_AGENT[s]
            }
            mono={OFFICE_AGENT_MONO[s]}
            state={cycle.stages[s].state}
            ready={cycle.stages[s].ready}
            meta={meta(s, i)}
            waiting={perStage(s)}
            onOpen={() => open(s)}
          />
        ))}
        <LiveCard
          live={live}
          label={
            live
              ? `v${cycle.version} is live`
              : office.cycles.length > 1
                ? `v${cycle.version} after Deployment`
                : 'after Deployment'
          }
          onOpen={() => void navigate(`/p/${encodeURIComponent(projectId)}`)}
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
