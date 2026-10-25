import {
  Activity,
  GitPullRequest,
  LayoutDashboard,
  MessageSquare,
  PanelRight,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { useChat } from '../../api/chat.ts';
import { useStage } from '../../state/stage.ts';
import { AgentsPanel, QuickAdd } from '../../components/AgentsPanel/AgentsPanel.tsx';
import { MagnetChat } from '../../components/MagnetChat/MagnetChat.tsx';
import { GitPanel } from '../../components/GitHubBox/GitPanel.tsx';
import { PlanUsage } from '../../components/PlanUsage/PlanUsage.tsx';
import { SourceControl } from '../../components/SourceControl/SourceControl.tsx';
import { LiveView } from './LiveView.tsx';
import { StageProgressCard } from './StageProgress.tsx';
import styles from './SidePanel.module.css';

const VIEWS = [
  ['overview', 'Overview', LayoutDashboard],
  ['live', 'Live', Activity],
  ['github', 'GitHub', GitPullRequest],
  ['chat', 'Chat', MessageSquare],
] as const;

export type View = (typeof VIEWS)[number][0];

const KEY = 'cherry.sideView';
const OPEN_KEY = 'cherry.rail';

function readView(): View {
  try {
    const v = localStorage.getItem(KEY);
    return VIEWS.some(([id]) => id === v) ? (v as View) : 'overview';
  } catch {
    return 'overview';
  }
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'open';
  } catch {
    return false;
  }
}

function keep(view: View, open: boolean) {
  try {
    localStorage.setItem(KEY, view);
    localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // Private window: the choice just isn't remembered.
  }
}

/**
 * The right rail (ADR-0045): closed by default, the choice kept per browser. `set` opens a
 * view; a second click on the open view's icon closes it; Ctrl+B toggles.
 */
export const useSideView = create<{
  view: View;
  open: boolean;
  set(v: View): void;
  click(v: View): void;
  toggle(): void;
  close(): void;
}>((set, get) => ({
  view: readView(),
  open: readOpen(),
  set: (view) => {
    keep(view, true);
    set({ view, open: true });
  },
  click: (view) => {
    const open = !(get().open && get().view === view);
    keep(view, open);
    set({ view, open });
  },
  toggle: () => {
    const open = !get().open;
    keep(get().view, open);
    set({ open });
  },
  close: () => {
    keep(get().view, false);
    set({ open: false });
  },
}));

/** The rail's icons, at the far right of every stage. */
export function Rail({ projectId }: { projectId: string }) {
  const { view, open, click, toggle } = useSideView();
  const stage = useStage(projectId);
  const working = !!useChat(projectId, stage).data?.running;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return (
    <nav className={styles.rail} aria-label="Side views">
      {VIEWS.map(([id, name, Icon]) => (
        <button
          key={id}
          type="button"
          className={styles.railBtn}
          aria-label={name}
          aria-pressed={open && view === id}
          title={name}
          onClick={() => click(id)}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
          {id === 'live' && working && (
            <span className={styles.liveDot} aria-label="Claude is working" />
          )}
        </button>
      ))}
      <span className={styles.railSpacer} />
      <button
        type="button"
        className={styles.railBtn}
        aria-label={open ? 'Hide side view (Ctrl B)' : 'Show side view (Ctrl B)'}
        title="Ctrl B"
        onClick={toggle}
      >
        <PanelRight size={17} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </nav>
  );
}

/** The open side view, next to the rail. Agents, Decisions and Notes are in the palette. */
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
  const close = useSideView((s) => s.close);
  const label = VIEWS.find(([id]) => id === view)?.[1];
  const stage = useStage(projectId);
  const navigate = useNavigate();
  const base = `/p/${encodeURIComponent(projectId)}`;
  const openNotes = () => void navigate(`${base}/notes`);
  const openAgents = () => void navigate(`${base}/agents`);
  const openChat = () => void navigate(base);

  return (
    <aside className={styles.panel} aria-label={label}>
      <header className={styles.head}>
        <span className={styles.title}>{label}</span>
        <button
          type="button"
          className={styles.close}
          aria-label={`Close ${label}`}
          onClick={close}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        {view === 'overview' && (
          <div className={styles.scrollAll}>
            <div className={styles.flat}>
              <StageProgressCard
                projectId={projectId}
                stage={stage}
                onOpenChat={openChat}
                onOpenNotes={openNotes}
              />
              <GitPanel key={projectId} projectId={projectId} now={now} collapsible />
              <PlanUsage now={now} />
            </div>
            <AgentsPanel
              projectId={projectId}
              branch={branch}
              now={now}
              limit={3}
              onSeeAll={openAgents}
              box={false}
            />
          </div>
        )}
        {view === 'live' && <LiveView projectId={projectId} now={now} onOpenAgents={openAgents} />}
        {view === 'chat' && (
          // Magnet about this project, and the Task / Note / Agent box (ADR-0039).
          <div className={styles.chatView}>
            <MagnetChat key={projectId} projectId={projectId} />
            <QuickAdd
              projectId={projectId}
              branch={branch}
              onDone={(kind) => (kind === 'agent' ? openAgents() : openNotes())}
            />
          </div>
        )}
        {view === 'github' && (
          <div className={styles.scroll}>
            <GitPanel key={projectId} projectId={projectId} now={now} full />
            <SourceControl key={`commits-${projectId}`} projectId={projectId} />
          </div>
        )}
      </div>
    </aside>
  );
}
