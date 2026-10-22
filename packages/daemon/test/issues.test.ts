import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueSlug, parseIssue } from '../src/issues/service.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

// ADR-0035: issues are files in docs/issues/.
describe('issue files', () => {
  it('makes short file names', () => {
    expect(issueSlug('Chat scroll jumps on reply!')).toBe('chat-scroll-jumps-on-reply');
    expect(issueSlug('???')).toBe('issue');
  });

  it('reads the front matter, ignoring comments and bad values', () => {
    const i = parseIssue(
      'docs/issues/0007-x.md',
      '---\ntitle: Scroll jumps\nstatus: planned   # open | planned | done\ntype: nonsense\nseverity: blocks\ncycle: docs/specs/chat.md\ngithub:\n---\n\nSteps here.\n',
      1,
    )!;
    expect(i).toMatchObject({
      number: 7,
      title: 'Scroll jumps',
      status: 'planned',
      type: 'bug',
      severity: 'blocks',
      cycle: 'docs/specs/chat.md',
      github: null,
      body: 'Steps here.',
    });
    expect(parseIssue('docs/issues/notes.md', 'x', 1)).toBeNull();
  });
});

describe('issues API', () => {
  let d: TestDaemon;
  let cookie: string;
  const api = async (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const dir = () => path.join(d.projectsDir, 'core');

  beforeEach(async () => {
    d = await testDaemon();
    cookie = await d.login();
    write(path.join(dir(), 'README.md'), '# core\n');
  });
  afterEach(() => d.cleanup());

  it('creates numbered files, lists newest first, and changes status in place', async () => {
    const a = await api('POST', '/api/projects/core/issues', {
      title: 'Chat scroll jumps',
      body: 'It jumps.',
    });
    expect(a.status).toBe(200);
    expect(a.body.issue).toMatchObject({
      number: 1,
      file: 'docs/issues/0001-chat-scroll-jumps.md',
      status: 'open',
      type: 'bug',
    });
    await api('POST', '/api/projects/core/issues', { title: 'Export to PDF', type: 'idea' });
    const list = await api('GET', '/api/projects/core/issues');
    expect(list.body.issues.map((i: { number: number }) => i.number)).toEqual([2, 1]);
    // No remote: no GitHub section.
    expect(list.body.github).toBeNull();

    // The user's own edits to the body survive a status change.
    const file = path.join(dir(), 'docs', 'issues', '0001-chat-scroll-jumps.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('It jumps.', 'It jumps a lot.'));
    const p = await api('PATCH', '/api/projects/core/issues/1', { status: 'planned' });
    expect(p.body.issue).toMatchObject({ status: 'planned', body: 'It jumps a lot.' });
    expect(readFileSync(file, 'utf8')).toContain('status: planned');

    expect((await api('PATCH', '/api/projects/core/issues/9', { status: 'done' })).status).toBe(
      404,
    );
    expect((await api('POST', '/api/projects/core/issues', { title: 'x' })).status).toBe(400);
  });

  it('refuses Send to GitHub without a remote, and never sends without approval', async () => {
    await api('POST', '/api/projects/core/issues', { title: 'Something broke' });
    const r = await api('POST', '/api/projects/core/issues/1/github');
    expect(r.status).toBe(409);
    expect(d.approvals.list()).toEqual([]);
  });
});
