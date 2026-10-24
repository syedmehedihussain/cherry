import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatItem } from '@cherry/shared';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

// V2.1 w7.9: rewind to before a message, like the CLI's Esc Esc.
describe('rewind', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  const file = () => path.join(d.projectsDir, 'core', 'notes.txt');
  const scripts: Record<string, Step[]> = {
    one: [
      { tool: { name: 'Write', input: { file_path: 'notes.txt', content: 'v1' } } },
      { text: 'Wrote it.' },
    ],
    two: [
      {
        tool: {
          name: 'Edit',
          input: { file_path: 'notes.txt', old_string: 'v1', new_string: 'v2' },
        },
      },
      { text: 'Changed it.' },
    ],
    three: [{ text: 'Fine.' }],
  };
  const api = async (method: 'GET' | 'POST', url: string, payload?: object) => {
    const r = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload ? { payload } : {}),
    });
    return { status: r.statusCode, body: r.json() };
  };
  const say = async (text: string) => {
    await api('POST', '/api/projects/core/chat', { text, mode: 'auto' });
    const start = Date.now();
    while (d.chat.state('core').running && Date.now() - start < 3000)
      await new Promise((r) => setTimeout(r, 10));
  };
  const items = async (): Promise<ChatItem[]> =>
    (await api('GET', '/api/projects/core/chat')).body.items;
  const userId = async (text: string) =>
    (await items()).find((i) => i.kind === 'user' && i.text === text)!.id;

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({ runner: fakeRunner((req) => scripts[req.prompt] ?? [], log) });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
  });
  afterEach(() => d.cleanup());

  it('puts the code and the chat back to before a message, and Claude resumes there', async () => {
    await say('one');
    await say('two');
    expect(readFileSync(file(), 'utf8')).toBe('v2');
    expect((await items()).find((i) => i.kind === 'user' && i.text === 'two')).toMatchObject({
      checkpoint: 'fake_cp_2',
    });

    const r = await api('POST', '/api/projects/core/chat/rewind', {
      itemId: await userId('two'),
      code: true,
      chat: true,
    });
    expect(r).toMatchObject({ status: 200, body: { text: 'two', files: ['notes.txt'] } });
    expect(readFileSync(file(), 'utf8')).toBe('v1');
    const left = await items();
    expect(left.filter((i) => i.kind === 'user').map((i) => i.kind === 'user' && i.text)).toEqual([
      'one',
    ]);
    expect(left.at(-1)?.kind).toBe('turn-end');

    await say('three');
    expect(log.requests.at(-1)).toMatchObject({ resume: 'fake_session_1', resumeAt: 'fake_end_1' });
    // Used once: the turn after that continues normally.
    await say('three');
    expect(log.requests.at(-1)?.resumeAt).toBeUndefined();
  });

  it('rewinds only the code, or only the chat', async () => {
    await say('one');
    await say('two');
    await api('POST', '/api/projects/core/chat/rewind', {
      itemId: await userId('two'),
      code: true,
      chat: false,
    });
    expect(readFileSync(file(), 'utf8')).toBe('v1');
    expect((await items()).filter((i) => i.kind === 'user')).toHaveLength(2);

    await api('POST', '/api/projects/core/chat/rewind', {
      itemId: await userId('one'),
      code: false,
      chat: true,
    });
    expect(existsSync(file())).toBe(true);
    expect(await items()).toEqual([]);
    await say('three');
    // Back before the first message: a fresh Claude session.
    expect(log.requests.at(-1)).toMatchObject({ resume: null });
  });

  it('refuses while Claude works and for unknown messages', async () => {
    await say('one');
    const r = await api('POST', '/api/projects/core/chat/rewind', {
      itemId: 'u_nope',
      code: true,
      chat: true,
    });
    expect(r.status).toBe(404);
  });
});
