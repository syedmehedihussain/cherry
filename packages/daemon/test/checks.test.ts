import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Checks, DeployInfo } from '@cherry/shared';
import { detectChecks, summarize } from '../src/deploy/checks.ts';
import { detectTarget, repoName } from '../src/deploy/info.ts';
import { HOST, ORIGIN, gitInit, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('deployment cockpit (V3 r10)', () => {
  let dir: string;
  beforeEach(() => {
    dir = tempDir('cherry-deploy-');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('finds the checks from package.json and the package manager', () => {
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: { typecheck: 'tsc', lint: 'eslint .', test: 'vitest run', build: 'vite build' },
      }),
    );
    write(path.join(dir, 'pnpm-lock.yaml'), '');
    mkdirSync(path.join(dir, 'node_modules'));
    expect(detectChecks(dir).checks).toEqual([
      { id: 'typecheck', command: 'pnpm typecheck' },
      { id: 'lint', command: 'pnpm lint' },
      { id: 'test', command: 'pnpm test' },
      { id: 'build', command: 'pnpm build' },
      { id: 'audit', command: 'pnpm audit --prod --audit-level high' },
    ]);
  });

  it('skips the npm placeholder test and says why there is nothing', () => {
    write(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    );
    expect(detectChecks(dir)).toEqual({
      checks: [],
      none: expect.stringContaining('no typecheck'),
    });
    rmSync(path.join(dir, 'package.json'));
    expect(detectChecks(dir).none).toContain('No package.json');
  });

  it('reads one short fact from the output', () => {
    expect(summarize('test', true, ' Tests  7 passed (7)')).toBe('7 passed');
    expect(summarize('test', false, 'Tests  2 failed | 5 passed')).toBe('2 failed');
    expect(summarize('test', true, 'ℹ tests 19\nℹ pass 19\nℹ fail 0')).toBe('19 passed');
    expect(summarize('test', false, 'ℹ pass 17\nℹ fail 2')).toBe('2 failed');
    expect(summarize('build', true, 'dist/a.js  200.4 kB\ndist/b.css  14 kB')).toBe('214 KB');
    // npm echoes the script; its numbers do not count.
    expect(summarize('build', true, '> echo "x 214.0 kB"\nx 214.0 kB')).toBe('214 KB');
    expect(summarize('audit', true, 'found 0 vulnerabilities')).toBe('0 high');
    expect(summarize('lint', false, '✖ 3 problems (3 errors, 0 warnings)')).toBe(
      '3 problems'.replace('problems', 'errors'),
    );
    expect(summarize('typecheck', true, '')).toBeNull();
  });

  it('knows the deploy target from the files', () => {
    expect(detectTarget(dir).kind).toBe('release');
    write(path.join(dir, 'package.json'), JSON.stringify({ name: 'kit', version: '1.0.0' }));
    expect(detectTarget(dir).kind).toBe('npm');
    write(path.join(dir, 'vercel.json'), '{}');
    expect(detectTarget(dir).kind).toBe('vercel');
    write(path.join(dir, '.github', 'workflows', 'pages.yml'), 'uses: actions/deploy-pages@v4');
    expect(detectTarget(dir)).toMatchObject({
      kind: 'github-pages',
      source: 'workflow .github/workflows/pages.yml',
    });
    expect(repoName('git@github.com:me/runlog.git')).toBe('me/runlog');
    expect(repoName('https://github.com/me/runlog')).toBe('me/runlog');
    expect(repoName('https://gitlab.com/me/x')).toBeNull();
  });

  it('runs the checks on a click and reports pass and fail', async () => {
    const d: TestDaemon = await testDaemon();
    try {
      const cookie = await d.login();
      const core = path.join(d.projectsDir, 'core');
      write(
        path.join(core, 'package.json'),
        JSON.stringify({
          version: '0.1.0',
          scripts: { test: 'echo "Tests 3 passed"', build: 'echo broken && exit 2' },
        }),
      );
      gitInit(core);
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'tag', 'v0.1.0'], {
        cwd: core,
      });
      const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
        d.app.inject({ method, url, headers: { host: HOST, origin: ORIGIN, cookie }, payload });
      const before = (await call('GET', '/api/projects/core/checks')).json<Checks>();
      expect(before.checks.map((c) => [c.id, c.status])).toEqual([
        ['test', 'idle'],
        ['build', 'idle'],
      ]);
      await call('POST', '/api/projects/core/checks/run', {});
      let after: Checks = before;
      for (let i = 0; i < 100; i++) {
        after = (await call('GET', '/api/projects/core/checks')).json<Checks>();
        if (after.checks.every((c) => c.status !== 'running')) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(after.checks.map((c) => [c.id, c.status, c.summary])).toEqual([
        ['test', 'pass', '3 passed'],
        ['build', 'fail', 'failed'],
      ]);
      expect(after.checks[1]!.output).toContain('$ npm run build');
      expect(after.checks[1]!.output).toContain('broken');

      const info = (await call('GET', '/api/projects/core/deploy')).json<DeployInfo>();
      expect(info).toMatchObject({ version: '0.1.0', last: { tag: 'v0.1.0' } });
    } finally {
      await d.cleanup();
    }
  });
});
