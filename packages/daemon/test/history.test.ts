import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

// V2.1 w7.6: earlier chats per stage, and resume like the CLI's /resume.
describe('chat history and resume', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  const inject = (method: 'GET' | 'POST', url: string, payload?: object) =>
    d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload ? { payload } : {}),
    });
  const say = async (text: string, stage = 'development') => {
    await inject('POST', '/api/projects/core/chat', { text, stage });
    const start = Date.now();
    while (d.chat.state('core', stage as 'development').running && Date.now() - start < 3000)
      await new Promise((r) => setTimeout(r, 10));
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [] };
    d = await testDaemon({ runner: fakeRunner([{ text: 'ok' }], log) });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
  });
  afterEach(() => d.cleanup());

  it('lists the stage chats newest first and resumes one with its Claude session', async () => {
    await say('first chat');
    await inject('POST', '/api/projects/core/chat/new?stage=development');
    await say('second chat');
    await say('a plan chat', 'plan');

    const list = (await inject('GET', '/api/projects/core/chat/history?stage=development')).json()
      .sessions;
    expect(list.map((s: { title: string; current: boolean }) => [s.title, s.current])).toEqual([
      ['second chat', true],
      ['first chat', false],
    ]);

    const first = list[1].id;
    const r = await inject('POST', '/api/projects/core/chat/resume?stage=development', {
      conversationId: first,
    });
    expect(r.statusCode).toBe(200);
    const state = (await inject('GET', '/api/projects/core/chat?stage=development')).json();
    expect(state.conversationId).toBe(first);
    expect(state.items[0]).toMatchObject({ kind: 'user', text: 'first chat' });

    await say('back again');
    expect(log.requests.at(-1)?.resume).toBe(log.requests[0]?.resume ?? 'fake_session_1');

    const after = (await inject('GET', '/api/projects/core/chat/history?stage=development')).json()
      .sessions;
    expect(
      after.filter((s: { current: boolean }) => s.current).map((s: { id: string }) => s.id),
    ).toEqual([first]);
  });

  it("refuses another stage's chat", async () => {
    await say('a plan chat', 'plan');
    const plan = (await inject('GET', '/api/projects/core/chat/history?stage=plan')).json()
      .sessions[0].id;
    const r = await inject('POST', '/api/projects/core/chat/resume?stage=development', {
      conversationId: plan,
    });
    expect(r.statusCode).toBe(404);
  });
});
