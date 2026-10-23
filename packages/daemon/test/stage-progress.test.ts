import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTasks } from '../src/projects/standard.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

// V2.1 w5: the stage agent keeps its checklist, which is the Overview's progress bar.
describe('Stage checklist and phase', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: Step[];
  const dir = () => path.join(d.projectsDir, 'core');
  const tasks = () =>
    JSON.parse(readFileSync(path.join(dir(), '_project', 'tasks.json'), 'utf8')) as {
      tasks: { id: string; phase: string; title: string; status: string }[];
    };
  const api = async (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const idle = async (stage: 'plan' | 'issues' | 'development') => {
    const start = Date.now();
    while (d.chat.state('core', stage).running) {
      if (Date.now() - start > 3000) throw new Error('still running');
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    script = [];
    d = await testDaemon({ runner: fakeRunner(() => script, log) });
    cookie = await d.login();
    write(
      path.join(dir(), '_project', 'project.json'),
      JSON.stringify({ schema: 1, name: 'core', phase: 'plan' }),
    );
    write(path.join(dir(), '_project', 'tasks.json'), JSON.stringify(buildTasks('plan')));
  });
  afterEach(() => d.cleanup());

  it('lets the Plan agent read, add, finish and drop its items without asking', async () => {
    script = [
      { call: { name: 'stage_checklist', input: {} } },
      {
        call: {
          name: 'stage_checklist',
          input: { add: ['Pricing model'], done: ['t1', 't2'], drop: ['t5', 't99'] },
        },
      },
      { text: 'Updated.' },
    ];
    await api('POST', '/api/projects/core/chat', { text: 'plan', stage: 'plan' });
    await idle('plan');
    expect(log.calls?.[0]?.text).toMatch(/^Plan checklist, 0\/6 finished:\nt1 \[todo\] Problem/);
    expect(log.calls?.[1]?.text).toMatch(/Plan checklist, 3\/7 finished/);
    expect(log.calls?.[1]?.text).toMatch(/Not in this checklist \(ignored\): t99/);
    const plan = tasks().tasks.filter((t) => t.phase === 'plan');
    expect(plan.map((t) => t.status)).toEqual([
      'done',
      'done',
      'todo',
      'todo',
      'skipped',
      'todo',
      'todo',
    ]);
    expect(plan.at(-1)?.title).toBe('Pricing model');
    expect(log.permissions).toEqual([]);
    expect(log.requests[0]?.appendSystemPrompt).toMatch(/Plan checklist \(the stage_checklist/);
  });

  it('only touches its own stage, and Issues has no checklist', async () => {
    script = [{ call: { name: 'stage_checklist', input: { done: ['t7'] } } }];
    await api('POST', '/api/projects/core/chat', { text: 'plan', stage: 'plan' });
    await idle('plan');
    // t7 is a Design item.
    expect(tasks().tasks.find((t) => t.id === 't7')?.status).toBe('todo');
    script = [{ text: 'ok' }];
    await api('POST', '/api/projects/core/chat', { text: 'triage', stage: 'issues' });
    await idle('issues');
    expect(log.requests[1]?.extraTools?.map((t) => t.name)).not.toContain('stage_checklist');
  });

  it('moves the project to the next stage', async () => {
    expect((await api('PATCH', '/api/projects/core/phase', { phase: 'design' })).body).toEqual({
      ok: true,
      phase: 'design',
    });
    const pj = JSON.parse(readFileSync(path.join(dir(), '_project', 'project.json'), 'utf8'));
    expect(pj).toMatchObject({ name: 'core', phase: 'design' });
    expect((await api('PATCH', '/api/projects/core/phase', { phase: 'nope' })).status).toBe(400);
  });

  // ADR-0041: the Planner proposes; Approve plan makes the tasks and starts the Builder.
  it('Approve plan adds Development tasks, moves the phase and starts the Builder in Auto', async () => {
    write(path.join(dir(), 'docs', 'specs', 'offline.md'), '# Offline\n');
    script = [
      {
        call: {
          name: 'propose_plan',
          input: { title: 'Offline', spec: 'docs/nope.md', tasks: ['x'] },
        },
      },
      {
        call: {
          name: 'propose_plan',
          input: {
            title: 'Offline mode',
            summary: 'Works without a network.',
            spec: 'docs/specs/offline.md',
            tasks: ['Cache the data', 'Sync on reconnect'],
          },
        },
      },
      { text: 'Here is the plan.' },
    ];
    await api('POST', '/api/projects/core/chat', { text: 'plan offline', stage: 'plan' });
    await idle('plan');
    expect(log.calls?.[0]).toMatchObject({
      ok: false,
      text: expect.stringMatching(/does not exist/),
    });
    const chat = await api('GET', '/api/projects/core/chat?stage=plan');
    const plan = chat.body.items.find((i: { kind: string }) => i.kind === 'plan');
    expect(plan).toMatchObject({
      title: 'Offline mode',
      spec: 'docs/specs/offline.md',
      status: 'open',
    });

    script = [{ text: 'Building.' }];
    const r = await api('POST', `/api/projects/core/chat/plans/${plan.id}/approve`);
    expect(r.body.taskIds).toEqual(['t22', 't23']);
    await idle('development');
    const dev = tasks()
      .tasks.filter((t) => t.phase === 'development')
      .slice(-2);
    expect(dev.map((t) => [t.id, t.title, t.status])).toEqual([
      ['t22', 'Cache the data', 'todo'],
      ['t23', 'Sync on reconnect', 'todo'],
    ]);
    expect(
      tasks()
        .tasks.filter((t) => t.phase === 'plan')
        .every((t) => t.status === 'done'),
    ).toBe(true);
    const pj = JSON.parse(readFileSync(path.join(dir(), '_project', 'project.json'), 'utf8'));
    expect(pj.phase).toBe('development');
    const start = log.requests.at(-1)!;
    expect(start.prompt).toBe(
      'Build the approved plan "Offline mode" in docs/specs/offline.md. Work through the Development checklist items t22 to t23 in order: build each one, test it, and mark it done with stage_checklist before the next. Ask me only for real choices.',
    );
    expect(start.appendSystemPrompt).toMatch(/auto mode/);
    // Approved once: a second click is refused.
    expect((await api('POST', `/api/projects/core/chat/plans/${plan.id}/approve`)).status).toBe(
      409,
    );
  });

  it('Keep planning closes the card without changes', async () => {
    script = [{ call: { name: 'propose_plan', input: { title: 'X', tasks: ['a'] } } }];
    await api('POST', '/api/projects/core/chat', { text: 'plan', stage: 'plan' });
    await idle('plan');
    const chat = await api('GET', '/api/projects/core/chat?stage=plan');
    const plan = chat.body.items.find((i: { kind: string }) => i.kind === 'plan');
    await api('POST', `/api/projects/core/chat/plans/${plan.id}/dismiss`);
    const after = await api('GET', '/api/projects/core/chat?stage=plan');
    expect(after.body.items.find((i: { kind: string }) => i.kind === 'plan').status).toBe(
      'dismissed',
    );
    expect(tasks().tasks.filter((t) => t.phase === 'development')).toHaveLength(3);
  });
});
