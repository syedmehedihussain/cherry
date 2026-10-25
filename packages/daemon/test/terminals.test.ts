import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TerminalInfo, TerminalServerMessage } from '@cherry/shared';
import { HOST, ORIGIN, testDaemon, type TestDaemon } from './helpers.ts';

// V3 r6, ADR-0049: a real shell in the project folder.
describe('terminals', () => {
  let d: TestDaemon;
  let cookie: string;
  beforeEach(async () => {
    d = await testDaemon();
    cookie = await d.login();
    mkdirSync(path.join(d.projectsDir, 'core'), { recursive: true });
  });
  afterEach(async () => d.cleanup());

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    d.app.inject({ method, url, headers: { host: HOST, origin: ORIGIN, cookie }, payload });

  const waitFor = async (pred: () => boolean, ms = 5000) => {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it('runs a shell in the project folder, keeps its output, and closes', async () => {
    const res = await call('POST', '/api/projects/core/terminals', { cols: 80, rows: 24 });
    expect(res.statusCode).toBe(200);
    const term = res.json<TerminalInfo>();
    expect(term).toMatchObject({ projectId: 'core', title: 'Terminal', alive: true });

    let out = '';
    const detach = d.terminals.attach('core', term.id, (m: TerminalServerMessage) => {
      if (m.t === 'out') out += m.d;
    });
    d.terminals.write('core', term.id, 'pwd; echo marker-$((40+2))\n');
    await waitFor(() => out.includes('marker-42'));
    expect(out).toContain(path.join(d.projectsDir, 'core'));
    detach();

    // A browser that attaches later gets what came before.
    let replay = '';
    d.terminals.attach('core', term.id, (m) => {
      if (m.t === 'out') replay += m.d;
    })();
    expect(replay).toContain('marker-42');

    const list = await call('GET', '/api/projects/core/terminals');
    expect(list.json<{ terminals: TerminalInfo[] }>().terminals.map((t) => t.id)).toEqual([
      term.id,
    ]);
    expect((await call('DELETE', `/api/projects/core/terminals/${term.id}`)).statusCode).toBe(200);
    expect((await call('GET', '/api/projects/core/terminals')).json()).toEqual({ terminals: [] });
  });

  it('says when the shell exits', async () => {
    const term = (await call('POST', '/api/projects/core/terminals', {})).json<TerminalInfo>();
    let code: number | null | undefined;
    d.terminals.attach('core', term.id, (m) => {
      if (m.t === 'exit') code = m.code;
    });
    d.terminals.write('core', term.id, 'exit 3\n');
    await waitFor(() => code !== undefined);
    expect(code).toBe(3);
    expect(d.terminals.list('core')[0]).toMatchObject({ alive: false, exitCode: 3 });
  });

  it('needs a session, and another project cannot reach it', async () => {
    const term = (await call('POST', '/api/projects/core/terminals', {})).json<TerminalInfo>();
    const anon = await d.app.inject({
      method: 'GET',
      url: `/ws/term/core/${term.id}`,
      headers: { host: HOST },
    });
    expect(anon.statusCode).toBe(401);
    expect(() => d.terminals.write('site', term.id, 'ls\n')).toThrow(/No such terminal/);
    expect((await call('DELETE', `/api/projects/site/terminals/${term.id}`)).statusCode).toBe(404);
  });
});
