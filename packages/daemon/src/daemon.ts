import { IdeaStore } from './ideas/store.ts';
import { ideaRoutes } from './routes/ideas.ts';
import { stageRoutes } from './routes/stages.ts';
import { issueRoutes } from './routes/issues.ts';
import { IssueService } from './issues/service.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Health, PlanUsage } from '@cherry/shared';
import { AuthStore, newCliSecret } from './auth.ts';
import { ConfigStore } from './config.ts';
import { openDb, type Db } from './db.ts';
import { EventHub } from './events.ts';
import { HealthService } from './health-service.ts';
import { PlanUsageService } from './plan-usage.ts';
import { NoteService } from './notes/service.ts';
import { noteRoutes } from './routes/notes.ts';
import { adrRoutes } from './routes/decisions.ts';
import { AdrService } from './adr/service.ts';
import { CommitService } from './projects/commits.ts';
import { commitRoutes } from './routes/commits.ts';
import { ensureMagnetFiles } from './magnet/files.ts';
import { GitInfoService } from './projects/github.ts';
import { ProjectService } from './projects/service.ts';
import { workspaceRoutes } from './routes/workspace.ts';
import { chatRoutes } from './routes/chat.ts';
import { calibrateRoutes } from './routes/calibrate.ts';
import { CalibrationService } from './calibrate/service.ts';
import { startRoutes } from './routes/start.ts';
import { gitRoutes } from './routes/git.ts';
import { agentRoutes } from './routes/agents.ts';
import { scanRoutes } from './routes/scans.ts';
import { migrateProjects } from './migrate.ts';
import { ScanService } from './scans/service.ts';
import { AgentManager } from './agents/manager.ts';
import { MagnetService } from './magnet/service.ts';
import { magnetRoutes } from './routes/magnet.ts';
import { GitActions, type PrLister } from './projects/git-actions.ts';
import { ChatService } from './chat/service.ts';
import { ApprovalBroker } from './claude/approvals.ts';
import { DecisionBroker } from './claude/decisions.ts';
import { sdkRunner, type Runner } from './claude/runner.ts';
import { buildServer } from './server.ts';
import { RunService } from './run/service.ts';
import { runRoutes } from './routes/run.ts';
import { TerminalService } from './terminal/service.ts';
import { terminalRoutes } from './routes/terminals.ts';
import { designRoutes, fontRoutes } from './routes/design.ts';
import { ChecksService } from './deploy/checks.ts';
import { deployRoutes } from './routes/deploy.ts';
import { watchFolders } from './watcher.ts';
import pkg from '../package.json' with { type: 'json' };

export interface Daemon {
  app: FastifyInstance;
  config: ConfigStore;
  auth: AuthStore;
  hub: EventHub;
  db: Db;
  chat: ChatService;
  approvals: ApprovalBroker;
  decisions: DecisionBroker;
  calibration: CalibrationService;
  agents: AgentManager;
  adrs: AdrService;
  scans: ScanService;
  magnet: MagnetService;
  projects: ProjectService;
  health: HealthService;
  planUsage: PlanUsageService;
  runs: RunService;
  terminals: TerminalService;
  cliSecret: string;
  close(): Promise<void>;
}

export interface DaemonOptions {
  home: string;
  /** Port the daemon listens on; used to build the allowed origins. */
  port: number;
  /** Extra allowed UI origins (the Vite dev server). */
  extraOrigins?: string[];
  /** Watch the projects folder for changes (off in unit tests). */
  watch?: boolean;
  /** Use an in-memory database (tests). */
  memoryDb?: boolean;
  /** Replace the real tool checks (tests). */
  healthCheck?: () => Promise<Health>;
  /** Replace the claude.ai plan usage lookup (tests). */
  planUsage?: () => Promise<PlanUsage>;
  /** Replace the Claude runner (tests use the fake Claude). */
  runner?: Runner;
  /** Replace `gh pr list` (tests). */
  prList?: PrLister;
  /** Stops the process (main.ts); enables POST /api/shutdown. */
  onShutdown?: () => void;
}

const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createDaemon(opts: DaemonOptions): Daemon {
  const config = new ConfigStore(opts.home);
  migrateProjects(config.projectsDir());
  ensureMagnetFiles(opts.home);
  const db = openDb(opts.memoryDb ? ':memory:' : path.join(opts.home, 'cache.db'));
  const hub = new EventHub();
  const auth = new AuthStore(opts.home);
  const health = new HealthService(pkg.version, config, hub, opts.healthCheck);
  const planUsage = new PlanUsageService(opts.planUsage);
  const projects = new ProjectService(config, db, hub, opts.home);
  const cliSecret = newCliSecret();
  const gitInfo = new GitInfoService();
  const approvals = new ApprovalBroker(db, hub);
  const decisions = new DecisionBroker();
  const adrs = new AdrService(config, db, hub);
  const commits = new CommitService(config, db, hub, opts.runner ?? sdkRunner);
  const chat = new ChatService(
    config,
    db,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    opts.home,
    adrs,
    commits,
  );
  const calibration = new CalibrationService(
    config,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    projects,
    opts.home,
  );

  const agents = new AgentManager(
    config,
    db,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    opts.home,
    adrs,
  );
  adrs.connect({ chat, agents });
  const scans = new ScanService(
    config,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    opts.home,
  );
  const notes = new NoteService(config, opts.runner ?? sdkRunner);
  const runs = new RunService(config, hub);
  const terminals = new TerminalService(config);
  const checks = new ChecksService(config, hub);
  const gitActions = new GitActions(config, hub, approvals, gitInfo, opts.prList);
  const magnet = new MagnetService(
    config,
    db,
    hub,
    approvals,
    decisions,
    opts.runner ?? sdkRunner,
    projects,
    opts.home,
    { calibration, agents, git: gitActions },
  );

  const app = buildServer({
    version: pkg.version,
    config,
    auth,
    hub,
    health,
    planUsage,
    projects,
    cliSecret,
    origins: [`http://127.0.0.1:${opts.port}`, ...(opts.extraOrigins ?? [])],
    webDist: WEB_DIST,
    ...(opts.onShutdown ? { onShutdown: opts.onShutdown } : {}),
    routes: [
      workspaceRoutes(config, gitInfo, adrs),
      chatRoutes(chat, approvals, decisions),
      calibrateRoutes(calibration),
      startRoutes(config, projects),
      gitRoutes(gitActions),
      agentRoutes(agents, chat),
      scanRoutes(scans),
      magnetRoutes(magnet),
      noteRoutes(notes),
      commitRoutes(commits),
      runRoutes(runs),
      terminalRoutes(terminals),
      designRoutes(config),
      fontRoutes(),
      deployRoutes(config, checks),
      adrRoutes(adrs),
      ideaRoutes(new IdeaStore(opts.home)),
      stageRoutes(opts.home, config),
      issueRoutes(new IssueService(config, approvals, hub)),
    ],
  });

  const changed = (ids: Set<string>) => {
    void projects.rescan();
    for (const id of ids) {
      hub.publish(`project:${id}`, 'project.changed', { projectId: id, paths: [] });
    }
  };
  // Watches the project folders in Cherry's list; made again when the list changes (ADR-0032).
  let watcher = opts.watch ? watchFolders(projects.listed(), changed) : null;
  projects.onListChange = () => {
    if (!opts.watch) return;
    void watcher?.close();
    watcher = watchFolders(projects.listed(), changed);
  };

  return {
    app,
    config,
    auth,
    hub,
    db,
    projects,
    health,
    planUsage,
    runs,
    cliSecret,
    chat,
    approvals,
    decisions,
    calibration,
    agents,
    adrs,
    scans,
    magnet,
    terminals,
    async close() {
      terminals.stopAll();
      checks.stopAll();
      await runs.stopAll();
      await chat.stopAll();
      await agents.stopAll();
      await scans.stopAll();
      await magnet.stopAll();
      await calibration.stopAll();
      approvals.cancel(undefined, 'Cherry restarted');
      await watcher?.close();
      await app.close();
      db.close();
    },
  };
}
