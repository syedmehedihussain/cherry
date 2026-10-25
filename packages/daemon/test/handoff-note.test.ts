import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { HOST, ORIGIN, testDaemon, write, type TestDaemon } from './helpers.ts';

// V3 r12: a short note from one stage to the next, written by Haiku on the user's move.
describe('stage handoff note', () => {
  let d: TestDaemon;
  afterEach(async () => d?.cleanup());

  const post = async (body: object) => {
    const cookie = await d.login();
    return d.app.inject({
      method: 'POST',
      url: '/api/projects/core/stages/handoff',
      headers: { host: HOST, origin: ORIGIN, cookie },
      payload: body,
    });
  };
  const tasks = (dir: string) =>
    write(
      path.join(dir, '_project', 'tasks.json'),
      JSON.stringify({
        schema: 1,
        tasks: [
          { id: 'p1', phase: 'plan', title: 'PRD', status: 'done', dependsOn: [] },
          { id: 'p2', phase: 'plan', title: 'Test plan', status: 'todo', dependsOn: [] },
        ],
      }),
    );

  it('runs on Haiku with a small prompt and returns its note', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({
      runner: fakeRunner(
        [
          {
            call: {
              name: 'handoff_note',
              input: { note: 'Plan wrote `docs/prd.md`. The test plan is open.' },
            },
          },
        ],
        log,
      ),
    });
    tasks(path.join(d.projectsDir, 'core'));
    const res = await post({ from: 'plan', to: 'design' });
    expect(res.json()).toEqual({
      note: 'Plan wrote `docs/prd.md`. The test plan is open.',
      by: 'haiku',
    });
    expect(log.requests[0]!.model).toBe('haiku');
    expect(log.requests[0]!.allowedTools).toEqual([]);
    expect(log.requests[0]!.prompt).toContain('- [x] PRD');
    expect(log.requests[0]!.prompt.length).toBeLessThan(6000);
  });

  it('falls back to the checklist when Haiku does not answer', async () => {
    d = await testDaemon({ runner: fakeRunner([{ text: 'no tool' }]) });
    tasks(path.join(d.projectsDir, 'core'));
    const res = await post({ from: 'plan', to: 'design' });
    expect(res.json()).toEqual({ note: 'Done: PRD.', by: 'cherry' });
    expect((await post({ from: 'plan', to: 'issues' })).statusCode).toBe(400);
  });
});
