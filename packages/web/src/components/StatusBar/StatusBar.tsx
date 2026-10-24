import { ArrowUpRight, GitBranch, Play } from 'lucide-react';
import { MODELS, type GitSummary, type RunState } from '@cherry/shared';
import { usePlanUsage } from '../../api/queries.ts';
import { shortUrl } from '../RunButton/RunButton.tsx';
import { useClaudeState } from '../TopBar/TopBar.tsx';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  git: GitSummary | null | undefined;
  /** The stage agent's name ("Planner"). */
  agent: string | undefined;
  model: string | undefined;
  /** Context used after the last reply (V2.1 w7.3). */
  context: { used: number; window: number } | null;
  /** The app Cherry runs (ADR-0024); undefined while loading. */
  app: RunState | undefined;
  onGit(): void;
  /** Starts the app. */
  onRun(): void;
  /** Opens the Run view with the app's output. */
  onOpenRun(): void;
  onUsage(): void;
  onPalette(): void;
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * The V3 status bar (ADR-0045): branch and changes, the running app, the agent, model, context
 * and plan use. Each item opens the matching view.
 */
export function StatusBar({
  git,
  agent,
  model,
  context,
  app,
  onGit,
  onRun,
  onOpenRun,
  onUsage,
  onPalette,
}: StatusBarProps) {
  const usage = usePlanUsage().data;
  const claude = useClaudeState();
  const ctx = context ? pct((context.used / context.window) * 100) : null;
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  return (
    <footer className={styles.bar} aria-label="Status bar">
      {git?.branch ? (
        <>
          <button type="button" className={styles.it} onClick={onGit} title="Open GitHub">
            <GitBranch size={12} aria-hidden="true" />
            {git.branch}
          </button>
          {git.remote && (
            <button
              type="button"
              className={styles.it}
              onClick={onGit}
              title={`${git.ahead} to push, ${git.behind} to pull`}
            >
              ↑{git.ahead} ↓{git.behind}
            </button>
          )}
          <button type="button" className={styles.it} onClick={onGit} title="Uncommitted files">
            {git.changes ? <span className={styles.changed}>{git.changes} changed</span> : 'clean'}
          </button>
        </>
      ) : (
        <span className={styles.it}>no git</span>
      )}
      <RunItem app={app} onRun={onRun} onOpen={onOpenRun} />
      <span className={styles.grow} />
      {agent && <span className={`${styles.it} ${styles.agent}`}>{agent}</span>}
      {modelLabel && <span className={styles.it}>{modelLabel}</span>}
      {ctx !== null && (
        <span className={styles.it} title="Context used" data-high={ctx >= 70 || undefined}>
          ctx
          <span className={styles.meter} aria-hidden="true">
            <i style={{ width: `${ctx}%` }} />
          </span>
          {ctx}%
        </span>
      )}
      {usage?.available && (usage.fiveHour || usage.week) && (
        <button type="button" className={styles.it} onClick={onUsage} title="Claude Code usage">
          {[
            usage.fiveHour && `5h ${pct(usage.fiveHour.usedPercent)}%`,
            usage.week && `wk ${pct(usage.week.usedPercent)}%`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </button>
      )}
      <span className={styles.it} title={claude === 'ok' ? 'Claude Code is ready' : undefined}>
        <span className={styles.dot} data-state={claude} aria-hidden="true" />
        Claude Code
      </span>
      <button type="button" className={styles.it} onClick={onPalette} title="Command palette">
        Ctrl K
      </button>
    </footer>
  );
}

/**
 * The app on localhost (ADR-0024): Run when idle, its address while running, or a link to a
 * site already up from this folder (Claude or a terminal started it).
 */
function RunItem({
  app,
  onRun,
  onOpen,
}: {
  app: RunState | undefined;
  onRun(): void;
  onOpen(): void;
}) {
  if (!app) return null;
  const other = app.servers[0];
  if (app.running)
    return (
      <button
        type="button"
        className={styles.it}
        aria-label={`App running${app.url ? ` at ${shortUrl(app.url)}` : ''}. Open the Run tab`}
        title={app.command ?? undefined}
        onClick={onOpen}
      >
        <span className={styles.live} aria-hidden="true" />
        {app.url ? shortUrl(app.url) : 'starting…'}
      </button>
    );
  if (other)
    return (
      <a
        className={styles.it}
        href={other.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${shortUrl(other.url)} in a new tab. Already running: ${other.command}`}
        title={`Already running: ${other.command}`}
      >
        <span className={styles.live} aria-hidden="true" />
        {shortUrl(other.url)}
        <ArrowUpRight size={11} aria-hidden="true" />
      </a>
    );
  if (!app.command) return null;
  return (
    <button
      type="button"
      className={styles.it}
      aria-label="Run the app on localhost"
      title={`Run: ${app.command}`}
      onClick={onRun}
    >
      <Play size={10} aria-hidden="true" />
      Run
    </button>
  );
}
