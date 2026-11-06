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

  it('writes the note from the checklist, with no model call (ADR-0055)', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({ runner: fakeRunner([{ text: 'never' }], log) });
    tasks(path.join(d.projectsDir, 'core'));
    const res = await post({ from: 'plan', to: 'design' });
    expect(res.json()).toEqual({ note: 'Done: PRD.', by: 'cherry' });
    expect(log.requests).toEqual([]);
    expect((await post({ from: 'plan', to: 'issues' })).statusCode).toBe(400);
  });
});
