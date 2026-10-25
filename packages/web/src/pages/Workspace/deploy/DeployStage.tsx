import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  FlaskConical,
  Globe,
  Monitor,
  Play,
  RefreshCw,
  Rocket,
  Smartphone,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { relativeTime, type Check, type DeployInfo } from '@cherry/shared';
import { sendChat, useChat } from '../../../api/chat.ts';
import { ApiFailure } from '../../../api/client.ts';
import {
  runChecks,
  startBrowserTest,
  stopBrowserTest,
  useBrowserTest,
  useChecks,
  useDeployInfo,
  useLiveBrowserTest,
  useLiveChecks,
} from '../../../api/deploy.ts';
import { BrowserTestSection, stepFixMessage } from './BrowserTest.tsx';
import { startRun, stopRun, useRun } from '../../../api/run.ts';
import { shortUrl } from '../../../lib/paths.ts';
import { useStages } from '../../../state/stage.ts';
import { ChatTab, readMode } from '../ChatTab.tsx';
import styles from './DeployStage.module.css';

const PHONE = { w: 375, h: 812 };

/** What the Builder gets from Fix in Development: the check, its command and its output. */
export function fixMessage(c: Check): string {
  const tail = c.output.split('\n').slice(-60).join('\n');
  return `The ${c.label.toLowerCase()} check fails in the Deployment cockpit. Command: \`${c.command}\`. Find the cause, fix it, and run the command again until it passes.\n\nOutput (end):\n\`\`\`\n${tail}\n\`\`\``;
}

/** What the Shipper gets from Deploy: what, where, and the limits. */
export function deployMessage(info: DeployInfo): string {
  const version = info.version ? `version ${info.version}` : 'the current commit';
  return `Deploy ${version} to ${info.target.label}${info.repo ? ` (${info.repo})` : ''}. Use your deploy skill for this target. Check first that the checks pass and the CHANGELOG has this version. Ask before each push or publish. When it is done, say the address and the tag in two lines.`;
}

/**
 * Deployment (V3 r10, artboard 04): the cockpit. Run and preview the app on the left; the
 * checks, the browser test (r11) and the deploy target on the right; Deploy asks once.
 */
export function DeployStage({ projectId, now }: { projectId: string; now: number }) {
  const app = useRun(projectId).data;
  const checks = useChecks(projectId).data;
  useLiveChecks(projectId);
  const info = useDeployInfo(projectId).data;
  const test = useBrowserTest(projectId).data;
  useLiveBrowserTest(projectId);
  const shipping = !!useChat(projectId, 'deployment').data?.running;
  const [device, setDevice] = useState<'phone' | 'desktop'>('desktop');
  const [side, setSide] = useState<'cockpit' | 'shipper'>('cockpit');
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const setStage = useStages((s) => s.set);
  const url = app?.running ? app.url : (app?.servers[0]?.url ?? null);

  const list = checks?.checks ?? [];
  // The browser test counts as one more check once it has run (artboard 04).
  const testFailed = test?.steps.filter((s) => !s.ok).length ?? 0;
  const testState: Check['status'] | null =
    !test || test.status === 'idle'
      ? null
      : test.status === 'running'
        ? 'running'
        : test.status === 'done' && !testFailed
          ? 'pass'
          : test.status === 'stopped'
            ? 'idle'
            : 'fail';
  const states = [...list.map((c) => c.status), ...(testState ? [testState] : [])];
  const passed = states.filter((st) => st === 'pass').length;
  const failed = states.filter((st) => st === 'fail').length;
  const running = list.some((c) => c.status === 'running');
  const checked = states.some((st) => st === 'pass' || st === 'fail');
  const testing = test?.status === 'running';
  const runTest = () => {
    if (!url) return;
    setError(null);
    void startBrowserTest(projectId, url).catch((e: unknown) =>
      setError(e instanceof ApiFailure ? e.message : 'Could not start the browser test.'),
    );
  };
  const headline = running
    ? 'Checking…'
    : !checked
      ? 'Not checked yet'
      : failed
        ? 'Almost ready'
        : 'Ready to ship';

  const fix = async (c: Check) => {
    setError(null);
    try {
      await sendChat(projectId, 'development', fixMessage(c), readMode(projectId, 'development'));
      setStage(projectId, 'development');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Could not send it to the Builder.');
    }
  };

  return (
    <div className={styles.cockpit}>
      <section className={styles.main} aria-label="Preview">
        <div className={styles.bar}>
          {app?.running ? (
            <span className={styles.runPill} data-on>
              <span className={styles.live} aria-hidden="true" />
              Running <span className={styles.cmd}>{app.command}</span>
              <button
                type="button"
                className={styles.stop}
                aria-label="Stop the app"
                onClick={() => void stopRun(projectId).catch(() => undefined)}
              >
                <Square size={9} fill="currentColor" aria-hidden="true" />
              </button>
            </span>
          ) : app?.command ? (
            <button
              type="button"
              className={styles.runPill}
              onClick={() => void startRun(projectId).catch(() => undefined)}
              title={app.command}
            >
              <Play size={12} aria-hidden="true" />
              Run <span className={styles.cmd}>{app.command}</span>
            </button>
          ) : (
            <span className={styles.runPill} title="Cherry cannot tell how to start this project">
              No run command
            </span>
          )}
          <div className={styles.url}>
            <Globe size={13} aria-hidden="true" />
            <span className={styles.urlText}>{url ?? 'not running'}</span>
            {url && (
              <>
                <button
                  type="button"
                  className={styles.icon}
                  aria-label="Reload the preview"
                  onClick={() => setReload((n) => n + 1)}
                >
                  <RefreshCw size={13} aria-hidden="true" />
                </button>
                <a
                  className={styles.icon}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${shortUrl(url)} in a new tab`}
                >
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </>
            )}
          </div>
          <div className={styles.seg}>
            <button
              type="button"
              aria-pressed={device === 'phone'}
              onClick={() => setDevice('phone')}
            >
              <Smartphone size={13} aria-hidden="true" />
              Phone
            </button>
            <button
              type="button"
              aria-pressed={device === 'desktop'}
              onClick={() => setDevice('desktop')}
            >
              <Monitor size={13} aria-hidden="true" />
              Desktop
            </button>
          </div>
          <span className={styles.grow} />
          {testing ? (
            <button
              type="button"
              className={styles.testBtn}
              onClick={() => void stopBrowserTest(projectId).catch(() => undefined)}
            >
              <Square size={10} fill="currentColor" aria-hidden="true" />
              Stop test
            </button>
          ) : (
            <button
              type="button"
              className={styles.testBtn}
              disabled={!url || !!test?.blocked}
              title={
                test?.blocked ??
                (url
                  ? 'Claude in Chrome walks through the app from the test plan'
                  : 'Run the app first')
              }
              onClick={runTest}
            >
              <FlaskConical size={13} aria-hidden="true" />
              Test
            </button>
          )}
          <button
            type="button"
            className={styles.deploy}
            disabled={!info}
            onClick={() => setConfirm(true)}
          >
            <Rocket size={13} aria-hidden="true" />
            Deploy
          </button>
        </div>
        <Preview url={url} device={device} reload={reload} />
        <div className={styles.foot}>
          <span>{device === 'phone' ? `${PHONE.w} × ${PHONE.h}` : 'fills the space'}</span>
          {app?.running && app.startedAt && <span>· up {relativeTime(app.startedAt, now)}</span>}
        </div>
      </section>

      <aside className={styles.side} aria-label="Checks and deploy">
        <div className={styles.sideTabs} role="tablist" aria-label="Cockpit side">
          <button
            type="button"
            role="tab"
            aria-selected={side === 'cockpit'}
            onClick={() => setSide('cockpit')}
          >
            Checks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={side === 'shipper'}
            onClick={() => setSide('shipper')}
          >
            Shipper
            {shipping && <span className={styles.live} aria-label="working" />}
          </button>
        </div>
        {side === 'shipper' ? (
          <div className={styles.chat}>
            <ChatTab projectId={projectId} stage="deployment" now={now} />
          </div>
        ) : (
          <div className={styles.sideScroll}>
            <div className={styles.summary}>
              <h2>{headline}</h2>
              <p>
                {states.length
                  ? `${passed} of ${states.length} check${states.length === 1 ? '' : 's'} pass${states.length === 1 ? 'es' : ''}.${testFailed ? ` ${testFailed} browser step${testFailed === 1 ? '' : 's'} failed.` : ''}`
                  : (checks?.none ?? 'Looking for checks…')}
              </p>
              {states.length > 0 && (
                <div className={styles.segments} aria-hidden="true">
                  {states.map((st, i) => (
                    <i key={i} data-status={st} />
                  ))}
                </div>
              )}
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <Section
              label="Checks"
              action={
                list.length > 0 && (
                  <button
                    type="button"
                    className={styles.link}
                    disabled={running}
                    onClick={() => void runChecks(projectId)}
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    Run all
                  </button>
                )
              }
            >
              {list.length === 0 && checks?.none && <p className={styles.muted}>{checks.none}</p>}
              <ul className={styles.checks} aria-label="Checks">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={styles.check}
                      data-status={c.status}
                      aria-expanded={open === c.id}
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                    >
                      <CheckIcon status={c.status} />
                      <span className={styles.checkLabel}>{c.label}</span>
                      <span className={styles.checkMeta}>
                        {c.status === 'running'
                          ? 'running…'
                          : (c.summary ??
                            (c.durationMs !== null ? `${(c.durationMs / 1000).toFixed(1)}s` : ''))}
                      </span>
                    </button>
                    {c.status === 'fail' && (
                      <div className={styles.fixRow}>
                        <button type="button" className={styles.fix} onClick={() => void fix(c)}>
                          <ArrowRight size={12} aria-hidden="true" />
                          Fix in Development
                        </button>
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => void runChecks(projectId, [c.id])}
                        >
                          Run again
                        </button>
                      </div>
                    )}
                    {open === c.id && (
                      <pre className={styles.output} aria-label={`${c.label} output`}>
                        {c.output || `$ ${c.command}\n(not run yet)`}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
            {test && (
              <BrowserTestSection
                projectId={projectId}
                test={test}
                onRun={runTest}
                onFix={(step) => {
                  setError(null);
                  void sendChat(
                    projectId,
                    'development',
                    stepFixMessage(test, step),
                    readMode(projectId, 'development'),
                  )
                    .then(() => setStage(projectId, 'development'))
                    .catch((e: unknown) =>
                      setError(e instanceof ApiFailure ? e.message : 'Could not send it.'),
                    );
                }}
              />
            )}
            {info && <DeploySection info={info} now={now} />}
          </div>
        )}
      </aside>

      {confirm && info && (
        <DeployConfirm
          info={info}
          failed={failed}
          onCancel={() => setConfirm(false)}
          onDeploy={async () => {
            await sendChat(projectId, 'deployment', deployMessage(info), 'ask');
            setConfirm(false);
            setSide('shipper');
          }}
        />
      )}
    </div>
  );
}

function CheckIcon({ status }: { status: Check['status'] }) {
  if (status === 'pass') return <CircleCheck size={15} className={styles.ok} aria-label="passed" />;
  if (status === 'fail') return <CircleX size={15} className={styles.bad} aria-label="failed" />;
  if (status === 'running') return <span className="spinner" style={{ width: 13, height: 13 }} />;
  return <CircleDashed size={15} className={styles.idle} aria-label="not run" />;
}

/** The app in a frame: phone size centred, or the whole space. */
function Preview({
  url,
  device,
  reload,
}: {
  url: string | null;
  device: 'phone' | 'desktop';
  reload: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el || device !== 'phone') return;
    const ro = new ResizeObserver(() =>
      setScale(Math.min(1, (el.clientHeight - 48) / PHONE.h, (el.clientWidth - 48) / PHONE.w)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);
  if (!url)
    return (
      <div className={styles.preview} ref={box}>
        <p className={styles.empty}>
          The app is not running. Run starts it on localhost, and it shows here.
        </p>
      </div>
    );
  const frame = (
    <iframe
      key={`${url}-${reload}`}
      title="App preview"
      src={url}
      className={styles.frame}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
  return (
    <div className={styles.preview} ref={box} data-device={device}>
      {device === 'phone' ? (
        <div
          className={styles.phone}
          style={{ width: PHONE.w, height: PHONE.h, transform: `scale(${scale})` }}
        >
          {frame}
        </div>
      ) : (
        frame
      )}
    </div>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-label={label}>
      <div className={styles.sectionHead}>
        <span className={styles.label}>{label}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

function DeploySection({ info, now }: { info: DeployInfo; now: number }) {
  return (
    <Section
      label="Deploy"
      action={
        <span className={styles.tag}>
          {info.last ? `last ${relativeTime(info.last.at, now)}` : 'first deploy'}
        </span>
      }
    >
      <dl className={styles.facts}>
        <dt>Target</dt>
        <dd title={info.target.source}>{info.target.label}</dd>
        <dt>Repo</dt>
        <dd className={styles.mono}>{info.repo ?? 'no GitHub remote'}</dd>
        <dt>Version</dt>
        <dd className={styles.mono}>{info.version ?? '—'}</dd>
        {info.last && (
          <>
            <dt>Last</dt>
            <dd className={styles.mono}>{info.last.tag}</dd>
          </>
        )}
      </dl>
    </Section>
  );
}

/** Deploy leaves the machine, so it asks once with what, where and the version (r10). */
function DeployConfirm({
  info,
  failed,
  onCancel,
  onDeploy,
}: {
  info: DeployInfo;
  failed: number;
  onCancel(): void;
  onDeploy(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.scrim} onMouseDown={() => !busy && onCancel()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="Deploy"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Deploy {info.version ? `v${info.version}` : 'this commit'}?</h2>
        <dl className={styles.facts}>
          <dt>What</dt>
          <dd>
            {info.version ? `Version ${info.version}` : 'The current commit'}
            {info.branch ? ` from ${info.branch}` : ''}
          </dd>
          <dt>Where</dt>
          <dd>
            {info.target.label}
            {info.repo ? ` · ${info.repo}` : ''}
          </dd>
          <dt>How</dt>
          <dd>The Shipper does it in the Deployment chat, with its deploy skill.</dd>
        </dl>
        {(failed > 0 || info.changes > 0) && (
          <p className={styles.warn}>
            {failed > 0 && `${failed} check${failed === 1 ? '' : 's'} failed. `}
            {info.changes > 0 &&
              `${info.changes} file${info.changes === 1 ? ' is' : 's are'} not committed.`}
          </p>
        )}
        <p className={styles.note}>
          It leaves this computer. Claude asks once more in the chat before each push or publish.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogFoot}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            autoFocus
            onClick={() => {
              setBusy(true);
              setError(null);
              void onDeploy()
                .catch((e: unknown) =>
                  setError(e instanceof ApiFailure ? e.message : 'Could not start the deploy.'),
                )
                .finally(() => setBusy(false));
            }}
          >
            <Rocket size={13} aria-hidden="true" />
            Deploy
          </button>
        </div>
      </div>
    </div>
  );
}
