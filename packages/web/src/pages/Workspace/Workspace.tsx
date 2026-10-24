import {
  Activity,
  BookOpen,
  CircleDot,
  FileText,
  GitPullRequest,
  History,
  House,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MessageSquarePlus,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  ScanEye,
  Settings,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { create } from 'zustand';
import { STAGE_LABEL, WORKSPACE_STAGES, type WorkspaceStage } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { searchFiles, useLiveProject, useProjectDetail } from '../../api/workspace.ts';
import { startRun, stopRun, useLiveRun, useRun } from '../../api/run.ts';
import { newChat, sendChat, useChat, useChatDraft, useLiveChat } from '../../api/chat.ts';
import { stageInfo, useStageInfo } from '../../api/stages.ts';
import { useAgents, useLiveAgents } from '../../api/agents.ts';
import { useScanAgents } from '../../api/scans.ts';
import { FileViewer } from '../../components/FileViewer/FileViewer.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { WorkspaceTop } from '../../components/WorkspaceTop/WorkspaceTop.tsx';
import { StageTabs } from '../../components/StageTabs/StageTabs.tsx';
import { StatusBar } from '../../components/StatusBar/StatusBar.tsx';
import {
  CommandPalette,
  usePalette,
  type PaletteItem,
} from '../../components/CommandPalette/CommandPalette.tsx';
import { AgentsPanel } from '../../components/AgentsPanel/AgentsPanel.tsx';
import { Decisions, usePendingDecisions } from '../../components/Decisions/Decisions.tsx';
import { useStage, useStages } from '../../state/stage.ts';
import { useNow } from '../../lib/useNow.ts';
import { useHistoryMenu } from './ChatTab.tsx';
import { DocsTab } from './DocsTab.tsx';
import { NotesTab } from './NotesTab.tsx';
import { ReportTab } from './ReportTab.tsx';
import { RunTab } from './RunTab.tsx';
import { StatusTab, UPDATE_STATUS_PROMPT } from './StatusTab.tsx';
import { Rail, SidePanel, useSideView } from './SidePanel.tsx';
import { StageBody } from './StageBody.tsx';
import styles from './Workspace.module.css';

/** A view opened from the palette or a link; it covers the stage until closed (ADR-0045). */
type ViewRoute =
  | { view: 'docs'; path: string | null }
  | { view: 'file'; path: string }
  | { view: 'report'; path: string }
  | { view: 'notes' | 'agents' | 'decisions' | 'status' | 'run' };

export function parseSplat(splat: string): ViewRoute | null {
  if (splat === 'docs' || splat.startsWith('docs/'))
    return { view: 'docs', path: splat.slice(5) || null };
  if (splat.startsWith('files/') && splat.length > 6) return { view: 'file', path: splat.slice(6) };
  if (splat.startsWith('reports/') && splat.length > 8)
    return { view: 'report', path: splat.slice(8) };
  if (['notes', 'agents', 'decisions', 'status', 'run'].includes(splat))
    return { view: splat as 'notes' };
  return null;
}

/** The last scan agent whose reports were open, per project, for the report's title. */
const useOpenReports = create<{
  reports: Record<string, string | undefined>;
  set(id: string, path: string | undefined): void;
}>((set) => ({
  reports: {},
  set: (id, path) => set((s) => ({ reports: { ...s.reports, [id]: path } })),
}));

export function Workspace() {
  const params = useParams();
  const id = params.id ?? '';
  const route = parseSplat(params['*'] ?? '');
  const navigate = useNavigate();
  const now = useNow(60_000);
  const detail = useProjectDetail(id);
  useLiveProject(id);
  const stage = useStage(id);
  const setStage = useStages((s) => s.set);
  const side = useSideView();
  const chat = useChat(id, stage);
  // Once per workspace: the chat and the Live view both read this state.
  useLiveChat(id);
  const app = useRun(id);
  useLiveRun(id);
  useLiveAgents(id);
  const setDraft = useChatDraft((s) => s.set);
  const running = !!chat.data?.running;
  const info = useStageInfo().data;
  const scans = useScanAgents(id);
  const pendingDecisions = usePendingDecisions(id);
  const agentsBusy = (useAgents(id).data?.agents ?? []).filter(
    (a) => a.status === 'running' || a.status === 'waiting',
  ).length;
  const openPalette = usePalette((s) => s.set);
  const setReport = useOpenReports((s) => s.set);
  const reportPath = route?.view === 'report' ? route.path : undefined;
  useEffect(() => {
    if (reportPath) setReport(id, reportPath);
  }, [reportPath, id, setReport]);

  const base = `/p/${encodeURIComponent(id)}`;
  const go = useCallback((to = '') => void navigate(`${base}${to}`), [navigate, base]);
  const selectStage = useCallback(
    (s: WorkspaceStage) => {
      setStage(id, s);
      go();
    },
    [setStage, id, go],
  );
  const openFile = useCallback((p: string) => go(`/files/${p}`), [go]);
  const findFiles = useCallback((q: string) => searchFiles(id, q), [id]);

  const items = usePaletteItems({
    id,
    stage,
    go,
    selectStage,
    agentsBusy,
    pendingDecisions,
    appRunning: !!app.data?.running,
    canRun: !!app.data?.command,
    chatRunning: running,
  });

  if (detail.isError) {
    const gone = detail.error instanceof ApiFailure && detail.error.status === 404;
    return (
      <div className={styles.page}>
        <TopBar crumbs={[{ label: 'Projects', href: '/' }, { label: id }]} />
        <div className={styles.gone}>
          <h1>{gone ? 'This project is not in Cherry' : 'Could not open this project'}</h1>
          <p>
            {gone
              ? `${id} is not in Cherry's list, or its folder was moved. Open it again from Home.`
              : (detail.error as Error).message}
          </p>
          <Link to="/" className="btn btn-secondary btn-md">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const card = detail.data?.card;
  const lastEnd = (chat.data?.items ?? []).findLast((i) => i.kind === 'turn-end');
  const context = lastEnd?.kind === 'turn-end' ? (lastEnd.context ?? null) : null;
  const updateStatus = running
    ? undefined
    : () => {
        void sendChat(id, stage, UPDATE_STATUS_PROMPT, 'ask');
        go();
      };

  return (
    <div className={styles.page}>
      <WorkspaceTop
        projectId={id}
        projectName={card?.name ?? id}
        stages={<StageTabs projectId={id} active={stage} onSelect={selectStage} />}
        onSearch={() => openPalette(true)}
      />
      <div className={styles.body}>
        <main className={styles.stage} aria-label={`${STAGE_LABEL[stage]} stage`}>
          {route ? (
            <ViewPane title={viewTitle(route, scans.data?.agents ?? [])} onClose={() => go()}>
              {route.view === 'docs' && (
                <DocsTab
                  projectId={id}
                  docPath={route.path}
                  now={now}
                  onAskClaude={(doc) => {
                    setDraft(id, `About ${doc}: `);
                    go();
                  }}
                />
              )}
              {route.view === 'notes' && <NotesTab projectId={id} />}
              {route.view === 'agents' && (
                <div className={styles.pane}>
                  <AgentsPanel projectId={id} branch={card?.git?.branch ?? null} now={now} />
                </div>
              )}
              {route.view === 'decisions' && (
                <div className={styles.pane}>
                  <Decisions projectId={id} />
                </div>
              )}
              {route.view === 'run' && <RunTab projectId={id} />}
              {route.view === 'status' && (
                <StatusTab
                  projectId={id}
                  mtime={detail.data ? (detail.data.statusMtime ?? null) : undefined}
                  now={now}
                  onUpdate={updateStatus}
                  updateDisabledReason="Claude is working; wait for the turn to finish"
                />
              )}
              {route.view === 'file' && (
                <FileViewer
                  key={route.path}
                  projectId={id}
                  path={route.path}
                  fileHref={(p) => `${base}/files/${p}`}
                />
              )}
              {route.view === 'report' && (
                <ReportTab
                  key={route.path.split('/')[0]}
                  projectId={id}
                  agentId={route.path.split('/')[0]!}
                  reportId={route.path.split('/')[1] || null}
                  now={now}
                />
              )}
            </ViewPane>
          ) : (
            <StageBody projectId={id} stage={stage} now={now} onOpenFile={openFile} />
          )}
        </main>
        {side.open && <SidePanel projectId={id} branch={card?.git?.branch ?? null} now={now} />}
        <Rail projectId={id} />
      </div>
      <StatusBar
        git={card?.git}
        agent={stageInfo(info, stage)?.name}
        model={chat.data?.model}
        context={context}
        app={app.data}
        onGit={() => side.set('github')}
        onRun={() => {
          void startRun(id).catch(() => undefined);
          go('/run');
        }}
        onOpenRun={() => go('/run')}
        onUsage={() => side.set('overview')}
        onPalette={() => openPalette(true)}
      />
      <CommandPalette items={items} searchFiles={findFiles} onOpenFile={openFile} />
    </div>
  );
}

function viewTitle(route: ViewRoute, scans: { id: string; name: string }[]): string {
  switch (route.view) {
    case 'docs':
      return 'Docs';
    case 'file':
      return route.path.split('/').pop() ?? route.path;
    case 'report': {
      const agent = route.path.split('/')[0] ?? '';
      return `${scans.find((a) => a.id === agent)?.name ?? agent} report`;
    }
    case 'notes':
      return 'Notes and tasks';
    case 'agents':
      return 'Agents';
    case 'decisions':
      return 'Decisions';
    case 'status':
      return 'Status';
    case 'run':
      return 'Run';
  }
}

const sideView = () => useSideView.getState();
const ic = (I: typeof Activity) => <I size={15} aria-hidden="true" />;

/** A hidden view, open over the stage: a title and a way back (ADR-0045). */
function ViewPane({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <section className={styles.view} aria-label={title}>
      <header className={styles.viewHead}>
        <span className={styles.viewTitle}>{title}</span>
        <button
          type="button"
          className={styles.viewClose}
          aria-label={`Close ${title}`}
          title="Back to the stage"
          onClick={onClose}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.viewBody}>{children}</div>
    </section>
  );
}

/** Every action and hidden view for the palette (ADR-0045, artboard 06). */
function usePaletteItems({
  id,
  stage,
  go,
  selectStage,
  agentsBusy,
  pendingDecisions,
  appRunning,
  canRun,
  chatRunning,
}: {
  id: string;
  stage: WorkspaceStage;
  go(to?: string): void;
  selectStage(s: WorkspaceStage): void;
  agentsBusy: number;
  pendingDecisions: number;
  appRunning: boolean;
  canRun: boolean;
  chatRunning: boolean;
}): PaletteItem[] {
  const info = useStageInfo().data;
  const navigate = useNavigate();
  return useMemo<PaletteItem[]>(
    () => [
      {
        id: 'v-agents',
        group: 'Views',
        label: 'Agents',
        hint: agentsBusy ? `${agentsBusy} running` : 'background agents',
        icon: ic(Activity),
        run: () => go('/agents'),
      },
      {
        id: 'v-scans',
        group: 'Views',
        label: 'Scan agents',
        hint: 'Security, Tests, Code health',
        icon: ic(ScanEye),
        run: () => go('/agents'),
      },
      {
        id: 'v-notes',
        group: 'Views',
        label: 'Notes and tasks',
        icon: ic(ListChecks),
        run: () => go('/notes'),
      },
      {
        id: 'v-decisions',
        group: 'Views',
        label: 'Decisions',
        hint: pendingDecisions ? `${pendingDecisions} proposed` : undefined,
        icon: ic(BookOpen),
        run: () => go('/decisions'),
      },
      { id: 'v-docs', group: 'Views', label: 'Docs', icon: ic(FileText), run: () => go('/docs') },
      {
        id: 'v-status',
        group: 'Views',
        label: 'Status report',
        icon: ic(CircleDot),
        run: () => go('/status'),
      },
      {
        id: 'v-overview',
        group: 'Views',
        label: 'Overview',
        icon: ic(LayoutDashboard),
        run: () => sideView().set('overview'),
      },
      {
        id: 'v-live',
        group: 'Views',
        label: 'Live',
        icon: ic(Activity),
        run: () => sideView().set('live'),
      },
      {
        id: 'v-github',
        group: 'Views',
        label: 'GitHub',
        words: 'source control commit git',
        icon: ic(GitPullRequest),
        run: () => sideView().set('github'),
      },
      {
        id: 'v-magnet',
        group: 'Views',
        label: 'Magnet chat',
        icon: ic(MessageSquare),
        run: () => sideView().set('chat'),
      },
      ...WORKSPACE_STAGES.map((s, i) => ({
        id: `s-${s}`,
        group: 'Stages' as const,
        label: `0${i + 1} ${STAGE_LABEL[s]}`,
        hint: s === stage ? 'open now' : stageInfo(info, s)?.name,
        icon: ic(CircleDot),
        run: () => selectStage(s),
      })),
      {
        id: 'a-agent',
        group: 'Actions',
        label: 'New background agent…',
        icon: ic(Plus),
        run: () => go('/agents'),
      },
      {
        id: 'a-new-chat',
        group: 'Actions',
        label: 'New chat',
        keys: ['/clear'],
        icon: ic(MessageSquarePlus),
        run: () => {
          go();
          void newChat(id, stage);
        },
      },
      {
        id: 'a-history',
        group: 'Actions',
        label: 'Chat history',
        keys: ['/resume'],
        icon: ic(History),
        run: () => {
          go();
          useHistoryMenu.getState().set(true);
        },
      },
      {
        id: 'a-push',
        group: 'Actions',
        label: 'Push to GitHub',
        icon: ic(GitPullRequest),
        run: () => sideView().set('github'),
      },
      ...(appRunning
        ? [
            {
              id: 'a-stop',
              group: 'Actions' as const,
              label: 'Stop the app',
              icon: ic(Square),
              run: () => void stopRun(id).catch(() => undefined),
            },
          ]
        : canRun
          ? [
              {
                id: 'a-run',
                group: 'Actions' as const,
                label: 'Run the app',
                icon: ic(Play),
                run: () => {
                  void startRun(id).catch(() => undefined);
                  go('/run');
                },
              },
            ]
          : []),
      ...(!chatRunning
        ? [
            {
              id: 'a-status',
              group: 'Actions' as const,
              label: 'Update the status report',
              icon: ic(RefreshCw),
              run: () => {
                void sendChat(id, stage, UPDATE_STATUS_PROMPT, 'ask');
                go();
              },
            },
          ]
        : []),
      {
        id: 'a-side',
        group: 'Actions',
        label: 'Toggle side view',
        keys: ['Ctrl', 'B'],
        icon: ic(PanelRight),
        run: () => sideView().toggle(),
      },
      {
        id: 'a-permissions',
        group: 'Actions',
        label: 'Permissions',
        hint: 'Always allow rules',
        icon: ic(ShieldCheck),
        run: () => void navigate('/settings/permissions'),
      },
      {
        id: 'a-settings',
        group: 'Actions',
        label: 'Settings',
        icon: ic(Settings),
        run: () => void navigate('/settings/general'),
      },
      {
        id: 'a-home',
        group: 'Actions',
        label: 'All projects',
        words: 'home',
        icon: ic(House),
        run: () => void navigate('/'),
      },
    ],
    [
      id,
      stage,
      agentsBusy,
      pendingDecisions,
      appRunning,
      canRun,
      chatRunning,
      info,
      go,
      selectStage,
      navigate,
    ],
  );
}
