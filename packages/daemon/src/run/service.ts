import { spawn, type ChildProcess } from 'node:child_process';
import type { RunServer, RunState } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { conflict } from '../http.ts';
import { projectDir } from '../projects/workspace.ts';
import { detectRun } from './detect.ts';
import { answersHttp, projectListeners } from './listeners.ts';

const HTTP_CACHE_MS = 30_000;

const MAX_OUTPUT = 64_000;
const FLUSH_MS = 100;
const KILL_AFTER_MS = 3000;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r(?!\n)/g;
const LOCAL_URL =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s'"<>)]*)?/;

interface Run {
  child: ChildProcess | null;
  command: string;
  source: string;
  url: string | null;
  startedAt: number | null;
  exitCode: number | null;
  output: string;
  pending: string;
  timer: NodeJS.Timeout | null;
}

/** The first local address the app printed, with 0.0.0.0 and [::] shown as localhost. */
export function findLocalUrl(text: string): string | null {
  // Skip the echoed command ("$ …" from Cherry, "> …" from npm): it is not the app talking.
  const said = text
    .split('\n')
    .filter((l) => !/^\s*[$>] /.test(l))
    .join('\n');
  const m = LOCAL_URL.exec(said);
  if (!m) return null;
  return m[0].replace(/[.,;:]+$/, '').replace(/\/\/(?:0\.0\.0\.0|\[::1?\])/, '//localhost');
}

/**
 * Runs the project's own app (dev server, script) on the user's click, one per project, in its
 * own process group so Stop ends the whole tree. Output stays in memory (ADR-0024).
 */
export class RunService {
  private readonly runs = new Map<string, Run>();
  /** "pid:port" → does it answer HTTP, so a poll does not knock on every port again. */
  private readonly http = new Map<string, { ok: boolean; at: number }>();

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
  ) {}

  async get(id: string): Promise<RunState> {
    const dir = projectDir(this.config.projectsDir(), id);
    const run = this.runs.get(id);
    const servers = await this.servers(dir, run);
    if (run?.child) return { ...this.view(run), servers };
    const found = detectRun(dir);
    return {
      command: found?.command ?? null,
      source: found?.source ?? null,
      running: false,
      url: null,
      startedAt: run?.startedAt ?? null,
      exitCode: run?.exitCode ?? null,
      servers,
      output: run?.output ?? '',
    };
  }

  /** Websites running from the folder that Cherry did not start (and that are not Cherry). */
  private async servers(dir: string, run: Run | undefined): Promise<RunServer[]> {
    const own = run?.child?.pid;
    const list = projectListeners(dir).filter((l) => l.pid !== process.pid && l.pgid !== own);
    const now = Date.now();
    const out: RunServer[] = [];
    for (const l of list) {
      const key = `${l.pid}:${l.port}`;
      let hit = this.http.get(key);
      if (!hit || now - hit.at > HTTP_CACHE_MS) {
        hit = { ok: await answersHttp(l.port), at: now };
        this.http.set(key, hit);
      }
      if (hit.ok)
        out.push({ url: `http://localhost:${l.port}/`, port: l.port, command: l.command });
    }
    return out;
  }

  start(id: string): RunState {
    const dir = projectDir(this.config.projectsDir(), id);
    if (this.runs.get(id)?.child) throw conflict('The app is already running.');
    const found = detectRun(dir);
    if (!found) throw conflict('Cherry could not find how to run this project.');
    const child = spawn('sh', ['-c', found.command], {
      cwd: dir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Python holds its output back when not on a terminal; the address would never show.
      env: {
        ...process.env,
        BROWSER: 'none',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        PYTHONUNBUFFERED: '1',
      },
    });
    const run: Run = {
      child,
      command: found.command,
      source: found.source,
      url: null,
      startedAt: Date.now(),
      exitCode: null,
      output: `$ ${found.command}\n`,
      pending: '', // the start response already carries the command line
      timer: null,
    };
    this.runs.set(id, run);
    const onData = (buf: Buffer) => this.append(id, run, buf.toString('utf8'));
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (err) => this.append(id, run, `\n${err.message}\n`));
    child.on('close', (code, signal) => {
      run.child = null;
      // Null when ended by a signal (Stop): that is not the app failing.
      run.exitCode = signal ? null : code;
      this.append(id, run, code !== null ? `\n[exited with code ${code}]\n` : '\n[stopped]\n');
      this.flush(id, run);
      this.publishState(id, run);
    });
    this.publishState(id, run);
    return this.view(run);
  }

  async stop(id: string): Promise<RunState> {
    projectDir(this.config.projectsDir(), id);
    const run = this.runs.get(id);
    if (run?.child) await killTree(run.child);
    return this.get(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.values()].map((r) => (r.child ? killTree(r.child) : null)));
  }

  private append(id: string, run: Run, raw: string) {
    const text = raw.replace(ANSI, '');
    run.output = (run.output + text).slice(-MAX_OUTPUT);
    run.pending += text;
    if (!run.url) {
      const url = findLocalUrl(run.output);
      if (url) {
        run.url = url;
        this.publishState(id, run);
      }
    }
    run.timer ??= setTimeout(() => this.flush(id, run), FLUSH_MS);
  }

  private flush(id: string, run: Run) {
    if (run.timer) clearTimeout(run.timer);
    run.timer = null;
    if (!run.pending) return;
    this.hub.publish(`project:${id}`, 'run.output', { projectId: id, text: run.pending });
    run.pending = '';
  }

  private publishState(id: string, run: Run) {
    const state: Omit<RunState, 'output' | 'servers'> & { output?: string; servers?: unknown } = {
      ...this.view(run),
    };
    delete state.output;
    delete state.servers;
    this.hub.publish(`project:${id}`, 'run.state', { projectId: id, state });
  }

  private view(run: Run): RunState {
    return {
      command: run.command,
      source: run.source,
      running: !!run.child,
      url: run.url,
      startedAt: run.startedAt,
      exitCode: run.exitCode,
      servers: [],
      output: run.output,
    };
  }
}

/** SIGTERM to the whole process group, SIGKILL if it is still there after 3 seconds. */
function killTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return resolve();
    const pid = child.pid;
    const done = setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }, KILL_AFTER_MS);
    child.once('close', () => {
      clearTimeout(done);
      resolve();
    });
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      clearTimeout(done);
      resolve();
    }
  });
}
