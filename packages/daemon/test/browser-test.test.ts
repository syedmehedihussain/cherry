import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserTest } from '@cherry/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { testPrompt } from '../src/deploy/browser-test.ts';
import { HOST, ORIGIN, testDaemon, write, type TestDaemon } from './helpers.ts';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SCRIPT: Step[] = [
  { tool: { name: 'mcp__claude-in-chrome__navigate', input: { url: 'http://localhost:5173' } } },
  {
    tool: { name: 'mcp__claude-in-chrome__computer', input: { action: 'screenshot' } },
    image: PNG,
  },
  { call: { name: 'test_step', input: { name: 'Home opens', ok: true } } },
  { tool: { name: 'Edit', input: { file_path: 'x.ts', old_string: 'a', new_string: 'b' } } },
  {
    call: {
      name: 'test_step',
      input: { name: 'Save a run', ok: false, detail: 'week shows 0 km' },
    },
  },
  {
    call: { name: 'test_done', input: { summary: '1 of 2 steps pass. Runs are lost on reload.' } },
  },
];

// V3 r11: the browser test walks the app in Chrome and records one row per step.
describe('browser test', () => {
  let d: TestDaemon;
  afterEach(async () => d?.cleanup());

  const until = async (f: () => Promise<boolean>) => {
    for (let i = 0; i < 100 && !(await f()); i++) await new Promise((r) => setTimeout(r, 20));
  };

  it('needs Chrome on, and only opens localhost', async () => {
    d = await testDaemon();
    const cookie = await d.login();
    const post = (url: string) =>
      d.app.inject({
        method: 'POST',
        url: '/api/projects/core/browser-test',
        headers: { host: HOST, origin: ORIGIN, cookie },
        payload: { url },
      });
    write(path.join(d.projectsDir, 'core', 'README.md'), '# core');
    expect((await post('http://localhost:5173')).json().error.message).toMatch(/Chrome is off/);
    d.config.update({ claude: { chrome: true } });
    expect((await post('https://example.com')).statusCode).toBe(400);
  });

  it('records steps with screenshots, never edits, and finishes with a summary', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({ runner: fakeRunner(SCRIPT, log) });
    const cookie = await d.login();
    const headers = { host: HOST, origin: ORIGIN, cookie };
    const core = path.join(d.projectsDir, 'core');
    write(path.join(core, 'x.ts'), 'a');
    write(path.join(core, 'docs', 'test-plan.md'), '# Test plan');
    d.config.update({ claude: { chrome: true } });
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/browser-test',
      headers,
      payload: { url: 'http://localhost:5173/' },
    });
    expect(res.statusCode).toBe(200);
    let test: BrowserTest = res.json();
    await until(async () => {
      test = (
        await d.app.inject({ method: 'GET', url: '/api/projects/core/browser-test', headers })
      ).json();
      return test.status !== 'running';
    });
    expect(test.status).toBe('done');
    expect(test.steps.map((s) => [s.name, s.ok, s.detail, s.shot])).toEqual([
      ['Home opens', true, '', '1.png'],
      ['Save a run', false, 'week shows 0 km', null],
    ]);
    expect(test.summary).toBe('1 of 2 steps pass. Runs are lost on reload.');
    expect(test.log.some((l) => l.includes('navigate'))).toBe(true);
    // Chrome ran without asking; the edit was refused and the file is the same.
    expect(log.requests[0]!.chrome).toBe(true);
    expect(log.requests[0]!.prompt).toContain('docs/test-plan.md');
    expect(readFileSync(path.join(core, 'x.ts'), 'utf8')).toBe('a');
    expect(existsSync(path.join(core, 'cherry', 'tests', test.id!, '1.png'))).toBe(true);
    const shot = await d.app.inject({
      method: 'GET',
      url: `/api/projects/core/browser-test/shot/${test.id}/1.png`,
      headers,
    });
    expect(shot.statusCode).toBe(200);
    expect(shot.headers['content-type']).toBe('image/png');
    const bad = await d.app.inject({
      method: 'GET',
      url: `/api/projects/core/browser-test/shot/${test.id}/..%2F..%2FREADME.md`,
      headers,
    });
    expect(bad.statusCode).toBe(404);
  });

  it('asks for the plan steps, or the main flow when there is no plan', () => {
    expect(testPrompt('http://localhost:3000', false)).toContain('There is no docs/test-plan.md');
  });
});
