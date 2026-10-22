import { execFileSync } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SourceControl } from '@cherry/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('Source Control and Auto commit', () => {
  let d: TestDaemon;
  let cookie: string;
  let dir: string;
  let script: Step[] = [];
  const log: FakeLog = { requests: [], permissions: [], decisions: [], calls: [] };
  const g = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
  const api = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const list = async (): Promise<SourceControl> =>
    (await api('GET', '/api/projects/site/source-control')).body;
  const paths = (l: { path: string }[]) => l.map((f) => f.path);

  beforeAll(async () => {
    d = await testDaemon({ runner: fakeRunner(() => script, log) });
    cookie = await d.login();
    dir = path.join(d.projectsDir, 'site');
    gitInit(dir);
    g('config', 'user.name', 'Syed Test');
    g('config', 'user.email', 'syed@example.com');
    write(path.join(dir, 'src', 'hero.ts'), 'export const hero = 1;\n');
    write(path.join(dir, 'old.ts'), 'old\n');
    write(path.join(dir, 'b.ts'), 'b\n');
    g('add', '-A');
    g('commit', '-q', '-m', 'feat: first');
    write(path.join(dir, 'src', 'hero.ts'), 'export const hero = 2;\n');
    write(path.join(dir, 'README.md'), '# Site\n');
    write(path.join(dir, '.env'), 'TOKEN=secret\n');
    rmSync(path.join(dir, 'old.ts'));
  });
  afterAll(() => d.cleanup());

  it('lists the changes, nothing staged, secret files hidden, Auto commit off', async () => {
    const l = await list();
    expect(l.author).toEqual({ name: 'Syed Test', email: 'syed@example.com' });
    expect(l.staged).toEqual([]);
    expect(paths(l.changes).sort()).toEqual(['README.md', 'old.ts', 'src/hero.ts']);
    expect(l.hidden).toEqual(['.env']);
    expect(l.autoCommit).toBe(false);
  });

  it('stages and unstages files; never a secret file', async () => {
    let r = await api('POST', '/api/projects/site/source-control/stage', {
      files: ['src/hero.ts', 'old.ts'],
    });
    expect(paths(r.body.staged).sort()).toEqual(['old.ts', 'src/hero.ts']);
    expect(paths(r.body.changes)).toEqual(['README.md']);
    r = await api('POST', '/api/projects/site/source-control/unstage', { files: ['old.ts'] });
    expect(paths(r.body.staged)).toEqual(['src/hero.ts']);
    expect(
      (await api('POST', '/api/projects/site/source-control/stage', { files: ['.env'] })).status,
    ).toBe(400);
    r = await api('POST', '/api/projects/site/source-control/stage', { all: true });
    expect(paths(r.body.staged).sort()).toEqual(['README.md', 'old.ts', 'src/hero.ts']);
    expect(r.body.hidden).toEqual(['.env']);
    expect(g('diff', '--cached', '--name-only')).not.toContain('.env');
    r = await api('POST', '/api/projects/site/source-control/unstage', { all: true });
    expect(r.body.staged).toEqual([]);
  });

  it('Write message asks Haiku about the staged diff only', async () => {
    expect((await api('POST', '/api/projects/site/source-control/message')).status).toBe(409);
    await api('POST', '/api/projects/site/source-control/stage', { files: ['src/hero.ts'] });
    script = [{ call: { name: 'commit_message', input: { message: 'fix(hero): show 2' } } }];
    const r = await api('POST', '/api/projects/site/source-control/message');
    expect(r.body).toEqual({ message: 'fix(hero): show 2' });
    const req = log.requests.at(-1)!;
    expect(req.model).toBe('haiku');
    expect(req.prompt).toContain('export const hero = 2;');
    expect(req.prompt).not.toContain('README.md');
    expect(req.prompt).not.toContain('TOKEN');
  });

  it('commits only what is staged, as the user, with no Claude trailer', async () => {
    const r = await api('POST', '/api/projects/site/commits', {
      message: 'fix(hero): show 2\n\nThe hero now shows two.',
    });
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('fix(hero): show 2');
    expect(g('log', '-1', '--format=%an|%s|%b').trim()).toBe(
      'Syed Test|fix(hero): show 2|The hero now shows two.',
    );
    expect(g('show', '--name-only', '--format=', 'HEAD').trim()).toBe('src/hero.ts');
    expect((await api('POST', '/api/projects/site/commits', { message: 'x' })).status).toBe(409);
  });

  it('refuses a commit with a secret file staged by hand', async () => {
    g('add', '-f', '.env');
    const r = await api('POST', '/api/projects/site/commits', { message: 'chore: env' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/\.env is a secret file/);
    g('rm', '--cached', '-q', '.env');
  });

  it('Auto commit: Claude gets commit_changes and commits its files as the user', async () => {
    const on = await api('PUT', '/api/projects/site/source-control/auto-commit', { on: true });
    expect(on.body).toEqual({ autoCommit: true });
    expect((await list()).autoCommit).toBe(true);
    renameSync(path.join(dir, 'b.ts'), path.join(dir, 'b2.ts'));
    script = [
      {
        call: {
          name: 'commit_changes',
          input: { message: 'docs: add the README', files: ['README.md'] },
        },
      },
      { call: { name: 'commit_changes', input: { message: 'chore: env', files: ['.env'] } } },
      { text: 'Committed the README.' },
    ];
    await api('POST', '/api/projects/site/chat', { text: 'add a readme' });
    const start = Date.now();
    while (d.chat.state('site').running) {
      if (Date.now() - start > 3000) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
    const req = log.requests.at(-1)!;
    expect(req.appendSystemPrompt).toMatch(/Auto commit is on/);
    expect(log.calls?.at(-2)).toMatchObject({ name: 'commit_changes', ok: true });
    expect(log.calls?.at(-1)).toMatchObject({
      name: 'commit_changes',
      ok: false,
      text: expect.stringMatching(/secret file/),
    });
    expect(g('log', '-1', '--format=%an|%s').trim()).toBe('Syed Test|docs: add the README');
    expect(g('log', '-1', '--format=%B')).not.toMatch(/Co-Authored-By/i);
    const row = d.chat.state('site').items.find((i) => i.kind === 'tool');
    expect(row).toMatchObject({ target: 'docs: add the README', status: 'ok' });

    await api('PUT', '/api/projects/site/source-control/auto-commit', { on: false });
    script = [{ text: 'ok' }];
    await api('POST', '/api/projects/site/chat', { text: 'hi' });
    while (d.chat.state('site').running) await new Promise((r) => setTimeout(r, 10));
    expect(log.requests.at(-1)!.appendSystemPrompt).not.toMatch(/Auto commit is on/);
  });
});
