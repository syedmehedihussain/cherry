import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Adr, ServerEvent } from '@cherry/shared';
import { listAdrs, parseAdr, setFields, slugOf, writeProposal } from '../src/adr/adr.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, gitInit, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

const CHERRY_ADRS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/adr');

const proposal = {
  title: 'Move storage to SQLite',
  context: 'Streaks live in a JSON file.\n\nIt is slow for big histories.',
  options: [
    { title: 'SQLite', tradeoff: 'A native dependency' },
    { title: 'Keep JSON', tradeoff: 'Slow' },
  ],
  proposal: 'We propose **SQLite** because queries get simple.',
  consequences: ['Good: fast reads', 'Follow-up: a migration'],
};

describe('ADR files', () => {
  it("reads Cherry's own ADRs: all decided, none pending", () => {
    const all = listAdrs(CHERRY_ADRS);
    expect(all.length).toBeGreaterThanOrEqual(25);
    expect(all.map((a) => a.adr.number)).toEqual(
      [...all.map((a) => a.adr.number)].sort((a, b) => b - a),
    );
    expect(all.some((a) => a.file === 'template.md')).toBe(false);
    for (const { adr } of all) expect(['done', 'pending']).toContain(adr.state);
    const rename = all.find((a) => a.adr.number === 14)!.adr;
    expect(rename.title).toMatch(/Rename Apeiron to Cherry/i);
    expect(rename.context.length).toBeGreaterThan(20);
  });

  it('maps the Status and Done lines to a state', () => {
    const adr = (head: string) =>
      parseAdr('0001-x.md', `# 0001 — X\n\n${head}\n\n## Context\n\nWhy.\n`).state;
    expect(adr('- **Status:** Proposed')).toBe('pending');
    expect(adr('- **Status:** Accepted\n- **Done:** not yet')).toBe('approved');
    expect(adr('- **Status:** Accepted\n- **Done:** 2026-10-15')).toBe('done');
    expect(adr('- **Status:** Accepted')).toBe('done');
    expect(adr('- **Status:** Superseded by 0014')).toBe('done');
    expect(adr('- **Status:** Rejected\n- **Rejected because:** no')).toBe('rejected');
  });

  it('writes a proposal with the next number and never replaces a file', () => {
    const dir = tempDir();
    write(path.join(dir, '0003-old.md'), '# 0003 — Old\n\n- **Status:** Accepted\n');
    write(path.join(dir, 'template.md'), '# NNNN — Title\n');
    const a = writeProposal(dir, proposal, 'Claude (chat)');
    expect(a).toEqual({ number: 4, file: '0004-move-storage-to-sqlite.md' });
    const parsed = parseAdr(a.file, readFileSync(path.join(dir, a.file), 'utf8'));
    expect(parsed).toMatchObject({
      number: 4,
      title: 'Move storage to SQLite',
      state: 'pending',
      proposedBy: 'Claude (chat)',
      context: 'Streaks live in a JSON file.',
      options: ['**SQLite** — Trade-off: A native dependency', '**Keep JSON** — Trade-off: Slow'],
    });
    expect(parsed.decision).toContain('We propose **SQLite**');
    expect(writeProposal(dir, proposal, 'Claude (chat)').number).toBe(5);
    expect(readFileSync(path.join(dir, '0003-old.md'), 'utf8')).toBe(
      '# 0003 — Old\n\n- **Status:** Accepted\n',
    );
  });

  it('changes only the header lines', () => {
    const text =
      '# 0002 — X\n\n- **Status:** Proposed\n- **Date:** 2026-10-15\n\n## Context\n\n- **Status:** in the body\n';
    const accepted = setFields(text, { Status: 'Accepted', Done: 'not yet' });
    expect(accepted).toBe(
      '# 0002 — X\n\n- **Status:** Accepted\n- **Date:** 2026-10-15\n- **Done:** not yet\n\n## Context\n\n- **Status:** in the body\n',
    );
    expect(
      setFields(accepted, { Status: 'Rejected', Done: null, 'Rejected because': 'Too big' }),
    ).toBe(
      '# 0002 — X\n\n- **Status:** Rejected\n- **Date:** 2026-10-15\n- **Rejected because:** Too big\n\n## Context\n\n- **Status:** in the body\n',
    );
  });

  it('makes a file-safe slug', () => {
    expect(slugOf('Rename Apeiron → Cherry!')).toBe('rename-apeiron-cherry');
    expect(slugOf('???')).toBe('decision');
  });
});

describe('decisions API', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: (prompt: string) => Step[];
  let events: ServerEvent[];
  const adrDir = () => path.join(d.projectsDir, 'core', 'docs', 'adr');

  const api = async (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const tasks = async (): Promise<{ id: string; title: string; status: string }[]> =>
    (await api('GET', '/api/projects/core/tasks')).body.tasks;
  const list = async (): Promise<Adr[]> =>
    (await api('GET', '/api/projects/core/decisions')).body.decisions;
  const idle = async () => {
    const start = Date.now();
    while (d.chat.state('core').running) {
      if (Date.now() - start > 3000) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const propose = async () => {
    script = () => [{ call: { name: 'propose_decision', input: proposal } }, { text: 'Proposed.' }];
    await api('POST', '/api/projects/core/chat', { text: 'switch to sqlite', mode: 'auto' });
    await idle();
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    events = [];
    script = () => [{ text: 'ok' }];
    d = await testDaemon({ runner: fakeRunner((req) => script(req.prompt), log) });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
    d.hub.listen((_t, e) => events.push(e));
  });
  afterEach(() => d.cleanup());

  it('Claude proposes; the ADR waits as Proposed and the chat goes on', async () => {
    await propose();
    expect(log.calls?.[0]).toMatchObject({ name: 'propose_decision', ok: true });
    expect(log.calls?.[0]?.text).toMatch(/ADR-0001.*Do not make this change until it is approved/);
    expect(readdirSync(adrDir())).toEqual(['0001-move-storage-to-sqlite.md']);
    const [adr] = await list();
    expect(adr).toMatchObject({
      number: 1,
      file: 'docs/adr/0001-move-storage-to-sqlite.md',
      state: 'pending',
      proposedBy: 'Claude (chat)',
      applying: null,
    });
    expect(events.some((e) => e.type === 'decisions.updated')).toBe(true);
    const row = d.chat.state('core').items.find((i) => i.kind === 'tool');
    expect(row).toMatchObject({
      tool: 'mcp__cherry__propose_decision',
      target: 'Move storage to SQLite',
      meta: 'ADR-0001',
      status: 'ok',
    });
    expect(log.requests[0]?.appendSystemPrompt).toMatch(/propose_decision/);
  });

  it('Approve only: Accepted, not done yet; Mark done sets the date', async () => {
    await propose();
    const r = await api('POST', '/api/projects/core/decisions/1/approve', { apply: 'none' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      decision: { state: 'approved', status: 'Accepted' },
      warning: null,
    });
    const file = readFileSync(path.join(adrDir(), '0001-move-storage-to-sqlite.md'), 'utf8');
    expect(file).toContain('- **Status:** Accepted\n');
    expect(file).toContain('- **Done:** not yet');
    expect((await api('POST', '/api/projects/core/decisions/1/approve')).status).toBe(409);
    const done = await api('POST', '/api/projects/core/decisions/1/done');
    expect(done.body.decision).toMatchObject({
      state: 'done',
      doneAt: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
    });
  });

  it('Approve and apply in chat: sends the change to the chat; decision_done closes it', async () => {
    await propose();
    script = (prompt) =>
      prompt.startsWith('Decision ADR-0001 was approved')
        ? [{ call: { name: 'decision_done', input: { adr: 1 } } }, { text: 'Switched.' }]
        : [{ text: 'ok' }];
    const r = await api('POST', '/api/projects/core/decisions/1/approve', { apply: 'chat' });
    expect(r.body.warning).toBeNull();
    await idle();
    expect(log.requests[1]?.prompt).toMatch(
      /Do not edit docs\/adr\/0001-move-storage-to-sqlite.md/,
    );
    // The chat's last mode (auto) is reused.
    expect(log.requests[1]?.appendSystemPrompt).toMatch(/auto mode/);
    expect((await list())[0]).toMatchObject({ state: 'done', applying: null });
  });

  it('Approve and start an agent: accepting its work marks the decision done', async () => {
    const dir = path.join(d.projectsDir, 'core');
    gitInit(dir);
    await propose();
    script = (prompt) =>
      prompt.startsWith('Decision ADR-0001')
        ? [
            {
              tool: { name: 'Write', input: { file_path: 'db.sql', content: 'create table x;\n' } },
            },
            { call: { name: 'decision_done', input: { adr: 1 } } },
            { text: 'Moved to SQLite. Tests pass.\nReady to merge' },
          ]
        : [{ text: 'ok' }];
    const r = await api('POST', '/api/projects/core/decisions/1/approve', { apply: 'agent' });
    expect(r.body.decision.applying).toMatchObject({ kind: 'agent' });
    const agentId = r.body.decision.applying.ref as string;
    const start = Date.now();
    while (d.agents.get(agentId).status !== 'done') {
      if (Date.now() - start > 5000) throw new Error('agent timed out');
      await new Promise((res) => setTimeout(res, 10));
    }
    expect(log.requests.at(-1)?.prompt).toMatch(/run its tests[\s\S]*Ready to merge/);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'notice',
        kind: 'agent.done',
        title: 'Ready to merge: ADR-0001 Move storage to SQLite',
      }),
    );
    // An agent can't close it: the change is only on its branch until accepted.
    expect(log.calls?.at(-1)).toMatchObject({ name: 'decision_done', ok: false });
    expect((await list())[0]?.state).toBe('approved');
    expect((await api('POST', `/api/agents/${agentId}/accept`)).status).toBe(200);
    expect((await list())[0]).toMatchObject({ state: 'done', applying: null });
  });

  it('Approve only adds a task; ticking the task marks the decision done, and back', async () => {
    await propose();
    await api('POST', '/api/projects/core/decisions/1/approve', { apply: 'none' });
    const [task] = await tasks();
    expect(task).toMatchObject({ title: 'Apply ADR-0001: Move storage to SQLite', status: 'todo' });
    const r = await api('PATCH', `/api/projects/core/tasks/${task!.id}`, { status: 'done' });
    expect(r.status).toBe(200);
    expect((await list())[0]?.state).toBe('done');

    // Mark done in Decisions ticks the task too.
    script = () => [
      { call: { name: 'propose_decision', input: { ...proposal, title: 'Add a cache' } } },
    ];
    await api('POST', '/api/projects/core/chat', { text: 'cache?' });
    await idle();
    await api('POST', '/api/projects/core/decisions/2/approve', { apply: 'none' });
    expect((await tasks())[1]).toMatchObject({
      title: 'Apply ADR-0002: Add a cache',
      status: 'todo',
    });
    await api('POST', '/api/projects/core/decisions/2/done');
    expect((await tasks())[1]?.status).toBe('done');
  });

  it('Reject removes the open task of an approved decision', async () => {
    await propose();
    await api('POST', '/api/projects/core/decisions/1/approve', { apply: 'none' });
    expect(await tasks()).toHaveLength(1);
    await api('POST', '/api/projects/core/decisions/1/reject', { reason: 'no' });
    expect(await tasks()).toEqual([]);
  });

  it('Approve in the chat while Claude is still replying: the change goes after the turn', async () => {
    script = (prompt) =>
      prompt.startsWith('Decision ADR-0001 was approved')
        ? [{ text: 'Applying now.' }]
        : [
            { call: { name: 'propose_decision', input: proposal } },
            { wait: 300 },
            { text: 'Proposed; carrying on.' },
          ];
    await api('POST', '/api/projects/core/chat', { text: 'switch to sqlite', mode: 'auto' });
    const start = Date.now();
    while (!(await list()).length) {
      if (Date.now() - start > 3000) throw new Error('no proposal');
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(d.chat.state('core').running).toBe(true);
    const r = await api('POST', '/api/projects/core/decisions/1/approve', { apply: 'chat' });
    expect(r.body.warning).toBeNull();
    await idle();
    await new Promise((res) => setTimeout(res, 20));
    await idle();
    expect(log.requests).toHaveLength(2);
    expect(log.requests[1]?.prompt).toMatch(/^Decision ADR-0001 was approved/);
  });

  it('decision_done is refused for a decision that is not approved', async () => {
    await propose();
    script = () => [{ call: { name: 'decision_done', input: { adr: 1 } } }];
    await api('POST', '/api/projects/core/chat', { text: 'done?' });
    await idle();
    expect(log.calls?.at(-1)).toMatchObject({
      ok: false,
      text: expect.stringMatching(/waiting for approval/),
    });
    expect((await list())[0]?.state).toBe('pending');
  });

  it('Reject keeps the file with the reason', async () => {
    await propose();
    const r = await api('POST', '/api/projects/core/decisions/1/reject', {
      reason: 'JSON is fine',
    });
    expect(r.body.decision).toMatchObject({ state: 'rejected', rejectedBecause: 'JSON is fine' });
    expect(readFileSync(path.join(adrDir(), '0001-move-storage-to-sqlite.md'), 'utf8')).toContain(
      '- **Rejected because:** JSON is fine',
    );
    expect((await api('POST', '/api/projects/core/decisions/1/done')).status).toBe(409);
  });

  it('refuses bad numbers and unknown projects', async () => {
    expect((await api('POST', '/api/projects/core/decisions/..%2F..%2Fx/approve')).status).toBe(
      400,
    );
    expect((await api('POST', '/api/projects/core/decisions/7/approve')).status).toBe(404);
    expect((await api('GET', '/api/projects/nope/decisions')).status).toBe(404);
    expect(await list()).toEqual([]);
    expect(existsSync(adrDir())).toBe(false);
  });
});
