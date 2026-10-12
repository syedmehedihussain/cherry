import { ArrowUpRight, Play, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiFailure } from '../../api/client.ts';
import { startRun, stopRun, useRun } from '../../api/run.ts';
import { shortUrl } from '../../components/RunButton/RunButton.tsx';
import styles from './RunTab.module.css';

/** The project's app on localhost: its command, address, Stop / Restart and the live output. */
export function RunTab({ projectId }: { projectId: string }) {
  const run = useRun(projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const out = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const s = run.data;

  // Follow new output unless the user scrolled up to read.
  useEffect(() => {
    const el = out.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [s?.output]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (run.isError) return <p className={styles.message}>{(run.error as Error).message}</p>;
  if (!s) return null;
  const others =
    s.servers.length > 0 ? (
      <div className={styles.others}>
        <span>Already running from this folder:</span>
        {s.servers.map((x) => (
          <a key={x.port} href={x.url} target="_blank" rel="noopener noreferrer" title={x.command}>
            {shortUrl(x.url)}
            <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
          </a>
        ))}
      </div>
    ) : null;
  if (!s.command)
    return (
      <>
        {others}
        <p className={styles.message}>
          Cherry runs websites only: a dev server script in package.json, Django, Flask, FastAPI, a
          Rust or Go web server, or a static index.html. It found none here.
        </p>
      </>
    );

  return (
    <div className={styles.run}>
      <div className={styles.bar}>
        <span className={styles.state} data-running={s.running || undefined}>
          <span className={styles.dot} aria-hidden="true" />
          {s.running
            ? 'Running'
            : s.exitCode === 0
              ? 'Finished'
              : s.exitCode !== null
                ? `Exited with code ${s.exitCode}`
                : s.startedAt
                  ? 'Stopped'
                  : 'Not running'}
        </span>
        <code className={styles.command} title={s.source ?? undefined}>
          {s.command}
        </code>
        <span className={styles.spacer} />
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
        {s.running && s.url && (
          <a className="btn btn-primary" href={s.url} target="_blank" rel="noopener noreferrer">
            Open {shortUrl(s.url)}
            <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
          </a>
        )}
        {s.running ? (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await stopRun(projectId);
                  await startRun(projectId);
                })
              }
            >
              <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
              Restart
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void act(() => stopRun(projectId))}
            >
              <Square size={11} strokeWidth={2} aria-hidden="true" />
              Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void act(() => startRun(projectId))}
          >
            <Play size={12} strokeWidth={2} aria-hidden="true" />
            Run
          </button>
        )}
      </div>
      {others}
      <pre
        ref={out}
        className={styles.output}
        role="log"
        aria-label="App output"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {s.output || `Press Run to start ${s.command}.`}
      </pre>
    </div>
  );
}
