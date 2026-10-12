import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState, ServerEvent } from '@cherry/shared';
import { detectRun } from '../src/run/detect.ts';
import { findLocalUrl } from '../src/run/service.ts';
import { HOST, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('detectRun', () => {
  let dir: string;
  beforeEach(() => {
    dir = tempDir('cherry-run-');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('prefers the dev script and the lockfile package manager, installing first if needed', () => {
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { start: 'node .', dev: 'vite' } }),
    );
    write(path.join(dir, 'pnpm-lock.yaml'), '');
    expect(detectRun(dir)).toEqual({
      command: 'pnpm install && pnpm dev',
      source: 'package.json script "dev"',
    });
    mkdirSync(path.join(dir, 'node_modules'));
    expect(detectRun(dir)?.command).toBe('pnpm dev');
  });

  it('uses npm run without a lockfile', () => {
    write(path.join(dir, 'package.json'), JSON.stringify({ scripts: { start: 'node .' } }));
    mkdirSync(path.join(dir, 'node_modules'));
    expect(detectRun(dir)?.command).toBe('npm run start');
  });

  it('falls back to Django, Makefile, Cargo, Go and a static site', () => {
    write(path.join(dir, 'index.html'), '<h1>hi</h1>');
    expect(detectRun(dir)?.source).toBe('static index.html');
    write(path.join(dir, 'go.mod'), 'module x');
    expect(detectRun(dir)?.command).toBe('go run .');
    write(path.join(dir, 'Cargo.toml'), '[package]');
    expect(detectRun(dir)?.command).toBe('cargo run');
    write(path.join(dir, 'Makefile'), 'build:\n\ttrue\nrun:\n\techo hi\n');
    expect(detectRun(dir)?.command).toBe('make run');
    write(path.join(dir, 'manage.py'), '');
    expect(detectRun(dir)?.command).toBe('python3 manage.py runserver');
  });

  it('returns null when it cannot tell', () => {
    write(path.join(dir, 'README.md'), '# notes');
    expect(detectRun(dir)).toBeNull();
  });
});

describe('findLocalUrl', () => {
  it('finds the first local address and shows 0.0.0.0 as localhost', () => {
    expect(findLocalUrl('  ➜  Local:   http://localhost:5173/\n')).toBe('http://localhost:5173/');
    expect(findLocalUrl('Serving on http://0.0.0.0:8000.')).toBe('http://localhost:8000');
    expect(findLocalUrl('see https://example.com')).toBeNull();
    expect(findLocalUrl('> vite --open http://localhost:1/\n')).toBeNull();
  });
});

describe('Run the app', () => {
  let d: TestDaemon;
  let cookie: string;
  const api = async (method: 'GET' | 'POST' | 'DELETE', url: string) => {
    const res = await d.app.inject({ method, url, headers: { host: HOST, cookie } });
    return { status: res.statusCode, body: res.json() as RunState };
  };
  const until = async (fn: () => boolean) => {
    const start = Date.now();
    while (!fn()) {
      if (Date.now() - start > 5000) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  beforeEach(async () => {
    d = await testDaemon();
    cookie = await d.login();
  });
  afterEach(() => d.cleanup());

  it('starts the dev script, finds its address, streams output and stops the whole tree', async () => {
    const dir = path.join(d.projectsDir, 'web');
    write(
      path.join(dir, 'server.js'),
      "console.log('\\u001b[32mready\\u001b[0m Local: http://localhost:4999/');\nsetInterval(() => {}, 1000);\n",
    );
    write(path.join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.js' } }));
    mkdirSync(path.join(dir, 'node_modules'));
    const events: ServerEvent[] = [];
    d.hub.listen((_t, e) => events.push(e));

    const idle = await api('GET', '/api/projects/web/run');
    expect(idle.body).toMatchObject({ command: `npm run dev`, running: false, url: null });

    const started = await api('POST', '/api/projects/web/run');
    expect(started.body.running).toBe(true);
    expect((await api('POST', '/api/projects/web/run')).status).toBe(409);

    await until(() => events.some((e) => e.type === 'run.state' && !!e.state.url));
    const now = await api('GET', '/api/projects/web/run');
    expect(now.body.url).toBe('http://localhost:4999/');
    expect(now.body.output).toContain('ready Local:'); // colour codes removed
    await until(() => events.some((e) => e.type === 'run.output' && e.text.includes('ready')));

    const stopped = await api('DELETE', '/api/projects/web/run');
    expect(stopped.body.running).toBe(false);
    expect(stopped.body.exitCode).not.toBeNull();
    expect(stopped.body.output).toContain('[stopped');
  });

  it('refuses to run a project it cannot run', async () => {
    write(path.join(d.projectsDir, 'notes', 'README.md'), '# notes');
    expect((await api('GET', '/api/projects/notes/run')).body.command).toBeNull();
    expect((await api('POST', '/api/projects/notes/run')).status).toBe(409);
  });
});
