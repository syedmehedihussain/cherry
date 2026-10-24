import { describe, expect, it } from 'vitest';
import { contextUse } from '../src/claude/runner.ts';
import { fakeRunner } from '../src/claude/fake-runner.ts';
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
});
