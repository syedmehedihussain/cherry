import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunState, ServerEvent } from '@cherry/shared';
import { detectRun } from '../src/run/detect.ts';
import { findLocalUrl } from '../src/run/service.ts';
import { answersHttp, projectListeners } from '../src/run/listeners.ts';
import { HOST, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('detectRun', () => {
  let dir: string;
  beforeEach(() => {
    dir = tempDir('cherry-run-');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const pkg = (p: object) => write(path.join(dir, 'package.json'), JSON.stringify(p));

  it('prefers the dev script and the lockfile package manager, installing first if needed', () => {
    pkg({ scripts: { start: 'vite preview', dev: 'vite' } });
    write(path.join(dir, 'pnpm-lock.yaml'), '');
    expect(detectRun(dir)).toEqual({
      command: 'pnpm install && pnpm dev',
      source: 'package.json script "dev"',
    });
    mkdirSync(path.join(dir, 'node_modules'));
    expect(detectRun(dir)?.command).toBe('pnpm dev');
  });

  it('runs a plain node start script only when the package is a web server', () => {
    mkdirSync(path.join(dir, 'node_modules'));
    pkg({ scripts: { start: 'node index.js' } });
    expect(detectRun(dir)).toBeNull(); // a command-line tool
    pkg({ scripts: { start: 'node index.js' }, dependencies: { express: '^5' } });
    expect(detectRun(dir)?.command).toBe('npm run start');
  });

  it('builds before a preview', () => {
    mkdirSync(path.join(dir, 'node_modules'));
    pkg({ scripts: { build: 'vite build', preview: 'vite preview' } });
    expect(detectRun(dir)?.command).toBe('npm run build && npm run preview');
  });

  it('never runs install scripts, Makefiles or command-line programs', () => {
    pkg({ scripts: { dev: 'sh install.sh' } });
    write(path.join(dir, 'install.sh'), 'echo hi');
    write(path.join(dir, 'Makefile'), 'run:\n\techo hi\n');
    write(path.join(dir, 'Cargo.toml'), '[dependencies]\nclap = "4"');
    write(path.join(dir, 'go.mod'), 'module x');
    write(path.join(dir, 'main.py'), 'print(1)');
    expect(detectRun(dir)).toBeNull();
  });

  it('finds Python and compiled web servers and a static site', () => {
    write(path.join(dir, 'index.html'), '<h1>hi</h1>');
    expect(detectRun(dir)?.source).toBe('static index.html');
    write(path.join(dir, 'go.mod'), 'require github.com/gin-gonic/gin v1');
    expect(detectRun(dir)?.command).toBe('go run .');
    write(path.join(dir, 'Cargo.toml'), '[dependencies]\naxum = "0.7"');
    expect(detectRun(dir)?.command).toBe('cargo run');
    write(path.join(dir, 'app.py'), '');
    write(path.join(dir, 'requirements.txt'), 'Flask==3');
    expect(detectRun(dir)?.command).toBe('python3 -m flask --app app run --debug');
    write(path.join(dir, 'requirements.txt'), 'fastapi\nuvicorn');
    expect(detectRun(dir)?.command).toBe('python3 -m uvicorn app:app --reload');
    write(path.join(dir, 'manage.py'), '');
    expect(detectRun(dir)?.command).toBe('python3 manage.py runserver');
  });

  it('returns null when it cannot tell', () => {
    write(path.join(dir, 'README.md'), '# notes');
    expect(detectRun(dir)).toBeNull();
  });
});

describe.runIf(process.platform === 'linux')('projectListeners', () => {
  let dir: string;
  let child: ChildProcess | null = null;
  beforeEach(() => {
    dir = tempDir('cherry-listen-');
  });
  afterEach(() => {
    child?.kill();
    child = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds a web server started from the folder and checks it answers HTTP', async () => {
    child = spawn(
      process.execPath,
      [
        '-e',
        "require('http').createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', function () { console.log(this.address().port) })",
      ],
      { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const port = await new Promise<number>((resolve) =>
      child!.stdout!.once('data', (b: Buffer) => resolve(Number(b.toString().trim()))),
    );
    const found = projectListeners(dir);
    expect(found.map((l) => l.port)).toContain(port);
    expect(found.find((l) => l.port === port)?.pid).toBe(child.pid);
    expect(await answersHttp(port)).toBe(true);
    // Another folder sees nothing of it.
    expect(projectListeners(tempDir('cherry-other-')).map((l) => l.port)).not.toContain(port);
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
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'node server.js' }, dependencies: { express: '^5' } }),
    );
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
    expect(stopped.body.exitCode).toBeNull();
    expect(stopped.body.output).toContain('[stopped]');
  });

  it.runIf(process.platform === 'linux')(
    'lists a site already running from the folder that Cherry did not start',
    async () => {
      const dir = path.join(d.projectsDir, 'site');
      write(path.join(dir, 'README.md'), '# site');
      const child = spawn(
        process.execPath,
        [
          '-e',
          "require('http').createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', function () { console.log(this.address().port) })",
        ],
        { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      try {
        const port = await new Promise<number>((resolve) =>
          child.stdout!.once('data', (b: Buffer) => resolve(Number(b.toString().trim()))),
        );
        const state = (await api('GET', '/api/projects/site/run')).body;
        expect(state.command).toBeNull();
        expect(state.servers).toEqual([
          expect.objectContaining({ url: `http://localhost:${port}/`, port }),
        ]);
      } finally {
        child.kill();
      }
    },
  );

  it('refuses to run a project it cannot run', async () => {
    write(path.join(d.projectsDir, 'notes', 'README.md'), '# notes');
    expect((await api('GET', '/api/projects/notes/run')).body.command).toBeNull();
    expect((await api('POST', '/api/projects/notes/run')).status).toBe(409);
  });
});
