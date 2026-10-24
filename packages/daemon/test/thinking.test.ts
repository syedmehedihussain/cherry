import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeRunner } from '../src/claude/fake-runner.ts';
import { HOST, testDaemon, write } from './helpers.ts';

// V2.1 w7.4: Claude's thinking is kept as a row with its text and how long it took.
describe('thinking', () => {
  it('keeps each thinking block with its text and duration', async () => {
    const d = await testDaemon({
      runner: fakeRunner([
        { think: 'Look at the streak first.', ms: 30 },
        { think: '' },
        { text: 'ok' },
      ]),
    });
    try {
      const cookie = await d.login();
      write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
      const inject = (method: 'GET' | 'POST', payload?: object) =>
        d.app.inject({
          method,
          url: '/api/projects/core/chat',
          headers: { host: HOST, cookie },
          ...(payload ? { payload } : {}),
        });
      await inject('POST', { text: 'hi' });
      const start = Date.now();
      while (d.chat.state('core').running && Date.now() - start < 3000)
        await new Promise((r) => setTimeout(r, 10));
      const thoughts = (await inject('GET'))
        .json()
        .items.filter((i: { kind: string }) => i.kind === 'thinking');
      expect(thoughts).toHaveLength(2);
      expect(thoughts[0]).toMatchObject({ text: 'Look at the streak first.' });
      expect(thoughts[0].durationMs).toBeGreaterThanOrEqual(25);
      expect(thoughts[1]).toMatchObject({ text: '' });
      expect(thoughts[1].durationMs).not.toBeNull();
    } finally {
      d.cleanup();
    }
  });
});
