import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useChat } from '../../api/chat.ts';
import { useTasks } from '../../api/workspace.ts';
import { AgentsPanel } from '../../components/AgentsPanel/AgentsPanel.tsx';
import { Decisions, usePendingDecisions } from '../../components/Decisions/Decisions.tsx';
import { GitPanel } from '../../components/GitHubBox/GitPanel.tsx';
import { PlanUsage } from '../../components/PlanUsage/PlanUsage.tsx';
import { ReadyToCommit } from '../../components/ReadyToCommit/ReadyToCommit.tsx';
import { LiveView } from './LiveView.tsx';
import { NotesEditor, TaskList } from './NotesTab.tsx';
import styles from './SidePanel.module.css';
import ws from './Workspace.module.css';

const VIEWS = [
  ['overview', 'Overview'],
  ['live', 'Live'],
  ['github', 'GitHub'],
  ['decisions', 'Decisions'],
  ['agents', 'Agents'],
  ['notes', 'Notes'],
] as const;

type View = (typeof VIEWS)[number][0];

/** Views behind the More button, so the row stays short. */
const MORE: readonly View[] = ['agents', 'notes'];

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
const useSideView = create<{ view: View; set(v: View): void }>((set) => ({
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

/** Right column of the workspace: a row of views, one shown at a time. */
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
  const working = !!useChat(projectId).data?.running;
  const pending = usePendingDecisions(projectId);

  return (
    <>
      <nav className={styles.views} role="tablist" aria-label="Side panel">
        {VIEWS.filter(([id]) => !MORE.includes(id)).map(([id, name]) => (
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
            {id === 'decisions' && pending > 0 && (
              <span className={styles.badge} aria-label={`${pending} pending`}>
                {pending}
              </span>
            )}
          </button>
        ))}
        <MoreViews view={view} onPick={setView} />
      </nav>
      <div className={styles.body} role="tabpanel" aria-label={label}>
        {view === 'overview' && (
          <>
            <div className={styles.pad}>
              <GitPanel key={projectId} projectId={projectId} now={now} collapsible />
              <PlanUsage now={now} />
              <TasksLine projectId={projectId} onOpen={() => setView('notes')} />
            </div>
            <AgentsPanel
              projectId={projectId}
              branch={branch}
              now={now}
              limit={3}
              onSeeAll={() => setView('agents')}
              kinds
              onDone={(kind) => setView(kind === 'agent' ? 'agents' : 'notes')}
            />
          </>
        )}
        {view === 'live' && (
          <LiveView projectId={projectId} now={now} onOpenAgents={() => setView('agents')} />
        )}
        {view === 'github' && (
          <div className={styles.scroll}>
            <GitPanel key={projectId} projectId={projectId} now={now} full />
            <ReadyToCommit key={`commits-${projectId}`} projectId={projectId} />
          </div>
        )}
        {view === 'agents' && <AgentsPanel projectId={projectId} branch={branch} now={now} />}
        {view === 'decisions' && <Decisions projectId={projectId} />}
        {view === 'notes' && (
          <div className={ws.notes} data-stacked>
            <TaskList projectId={projectId} />
            <NotesEditor projectId={projectId} />
          </div>
        )}
      </div>
    </>
  );
}

/** The last tab: "More", or the name of the extra view that is open. Opens a menu of them. */
function MoreViews({ view, onPick }: { view: View; onPick(v: View): void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = MORE.includes(view) ? VIEWS.find(([id]) => id === view)?.[1] : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.moreWrap} ref={wrap}>
      <button
        type="button"
        role="tab"
        aria-selected={!!current}
        aria-haspopup="menu"
        aria-expanded={open}
        className={styles.view}
        onClick={() => setOpen(!open)}
      >
        {current ?? 'More'}
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className={styles.moreIcon} />
      </button>
      {open && (
        <div className={styles.moreMenu} role="menu" aria-label="More views">
          {VIEWS.filter(([id]) => MORE.includes(id)).map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={view === id}
              onClick={() => {
                onPick(id);
                setOpen(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
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
