import { Check, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { useChat, useChatDraft } from '../../api/chat.ts';
import { useStageFocus } from '../../api/stages.ts';
import { useStage } from '../../state/stage.ts';
import { useTasks } from '../../api/workspace.ts';
import { AgentsPanel } from '../../components/AgentsPanel/AgentsPanel.tsx';
import { GitPanel } from '../../components/GitHubBox/GitPanel.tsx';
import { PlanUsage } from '../../components/PlanUsage/PlanUsage.tsx';
import { SourceControl } from '../../components/SourceControl/SourceControl.tsx';
import { LiveView, chromeSteps, currentTurn } from './LiveView.tsx';
import styles from './SidePanel.module.css';

const VIEWS = [
  ['overview', 'Overview'],
  ['live', 'Live'],
  ['github', 'GitHub'],
] as const;

export type View = (typeof VIEWS)[number][0];

const KEY = 'cherry.sideView';

function readView(): View {
  try {
    const v = localStorage.getItem(KEY);
    return VIEWS.some(([id]) => id === v) ? (v as View) : 'overview';
  } catch {
    return 'overview';
  }
}

/** The chosen view stays the same across projects and reloads. */
export const useSideView = create<{ view: View; set(v: View): void }>((set) => ({
  view: readView(),
  set: (view) => {
    try {
      localStorage.setItem(KEY, view);
    } catch {
      // Private window: the choice just isn't remembered.
    }
    set({ view });
  },
}));

/**
 * Right column of the workspace: a row of views, one shown at a time. Agents, Decisions and
 * Notes & Tasks are tabs in the centre.
 */
export function SidePanel({
  projectId,
  branch,
  now,
}: {
  projectId: string;
  branch: string | null;
  now: number;
}) {
  const view = useSideView((s) => s.view);
  const setView = useSideView((s) => s.set);
  const label = VIEWS.find(([id]) => id === view)?.[1];
  const stage = useStage(projectId);
  const chat = useChat(projectId, stage).data;
  const working = !!chat?.running;
  // Chrome started in this reply: show its steps in Live, once per turn (ADR-0038).
  const items = chat?.items ?? [];
  const turnNow = currentTurn(items, working);
  const chromeNow = !!turnNow && chromeSteps(items).at(-1)?.turnId === turnNow;
  const shownTurn = useRef<string | null>(null);
  useEffect(() => {
    if (chromeNow && turnNow && shownTurn.current !== turnNow) {
      shownTurn.current = turnNow;
      setView('live');
    }
  }, [chromeNow, turnNow, setView]);
  const navigate = useNavigate();
  const base = `/p/${encodeURIComponent(projectId)}`;
  const openNotes = () => void navigate(`${base}/notes`);
  const openAgents = () => void navigate(`${base}/agents`);
  const openChat = () => void navigate(base);

  return (
    <>
      <nav className={styles.views} role="tablist" aria-label="Side panel">
        {VIEWS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={styles.view}
            onClick={() => setView(id)}
          >
            {name}
            {id === 'live' && working && (
              <span className={styles.liveDot} aria-label="Claude is working" />
            )}
          </button>
        ))}
      </nav>
      <div className={styles.body} role="tabpanel" aria-label={label}>
        {view === 'overview' && (
          <>
            <div className={styles.pad}>
              {stage === 'preparation' && <Readiness projectId={projectId} onOpenChat={openChat} />}
              <GitPanel key={projectId} projectId={projectId} now={now} collapsible />
              <PlanUsage now={now} />
              <TasksLine projectId={projectId} onOpen={openNotes} />
            </div>
            <AgentsPanel
              projectId={projectId}
              branch={branch}
              now={now}
              limit={3}
              onSeeAll={openAgents}
              kinds
              onDone={(kind) => (kind === 'agent' ? openAgents() : openNotes())}
            />
          </>
        )}
        {view === 'live' && <LiveView projectId={projectId} now={now} onOpenAgents={openAgents} />}
        {view === 'github' && (
          <div className={styles.scroll}>
            <GitPanel key={projectId} projectId={projectId} now={now} full />
            <SourceControl key={`commits-${projectId}`} projectId={projectId} />
          </div>
        )}
      </div>
    </>
  );
}

/** One line on the Overview: how far the task list is, and what is next. */
function TasksLine({ projectId, onOpen }: { projectId: string; onOpen(): void }) {
  const tasks = useTasks(projectId);
  const list = tasks.data?.tasks ?? [];
  if (list.length === 0) return null;
  const done = list.filter((t) => t.status === 'done' || t.status === 'skipped').length;
  const next = list.find((t) => t.status === 'doing') ?? list.find((t) => t.status === 'todo');
  return (
    <button type="button" className={styles.tasks} onClick={onOpen}>
      <span className={styles.tasksCount}>
        {done}/{list.length} tasks
      </span>
      <span className={styles.tasksNext} title={next?.title}>
        {next ? `Next: ${next.title}` : 'All done'}
      </span>
      <ChevronRight size={13} aria-hidden="true" />
    </button>
  );
}

/** Preparation: a quick, file-only readiness check (ADR-0034); the Preparer fixes on request. */
function Readiness({ projectId, onOpenChat }: { projectId: string; onOpenChat(): void }) {
  const items = useStageFocus(projectId, 'preparation').data?.readiness ?? [];
  const setDraft = useChatDraft((s) => s.set);
  if (!items.length) return null;
  const missing = items.filter((i) => !i.ok);
  return (
    <section className={styles.readiness} aria-label="Readiness">
      <div className={styles.readinessHead}>
        <span className="label">Readiness</span>
        <span className={styles.readinessCount}>
          {items.length - missing.length}/{items.length}
        </span>
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.id} data-ok={i.ok || undefined} title={i.detail}>
            {i.ok ? <Check size={12} aria-label="ready" /> : <X size={12} aria-label="missing" />}
            {i.label}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setDraft(
              projectId,
              `Run the project-readiness check and set up what is missing. Cherry's quick check found: ${missing.map((m) => m.label).join(', ')}.`,
            );
            onOpenChat();
          }}
        >
          Ask the Preparer to fix
        </button>
      )}
    </section>
  );
}
