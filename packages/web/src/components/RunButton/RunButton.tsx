import { ArrowUpRight, Play } from 'lucide-react';
import type { RunState } from '@cherry/shared';
import styles from './RunButton.module.css';

interface RunButtonProps {
  /** undefined while loading. */
  state: RunState | undefined;
  /** The Run tab is the open tab. */
  active?: boolean;
  busy?: boolean;
  onRun(): void;
  onOpen(): void;
}

/** Shows the address without the scheme: "localhost:5173". */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Play button before the Status pill. Running, it shows the address and opens the Run tab. When
 * a site is already up from this folder (Claude or a terminal started it), it is a link to it
 * in a new tab. Idle, a click starts the app. Hidden when there is nothing to run or open.
 */
export function RunButton({ state, active, busy, onRun, onOpen }: RunButtonProps) {
  if (!state) return null;
  const other = state.servers[0];
  if (!state.running && other)
    return (
      <a
        className={styles.run}
        data-running
        href={other.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${shortUrl(other.url)} in a new tab. Already running: ${other.command}`}
        title={`Already running: ${other.command}`}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>{shortUrl(other.url)}</span>
        <ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" className={styles.arrow} />
      </a>
    );
  if (!state.command) return null;
  if (state.running)
    return (
      <button
        type="button"
        className={styles.run}
        data-running
        aria-pressed={!!active}
        aria-label={`App running${state.url ? ` at ${shortUrl(state.url)}` : ''}. Open the Run tab`}
        title={state.command}
        onClick={onOpen}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>{state.url ? shortUrl(state.url) : 'Starting…'}</span>
      </button>
    );
  return (
    <button
      type="button"
      className={styles.run}
      aria-pressed={!!active}
      aria-label="Run the app on localhost"
      title={`Run: ${state.command}`}
      disabled={busy}
      onClick={onRun}
    >
      <Play size={11} strokeWidth={2.2} aria-hidden="true" className={styles.icon} />
      <span className={styles.text}>Run</span>
    </button>
  );
}
