import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { gitInit, HOST, ORIGIN, testDaemon, type TestDaemon } from './helpers.ts';

describe('the office (V4, ADR-0052, ADR-0054)', () => {
  let d: TestDaemon | null = null;
  let cookie = '';
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  const start = async () => {
    d = await testDaemon();
    gitInit(path.join(d.projectsDir, 'proj'));
    cookie = await d.login();
  };
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
    d!.app.inject({
      method,
      url: `/api/projects/proj/office${url}`,
      headers: { host: HOST, origin: ORIGIN, cookie },
      ...(body === undefined ? {} : { payload: body as object }),
    });
  const ok = async (method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const res = await call(method, url, body);
    expect(res.statusCode, res.body).toBe(200);
    return res.json().office;
  };
  const err = async (method: 'POST', url: string, body: unknown, status: number) => {
    const res = await call(method, url, body);
    expect(res.statusCode, res.body).toBe(status);
    return res.json().error.message as string;
  };
  const stages = (office: { cycles: { stages: Record<string, { state: string }> }[] }) =>
    Object.fromEntries(Object.entries(office.cycles.at(-1)!.stages).map(([k, v]) => [k, v.state]));

  it('starts with only Idea open, in _project/office.json, kept out of git', async () => {
    await start();
    expect((await call('GET', '')).json()).toEqual({ office: null });
    const o = await ok('POST', '', {
      kind: 'client',
      client: { name: 'Fitness Master Gym', contact: 'Nusrat Jahan' },
    });
    expect(stages(o)).toEqual({
      idea: 'active',
      requirements: 'locked',
      plan: 'locked',
      design: 'locked',
      development: 'locked',
      testing: 'locked',
      deployment: 'locked',
    });
    const dir = path.join(d!.projectsDir, 'proj');
    const file = path.join(dir, '_project', 'office.json');
    expect(JSON.parse(readFileSync(file, 'utf8')).client.name).toBe('Fitness Master Gym');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8')).toContain('_project/');
    expect(await err('POST', '', { kind: 'personal' }, 409)).toMatch(/already has an office/);
  });

  it('signs off in order: ready first, client approval or internal, then the next stage opens', async () => {
    await start();
    await ok('POST', '', { kind: 'client', client: { name: 'Gym' } });
    expect(await err('POST', '/stages/idea/sign-off', { by: 'Nusrat' }, 409)).toMatch(
      /not said Idea is ready/,
    );
    expect(await err('POST', '/stages/plan/ready', { ready: true }, 409)).toMatch(/not open/);
    await ok('POST', '/stages/idea/ready', { ready: true });
    expect(await err('POST', '/stages/idea/sign-off', {}, 400)).toMatch(/Who approved/);

    let o = await ok('POST', '/stages/idea/send');
    expect(stages(o).idea).toBe('waiting');
    o = await ok('POST', '/stages/idea/sign-off', {
      by: 'Nusrat',
      date: '2026-11-06',
      notes: 'ok',
    });
    expect(stages(o)).toMatchObject({ idea: 'signed', requirements: 'active', plan: 'locked' });
    expect(o.cycles[0].stages.idea.signOffs[0]).toMatchObject({ by: 'Nusrat', internal: false });

    await ok('POST', '/stages/requirements/ready', { ready: true });
    o = await ok('POST', '/stages/requirements/sign-off', { internal: true });
    expect(o.cycles[0].stages.requirements.signOffs[0]).toMatchObject({
      by: 'you',
      internal: true,
    });
    expect(stages(o).plan).toBe('active');
  });

  it('holds Development until the prototype is approved, and goes Live after Deployment', async () => {
    await start();
    await ok('POST', '', { kind: 'client', client: { name: 'Gym' } });
    for (const s of ['idea', 'requirements', 'plan', 'design']) {
      await ok('POST', `/stages/${s}/ready`, { ready: true });
      await ok('POST', `/stages/${s}/sign-off`, { internal: true });
    }
    await ok('POST', '/stages/development/ready', { ready: true });
    expect(await err('POST', '/stages/development/sign-off', { internal: true }, 409)).toMatch(
      /prototype/,
    );
    expect(await err('POST', '/dev-gate', { gate: 'approved' }, 409)).toMatch(/build to approved/);
    await ok('POST', '/dev-gate', { gate: 'sent' });
    await ok('POST', '/dev-gate', { gate: 'approved' });
    for (const s of ['development', 'testing', 'deployment']) {
      if (s !== 'development') await ok('POST', `/stages/${s}/ready`, { ready: true });
      await ok('POST', `/stages/${s}/sign-off`, { internal: true });
    }
    const o = (await call('GET', '')).json().office;
    expect(o.cycles[0].liveAt).toEqual(expect.any(String));

    const v2 = await ok('POST', '/versions', { version: '2.0', title: 'Class booking' });
    expect(v2.cycles).toHaveLength(2);
    expect(stages(v2)).toMatchObject({ idea: 'carried', requirements: 'active', plan: 'locked' });
    expect(await err('POST', '/versions', { version: '3.0', title: 'x' }, 409)).toMatch(
      /2.0 is not live/,
    );
  });

  it('logs small changes; an approved big change flags the signed-off stages until they are signed again', async () => {
    await start();
    await ok('POST', '', { kind: 'client', client: { name: 'Gym' } });
    for (const s of ['idea', 'requirements']) {
      await ok('POST', `/stages/${s}/ready`, { ready: true });
      await ok('POST', `/stages/${s}/sign-off`, { internal: true });
    }
    let o = await ok('POST', '/changes', {
      kind: 'small',
      stage: 'idea',
      text: 'Rename package to plan.',
    });
    expect(o.changelog[0]).toMatchObject({ stage: 'idea', text: 'Rename package to plan.' });

    o = await ok('POST', '/changes', {
      kind: 'big',
      title: 'Family memberships',
      text: 'One account pays for up to 4 members.',
      stages: ['requirements', 'plan', 'design'],
    });
    expect(o.changes[0]).toMatchObject({ id: 'CR-001', status: 'proposed' });
    o = await ok('POST', '/changes/CR-001/approve');
    // Only signed-off stages are flagged; Plan is open and Design is locked.
    expect(stages(o)).toMatchObject({
      idea: 'signed',
      requirements: 'update',
      plan: 'active',
      design: 'locked',
    });
    expect(await err('POST', '/changes/CR-001/reject', undefined, 409)).toMatch(/already approved/);

    expect(await err('POST', '/stages/requirements/sign-off', { internal: true }, 409)).toMatch(
      /not said/,
    );
    await ok('POST', '/stages/requirements/ready', { ready: true });
    o = await ok('POST', '/stages/requirements/sign-off', { by: 'Nusrat' });
    expect(stages(o)).toMatchObject({ requirements: 'signed', plan: 'active' });
    expect(o.cycles[0].stages.requirements.signOffs).toHaveLength(2);
  });

  it('personal projects: no client, no waiting, the user signs off', async () => {
    await start();
    let o = await ok('POST', '', { kind: 'personal' });
    expect(o.client).toBeNull();
    await ok('POST', '/stages/idea/ready', { ready: true });
    expect(await err('POST', '/stages/idea/send', undefined, 400)).toMatch(/no client/);
    o = await ok('POST', '/stages/idea/sign-off', {});
    expect(o.cycles[0].stages.idea.signOffs[0]).toMatchObject({ by: 'you', internal: true });
    expect((await call('PATCH', '', { client: { name: 'X', contact: '' } })).statusCode).toBe(400);
  });

  it('keeps costs, time and settings', async () => {
    await start();
    await ok('POST', '', { kind: 'client', client: { name: 'Gym' } });
    let o = await ok('POST', '/costs', {
      item: 'Domain',
      vendor: 'Namecheap',
      amount: 14.99,
      bill: true,
    });
    expect(o.costs[0]).toMatchObject({ item: 'Domain', amount: 14.99, bill: true });
    o = await ok('POST', '/time', { stage: 'idea', hours: 1.5, note: 'Client call' });
    expect(o.time[0]).toMatchObject({ stage: 'idea', hours: 1.5 });
    o = await ok('PATCH', '', { rate: 30, budgetTokens: 8_000_000 });
    expect(o).toMatchObject({ rate: 30, budgetTokens: 8_000_000 });
    o = await ok('DELETE', `/costs/${o.costs[0].id}`);
    expect(o.costs).toEqual([]);
    expect((await call('DELETE', '/costs/cost_nope')).statusCode).toBe(404);
  });

  it('refuses a broken office.json instead of overwriting it', async () => {
    await start();
    await ok('POST', '', { kind: 'personal' });
    const file = path.join(d!.projectsDir, 'proj', '_project', 'office.json');
    writeFileSync(file, '{ not json');
    const res = await call('GET', '');
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('office_invalid');
    expect(readFileSync(file, 'utf8')).toBe('{ not json');
  });
});

describe('stage documents (ADR-0053)', () => {
  let d: TestDaemon | null = null;
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  it('lists docs/<stage>/client|technical with their titles, then V3 flat docs where they are', async () => {
    d = await testDaemon();
    const dir = path.join(d.projectsDir, 'proj');
    gitInit(dir);
    const put = (rel: string, text: string) => {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    };
    put('docs/plan/client/summary.md', '# How we will build it\n\nText');
    put('docs/plan/technical/system-design.md', 'No heading here');
    put('docs/plan/technical/diagrams/data.md', '# Data diagram');
    put('docs/plan/technical/notes.png', 'binary');
    put('docs/prd.md', '# PRD\n');
    put('docs/adr/0001-expo.md', '# 0001 Expo\n');
    const cookie = await d.login();
    const get = (stage: string) =>
      d!.app.inject({
        method: 'GET',
        url: `/api/projects/proj/office/docs?stage=${stage}`,
        headers: { host: HOST, origin: ORIGIN, cookie },
      });
    const res = (await get('plan')).json();
    expect(res.client).toEqual([
      { path: 'docs/plan/client/summary.md', title: 'How we will build it', legacy: false },
    ]);
    expect(res.technical).toEqual([
      { path: 'docs/plan/technical/diagrams/data.md', title: 'Data diagram', legacy: false },
      { path: 'docs/plan/technical/system-design.md', title: 'system-design', legacy: false },
      { path: 'docs/prd.md', title: 'PRD', legacy: true },
      { path: 'docs/adr/0001-expo.md', title: '0001 Expo', legacy: true },
    ]);
    expect((await get('idea')).json()).toEqual({ client: [], technical: [] });
    expect((await get('nope')).statusCode).toBe(400);
  });
});

describe('staff agents in the stage chats (o3)', () => {
  let d: TestDaemon | null = null;
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  it('briefs the stage agent, uses the user staff file, and stage_ready marks the stage ready', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [], calls: [] };
    d = await testDaemon({
      runner: fakeRunner(
        [
          { call: { name: 'stage_ready', input: {} } },
          { text: 'The idea is clear. We can start Requirements.' },
        ],
        log,
      ),
    });
    const dir = path.join(d.projectsDir, 'proj');
    gitInit(dir);
    mkdirSync(path.join(d.home, 'staff'), { recursive: true });
    writeFileSync(
      path.join(d.home, 'staff', 'business-analyst.md'),
      '---\nname: Business Analyst\n---\nYou are my own analyst. Ask about payments first.\n',
    );
    const cookie = await d.login();
    const api = (method: 'GET' | 'POST', url: string, payload?: object) =>
      d!.app.inject({
        method,
        url,
        headers: { host: HOST, origin: ORIGIN, cookie },
        ...(payload ? { payload } : {}),
      });

    await api('POST', '/api/projects/proj/office', {
      kind: 'client',
      client: { name: 'Fitness Master Gym' },
    });
    await api('POST', '/api/projects/proj/chat', { text: 'A gym wants an app', stage: 'idea' });
    const start = Date.now();
    while (d.chat.state('proj', 'idea').running && Date.now() - start < 3000)
      await new Promise((r) => setTimeout(r, 10));

    const prompt = log.requests[0]!.appendSystemPrompt ?? '';
    expect(prompt).toContain('You are the **Business Analyst**');
    expect(prompt).toContain('for the client Fitness Master Gym');
    expect(prompt).toContain('docs/idea/client/');
    expect(prompt).toContain('You are my own analyst. Ask about payments first.');
    expect(log.calls).toEqual([
      { name: 'stage_ready', ok: true, text: expect.stringMatching(/Marked ready/) },
    ]);
    const office = (await api('GET', '/api/projects/proj/office')).json().office;
    expect(office.cycles[0].stages.idea.ready).toBe(true);
  });

  it('a project without an office gets no brief and no stage_ready', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [], calls: [] };
    d = await testDaemon({ runner: fakeRunner([{ text: 'ok' }], log) });
    gitInit(path.join(d.projectsDir, 'core'));
    const cookie = await d.login();
    await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/chat',
      headers: { host: HOST, origin: ORIGIN, cookie },
      payload: { text: 'hi', stage: 'plan' },
    });
    const start = Date.now();
    while (d.chat.state('core', 'plan').running && Date.now() - start < 3000)
      await new Promise((r) => setTimeout(r, 10));
    expect(log.requests[0]!.appendSystemPrompt).not.toContain('## The office');
    expect(log.requests[0]!.extraTools?.map((t) => t.name)).not.toContain('stage_ready');
  });
});

describe('history for the Version control tab (o11)', () => {
  let d: TestDaemon | null = null;
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  it('lists commits with files and tags, and only one stage when asked', async () => {
    const { execFileSync } = await import('node:child_process');
    d = await testDaemon();
    const dir = path.join(d.projectsDir, 'proj');
    gitInit(dir);
    const g = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.name=Meddy', '-c', 'user.email=m@m', ...a], {
        cwd: dir,
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    mkdirSync(path.join(dir, 'docs/idea/client'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/idea/client/brief.md'), '# Brief\n');
    g('add', '.');
    g('commit', '-q', '-m', 'docs(idea): project brief');
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src/app.ts'), 'export {};\n');
    g('add', '.');
    g('commit', '-q', '-m', 'feat: the app');
    g('tag', 'v1.0.0');
    const cookie = await d.login();
    const get = async (q: string) =>
      (
        await d!.app.inject({
          method: 'GET',
          url: `/api/projects/proj/git/history${q}`,
          headers: { host: HOST, origin: ORIGIN, cookie },
        })
      ).json().commits;
    const all = await get('');
    expect(all.map((c: { subject: string }) => c.subject)).toEqual([
      'feat: the app',
      'docs(idea): project brief',
      'init',
    ]);
    expect(all[0]).toMatchObject({ author: 'Meddy', tags: ['v1.0.0'], files: ['src/app.ts'] });
    expect((await get('?stage=idea')).map((c: { subject: string }) => c.subject)).toEqual([
      'docs(idea): project brief',
    ]);
    expect((await get('?stage=development')).map((c: { subject: string }) => c.subject)).toEqual([
      'feat: the app',
    ]);
  });
});
