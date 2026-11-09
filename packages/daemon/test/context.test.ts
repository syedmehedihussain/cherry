import { describe, expect, it } from 'vitest';
import { contextUse } from '../src/claude/runner.ts';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import path from 'node:path';
import { HOST, testDaemon, write } from './helpers.ts';

const usage = (input: number, cacheRead: number, contextWindow: number) => ({
  inputTokens: input,
  cacheReadInputTokens: cacheRead,
  cacheCreationInputTokens: 0,
  contextWindow,
});

// V2.1 w7.3: the context meter.
describe('context meter', () => {
  it('measures against the main model, the one that read the most', () => {
    expect(
      contextUse(42_000, {
        'claude-haiku-4-5': usage(900, 0, 200_000),
        'claude-opus-5-5': usage(3_000, 80_000, 1_000_000),
      }),
    ).toEqual({ used: 42_000, window: 1_000_000 });
    expect(contextUse(null, { opus: usage(1, 1, 200_000) })).toBeNull();
    expect(contextUse(10, {})).toEqual({ used: 10, window: 0 });
    expect(contextUse(10, undefined)).toEqual({ used: 10, window: 0 });
  });

  it('keeps the context on the turn-end row', async () => {
    const d = await testDaemon({
      runner: fakeRunner((_req, n) =>
        n === 0 ? [{ context: 150_000 }, { text: 'ok' }] : [{ context: 30_000, window: 0 }],
      ),
    });
    try {
      const cookie = await d.login();
      write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
      const lastEnd = async (text: string) => {
        await d.app.inject({
          method: 'POST',
          url: '/api/projects/core/chat',
          headers: { host: HOST, cookie },
          payload: { text },
        });
        const start = Date.now();
        while (d.chat.state('core').running && Date.now() - start < 3000)
          await new Promise((r) => setTimeout(r, 10));
        const items = (
          await d.app.inject({
            method: 'GET',
            url: '/api/projects/core/chat',
            headers: { host: HOST, cookie },
          })
        ).json().items;
        return items.at(-1);
      };
      expect(await lastEnd('hi')).toMatchObject({
        kind: 'turn-end',
        context: { used: 150_000, window: 200_000 },
      });
      // A /compact turn that called no model keeps the window it had.
      expect(await lastEnd('/compact')).toMatchObject({
        kind: 'turn-end',
        context: { used: 30_000, window: 200_000 },
      });
    } finally {
      d.cleanup();
    }
  });

  // ADR-0061: over half the window, the next message starts a fresh session with a note.
  it('starts a fresh session past half the window, unless the user keeps it', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    const d = await testDaemon({
      runner: fakeRunner(() => [{ context: 120_000 }, { text: 'ok' }], log),
    });
    try {
      const cookie = await d.login();
      write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
      const send = async (payload: Record<string, unknown>) => {
        const res = await d.app.inject({
          method: 'POST',
          url: '/api/projects/core/chat',
          headers: { host: HOST, cookie },
          payload,
        });
        const start = Date.now();
        while (d.chat.state('core').running && Date.now() - start < 3000)
          await new Promise((r) => setTimeout(r, 10));
        return res.json().conversationId as string;
      };
      const first = await send({ text: 'Read every lesson' });
      // Kept on purpose: same chat, same Claude session.
      expect(await send({ text: 'One more', keepSession: true })).toBe(first);
      expect(log.requests[1]?.resume).toBeTruthy();
      expect(log.requests[1]?.prompt).toBe('One more');
      // The next message: a new chat, no resume, the note before the user's text.
      const second = await send({ text: 'Now the quiz' });
      expect(second).not.toBe(first);
      expect(log.requests[2]?.resume).toBeNull();
      expect(log.requests[2]?.prompt).toMatch(
        /^Fresh session, to keep the context small\. The last chat was about: "One more"\.[^]*\n\nNow the quiz$/,
      );
      expect(d.chat.history('core').map((c) => c.id)).toContain(first);
    } finally {
      d.cleanup();
    }
  });
});
