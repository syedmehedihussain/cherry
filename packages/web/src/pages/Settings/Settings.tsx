import { ArrowLeft, ArrowUpRight, Check, Code2, Globe, Mail } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  MAGNET_FILES,
  relativeTime,
  type AllowRule,
  type MagnetFileName,
  type Usage,
} from '@cherry/shared';
import { removeAllowRule, useAllowRules } from '../../api/chat.ts';
import { ApiFailure } from '../../api/client.ts';
import { patchConfig, saveMagnetFile, useMagnetInfo } from '../../api/magnet.ts';
import { recheckHealth, useConfig, useHealth } from '../../api/queries.ts';
import { Lockup } from '../../components/Brand/Brand.tsx';
import { MagnetAvatar } from '../../components/MagnetAvatar/MagnetAvatar.tsx';
import { Switch } from '../../components/Switch/Switch.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { tildify } from '../../lib/paths.ts';
import {
  notifyState,
  turnOffNotifications,
  turnOnNotifications,
  type NotifyState,
} from '../../lib/desktopNotify.ts';
import { ThemePicker } from '../../components/ThemePicker/ThemePicker.tsx';
import { useNow } from '../../lib/useNow.ts';
import { useStageInfo } from '../../api/stages.ts';
import styles from './Settings.module.css';

const GROUPS: { title: string | null; items: [string, string][] }[] = [
  {
    title: 'App',
    items: [
      ['general', 'General'],
      ['appearance', 'Appearance'],
      ['shortcuts', 'Shortcuts'],
    ],
  },
  {
    title: 'Connections',
    items: [
      ['folder', 'New projects folder'],
      ['claude', 'Claude Code'],
      ['github', 'GitHub'],
    ],
  },
  {
    title: 'Assistant',
    items: [
      ['agents', 'Stage agents'],
      ['permissions', 'Permissions'],
      ['magnet', 'Magnet'],
    ],
  },
];

export function Settings() {
  const section = useParams().section ?? 'general';
  const health = useHealth();
  const dot = (key: string) => {
    if (!health.data) return null;
    const ok =
      key === 'claude'
        ? health.data.claude.found && health.data.claude.loggedIn
        : key === 'github'
          ? health.data.gh.loggedIn
          : null;
    return ok === null ? null : <span className={styles.dot} data-ok={ok || undefined} />;
  };
  return (
    <div className={styles.page}>
      <TopBar crumbs={[{ label: 'Settings' }]} />
      <div className={styles.grid}>
        <nav aria-label="Settings" className={styles.nav}>
          <Link to="/" className={styles.back}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to projects
          </Link>
          {GROUPS.map((g) => (
            <div key={g.title} className={styles.group}>
              <div className={styles.groupTitle}>{g.title}</div>
              {g.items.map(([key, label]) => (
                <Link
                  key={key}
                  to={`/settings/${key}`}
                  className={styles.item}
                  aria-current={section === key ? 'page' : undefined}
                >
                  {label}
                  {dot(key)}
                </Link>
              ))}
            </div>
          ))}
          <div className={styles.group} style={{ marginTop: 'auto' }}>
            <Link
              to="/settings/about"
              className={styles.item}
              aria-current={section === 'about' ? 'page' : undefined}
            >
              About
            </Link>
          </div>
        </nav>
        <main className={styles.main}>
          <div className={styles.content}>
            {section === 'agents' ? (
              <AgentsSection />
            ) : section === 'permissions' ? (
              <PermissionsSection />
            ) : section === 'magnet' ? (
              <MagnetSection />
            ) : section === 'folder' ? (
              <FolderSection />
            ) : section === 'claude' ? (
              <ClaudeSection />
            ) : section === 'github' ? (
              <GitHubSection />
            ) : section === 'appearance' ? (
              <AppearanceSection />
            ) : section === 'shortcuts' ? (
              <ShortcutsSection />
            ) : section === 'about' ? (
              <AboutSection />
            ) : (
              <GeneralSection />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/** "Always allow here" rules per project (ADR-0043), like the CLI's /permissions. */
function PermissionsSection() {
  const rules = useAllowRules();
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const byProject = new Map<string, AllowRule[]>();
  for (const r of rules.data ?? [])
    byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r]);
  return (
    <section className={styles.section}>
      <h1>Permissions</h1>
      <p className={styles.lead}>
        What you chose to <strong>Always allow here</strong> on an approval card. These commands and
        tools run in that project without asking. Serious commands, pushing, publishing and edits
        always ask.
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {rules.isSuccess && byProject.size === 0 && (
        <p className={styles.muted}>
          Nothing yet. Every command asks until you pick Always allow here.
        </p>
      )}
      {[...byProject].map(([projectId, list]) => (
        <section key={projectId} className={styles.block} aria-label={projectId}>
          <h2>{projectId}</h2>
          <ul className={styles.rules}>
            {list.map((r) => (
              <li key={r.rule}>
                <span className={styles.ruleKind}>
                  {r.rule.startsWith('run:') ? 'Command' : 'Tool'}
                </span>
                <span className="mono">{r.rule.replace(/^(run|tool):/, '')}</span>
                <span className={styles.muted}>{relativeTime(r.createdAt, now)}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Remove ${r.rule.replace(/^(run|tool):/, '')}`}
                  onClick={async () => {
                    setError(null);
                    try {
                      await removeAllowRule(r.projectId, r.rule);
                    } catch (e) {
                      setError(e instanceof ApiFailure ? e.message : 'Could not remove it.');
                    }
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

function AppearanceSection() {
  return (
    <section className={styles.section}>
      <h1>Appearance</h1>
      <p className={styles.lead}>
        Pick a theme. It applies at once and is remembered in this browser.
      </p>
      <ThemePicker />
    </section>
  );
}

function Saved({ at }: { at: number | null }) {
  return at ? (
    <span className={styles.saved} role="status">
      <Check size={12} aria-hidden="true" /> Saved
    </span>
  ) : null;
}

function useSave() {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setSavedAt(Date.now());
    } catch (e) {
      setSavedAt(null);
      setError(e instanceof ApiFailure ? e.message : 'Could not save.');
    }
  };
  return { savedAt, error, run };
}

function GeneralSection() {
  const config = useConfig();
  const save = useSave();
  if (!config.data) return null;
  const c = config.data;
  return (
    <section className={styles.section}>
      <h1>General</h1>
      <div className={styles.rows}>
        <label className={styles.row}>
          <span>
            <strong>Default model</strong>
            <span>Used for new chats, calibration, agents and Magnet.</span>
          </span>
          <select
            value={c.claude.defaultModel}
            onChange={(e) =>
              void save.run(() => patchConfig({ claude: { defaultModel: e.target.value } }))
            }
          >
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </label>
        <label className={styles.row}>
          <span>
            <strong>Agents running at once</strong>
            <span>More agents wait in a queue until a slot frees.</span>
          </span>
          <select
            value={c.agents.maxRunning}
            onChange={(e) =>
              void save.run(() => patchConfig({ agents: { maxRunning: Number(e.target.value) } }))
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.row}>
          <span>
            <strong>Claude in Chrome</strong>
            <span>
              Project chats may use your Chrome to open and check the app, through the Claude in
              Chrome extension. It runs without asking; its steps show in Live. Agents never use it.
            </span>
          </span>
          <Switch
            label={c.claude.chrome ? 'On' : 'Off'}
            checked={c.claude.chrome}
            onChange={(v) => void save.run(() => patchConfig({ claude: { chrome: v } }))}
          />
        </div>
        <NotifyRow />
      </div>
      <Saved at={save.savedAt} />
      {save.error && <p className={styles.error}>{save.error}</p>}
    </section>
  );
}

const NOTIFY_HINT: Record<NotifyState, string> = {
  on: 'Agent done or failed, scan done, a decision to approve, an approval, and a chat reply while you are in another tab.',
  off: 'Off in this browser. Cherry still shows toasts and the count in the tab title.',
  ask: 'Your browser asks once. Nothing leaves this machine.',
  blocked: 'Blocked in the browser. Allow notifications for this site in the browser settings.',
  unsupported: 'This browser has no desktop notifications.',
};

function NotifyRow() {
  const [state, setState] = useState<NotifyState>(notifyState);
  return (
    <div className={styles.row}>
      <span>
        <strong>Desktop notifications</strong>
        <span>{NOTIFY_HINT[state]}</span>
      </span>
      <Switch
        label={state === 'on' ? 'On' : 'Off'}
        checked={state === 'on'}
        disabled={state === 'blocked' || state === 'unsupported'}
        onChange={(v) => {
          if (v) void turnOnNotifications().then(setState);
          else {
            turnOffNotifications();
            setState(notifyState());
          }
        }}
      />
    </div>
  );
}

function FolderSection() {
  const config = useConfig();
  const [value, setValue] = useState<string | null>(null);
  const save = useSave();
  if (!config.data) return null;
  const v = value ?? config.data.projectsDir;
  return (
    <section className={styles.section}>
      <h1>New projects folder</h1>
      <p className={styles.lead}>
        Start project creates new projects in{' '}
        <span className="mono">{tildify(config.data.resolvedProjectsDir)}</span>. You can pick
        another place for each one. Cherry does not scan this folder; Home lists only the projects
        you open or create.
      </p>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(() => patchConfig({ projectsDir: v.trim() }));
        }}
      >
        <label className="sr-only" htmlFor="projects-dir">
          New projects folder
        </label>
        <input
          id="projects-dir"
          className="input mono"
          value={v}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary btn-md"
          disabled={!v.trim() || v === config.data.projectsDir}
        >
          Save
        </button>
      </form>
      <Saved at={save.savedAt} />
      {save.error && <p className={styles.error}>{save.error}</p>}
    </section>
  );
}

function HealthRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CheckAgain() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-md"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void recheckHealth().finally(() => setBusy(false));
      }}
    >
      {busy ? 'Checking…' : 'Check again'}
    </button>
  );
}

/** The six stage agents and their skills (ADR-0034). */
function AgentsSection() {
  const stages = useStageInfo().data;
  return (
    <section className={styles.section}>
      <h1>Stage agents</h1>
      <p className={styles.lead}>
        Each stage tab in a project has its own agent and chat. Skills that ship with Cherry are
        marked bundled. To give an agent your own skill, put its folder (with a{' '}
        <span className="mono">SKILL.md</span>) in{' '}
        <span className="mono">~/.cherry/skills/&lt;stage&gt;/</span>; a skill with the same name
        replaces the bundled one. Only the skill folder loads, never hooks or settings.
      </p>
      {stages?.map((s) => (
        <div key={s.stage} className={styles.agent}>
          <div className={styles.agentHead}>
            <strong>
              {s.label}: the {s.name}
            </strong>
            {s.docsOnly && <span className={styles.agentNote}>docs only</span>}
          </div>
          <p>{s.summary}</p>
          {s.skills.length ? (
            <ul className={styles.agentSkills}>
              {s.skills.map((k) => (
                <li key={k.name} title={k.description}>
                  <span className="mono">{k.name}</span>
                  <span className={styles.agentNote}>{k.source}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.agentNote}>
              No skills yet. Add one in <span className="mono">~/.cherry/skills/{s.stage}/</span>.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function ClaudeSection() {
  const h = useHealth().data;
  return (
    <section className={styles.section}>
      <h1>Claude Code</h1>
      <p className={styles.lead}>
        Cherry drives the claude command on this machine. It never sees your login.
      </p>
      {h && (
        <HealthRows
          rows={[
            ['Installed', h.claude.found ? `Yes · ${h.claude.version ?? ''}` : 'No'],
            ['Logged in', h.claude.loggedIn ? 'Yes' : 'No — run claude in a terminal and log in'],
          ]}
        />
      )}
      <CheckAgain />
    </section>
  );
}

function GitHubSection() {
  const h = useHealth().data;
  return (
    <section className={styles.section}>
      <h1>GitHub</h1>
      <p className={styles.lead}>
        Optional. The GitHub CLI (<span className="mono">gh</span>) creates repositories and lists
        pull requests. Without it the GitHub box shows git data only.
      </p>
      {h && (
        <HealthRows
          rows={[
            ['git', h.git.found ? `Yes · ${h.git.version ?? ''}` : 'Not found'],
            ['gh installed', h.gh.found ? 'Yes' : 'No'],
            [
              'gh logged in',
              h.gh.loggedIn ? (
                'Yes'
              ) : (
                <>
                  No — run <span className="mono">gh auth login</span>
                </>
              ),
            ],
          ]}
        />
      )}
      <CheckAgain />
    </section>
  );
}

function ShortcutsSection() {
  const list: [string, string][] = [
    ['Enter', 'Send a message, start an agent, confirm a decision card'],
    ['Shift + Enter', 'New line in the composer'],
    [
      '↑ / ↓',
      'In an empty composer: step through the messages you sent; on a decision card: move between options',
    ],
    ['Esc', 'Stop Claude while it works; close Magnet, a menu or a dialog'],
    ['/', 'Commands in the composer: /clear, /compact, /model, /resume, /permissions …'],
    ['@', 'Mention a project file in the composer'],
    ['Ctrl + V', 'Paste a screenshot as an attachment'],
    ['Ctrl + S', 'Save the file in the built-in editor'],
    ['Tab', 'Indent two spaces in the built-in editor'],
  ];
  return (
    <section className={styles.section}>
      <h1>Shortcuts</h1>
      <dl className={styles.facts}>
        {list.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const AUTHOR = 'Syed Mehedi Hussain';
const AUTHOR_LINKS = [
  {
    label: 'Website',
    text: 'syedmehedihussain.codes',
    href: 'https://syedmehedihussain.codes/',
    icon: <Globe size={16} aria-hidden="true" />,
  },
  {
    label: 'GitHub',
    text: 'github.com/syedmehedihussain',
    href: 'https://github.com/syedmehedihussain',
    icon: <GitHubMark />,
  },
  {
    label: 'Email',
    text: 'syedmehedihussain@gmail.com',
    href: 'mailto:syedmehedihussain@gmail.com',
    icon: <Mail size={16} aria-hidden="true" />,
  },
  {
    label: 'Source code',
    text: 'syedmehedihussain/cherry',
    href: 'https://github.com/syedmehedihussain/cherry',
    icon: <Code2 size={16} aria-hidden="true" />,
  },
];

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function AboutSection() {
  const h = useHealth().data;
  return (
    <section className={styles.section} aria-label="About">
      <div className={styles.aboutHero}>
        <Lockup size={64} tagline />
        <p className={styles.lead}>
          A local workspace that drives Claude Code to plan, document and build your projects.
        </p>
        <span className={styles.aboutMeta}>
          {h?.version ? `Version ${h.version} · ` : ''}MIT licence
        </span>
      </div>

      <section aria-labelledby="made-by" className={styles.block}>
        <h2 id="made-by">A side quest of smh</h2>
        <p className={styles.lead}>
          Designed and built by {AUTHOR}. Questions, ideas or bugs are welcome.
        </p>
        <ul className={styles.links}>
          {AUTHOR_LINKS.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noopener noreferrer">
                <span className={styles.linkIcon}>{l.icon}</span>
                <span className={styles.linkText}>
                  <strong>{l.label}</strong>
                  <span>{l.text}</span>
                </span>
                <ArrowUpRight size={14} aria-hidden="true" className={styles.linkArrow} />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-it-runs" className={styles.block}>
        <h2 id="how-it-runs">How it runs</h2>
        <dl className={styles.facts}>
          <div>
            <dt>Settings</dt>
            <dd className="mono">~/.cherry/config.json</dd>
          </div>
          <div>
            <dt>Magnet&rsquo;s notes</dt>
            <dd className="mono">~/.cherry/magnet/</dd>
          </div>
          <div>
            <dt>Project state</dt>
            <dd>
              <span className="mono">_project/</span> in each project, outside git
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>Listens on 127.0.0.1 only. Talks to Claude and GitHub, nothing else.</dd>
          </div>
        </dl>
      </section>

      <p className={styles.muted}>Built with Claude Code.</p>
    </section>
  );
}

function MagnetSection() {
  const info = useMagnetInfo();
  const now = useNow(60_000);
  const d = info.data;
  return (
    <>
      <div className={styles.hero}>
        <span className={styles.heroAvatar}>
          <MagnetAvatar size={96} />
        </span>
        <div className={styles.heroText}>
          <h1>Magnet</h1>
          <p>
            Your assistant across all projects. He reads everything and changes nothing until you
            approve.
          </p>
        </div>
        {d && (
          <Switch
            checked={d.readOnly}
            label="Read-only mode"
            onChange={(v) => void patchConfig({ magnet: { readOnly: v } })}
          />
        )}
      </div>
      {d && !d.readOnly && (
        <p className={styles.lead}>
          With read-only off, Magnet may also edit its own notes below, each edit shown for your
          approval. Actions on projects always need Approve.
        </p>
      )}
      <div className={styles.stats}>
        <Stat n={d?.stats.projects} label="Projects tracked" />
        <Stat n={d?.stats.sessionsWeek} label="Sessions this week" />
        <Stat n={d?.stats.agentsRun} label="Agents run" />
      </div>
      <section aria-labelledby="knows" className={styles.block}>
        <div className={styles.blockHead}>
          <h2 id="knows">What Magnet knows</h2>
          <span className={styles.muted}>
            Plain Markdown in{' '}
            <span className="mono">{d ? tildify(d.dir) : '~/.cherry/magnet'}/</span>
          </span>
        </div>
        <div className={styles.files}>
          {MAGNET_FILES.map((name) => {
            const f = d?.files.find((x) => x.name === name);
            return f ? (
              <KnowledgeFile
                key={name}
                name={name}
                content={f.content}
                updatedAt={f.updatedAt}
                now={now}
              />
            ) : null;
          })}
        </div>
      </section>
      {d && <UsageBlock usage={d.usage} />}
    </>
  );
}

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <div>
      <span className={styles.statN}>{n ?? '—'}</span>
      <span className={styles.muted}>{label}</span>
    </div>
  );
}

const FILE_HINT: Record<MagnetFileName, string> = {
  'MAGNET.md': 'Personality',
  'me.md': 'About you',
  'work.md': 'Your work',
};

function KnowledgeFile({
  name,
  content,
  updatedAt,
  now,
}: {
  name: MagnetFileName;
  content: string;
  updatedAt: number;
  now: number;
}) {
  const [text, setText] = useState(content);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirty = text !== content;
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      setState('saving');
      saveMagnetFile(name, text).then(
        () => setState('saved'),
        () => setState('error'),
      );
    }, 800);
    return () => window.clearTimeout(t);
  }, [text, dirty, name]);
  const id = `mf-${name}`;
  return (
    <div className={styles.file}>
      <div className={styles.fileHead}>
        <label htmlFor={id} className="mono">
          {name}
        </label>
        <span className={styles.muted}>
          {state === 'saving'
            ? 'Saving…'
            : state === 'error'
              ? 'Could not save'
              : dirty
                ? 'Unsaved'
                : state === 'saved'
                  ? 'Saved'
                  : updatedAt
                    ? `${FILE_HINT[name]} · ${relativeTime(updatedAt, now)}`
                    : FILE_HINT[name]}
        </span>
      </div>
      <textarea
        id={id}
        rows={8}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

function UsageBlock({ usage }: { usage: Usage }) {
  const [weekly, setWeekly] = useState(false);
  const level = (n: number, max: number) =>
    n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(1, max)) * 4));
  const weeks: { label: string; sessions: number }[] = [];
  for (let i = 0; i < usage.days.length; i += 7) {
    const chunk = usage.days.slice(i, i + 7);
    weeks.push({ label: chunk[0]!.day, sessions: chunk.reduce((s, d) => s + d.sessions, 0) });
  }
  const cells = weekly
    ? weeks.map((w) => ({ key: w.label, n: w.sessions, title: `Week of ${w.label}` }))
    : usage.days.map((d) => ({ key: d.day, n: d.sessions, title: d.day }));
  const max = Math.max(...cells.map((c) => c.n), 1);
  const months = [
    ...new Set(
      usage.days
        .filter((d) => d.day.endsWith('-01'))
        .map((d) => new Date(`${d.day}T12:00:00`).toLocaleString('en', { month: 'short' })),
    ),
  ];
  const minutes = Math.round(usage.longestMs / 60_000);
  return (
    <section aria-labelledby="usage" className={styles.block}>
      <h2 id="usage">Usage</h2>
      <div className={styles.usage}>
        <div className={styles.usageStats}>
          <Stat n={usage.sessionsMonth} label="Sessions this month" />
          <div>
            <span className={styles.statN}>{minutes < 1 ? '<1 m' : `${minutes} m`}</span>
            <span className={styles.muted}>Longest task</span>
          </div>
          <div>
            <span className={styles.statN}>
              {usage.currentStreak} day{usage.currentStreak === 1 ? '' : 's'}
            </span>
            <span className={styles.muted}>Current streak</span>
          </div>
          <div>
            <span className={styles.statN}>
              {usage.longestStreak} day{usage.longestStreak === 1 ? '' : 's'}
            </span>
            <span className={styles.muted}>Longest streak</span>
          </div>
        </div>
        <div className={styles.heatHead}>
          <span className={styles.muted}>Days worked, all projects</span>
          <div className={styles.toggle}>
            <button type="button" aria-pressed={!weekly} onClick={() => setWeekly(false)}>
              Daily
            </button>
            <button type="button" aria-pressed={weekly} onClick={() => setWeekly(true)}>
              Weekly
            </button>
          </div>
        </div>
        <div
          className={styles.heat}
          data-weekly={weekly || undefined}
          role="img"
          aria-label="Sessions per day, last 26 weeks"
        >
          {cells.map((c) => (
            <span
              key={c.key}
              title={`${c.title}: ${c.n} session${c.n === 1 ? '' : 's'}`}
              data-level={level(c.n, max)}
            />
          ))}
        </div>
        <div className={styles.heatFoot}>
          <span className={styles.months}>
            {months.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </span>
          <span className={styles.legend}>
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} data-level={l} />
            ))}
            More
          </span>
        </div>
      </div>
    </section>
  );
}
