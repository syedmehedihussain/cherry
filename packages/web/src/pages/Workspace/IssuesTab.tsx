import { ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Issue, IssueInput } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import {
  createIssue,
  importGithubIssue,
  sendIssueToGithub,
  setIssueStatus,
  useIssues,
} from '../../api/issues.ts';
import { Pill, type PillTone } from '../../components/Pill/Pill.tsx';
import styles from './IssuesTab.module.css';

const SEVERITY_TONE: Record<Issue['severity'], PillTone> = {
  blocks: 'danger',
  annoying: 'warning',
  cosmetic: 'neutral',
};
const FILTERS = ['open', 'planned', 'done', 'all'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The Issues stage (ADR-0035): issue files in docs/issues/, the project's GitHub issues next to
 * them, and Plan selected to start the next round.
 */
export function IssuesTab({
  projectId,
  onPlan,
}: {
  projectId: string;
  /** Opens Plan with a message naming these issue files. */
  onPlan(issues: Issue[]): void;
}) {
  const data = useIssues(projectId);
  const [filter, setFilter] = useState<Filter>('open');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issues = data.data?.issues ?? [];
  const shown = filter === 'all' ? issues : issues.filter((i) => i.status === filter);
  const chosen = issues.filter((i) => picked.has(i.number));
  const base = `/p/${encodeURIComponent(projectId)}`;

  const act = (p: Promise<unknown>) => {
    setError(null);
    p.catch((e: unknown) =>
      setError(e instanceof ApiFailure ? e.message : 'Something went wrong.'),
    );
  };
  const toggle = (n: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2>Issues</h2>
        <div className={styles.filters} role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0]!.toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className={styles.count}>{issues.filter((i) => i.status === f).length}</span>
              )}
            </button>
          ))}
        </div>
        <span className={styles.spacer} />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!chosen.length}
          title="Open Plan with these issues"
          onClick={() => {
            onPlan(chosen);
            setPicked(new Set());
          }}
        >
          Plan selected{chosen.length ? ` (${chosen.length})` : ''}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={13} aria-hidden="true" />
          New issue
        </button>
      </div>
      <p className={styles.hint}>
        Each issue is a file in <span className="mono">docs/issues/</span>. Pick some and{' '}
        <strong>Plan selected</strong> to start the next round; or describe a problem to the Triager
        in the chat.
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {adding && (
        <NewIssue
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            await createIssue(projectId, input);
            setAdding(false);
            setFilter('open');
          }}
        />
      )}

      {data.isPending ? (
        <span className="shimmer" style={{ height: 120 }} />
      ) : shown.length === 0 ? (
        <p className={styles.empty}>
          {issues.length === 0
            ? 'No issues yet. Write one, or tell the Triager what went wrong.'
            : `No ${filter} issues.`}
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((i) => (
            <li key={i.number} className={styles.issue}>
              <input
                type="checkbox"
                aria-label={`Pick ${i.title}`}
                checked={picked.has(i.number)}
                onChange={() => toggle(i.number)}
              />
              <div className={styles.main}>
                <div className={styles.titleRow}>
                  <span className={styles.num}>#{i.number}</span>
                  <Link to={`${base}/files/${i.file}`} className={styles.title}>
                    {i.title}
                  </Link>
                </div>
                <div className={styles.meta}>
                  <Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill>
                  <span>{i.type}</span>
                  {i.cycle && (
                    <span className="mono" title="The spec that took it">
                      {i.cycle}
                    </span>
                  )}
                  {i.github && (
                    <a href={i.github} target="_blank" rel="noreferrer" className={styles.gh}>
                      GitHub <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
              <select
                aria-label={`Status of ${i.title}`}
                value={i.status}
                onChange={(e) =>
                  act(setIssueStatus(projectId, i.number, e.target.value as Issue['status']))
                }
              >
                <option value="open">Open</option>
                <option value="planned">Planned</option>
                <option value="done">Done</option>
              </select>
              {data.data?.github && !i.github && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Creates the issue on GitHub after you approve"
                  onClick={() => act(sendIssueToGithub(projectId, i.number))}
                >
                  Send to GitHub
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.data?.github && (
        <section className={styles.github} aria-labelledby="gh-issues-h">
          <h3 id="gh-issues-h">Open on GitHub</h3>
          {data.data.github.error ? (
            <p className={styles.empty}>{data.data.github.error}</p>
          ) : data.data.github.issues.length === 0 ? (
            <p className={styles.empty}>No open GitHub issues.</p>
          ) : (
            <ul className={styles.list}>
              {data.data.github.issues.map((g) => (
                <li key={g.number} className={styles.issue}>
                  <div className={styles.main}>
                    <div className={styles.titleRow}>
                      <span className={styles.num}>#{g.number}</span>
                      <a href={g.url} target="_blank" rel="noreferrer" className={styles.title}>
                        {g.title}
                      </a>
                    </div>
                    {g.labels.length > 0 && (
                      <div className={styles.meta}>
                        {g.labels.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {g.local ? (
                    <Link to={`${base}/files/${g.local}`} className="btn btn-ghost btn-sm">
                      In Cherry
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => act(importGithubIssue(projectId, g.number))}
                    >
                      Import
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function NewIssue({
  onSave,
  onCancel,
}: {
  onSave(input: IssueInput): Promise<void>;
  onCancel(): void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Issue['type']>('bug');
  const [severity, setSeverity] = useState<Issue['severity']>('annoying');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={styles.form}
      aria-label="New issue"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        onSave({ title, type, severity, body })
          .catch((err: unknown) =>
            setError(err instanceof ApiFailure ? err.message : 'Could not save the issue.'),
          )
          .finally(() => setBusy(false));
      }}
    >
      <input
        className="input"
        placeholder="What is wrong, in one line"
        aria-label="Title"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className={styles.formRow}>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as Issue['type'])}>
            <option value="bug">Bug</option>
            <option value="improvement">Improvement</option>
            <option value="idea">Idea</option>
          </select>
        </label>
        <label>
          How bad
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Issue['severity'])}
          >
            <option value="blocks">Blocks use</option>
            <option value="annoying">Annoying</option>
            <option value="cosmetic">Cosmetic</option>
          </select>
        </label>
      </div>
      <textarea
        className={styles.body}
        placeholder="What happened, steps to reproduce, what you expected"
        aria-label="Details"
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formRow}>
        <span className={styles.spacer} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy || title.trim().length < 3}
        >
          {busy ? 'Saving…' : 'Save issue'}
        </button>
      </div>
    </form>
  );
}
