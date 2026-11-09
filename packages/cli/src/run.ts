import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import pkg from '../package.json' with { type: 'json' };
import {
  DAEMON_DIR,
  DAEMON_MAIN,
  REPO_ROOT,
  TSX_LOADER,
  WEB_DIR,
  cliRequest,
  openBrowser,
  readRunInfo,
  startDaemon,
  stopDaemon,
  type RunInfo,
} from './daemon-client.ts';

export interface RunResult {
  code: number;
  out: string;
}

export const HELP = `cherry ${pkg.version} · cherry-pick your workflow

Usage: cherry [command]

  (none), up         start Cherry and open it in the browser
  start              keep Cherry always on: runs in the background, starts at login
  stop               stop Cherry and turn always-on off
  restart            restart Cherry (after \`git pull\`; rebuilds the UI if needed)
  down               stop Cherry until the next \`cherry\` or login
  status             show whether Cherry is running
  .                  open this folder in Cherry (like \`code .\`)
  open <folder>      open a folder from anywhere, or a project by name
  logout             end every browser session
  doctor             check Node, git, gh and claude

  --no-open          print the link without opening the browser
  -v, --version      print the version
  -h, --help         print this help`;

interface Status {
  version: string;
  projects: number;
  health: { claude: { found: boolean; loggedIn: boolean; version: string | null } };
}

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

/** Builds the web UI when there is no build yet or the source changed since (the daemon serves it). */
function ensureWebBuild(): void {
  const index = path.join(WEB_DIR, 'dist', 'index.html');
  const sources = [path.join(WEB_DIR, 'src'), path.join(REPO_ROOT, 'docs', 'design')];
  if (existsSync(index) && statSync(index).mtimeMs >= Math.max(...sources.map(newestMtime))) return;
  console.error('Building the web UI (first run or after an update, about a minute)…');
  const vite = path.join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  // Only warnings and errors: the full asset list is hundreds of lines.
  const res = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], {
    cwd: WEB_DIR,
    stdio: 'inherit',
  });
  if (res.status !== 0) throw new Error('Building the web UI failed.');
}

async function ensureRunning(): Promise<{ info: RunInfo; started: boolean }> {
  const running = readRunInfo();
  if (running) return { info: running, started: false };
  if (serviceEnabled()) {
    systemctl('start', UNIT);
    return { info: await waitForService(), started: true };
  }
  ensureWebBuild();
  return { info: await startDaemon(), started: true };
}

async function loginLink(info: RunInfo, route = '/'): Promise<string> {
  const { code } = await cliRequest<{ code: string }>(info, 'POST', '/api/cli/login-code');
  return `${info.webUrl}${route}#login=${code}`;
}

async function up(open: boolean, route = '/'): Promise<RunResult> {
  const { info, started } = await ensureRunning();
  const link = await loginLink(info, route);
  if (open) openBrowser(link);
  const head = started ? 'Cherry is running.' : 'Cherry was already running.';
  return {
    code: 0,
    out: `${head}\n\n  ${link}\n\nThe link logs you in once and works for 10 minutes. Bookmark ${info.webUrl}${route} for later.`,
  };
}

/** `cherry .` and `cherry open <path>`: adds the folder to Home and opens its workspace. */
async function openFolder(open: boolean, folder: string): Promise<RunResult> {
  const { info } = await ensureRunning();
  const dir = path.resolve(callerCwd(), folder.replace(/^~(?=$|\/)/, homedir()));
  const { id } = await cliRequest<{ id: string }>(info, 'POST', '/api/cli/open-folder', {
    path: dir,
  });
  return up(open, `/p/${encodeURIComponent(id)}`);
}

/**
 * The folder `cherry` was run from. The installed command runs in the repo (mise -C) and passes
 * the real one in CHERRY_CWD; `pnpm cherry` passes it in INIT_CWD.
 */
function callerCwd(): string {
  return process.env.CHERRY_CWD || process.env.INIT_CWD || process.cwd();
}

/** A folder on disk (`.`, `../app`, `~/code/app`, or a folder here), not a project name. */
function isFolderArg(arg: string): boolean {
  if (arg === '.' || arg === '..' || arg.includes('/') || arg.startsWith('~')) return true;
  try {
    return statSync(path.resolve(callerCwd(), arg)).isDirectory();
  } catch {
    return false;
  }
}

async function status(): Promise<RunResult> {
  const info = readRunInfo();
  if (!info) return { code: 1, out: 'Cherry is not running. Start it with `cherry`.' };
  const s = await cliRequest<Status>(info, 'GET', '/api/cli/status');
  const claude = s.health.claude.found
    ? s.health.claude.loggedIn
      ? `found (${s.health.claude.version ?? '?'})`
      : 'found, not logged in'
    : 'not found';
  return {
    code: 0,
    out: [
      `Cherry ${s.version} is running (pid ${info.pid}).`,
      `  UI:          ${info.webUrl}`,
      `  Daemon:      http://127.0.0.1:${info.port}`,
      `  Projects:    ${s.projects}`,
      `  Claude Code: ${claude}`,
    ].join('\n'),
  };
}

async function down(): Promise<RunResult> {
  const info = readRunInfo();
  if (!info) return { code: 0, out: 'Cherry is not running.' };
  // The service would start it again on failure; stop it through systemd.
  if (process.platform === 'linux' && systemctl('is-active', UNIT).ok) {
    systemctl('stop', UNIT);
    return { code: 0, out: 'Cherry stopped. It starts again at login, or with `cherry`.' };
  }
  return (await stopDaemon(info))
    ? { code: 0, out: 'Cherry stopped.' }
    : { code: 1, out: `Cherry (pid ${info.pid}) did not stop.` };
}

async function logout(): Promise<RunResult> {
  const info = readRunInfo();
  if (!info) return { code: 1, out: 'Cherry is not running.' };
  await cliRequest(info, 'POST', '/api/cli/logout');
  return { code: 0, out: 'Every browser is logged out. Run `cherry` for a new link.' };
}

function check(cmd: string, args: string[]): { ok: boolean; out: string } {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: String(err.stdout ?? err.stderr ?? '').trim() };
  }
}

function doctor(): RunResult {
  const lines: string[] = [];
  let bad = 0;
  const row = (ok: boolean, name: string, detail: string, fix?: string) => {
    if (!ok) bad++;
    lines.push(`${ok ? 'ok ' : 'FIX'}  ${name.padEnd(12)} ${detail}`);
    if (!ok && fix) lines.push(`     ${''.padEnd(12)} → ${fix}`);
  };
  const major = Number(process.versions.node.split('.')[0]);
  row(major >= 22, 'Node', process.versions.node, 'Install Node 22 or newer (mise use node@22).');
  const git = check('git', ['--version']);
  row(git.ok, 'git', git.ok ? git.out : 'not found', 'Install git 2.40 or newer.');
  const claude = check('claude', ['--version']);
  row(
    claude.ok,
    'Claude Code',
    claude.ok ? claude.out : 'not found',
    'Install Claude Code: https://claude.com/claude-code',
  );
  if (claude.ok) {
    const auth = check('claude', ['auth', 'status', '--json']);
    let loggedIn: boolean;
    try {
      loggedIn = (JSON.parse(auth.out) as { loggedIn?: boolean }).loggedIn === true;
    } catch {
      loggedIn = false;
    }
    row(
      loggedIn,
      'Claude login',
      loggedIn ? 'logged in' : 'not logged in',
      'Run `claude auth login`.',
    );
  }
  const gh = check('gh', ['auth', 'status']);
  lines.push(
    `${gh.ok ? 'ok ' : '-- '}  ${'GitHub CLI'.padEnd(12)} ${gh.ok ? 'logged in' : 'optional: not found or not logged in (gh auth login)'}`,
  );
  const projects = path.join(homedir(), 'Projects');
  row(existsSync(projects), 'Projects', projects, `Create it: mkdir ${projects}`);
  return { code: bad ? 1 : 0, out: lines.join('\n') };
}

// --- Always on (ADR-0063): a systemd user service that starts at login. ---

const UNIT = 'cherry.service';
const unitFile = () => path.join(homedir(), '.config', 'systemd', 'user', UNIT);
const CLI_MAIN = path.join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');

function systemctl(...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** True when Cherry is set up as an always-on service (the unit is enabled). */
export function serviceEnabled(): boolean {
  return process.platform === 'linux' && existsSync(unitFile()) && systemctl('is-enabled', UNIT).ok;
}

/**
 * The unit. PATH is the one `cherry start` ran with, so the daemon finds claude, git and gh
 * (systemd gives services a bare PATH). Before each start it rebuilds the UI when the source is
 * newer, so `git pull && cherry restart` is the whole update.
 */
export function serviceUnit(env: NodeJS.ProcessEnv = process.env): string {
  const node = process.execPath;
  return `[Unit]
Description=Cherry daemon (127.0.0.1)
After=default.target

[Service]
WorkingDirectory=${DAEMON_DIR}
Environment="PATH=${env.PATH ?? '/usr/bin:/bin'}"
Environment=CHERRY_WEB_URL=
ExecStartPre=${node} --import ${TSX_LOADER} ${CLI_MAIN} build-ui
ExecStart=${node} --import ${TSX_LOADER} ${DAEMON_MAIN}
Restart=on-failure
RestartSec=3
TimeoutStartSec=300

[Install]
WantedBy=default.target
`;
}

async function waitForService(): Promise<RunInfo> {
  // The first start can build the UI (about a minute).
  for (let i = 0; i < 1500; i++) {
    const info = readRunInfo();
    if (info) {
      try {
        await cliRequest(info, 'GET', '/api/cli/status');
        return info;
      } catch {
        // not listening yet
      }
    }
    // activating while it builds or boots; failed or inactive means it gave up.
    const state = systemctl('is-active', UNIT).out;
    if (i > 25 && (state === 'failed' || state === 'inactive')) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Cherry did not start. See `journalctl --user -u cherry -n 50`.');
}

async function start(open: boolean): Promise<RunResult> {
  if (process.platform !== 'linux')
    return { code: 1, out: 'Always-on supports Linux (systemd) for now. Run `cherry` instead.' };
  const running = readRunInfo();
  if (running && running.webUrl !== `http://127.0.0.1:${running.port}`)
    return {
      code: 1,
      out: 'pnpm dev is running Cherry from source. Quit it, then run `cherry start`.',
    };
  // A daemon started by `cherry` holds the port; the service takes over.
  if (running && !systemctl('is-active', UNIT).ok) await stopDaemon(running);
  mkdirSync(path.dirname(unitFile()), { recursive: true });
  writeFileSync(unitFile(), serviceUnit());
  for (const step of [['daemon-reload'], ['enable', UNIT], ['restart', UNIT]]) {
    const r = systemctl(...step);
    if (!r.ok) return { code: 1, out: `systemctl --user ${step.join(' ')} failed: ${r.out}` };
  }
  console.error('Starting Cherry in the background…');
  const info = await waitForService();
  const link = await loginLink(info);
  if (open) openBrowser(link);
  return {
    code: 0,
    out: `Cherry is always on: it runs in the background and starts when you log in.\n\n  ${link}\n\nOpen the link once, then bookmark ${info.webUrl}/. You stay logged in while you use it.\nUpdate: git pull && cherry restart.  Turn it off: cherry stop.`,
  };
}

async function stop(): Promise<RunResult> {
  if (process.platform === 'linux' && existsSync(unitFile())) {
    systemctl('disable', '--now', UNIT);
    return {
      code: 0,
      out: 'Cherry stopped, and it no longer starts at login. `cherry start` turns it on again.',
    };
  }
  return down();
}

async function restart(open: boolean): Promise<RunResult> {
  if (!serviceEnabled()) {
    await down();
    return up(open);
  }
  const r = systemctl('restart', UNIT);
  if (!r.ok) return { code: 1, out: `systemctl --user restart cherry failed: ${r.out}` };
  console.error('Restarting Cherry…');
  await waitForService();
  return { code: 0, out: 'Cherry restarted.' };
}

export async function run(argv: readonly string[]): Promise<RunResult> {
  const args = argv.filter((a) => a !== '--no-open');
  const open = !argv.includes('--no-open');
  const [first = 'up', second] = args;

  try {
    switch (first) {
      case '-v':
      case '--version':
        return { code: 0, out: pkg.version };
      case '-h':
      case '--help':
      case 'help':
        return { code: 0, out: HELP };
      case 'up':
        return await up(open);
      case '.':
        return await openFolder(open, '.');
      case 'open':
        if (!second) return { code: 2, out: 'Usage: cherry open <folder or project>' };
        if (isFolderArg(second)) return await openFolder(open, second);
        return await up(open, `/p/${encodeURIComponent(second)}`);
      case 'down':
        return await down();
      case 'start':
      case 'install-service': // the old name
        return await start(open);
      case 'stop':
        return await stop();
      case 'restart':
        return await restart(open);
      case 'build-ui': // the service runs this before each start
        ensureWebBuild();
        return { code: 0, out: 'The web UI is up to date.' };
      case 'status':
        return await status();
      case 'logout':
        return await logout();
      case 'doctor':
        return doctor();
      default:
        return { code: 2, out: `Unknown command "${first}".\n\n${HELP}` };
    }
  } catch (e) {
    return { code: 1, out: `cherry ${first}: ${(e as Error).message}` };
  }
}
