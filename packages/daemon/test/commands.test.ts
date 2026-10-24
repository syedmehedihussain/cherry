import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expandCommand, projectCommands, withMentions } from '../src/chat/commands.ts';
import { searchFiles } from '../src/projects/workspace.ts';
import { fakeRunner, type FakeLog } from '../src/claude/fake-runner.ts';
import { HOST, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

// V2.1 w7.1: the project's own slash commands, like the CLI's .claude/commands.
describe('project slash commands', () => {
  it('lists .claude/commands/*.md and fills in $ARGUMENTS', () => {
    const dir = tempDir('cherry-cmd-');
    write(
      path.join(dir, '.claude', 'commands', 'fix-issue.md'),
      '---\ndescription: Fix a GitHub issue\n---\nFix issue $ARGUMENTS and add a test.\n',
    );
    write(
      path.join(dir, '.claude', 'commands', 'deploy.md'),
      '# Deploy to staging\nRun the deploy.\n',
    );
    write(path.join(dir, '.claude', 'commands', 'bad name.md'), 'x');
    expect(projectCommands(dir).map(({ name, description }) => ({ name, description }))).toEqual([
      { name: 'deploy', description: 'Deploy to staging' },
      { name: 'fix-issue', description: 'Fix a GitHub issue' },
    ]);
    expect(expandCommand(dir, '/fix-issue 42')).toBe('Fix issue 42 and add a test.');
    expect(expandCommand(dir, '/deploy now please')).toBe(
      '# Deploy to staging\nRun the deploy.\n\nnow please',
    );
    expect(expandCommand(dir, '/compact')).toBe('/compact');
    expect(expandCommand(dir, 'hello /deploy')).toBe('hello /deploy');
  });

  describe('in the chat', () => {
    let d: TestDaemon;
    let cookie: string;
    let log: FakeLog;
    beforeEach(async () => {
      log = { requests: [], permissions: [], decisions: [] };
      d = await testDaemon({ runner: fakeRunner([{ text: 'ok' }], log) });
      cookie = await d.login();
      write(
        path.join(d.projectsDir, 'core', '.claude', 'commands', 'fix-issue.md'),
        'Fix issue $ARGUMENTS.\n',
      );
    });
    afterEach(() => d.cleanup());

    it('serves the list and sends the expanded text, keeping the typed message', async () => {
      const inject = (method: 'GET' | 'POST', url: string, payload?: object) =>
        d.app.inject({
          method,
          url,
          headers: { host: HOST, cookie },
          ...(payload ? { payload } : {}),
        });
      const list = await inject('GET', '/api/projects/core/commands');
      expect(list.json()).toEqual({
        commands: [{ name: 'fix-issue', description: 'Fix issue $ARGUMENTS.' }],
      });
      await inject('POST', '/api/projects/core/chat', { text: '/fix-issue 7' });
      const start = Date.now();
      while (d.chat.state('core').running && Date.now() - start < 3000)
        await new Promise((r) => setTimeout(r, 10));
      expect(log.requests[0]?.prompt).toBe('Fix issue 7.');
      const items = (await inject('GET', '/api/projects/core/chat')).json().items;
      expect(items[0]).toMatchObject({ kind: 'user', text: '/fix-issue 7' });
    });
  });
});

// V2.1 w7.2: @ file mentions.
describe('@ file mentions', () => {
  const project = () => {
    const dir = tempDir('cherry-mention-');
    write(path.join(dir, 'lib', 'streaks.ts'), 'x');
    write(path.join(dir, 'lib', 'old-streaks.ts'), 'x');
    write(path.join(dir, 'docs', 'prd.md'), 'x');
    write(path.join(dir, 'node_modules', 'streaks', 'index.js'), 'x');
    write(path.join(dir, '.env'), 'SECRET=1');
    return dir;
  };

  it('searches project files best first, without ignored folders or secrets', () => {
    const dir = project();
    expect(searchFiles(dir, 'streaks')).toEqual(['lib/streaks.ts', 'lib/old-streaks.ts']);
    expect(searchFiles(dir, 'docs/')).toEqual(['docs/prd.md']);
    expect(searchFiles(dir, 'env')).toEqual([]);
    expect(searchFiles(dir, '')).not.toContain('.env');
    expect(searchFiles(dir, '', 2)).toHaveLength(2);
  });

  it('asks Claude to read the mentioned files that exist inside the project', () => {
    const dir = project();
    expect(withMentions(dir, 'look at @lib/streaks.ts and @docs/prd.md.')).toBe(
      'look at @lib/streaks.ts and @docs/prd.md.\n\n(Files I mentioned: lib/streaks.ts, docs/prd.md. Read them first.)',
    );
    expect(withMentions(dir, '@.env @../outside.txt @missing.ts mail@lib/streaks.ts')).toBe(
      '@.env @../outside.txt @missing.ts mail@lib/streaks.ts',
    );
    expect(withMentions(dir, 'no mentions')).toBe('no mentions');
  });
});
