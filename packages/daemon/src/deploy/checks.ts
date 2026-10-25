import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Check, CheckId, Checks } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { EventHub } from '../events.ts';
import { projectDir } from '../projects/workspace.ts';
import { packageManager } from '../run/detect.ts';

const MAX_OUTPUT = 64_000;
const TIMEOUT_MS = 10 * 60_000;
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

const LABEL: Record<CheckId, string> = {
  typecheck: 'Typecheck',
  lint: 'Lint',
  test: 'Unit tests',
  build: 'Build',
  audit: 'Audit',
};
/** package.json scripts that serve each check, first match wins. */
const SCRIPTS: Record<Exclude<CheckId, 'audit'>, string[]> = {
  typecheck: ['typecheck', 'type-check', 'check-types', 'tsc'],
  lint: ['lint'],
  test: ['test:unit', 'test'],
  build: ['build'],
};

/** The checks a project has, from its package.json (JS and TS projects). */
export function detectChecks(dir: string): {
  checks: { id: CheckId; command: string }[];
  none: string | null;
} {
  let pkg: { scripts?: Record<string, string>; devDependencies?: object; dependencies?: object };
  try {
    pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as typeof pkg;
  } catch {
    return {
      checks: [],
      none: 'No package.json. Cherry runs the typecheck, lint, test and build scripts of a JavaScript or TypeScript project.',
    };
  }
  const pm = packageManager(dir);
  const run = (script: string) => (pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`);
  const scripts = pkg.scripts ?? {};
  const out: { id: CheckId; command: string }[] = [];
  for (const id of ['typecheck', 'lint', 'test', 'build'] as const) {
    const script = SCRIPTS[id].find((s) => scripts[s] && !/no test specified/.test(scripts[s]!));
    if (script) out.push({ id, command: run(script) });
    else if (id === 'typecheck' && existsSync(path.join(dir, 'tsconfig.json')))
      out.push({ id, command: pm === 'npm' ? 'npx tsc --noEmit' : `${pm} exec tsc --noEmit` });
  }
  const lock = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].some((f) =>
    existsSync(path.join(dir, f)),
  );
  if (lock && existsSync(path.join(dir, 'node_modules')))
    out.push({
      id: 'audit',
      command:
        pm === 'pnpm'
          ? 'pnpm audit --prod --audit-level high'
          : pm === 'yarn'
            ? 'yarn npm audit --severity high'
            : 'npm audit --omit=dev --audit-level=high',
    });
  return {
    checks: out,
    none: out.length ? null : 'package.json has no typecheck, lint, test or build script.',
  };
}

/** The one short fact a row shows, read from the output. */
export function summarize(id: CheckId, ok: boolean, out: string): string | null {
  // Not the echoed command lines ("$ pnpm build", npm's "> echo …"): only what the tool said.
  const text = out
    .replace(ANSI, '')
    .split('\n')
    .filter((l) => !/^\s*[$>] /.test(l))
    .join('\n');
  if (id === 'test') {
    const passed = /(\d+)\s+(?:tests?\s+)?passed/i.exec(text)?.[1];
    const failed = /(\d+)\s+(?:tests?\s+)?failed/i.exec(text)?.[1];
    if (failed && Number(failed) > 0) return `${failed} failed`;
    if (passed) return `${passed} passed`;
  }
  if (id === 'build') {
    const sizes = [...text.matchAll(/([\d.]+)\s*(kB|KB|MB)\b/g)].map(
      (m) => Number(m[1]) * (m[2] === 'MB' ? 1024 : 1),
    );
    if (ok && sizes.length) return `${Math.round(sizes.reduce((a, b) => a + b, 0))} KB`;
  }
  if (id === 'audit') {
    const high = /(\d+)\s+high/i.exec(text)?.[1];
    const critical = /(\d+)\s+critical/i.exec(text)?.[1];
    const n = Number(high ?? 0) + Number(critical ?? 0);
    if (ok || high || critical) return `${n} high`;
  }
  if (id === 'typecheck' || id === 'lint') {
    const errors = /(\d+)\s+(?:errors?|problems?)/i.exec(text)?.[1];
    if (!ok && errors) return `${errors} error${errors === '1' ? '' : 's'}`;
  }
  return ok ? null : 'failed';
}

function kill(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

interface Running {
  child: ChildProcess;
  timer: NodeJS.Timeout;
}

/**
 * The cockpit's checks (V3 r10): the project's own package.json scripts, run one after another
 * in the project folder on a click. Nothing runs on its own.
 */
export class ChecksService {
  private state = new Map<string, Check[]>();
  private running = new Map<string, Running>();
  private queues = new Map<string, CheckId[]>();

  constructor(
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
  ) {}

  private dir(projectId: string) {
    return projectDir(this.config.projectsDir(), projectId);
  }

  get(projectId: string): Checks {
    const found = detectChecks(this.dir(projectId));
    const kept = this.state.get(projectId) ?? [];
    const checks = found.checks.map(
      (c): Check =>
        kept.find((k) => k.id === c.id && k.command === c.command) ?? {
          ...c,
          label: LABEL[c.id],
          status: 'idle',
          summary: null,
          durationMs: null,
          output: '',
          finishedAt: null,
        },
    );
    this.state.set(projectId, checks);
    return { checks, none: found.none };
  }

  private publish(projectId: string) {
    const checks = this.state.get(projectId) ?? [];
    this.hub.publish(`project:${projectId}`, 'checks.updated', {
      projectId,
      checks: { checks, none: null },
    });
  }

  private patch(projectId: string, id: CheckId, change: Partial<Check>) {
    this.state.set(
      projectId,
      (this.state.get(projectId) ?? []).map((c) => (c.id === id ? { ...c, ...change } : c)),
    );
    this.publish(projectId);
  }

  /** Runs the given checks (all when none are named), one at a time. */
  run(projectId: string, ids?: CheckId[]): Checks {
    const all = this.get(projectId);
    const wanted = all.checks.map((c) => c.id).filter((id) => !ids || ids.includes(id));
    const queue = this.queues.get(projectId) ?? [];
    for (const id of wanted) if (!queue.includes(id)) queue.push(id);
    this.queues.set(projectId, queue);
    for (const id of wanted)
      this.patch(projectId, id, { status: 'running', summary: null, output: '' });
    if (!this.running.has(projectId)) this.next(projectId);
    return { checks: this.state.get(projectId) ?? [], none: all.none };
  }

  private next(projectId: string): void {
    const queue = this.queues.get(projectId) ?? [];
    const id = queue.shift();
    if (!id) {
      this.running.delete(projectId);
      return;
    }
    const check = (this.state.get(projectId) ?? []).find((c) => c.id === id);
    if (!check) return this.next(projectId);
    const started = Date.now();
    let output = '';
    const child = spawn(check.command, {
      cwd: this.dir(projectId),
      shell: true,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Its own process group, so a stop ends the script's children too.
      detached: true,
    });
    const add = (b: Buffer) => {
      output = (output + b.toString()).slice(-MAX_OUTPUT);
    };
    child.stdout?.on('data', add);
    child.stderr?.on('data', add);
    const timer = setTimeout(() => {
      output += '\n[Cherry stopped the check after 10 minutes]';
      kill(child);
    }, TIMEOUT_MS);
    this.running.set(projectId, { child, timer });
    let finished = false;
    const done = (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const ok = code === 0;
      const clean = output.replace(ANSI, '');
      this.patch(projectId, id, {
        status: ok ? 'pass' : 'fail',
        summary: summarize(id, ok, clean),
        durationMs: Date.now() - started,
        output: `$ ${check.command}\n${clean}`.trimEnd(),
        finishedAt: Date.now(),
      });
      this.next(projectId);
    };
    child.on('error', (e) => {
      output += `\n${e.message}`;
      done(1);
    });
    child.on('close', done);
  }

  stopAll(): void {
    for (const r of this.running.values()) {
      clearTimeout(r.timer);
      kill(r.child);
    }
    this.running.clear();
    this.queues.clear();
  }
}
