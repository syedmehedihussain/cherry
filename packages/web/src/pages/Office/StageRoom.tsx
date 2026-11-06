import { ChevronLeft, CircleCheck, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  OFFICE_AGENT,
  OFFICE_AGENT_MONO,
  OFFICE_STAGE_LABEL,
  type OfficeFile,
  type OfficeStage,
  type StageDoc,
} from '@cherry/shared';
import { useChat, useLiveChat } from '../../api/chat.ts';
import { useStageDocs } from '../../api/office.ts';
import { usePlanUsage } from '../../api/queries.ts';
import { useLiveProject } from '../../api/workspace.ts';
import { resetText } from '../../components/PlanUsage/PlanUsage.tsx';
import { useNow } from '../../lib/useNow.ts';
import { ChatTab } from '../Workspace/ChatTab.tsx';
import { DeployStage } from '../Workspace/deploy/DeployStage.tsx';
import { DesignStage } from '../Workspace/design/DesignStage.tsx';
import { DocReader } from '../Workspace/plan/PlanStage.tsx';
import { BugsTab, QuestionsTab, UatTab } from './StageExtras.tsx';
import styles from './StageRoom.module.css';

const STATE_WORD = {
  locked: 'locked',
  active: 'On-going',
  waiting: 'waiting for client',
  signed: 'complete',
  update: 'needs update',
  carried: 'from the last version',
} as const;

/**
 * A stage room (V4 o7): the chat with the stage's agent and the stage's documents. Design and
 * Deployment keep their V3 layouts (canvas, cockpit) inside the room.
 */
export function StageRoom({
  projectId,
  stage,
  office,
  onSignOff,
}: {
  projectId: string;
  stage: OfficeStage;
  office: OfficeFile;
  onSignOff(): void;
}) {
  const now = useNow(30_000);
  useLiveChat(projectId);
  useLiveProject(projectId);
  const cycle = office.cycles[office.cycles.length - 1]!;
  const rec = cycle.stages[stage];
  const [doc, setDoc] = useState<string | null>(null);
  const canSign =
    (rec.state === 'active' || rec.state === 'waiting' || rec.state === 'update') && rec.ready;
  const word = rec.state === 'active' && rec.ready ? 'ready to sign off' : STATE_WORD[rec.state];

  let body;
  if (stage === 'design')
    body = <DesignStage projectId={projectId} now={now} onOpenFile={setDoc} />;
  else if (stage === 'deployment') body = <DeployStage projectId={projectId} now={now} />;
  else
    body = (
      <div className={styles.split}>
        <div className={styles.chat}>
          <ChatTab projectId={projectId} stage={stage} now={now} onOpenFile={setDoc} />
          <StatusLine projectId={projectId} stage={stage} now={now} />
        </div>
        <DocsPanel
          projectId={projectId}
          stage={stage}
          personal={office.kind === 'personal'}
          open={doc}
          onOpen={setDoc}
          now={now}
        />
      </div>
    );

  return (
    <div className={styles.room}>
      <header className={styles.top}>
        <Link to={`/p/${encodeURIComponent(projectId)}`} className="btn btn-ghost btn-sm">
          <ChevronLeft size={14} aria-hidden="true" />
          Office
        </Link>
        <span className={styles.sep} />
        <span className={styles.av}>{OFFICE_AGENT_MONO[stage]}</span>
        <span className={styles.who}>
          <span className={styles.name}>{OFFICE_STAGE_LABEL[stage]}</span>
          <span className={styles.role}>{OFFICE_AGENT[stage]}</span>
        </span>
        <span className={styles.pill} data-state={rec.state} data-ready={rec.ready || undefined}>
          {word}
        </span>
        <span className={styles.grow} />
        {rec.state === 'signed' || rec.state === 'carried' ? (
          <span className={styles.signed}>
            <CircleCheck size={14} aria-hidden="true" />
            Signed off
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canSign}
            title={canSign ? undefined : `The ${OFFICE_AGENT[stage]} says when the stage is ready`}
            onClick={onSignOff}
          >
            <CircleCheck size={14} aria-hidden="true" />
            {rec.state === 'waiting'
              ? 'Record approval'
              : rec.state === 'update'
                ? 'Sign off again'
                : 'Sign off'}
          </button>
        )}
      </header>
      {rec.state === 'locked' ? (
        <p className={styles.locked}>This stage opens when the one before it is signed off.</p>
      ) : (
        body
      )}
    </div>
  );
}

/** Client (or Summary) and Technical documents of the stage, and the open one. */
function DocsPanel({
  projectId,
  stage,
  personal,
  open,
  onOpen,
  now,
}: {
  projectId: string;
  stage: OfficeStage;
  personal: boolean;
  open: string | null;
  onOpen(path: string): void;
  now: number;
}) {
  const query = useStageDocs(projectId, stage);
  const docs = query.data;
  // The agent writes documents during a turn: look again when the chat moves on.
  const items = useChat(projectId, stage).data?.items.length ?? 0;
  const { refetch } = query;
  useEffect(() => {
    void refetch();
  }, [items, refetch]);
  type Tab = 'client' | 'technical' | 'questions' | 'uat' | 'bugs';
  const [tab, setTab] = useState<Tab>('client');
  const isDocs = tab === 'client' || tab === 'technical';
  const list: StageDoc[] = isDocs ? (docs?.[tab] ?? []) : [];
  const shown = open ?? list[0]?.path ?? null;
  const tabs: [Tab, string, number | null][] = [
    ['client', personal ? 'Summary' : 'Client', docs?.client.length ?? 0],
    ['technical', 'Technical', docs?.technical.length ?? 0],
    ...(stage === 'requirements' ? [['questions', 'Questions', null] as [Tab, string, null]] : []),
    ...(stage === 'testing'
      ? ([
          ['uat', 'UAT', null],
          ['bugs', 'Bugs', null],
        ] as [Tab, string, null][])
      : []),
  ];
  return (
    <aside className={styles.docs} aria-label="Documents">
      <div className={styles.docsHead} role="tablist" aria-label="Documents for">
        {tabs.map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {label} {n !== null && <span className={styles.n}>{n}</span>}
          </button>
        ))}
      </div>
      {tab === 'questions' && <QuestionsTab projectId={projectId} />}
      {tab === 'uat' && <UatTab projectId={projectId} />}
      {tab === 'bugs' && <BugsTab projectId={projectId} />}
      {isDocs && list.length > 0 && (
        <ul className={styles.list}>
          {list.map((d) => (
            <li key={d.path}>
              <button
                type="button"
                aria-current={d.path === shown || undefined}
                onClick={() => onOpen(d.path)}
                title={d.path}
              >
                <FileText size={14} aria-hidden="true" />
                <span className={styles.title}>{d.title}</span>
                <span className={styles.path}>{d.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isDocs ? null : shown ? (
        <DocReader key={shown} projectId={projectId} path={shown} now={now} extra={false} />
      ) : (
        <p className={styles.empty}>
          No {tab === 'client' ? (personal ? 'summary' : 'client') : 'technical'} documents yet. The{' '}
          {OFFICE_AGENT[stage]} writes them in{' '}
          <span className="mono">
            docs/{stage}/{tab}/
          </span>{' '}
          when you give a job.
        </p>
      )}
    </aside>
  );
}

/** Under the chat: model, context window, and the 5-hour and weekly limits. */
function StatusLine({
  projectId,
  stage,
  now,
}: {
  projectId: string;
  stage: OfficeStage;
  now: number;
}) {
  const chat = useChat(projectId, stage).data;
  const usage = usePlanUsage().data;
  const end = chat?.items.findLast((i) => i.kind === 'turn-end');
  const ctx = end?.kind === 'turn-end' ? end.context : undefined;
  const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const bar = (v: number) => (
    <span className={styles.bar}>
      <i style={{ width: `${pct(v)}%` }} data-high={v > 75 || undefined} />
    </span>
  );
  return (
    <div className={styles.status} aria-label="Status line">
      <span>{chat?.model ?? 'opus'}</span>
      {ctx && (
        <span title="Context window of this chat">
          ctx {bar((ctx.used / ctx.window) * 100)}
          {pct((ctx.used / ctx.window) * 100)}% of {Math.round(ctx.window / 1000)}k
        </span>
      )}
      {usage?.available && usage.fiveHour && (
        <span title="5-hour usage window">
          5h {bar(usage.fiveHour.usedPercent)}
          {pct(usage.fiveHour.usedPercent)}%
          {usage.fiveHour.resetsAt !== null && (
            <span className={styles.dim}> {resetText(usage.fiveHour.resetsAt, now)}</span>
          )}
        </span>
      )}
      {usage?.available && usage.week && (
        <span title="Weekly usage">
          week {bar(usage.week.usedPercent)}
          {pct(usage.week.usedPercent)}%
        </span>
      )}
    </div>
  );
}
