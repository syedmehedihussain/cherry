import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
