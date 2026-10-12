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
  if (!s.command)
    return (
      <p className={styles.message}>
        Cherry could not find how to run this project. It looks for a dev or start script in
        package.json, manage.py, a Makefile, Cargo.toml, go.mod or an index.html.
      </p>
    );

  return (
    <div className={styles.run}>
      <div className={styles.bar}>
        <span className={styles.state} data-running={s.running || undefined}>
          <span className={styles.dot} aria-hidden="true" />
          {s.running
            ? 'Running'
            : s.exitCode !== null
              ? `Stopped (exit ${s.exitCode})`
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
