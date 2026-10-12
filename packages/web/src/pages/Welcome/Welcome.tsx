import { useQuery } from '@tanstack/react-query';
import { ArrowUp, Folder } from 'lucide-react';
import { useDeferredValue, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ConfigSchema, FolderListSchema } from '@cherry/shared';
import { api, ApiFailure } from '../../api/client.ts';
import { keys, queryClient, recheckHealth, useConfig, useHealth } from '../../api/queries.ts';
import { CherryBadge } from '../../components/Brand/Brand.tsx';
import { ThemePicker } from '../../components/ThemePicker/ThemePicker.tsx';
import styles from './Welcome.module.css';

const STEPS = 4;

/** First start only: what Cherry is, where the projects live, the tools it needs, and a theme. */
export function Welcome() {
  const config = useConfig();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!config.data) return null;
  if (config.data.onboarded && step === 0) return <Navigate to="/" replace />;
  const folder = dir ?? config.data.projectsDir;

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('POST', '/api/setup', { projectsDir: folder }, ConfigSchema.passthrough());
      await queryClient.invalidateQueries({ queryKey: keys.config });
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      void navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <CherryBadge size={56} />
        <p className={styles.step}>
          Step {step + 1} of {STEPS}
        </p>

        {step === 0 && (
          <>
            <h1>Welcome to Cherry</h1>
            <p className={styles.lead}>
              A local workspace where Claude Code plans, documents and builds your projects.
            </p>
            <ul className={styles.points}>
              <li>Every folder in your projects folder is a project.</li>
              <li>Chat with Claude. Nothing changes on disk until you approve it.</li>
              <li>Status and notes stay in each project&rsquo;s _project/ folder.</li>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Where are your projects?</h1>
            <p className={styles.lead}>Pick a folder, or type a new path and Cherry creates it.</p>
            <FolderPicker value={folder} onChange={setDir} />
          </>
        )}

        {step === 2 && (
          <>
            <h1>Check your tools</h1>
            <p className={styles.lead}>
              Cherry runs Claude Code and git on this machine. GitHub is optional.
            </p>
            <ToolCheck />
          </>
        )}

        {step === 3 && (
          <>
            <h1>Pick a theme</h1>
            <p className={styles.lead}>You can change it later in Settings.</p>
            <ThemePicker />
          </>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          {step > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          {step < STEPS - 1 ? (
            <button
              type="button"
              className="btn btn-primary btn-md"
              disabled={step === 1 && !folder.trim()}
              onClick={() => setStep(step + 1)}
            >
              {step === 0 ? 'Get started' : 'Continue'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-md"
              disabled={saving}
              onClick={() => void finish()}
            >
              Start using Cherry
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

type Tone = 'ok' | 'warn' | 'bad';

function ToolCheck() {
  const health = useHealth();
  const [busy, setBusy] = useState(false);
  const check = () => {
    setBusy(true);
    void recheckHealth()
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  // A fresh look when the step opens: the user may have just logged in somewhere.
  useEffect(() => {
    void recheckHealth().catch(() => undefined);
  }, []);
  const h = health.data;
  if (!h) return <span className="shimmer" style={{ height: 160, width: '100%' }} />;

  const claude: [Tone, ReactNode] = !h.claude.found
    ? ['bad', <>Not installed. Install Claude Code, then check again.</>]
    : !h.claude.loggedIn
      ? [
          'bad',
          <>
            Installed, not logged in. Run <code>claude</code> in a terminal and log in.
          </>,
        ]
      : ['ok', <>Ready{h.claude.version ? ` · ${h.claude.version}` : ''}</>];
  const git: [Tone, ReactNode] = h.git.found
    ? ['ok', <>Ready{h.git.version ? ` · ${h.git.version}` : ''}</>]
    : ['bad', <>Not found. Install git, then check again.</>];
  const gh: [Tone, ReactNode] = !h.gh.found
    ? [
        'warn',
        <>
          Optional. Install the GitHub CLI (<code>gh</code>) to create repos and see pull requests.
        </>,
      ]
    : !h.gh.loggedIn
      ? [
          'warn',
          <>
            Installed, not logged in. Run <code>gh auth login</code>.
          </>,
        ]
      : ['ok', <>Connected</>];
  const rows: [string, Tone, ReactNode][] = [
    ['Claude Code', ...claude],
    ['git', ...git],
    ['GitHub', ...gh],
  ];

  return (
    <div className={styles.tools}>
      <ul className={styles.toolList} aria-label="Tools">
        {rows.map(([name, tone, text]) => (
          <li key={name} data-tone={tone}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.toolText}>
              <strong>{name}</strong>
              <span>{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.toolFoot}>
        <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={check}>
          {busy ? 'Checking…' : 'Check again'}
        </button>
        {claude[0] !== 'ok' && (
          <span className={styles.note}>
            You can go on and fix this later. Chat and agents need Claude Code.
          </span>
        )}
      </div>
    </div>
  );
}

function FolderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const query = useDeferredValue(value.trim());
  const list = useQuery({
    queryKey: ['folders', query],
    queryFn: () =>
      api('GET', `/api/folders?path=${encodeURIComponent(query)}`, undefined, FolderListSchema),
    enabled: !!query,
    placeholderData: (prev) => prev,
  });
  const data = list.data;
  const join = (name: string) => `${(data?.path ?? value).replace(/\/$/, '')}/${name}`;

  return (
    <div className={styles.picker}>
      <input
        className="input mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Projects folder"
        spellCheck={false}
      />
      <div className={styles.browser}>
        <button
          type="button"
          className={styles.up}
          disabled={!data?.parent}
          onClick={() => data?.parent && onChange(data.parent)}
        >
          <ArrowUp size={14} /> Up
        </button>
        {data && !data.exists ? (
          <p className={styles.note}>This folder does not exist yet. Cherry will create it.</p>
        ) : data && data.dirs.length === 0 ? (
          <p className={styles.note}>No folders inside. Projects you add will go here.</p>
        ) : (
          <ul className={styles.dirs}>
            {data?.dirs.map((name) => (
              <li key={name}>
                <button type="button" onClick={() => onChange(join(name))}>
                  <Folder size={14} /> {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
