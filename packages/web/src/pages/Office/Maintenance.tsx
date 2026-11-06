import { useQuery } from '@tanstack/react-query';
import { Bug, Globe, History, LayoutDashboard, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  HistorySchema,
  IssueListSchema,
  type Issue,
  type OfficeFile,
  type OfficeStage,
} from '@cherry/shared';
import { useChatDraft } from '../../api/chat.ts';
import { api, ApiFailure } from '../../api/client.ts';
import { queryClient } from '../../api/queries.ts';
import styles from './Maintenance.module.css';

const ROOMS: {
  id: string;
  name: string;
  agent: string;
  stage: OfficeStage | null;
  job: string | null;
}[] = [
  { id: 'support', name: 'Support', agent: 'Client requests', stage: null, job: null },
  {
    id: 'qa',
    name: 'QA',
    agent: 'QA Engineer',
    stage: 'testing',
    job: 'Run the regression checks on the live version and report what fails.',
  },
  { id: 'issues', name: 'Issues', agent: 'Triage', stage: null, job: null },
  {
    id: 'bugfix',
    name: 'Bug fixing',
    agent: 'Development Team',
    stage: 'development',
    job: 'Fix the next open bug in docs/issues/, with a test, as a small fix release.',
  },
  {
    id: 'upgrades',
    name: 'Upgrades',
    agent: 'DevOps Engineer',
    stage: 'deployment',
    job: 'Check the dependency and platform upgrades the app needs, and list them by risk.',
  },
];

/**
 * The maintenance office (V4 o19): after Deployment is signed off the project is Live. Support
 * and Issues are the issue files; QA, Bug fixing and Upgrades open the staff's rooms with the
 * job ready to send. Nothing runs by itself.
 */
export function Maintenance({
  projectId,
  name,
  office,
}: {
  projectId: string;
  name: string;
  office: OfficeFile;
}) {
  const navigate = useNavigate();
  const setDraft = useChatDraft((s) => s.set);
  const live = office.cycles.find((c) => c.liveAt)!;
  const issues = useQuery({
    queryKey: ['issues', projectId],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/issues`,
        undefined,
        IssueListSchema,
      ),
  });
  const tags = useQuery({
    queryKey: ['history', projectId, 'all'],
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/git/history`,
        undefined,
        HistorySchema,
      ),
  }).data?.commits.filter((c) => c.tags.length);
  const all = issues.data?.issues ?? [];
  const open = all.filter((i) => i.status !== 'done');
  const bugs = open.filter((i) => i.type === 'bug');
  const requests = open.filter((i) => i.type !== 'bug');
  const [room, setRoom] = useState<string>('issues');
  const go = (stage: OfficeStage, job: string) => {
    setDraft(projectId, job);
    void navigate(`/p/${encodeURIComponent(projectId)}/s/${stage}`);
  };
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{name}</h1>
        <span className={styles.live}>
          <Globe size={12} aria-hidden="true" />v{live.version} live
        </span>
        <span className={styles.grow} />
        <Link
          to={`/p/${encodeURIComponent(projectId)}/stages`}
          className="btn btn-secondary btn-sm"
        >
          <LayoutDashboard size={14} aria-hidden="true" />
          Build stages
        </Link>
      </header>
      <div className={styles.rooms}>
        {ROOMS.map((r) => {
          const count =
            r.id === 'support' ? requests.length : r.id === 'issues' ? bugs.length : null;
          return (
            <button
              key={r.id}
              type="button"
              className={styles.room}
              data-hot={(count ?? 0) > 0 || undefined}
              aria-pressed={room === r.id}
              onClick={() => (r.stage && r.job ? go(r.stage, r.job) : setRoom(r.id))}
            >
              <span className={styles.role}>{r.agent}</span>
              <span className={styles.name}>{r.name}</span>
              <span className={styles.state}>
                {count !== null ? `${count} open` : r.stage ? 'give a job' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.below}>
        <section
          className={styles.panel}
          aria-label={room === 'support' ? 'Client requests' : 'Bugs'}
        >
          <h2>
            {room === 'support' ? (
              <LifeBuoy size={15} aria-hidden="true" />
            ) : (
              <Bug size={15} aria-hidden="true" />
            )}
            {room === 'support' ? 'Client requests' : 'Bugs'}
          </h2>
          <IssueList
            projectId={projectId}
            items={room === 'support' ? requests : bugs}
            onFix={(i) =>
              go(
                'development',
                `Fix issue #${i.number}: ${i.title} (${i.file}). Add a test, then say when it is ready to ship.`,
              )
            }
          />
          <AddIssue projectId={projectId} kind={room === 'support' ? 'improvement' : 'bug'} />
        </section>
        <section className={styles.panel} aria-label="Version history">
          <h2>
            <History size={15} aria-hidden="true" />
            Version history
          </h2>
          <ul className={styles.versions}>
            {office.cycles
              .slice()
              .reverse()
              .map((c) => (
                <li key={c.version}>
                  <b>v{c.version}</b> {c.title}{' '}
                  <span className={styles.dim}>
                    {c.liveAt
                      ? `live since ${new Date(c.liveAt).toLocaleDateString('en-GB')}`
                      : 'in progress'}
                  </span>
                </li>
              ))}
            {tags?.map((c) => (
              <li key={c.hash}>
                <span className={styles.tag}>{c.tags.join(', ')}</span> {c.subject}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function IssueList({
  projectId,
  items,
  onFix,
}: {
  projectId: string;
  items: Issue[];
  onFix(i: Issue): void;
}) {
  if (!items.length) return <p className={styles.dim}>Nothing open.</p>;
  const done = (n: number) =>
    api('PATCH', `/api/projects/${encodeURIComponent(projectId)}/issues/${n}`, {
      status: 'done',
    }).then(() => queryClient.invalidateQueries({ queryKey: ['issues', projectId] }));
  return (
    <ul className={styles.issues}>
      {items.map((i) => (
        <li key={i.file}>
          <span className="mono">#{i.number}</span>
          <span className={styles.title}>{i.title}</span>
          <span className="tag">{i.severity}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onFix(i)}>
            Fix now
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void done(i.number)}
          >
            Done
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddIssue({ projectId, kind }: { projectId: string; kind: 'bug' | 'improvement' }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        void api('POST', `/api/projects/${encodeURIComponent(projectId)}/issues`, {
          title,
          type: kind,
        })
          .then(() => {
            setTitle('');
            setError(null);
            return queryClient.invalidateQueries({ queryKey: ['issues', projectId] });
          })
          .catch((err: unknown) =>
            setError(err instanceof ApiFailure ? err.message : 'Could not add it.'),
          );
      }}
    >
      <input
        aria-label={kind === 'bug' ? 'Flag a bug' : 'Add a client request'}
        placeholder={
          kind === 'bug' ? 'Flag a bug: what happened?' : 'What does the client ask for?'
        }
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit" className="btn btn-secondary btn-sm" disabled={title.trim().length < 3}>
        {kind === 'bug' ? 'Flag' : 'Add'}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}
