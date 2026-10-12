import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface RunCommand {
  command: string;
  /** Where the command came from, for the UI. */
  source: string;
}

const SCRIPTS = ['dev', 'start', 'serve', 'preview'];

function packageManager(dir: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(dir, 'bun.lockb')) || existsSync(path.join(dir, 'bun.lock')))
    return 'bun';
  return 'npm';
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * How to run this project on localhost, from its files alone (no Claude, no tokens). First match
 * wins: a package.json script, Django, a Makefile target, Cargo, Go, then a plain static site.
 * Null when Cherry cannot tell; the Run button then stays hidden.
 */
export function detectRun(dir: string): RunCommand | null {
  const pkg = readJson(path.join(dir, 'package.json'));
  const scripts = (pkg?.scripts ?? {}) as Record<string, unknown>;
  const script = SCRIPTS.find((s) => typeof scripts[s] === 'string');
  if (script) {
    const pm = packageManager(dir);
    const run =
      pm === 'npm' ? `npm run ${script}` : pm === 'bun' ? `bun run ${script}` : `${pm} ${script}`;
    const install = existsSync(path.join(dir, 'node_modules')) ? '' : `${pm} install && `;
    return { command: install + run, source: `package.json script "${script}"` };
  }
  if (existsSync(path.join(dir, 'manage.py')))
    return { command: 'python3 manage.py runserver', source: 'Django manage.py' };
  const make = path.join(dir, 'Makefile');
  if (existsSync(make)) {
    const target = ['dev', 'run', 'serve', 'start'].find((t) =>
      new RegExp(`^${t}:`, 'm').test(readFileSync(make, 'utf8')),
    );
    if (target) return { command: `make ${target}`, source: `Makefile target "${target}"` };
  }
  if (existsSync(path.join(dir, 'Cargo.toml')))
    return { command: 'cargo run', source: 'Cargo.toml' };
  if (existsSync(path.join(dir, 'go.mod'))) return { command: 'go run .', source: 'go.mod' };
  if (existsSync(path.join(dir, 'index.html')))
    return {
      command: 'python3 -m http.server 8000 --bind 127.0.0.1',
      source: 'static index.html',
    };
  return null;
}
