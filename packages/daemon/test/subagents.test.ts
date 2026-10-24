import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeRunner } from '../src/claude/fake-runner.ts';
import { READ_TOOLS } from '../src/claude/runner.ts';
import { HOST, testDaemon, write } from './helpers.ts';

// V2.1 w7.5, ADR-0042: subagents start without asking and show as one row with their steps.
describe('subagents', () => {
  it('start without asking', () => {
    expect(READ_TOOLS).toEqual(expect.arrayContaining(['Task', 'Agent']));
  });

  it("count a subagent's steps on its row", async () => {
    const d = await testDaemon({
      runner: fakeRunner([
        {
          subagent: {
            type: 'Explore',
            description: 'Find the streak code',
            steps: [
              { name: 'Read', input: { file_path: 'README.md' } },
              { name: 'Bash', input: { command: 'false' }, fail: true },
            ],
          },
        },
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
      const tools = (await inject('GET'))
        .json()
        .items.filter((i: { kind: string }) => i.kind === 'tool');
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        tool: 'Task',
        target: 'Find the streak code',
        status: 'ok',
        sub: { type: 'Explore', steps: 2, failed: 1, last: 'Run false' },
      });
    } finally {
      d.cleanup();
    }
  });
});
