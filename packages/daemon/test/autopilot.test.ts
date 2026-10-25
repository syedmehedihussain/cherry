import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AutopilotState, ChatItem } from '@cherry/shared';
import { nextMilestone } from '../src/autopilot/service.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, ORIGIN, gitInit, testDaemon, write, type TestDaemon } from './helpers.ts';

const ROADMAP =
  '# Roadmap\n\n## M1 — Log a run\n\n- [x] Set up\n- [ ] Add the db module\n- [ ] Save runs\n\n## M2 — Week\n\n- [ ] Week view\n';

/** Magnet and the Builder, told apart by their prompts. */
function script(req: { prompt: string }): Step[] {
  const p = req.prompt;
  if (p.includes('The job:'))
    return [
      {
        call: {
          name: 'say',
          input: { text: 'Yes, sir. M1 has 2 tasks left. I report when it is done.' },
        },
      },
      { call: { name: 'plan_tasks', input: { total: 2 } } },
      {
        call: {
          name: 'order',
          input: { text: 'Task 1: add the db module. Run the tests.', task: 'Add the db module' },
        },
      },
    ];
  if (p.startsWith('Task 1:')) return [{ text: 'Added the db module. Tests 3 passed.' }];
  if (p.includes('Added the db module'))
    return [
      {
        call: {
          name: 'task_result',
          input: { title: 'Add the db module', status: 'done', tests: 'pass' },
        },
      },
      {
        call: {
          name: 'decide',
          input: {
            title: 'Week starts on Monday',
            context: 'The PRD does not say which day a week starts.',
            decision: 'Weeks start on Monday.',
            reason: 'ISO 8601. The PRD does not say.',
          },
        },
      },
      {
        call: {
          name: 'order',
          input: { text: 'Task 2: save runs and list them by week.', task: 'Save runs' },
        },
      },
    ];
  if (p.startsWith('Task 2:'))
    return [
      { tool: { name: 'Bash', input: { command: 'git push origin main' } } },
      { text: 'Saved runs. Tests 5 passed. The push was refused.' },
    ];
  if (p.includes('Saved runs'))
    return [
      {
        call: { name: 'task_result', input: { title: 'Save runs', status: 'done', tests: 'pass' } },
      },
      {
        call: {
          name: 'land',
          input: {
            result: ['2 of 2 tasks are complete.', 'All tests pass.'],
            next: 'Open Deployment. Run the browser test.',
          },
        },
      },
    ];
  if (p.startsWith('Loop:')) return [{ text: 'ok' }];
  if (p.includes('again')) return [{ call: { name: 'order', input: { text: 'Loop: do it.' } } }];
  return [{ text: 'no script' }];
}

describe('Autopilot (ADR-0046)', () => {
  let d: TestDaemon;
  afterEach(async () => d?.cleanup());

  async function setUp(fn = script) {
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({ runner: fakeRunner((req) => fn(req), log) });
    const cookie = await d.login();
    const core = path.join(d.projectsDir, 'core');
    write(path.join(core, 'docs', 'roadmap.md'), ROADMAP);
    gitInit(core);
    const call = (url: string, payload: object) =>
      d.app.inject({
        method: 'POST',
        url,
        headers: { host: HOST, origin: ORIGIN, cookie },
        payload,
      });
    return { log, core, call };
  }

  const until = async (f: () => boolean) => {
    for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 20));
  };

  it('finds the next milestone in the roadmap', () => {
    expect(nextMilestone(ROADMAP)).toEqual({ name: 'M1', left: 2 });
    expect(nextMilestone('# none')).toBeNull();
  });

  it('asks first and runs nothing until the user answers', async () => {
    const { log, call } = await setUp();
    const asked = (
      await call('/api/projects/core/autopilot/ask', { stage: 'development' })
    ).json<AutopilotState>();
    expect(asked.status).toBe('asking');
    expect(asked.suggestions[0]).toBe('Finish M1 · 2 tasks left');
    expect(log.requests).toHaveLength(0);
    const deploy = await call('/api/projects/core/autopilot/ask', { stage: 'deployment' });
    expect(deploy.statusCode).toBe(400);
  });

  it('flies a job: orders, a decision as an ADR, a push left for the user, a report', async () => {
    const { log, core, call } = await setUp();
    await call('/api/projects/core/autopilot/ask', { stage: 'development' });
    const res = await call('/api/projects/core/autopilot/start', {
      stage: 'development',
      goal: 'Finish M1',
    });
    expect(res.statusCode).toBe(200);
    await until(() => d.autopilot.get('core', 'development').status === 'done');
    const s = d.autopilot.get('core', 'development');
    expect(s.status).toBe('done');
    expect(s.orders).toBe(2);
    expect(s.total).toBe(2);
    expect(s.tasks.map((t) => [t.title, t.status])).toEqual([
      ['Add the db module', 'done'],
      ['Save runs', 'done'],
    ]);
    expect(s.events[0]).toMatchObject({
      kind: 'status',
      text: 'Yes, sir. M1 has 2 tasks left. I report when it is done.',
    });
    expect(s.needsYou).toEqual(['Push: git push origin main']);
    expect(s.report).toMatchObject({
      headline: 'Welcome back, sir. Finish M1 is complete.',
      result: ['2 of 2 tasks are complete.', 'All tests pass.'],
      next: 'Open Deployment. Run the browser test.',
    });

    // The decision is an ADR, Accepted, decided by Magnet, for review.
    expect(s.decisions).toEqual([
      {
        adr: 1,
        title: 'Week starts on Monday',
        reason: 'ISO 8601. The PRD does not say.',
        review: 'open',
      },
    ]);
    const adrFile = readdirSync(path.join(core, 'docs', 'adr'))[0]!;
    const adr = readFileSync(path.join(core, 'docs', 'adr', adrFile), 'utf8');
    expect(adr).toContain('- **Status:** Accepted');
    expect(adr).toContain('- **Decided by:** Magnet (Autopilot), for review');

    // Magnet's orders are in the chat, marked as Magnet's; the Builder ran in Auto.
    const users = d.chat
      .state('core', 'development')
      .items.filter((i): i is Extract<ChatItem, { kind: 'user' }> => i.kind === 'user');
    expect(users.map((u) => [u.by, u.role])).toEqual([
      ['magnet', 'order'],
      ['magnet', 'order'],
    ]);
    // Magnet never edits; it runs on the default model.
    const magnet = log.requests.filter((r) => r.appendSystemPrompt.includes('You are Magnet'));
    expect(magnet.every((r) => r.disallowedTools?.includes('Edit'))).toBe(true);

    const reviewed = (
      await call('/api/projects/core/autopilot/review', {
        stage: 'development',
        adr: 1,
        review: 'kept',
      })
    ).json<AutopilotState>();
    expect(reviewed.decisions[0]!.review).toBe('kept');
  });

  it('stops when Magnet gives the same order twice', async () => {
    const { call } = await setUp((req) =>
      req.prompt.includes('The job:') || req.prompt.includes('finished the turn')
        ? [{ call: { name: 'order', input: { text: 'Loop: do it.' } } }]
        : [{ text: 'ok' }],
    );
    await call('/api/projects/core/autopilot/ask', { stage: 'development' });
    await call('/api/projects/core/autopilot/start', { stage: 'development', goal: 'Loop' });
    await until(() => d.autopilot.get('core', 'development').status === 'failed');
    const s = d.autopilot.get('core', 'development');
    expect(s.status).toBe('failed');
    expect(s.error).toMatch(/same order twice/);
    expect(s.orders).toBe(1);
  });
});
