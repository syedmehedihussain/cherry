import { Play } from 'lucide-react';
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
 * Play button before the Status pill. Hidden when Cherry cannot tell how to run the project.
 * Idle, a click starts the app; running, it shows the address and opens the Run tab.
 */
export function RunButton({ state, active, busy, onRun, onOpen }: RunButtonProps) {
  if (!state?.command) return null;
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
