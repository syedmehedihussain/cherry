import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { suggest } from '@cherry/shared';
import { jobHint } from '../src/chat/service.ts';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { missingChecks, requiredChecks, stageSpecialists } from '../src/stages/specialists.ts';
import { gitInit, HOST, ORIGIN, testDaemon, type TestDaemon } from './helpers.ts';

// ADR-0062: the crew works on its own; Cherry checks the required specialists before ready.
describe('crew', () => {
  let d: TestDaemon | null = null;
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  it('reads the required checks from AGENT.md', () => {
    expect(requiredChecks('design', {})).toEqual([{ any: ['a11y-architect'], done: false }]);
    expect(requiredChecks('development', { 'typescript-reviewer': 1 })).toEqual([
      { any: ['code-reviewer', 'typescript-reviewer', 'react-reviewer'], done: true },
    ]);
    expect(requiredChecks('plan', {})).toEqual([]);
    expect(missingChecks('testing', {})).toMatch(/needs security-reviewer/);
    expect(missingChecks('testing', { 'security-reviewer': 2 })).toBeNull();
  });

  it('suggests what fits the job by shared words, with no model call', () => {
    const dev = stageSpecialists('development');
    expect(
      suggest('The save button crashes, fix the bug test-first', dev, 2, 3).map((s) => s.name),
    ).toContain('tdd-guide');
    expect(suggest('Hello', dev)).toEqual([]);
    expect(jobHint('/nonexistent', 'development', '/compact')).toBe('');
    expect(
      jobHint('/nonexistent', 'testing', 'Run the end-to-end tests of the main flows'),
    ).toMatch(/^\n\n\[Cherry: for this job, look at .*e2e-runner/);
  });

  it('refuses stage_ready until the required specialist has run', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [], calls: [] };
    d = await testDaemon({
      runner: fakeRunner(
        (_req, n) =>
          n === 0
            ? [{ call: { name: 'stage_ready', input: {} } }, { text: 'Tried.' }]
            : [
                {
                  subagent: {
                    type: 'a11y-architect',
                    description: 'WCAG check',
                    steps: [{ name: 'Read', input: { file_path: 'design/tokens.css' } }],
                    output: 'All good.',
                  },
                },
                { call: { name: 'stage_ready', input: {} } },
                { text: 'Design is ready.' },
              ],
        log,
      ),
    });
    const dir = path.join(d.projectsDir, 'proj');
    gitInit(dir);
    const cookie = await d.login();
    const api = (method: 'GET' | 'POST', url: string, payload?: object) =>
      d!.app.inject({
        method,
        url,
        headers: { host: HOST, origin: ORIGIN, cookie },
        ...(payload ? { payload } : {}),
      });
    await api('POST', '/api/projects/proj/office', { kind: 'personal' });
    const file = path.join(dir, '_project', 'office.json');
    const office = JSON.parse(readFileSync(file, 'utf8'));
    office.cycles[0].stages.design.state = 'active';
    writeFileSync(file, JSON.stringify(office));
    const send = async (text: string) => {
      await api('POST', '/api/projects/proj/chat', { text, stage: 'design' });
      const start = Date.now();
      while (d!.chat.state('proj', 'design').running && Date.now() - start < 3000)
        await new Promise((r) => setTimeout(r, 10));
    };

    await send('Draw the screens');
    expect(log.calls?.[0]).toMatchObject({ name: 'stage_ready', ok: false });
    expect(log.calls?.[0]?.text).toMatch(/needs a11y-architect/);
    expect((await api('GET', '/api/projects/proj/crew?stage=design')).json()).toEqual({
      runs: {},
      checks: [{ any: ['a11y-architect'], done: false }],
    });

    await send('Check accessibility, then say it is ready');
    expect(log.calls?.[1]).toMatchObject({ name: 'stage_ready', ok: true });
    expect((await api('GET', '/api/projects/proj/crew?stage=design')).json()).toEqual({
      runs: { 'a11y-architect': 1 },
      checks: [{ any: ['a11y-architect'], done: true }],
    });
    // The system prompt tells the agent to use its crew on its own.
    expect(log.requests[0]!.appendSystemPrompt).toMatch(/use them on your own/);
  });
});
