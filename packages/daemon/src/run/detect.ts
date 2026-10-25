import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface RunCommand {
  command: string;
  /** Where the command came from, for the UI. */
  source: string;
}

const SCRIPTS = ['dev', 'start', 'serve', 'preview'];
/** Scripts that start a website: dev servers, framework CLIs, static servers. */
const WEB_SCRIPT =
  /\b(vite|next|nuxt|nuxi|astro|remix|react-scripts|vue-cli-service|ng serve|svelte-kit|gatsby|webpack(-dev-server| serve)|parcel|eleventy|docusaurus|storybook|serve|http-server|live-server|browser-sync|wrangler dev|expo start)\b/;
/** Dependencies that mean "this package is a web server", so `start: node server.js` counts. */
const WEB_DEPS = [
  'express',
  'fastify',
  'koa',
  'hono',
  '@hapi/hapi',
  '@nestjs/core',
  'next',
  'nuxt',
  'vite',
  'astro',
  '@remix-run/dev',
  'react-scripts',
  '@sveltejs/kit',
  'gatsby',
  'http-server',
  'serve',
];

export function packageManager(dir: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(dir, 'bun.lockb')) || existsSync(path.join(dir, 'bun.lock')))
    return 'bun';
  return 'npm';
}

function read(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function node(dir: string): RunCommand | null {
  let pkg: { scripts?: Record<string, unknown>; dependencies?: object; devDependencies?: object };
  try {
    pkg = JSON.parse(read(path.join(dir, 'package.json'))) as typeof pkg;
  } catch {
    return null;
  }
  const scripts = pkg.scripts ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const webDeps = WEB_DEPS.some((d) => d in deps);
  const script = SCRIPTS.find((s) => {
    const body = scripts[s];
    return typeof body === 'string' && (WEB_SCRIPT.test(body) || webDeps);
  });
  if (!script) return null;
  const pm = packageManager(dir);
  const run = (s: string) =>
    pm === 'npm' ? `npm run ${s}` : pm === 'bun' ? `bun run ${s}` : `${pm} ${s}`;
  const install = existsSync(path.join(dir, 'node_modules')) ? '' : `${pm} install && `;
  // A preview serves the build, so build first.
  const build =
    script === 'preview' && typeof scripts.build === 'string' ? `${run('build')} && ` : '';
  return { command: install + build + run(script), source: `package.json script "${script}"` };
}

function python(dir: string): RunCommand | null {
  if (existsSync(path.join(dir, 'manage.py')))
    return { command: 'python3 manage.py runserver', source: 'Django manage.py' };
  const deps = (
    read(path.join(dir, 'requirements.txt')) + read(path.join(dir, 'pyproject.toml'))
  ).toLowerCase();
  const entry = ['app', 'main'].find((m) => existsSync(path.join(dir, `${m}.py`)));
  if (!entry) return null;
  if (/\bfastapi\b/.test(deps))
    return { command: `python3 -m uvicorn ${entry}:app --reload`, source: `FastAPI ${entry}.py` };
  if (/\bflask\b/.test(deps))
    return { command: `python3 -m flask --app ${entry} run --debug`, source: `Flask ${entry}.py` };
  return null;
}

function compiled(dir: string): RunCommand | null {
  if (/\b(actix-web|axum|rocket|warp|poem)\b/.test(read(path.join(dir, 'Cargo.toml'))))
    return { command: 'cargo run', source: 'Cargo.toml (web server)' };
  if (/(gin-gonic|labstack\/echo|gofiber|go-chi|gorilla\/mux)/.test(read(path.join(dir, 'go.mod'))))
    return { command: 'go run .', source: 'go.mod (web server)' };
  return null;
}

/**
 * How to run this project as a website on localhost, from its files alone (no Claude, no
 * tokens). Only things that serve a page count: a web dev server script in package.json (with a
 * build first for `preview`), Django, Flask or FastAPI, a Rust or Go web server, or a static
 * index.html. Command-line programs, install scripts and Makefiles are never run. Null when
 * nothing matches; the Run button then stays hidden.
 */
export function detectRun(dir: string): RunCommand | null {
  const found = node(dir) ?? python(dir) ?? compiled(dir);
  if (found) return found;
  if (existsSync(path.join(dir, 'index.html')))
    return { command: 'python3 -m http.server 8000 --bind 127.0.0.1', source: 'static index.html' };
  return null;
}
