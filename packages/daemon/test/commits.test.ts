import { execFileSync } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CommitPlan } from '@cherry/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('Ready to commit', () => {
  let d: TestDaemon;
  let cookie: string;
  let dir: string;
  let script: Step[] = [];
  const log: FakeLog = { requests: [], permissions: [], decisions: [] };
  const g = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };

  beforeAll(async () => {
    d = await testDaemon({ runner: fakeRunner(() => script, log) });
    cookie = await d.login();
    dir = path.join(d.projectsDir, 'site');
    gitInit(dir);
    g('config', 'user.name', 'Syed Test');
    g('config', 'user.email', 'syed@example.com');
    write(path.join(dir, 'src', 'hero.ts'), 'export const hero = 1;\n');
    write(path.join(dir, 'old.ts'), 'old\n');
    g('add', '-A');
    g('commit', '-q', '-m', 'feat: first');
    write(path.join(dir, 'src', 'hero.ts'), 'export const hero = 2;\n');
    write(path.join(dir, 'README.md'), '# Site\n');
    write(path.join(dir, '.env'), 'TOKEN=secret\n');
    rmSync(path.join(dir, 'old.ts'));
  });
  afterAll(() => d.cleanup());

  it('groups the changes with Claude, without secret files', async () => {
    script = [
      {
        call: {
          name: 'propose_commits',
          input: {
            commits: [
              {
                message: 'fix(hero): bump the hero value',
                explanation: 'This commit changes the hero value. The page shows the new value.',
                files: ['src/hero.ts'],
              },
              {
                message: 'docs: add a README',
                explanation: 'This adds a README.',
                files: ['README.md'],
              },
            ],
          },
        },
      },
    ];
    // Opening the view is free: one group, no Claude request.
    const before = log.requests.length;
    const free = (await api('GET', '/api/projects/site/commits/plan')).body as CommitPlan;
    expect(log.requests.length).toBe(before);
    expect(free.grouped).toBe(false);
    expect(free.commits).toHaveLength(1);
    expect(free.commits[0]!.files.sort()).toEqual(['README.md', 'old.ts', 'src/hero.ts']);

    // Group with Claude.
    const r = await api('GET', '/api/projects/site/commits/plan?refresh=1');
    expect(r.status).toBe(200);
    const plan = r.body as CommitPlan;
    expect(plan.grouped).toBe(true);
    expect(plan.author).toEqual({ name: 'Syed Test', email: 'syed@example.com' });
    expect(plan.hidden).toEqual(['.env']);
    expect(plan.commits.map((c) => [c.message, c.files])).toEqual([
      ['fix(hero): bump the hero value', ['src/hero.ts']],
      ['docs: add a README', ['README.md']],
      ['chore: other changes', ['old.ts']],
    ]);
    expect(log.requests.at(-1)?.prompt).not.toContain('TOKEN=secret');
    expect(log.requests.at(-1)?.model).toBe('haiku');
  });

  it('reuses the plan while nothing changed', async () => {
    const before = log.requests.length;
    await api('GET', '/api/projects/site/commits/plan');
    expect(log.requests.length).toBe(before);
  });

  it('commits exactly those files, as the user, with no Claude trailer', async () => {
    const r = await api('POST', '/api/projects/site/commits', {
      message: 'fix(hero): bump the hero value\n\nThe hero shows 2.',
      files: ['src/hero.ts'],
    });
    expect(r.status).toBe(200);
    expect(g('log', '-1', '--format=%an <%ae>%n%B').trim()).toBe(
      'Syed Test <syed@example.com>\nfix(hero): bump the hero value\n\nThe hero shows 2.',
    );
    expect(g('show', '--name-only', '--format=', 'HEAD').trim()).toBe('src/hero.ts');
    const plan = (await api('GET', '/api/projects/site/commits/plan')).body as CommitPlan;
    expect(plan.commits.map((c) => c.message)).toEqual([
      'docs: add a README',
      'chore: other changes',
    ]);
  });

  it('commits a deleted file and a rename', async () => {
    renameSync(path.join(dir, 'README.md'), path.join(dir, 'INTRO.md'));
    const r = await api('POST', '/api/projects/site/commits', {
      message: 'chore: remove old.ts',
      files: ['old.ts'],
    });
    expect(r.status).toBe(200);
    expect(g('show', '--name-status', '--format=', 'HEAD').trim()).toBe('D\told.ts');
  });

  it('refuses secret files and files without changes', async () => {
    expect(
      (await api('POST', '/api/projects/site/commits', { message: 'x', files: ['.env'] })).status,
    ).toBe(400);
    expect(
      (await api('POST', '/api/projects/site/commits', { message: 'x', files: ['src/hero.ts'] }))
        .status,
    ).toBe(409);
  });
});
