import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Agent } from '@cherry/shared';
import { slugify, splitReport } from '../src/agents/manager.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { HOST, gitInit, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' };
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    env,
    encoding: 'utf8',
  }).trim();

describe('background agents', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: (prompt: string) => Step[];
  let dir: string;

  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const agent = (id: string): Agent => d.agents.get(id);
  const until = async (id: string, pred: (a: Agent) => boolean, ms = 5000) => {
    const start = Date.now();
    while (!pred(agent(id))) {
      if (Date.now() - start > ms) throw new Error(`timed out: ${JSON.stringify(agent(id))}`);
      await new Promise((r) => setTimeout(r, 10));
    }
    return agent(id);
  };
  const startAgent = async (task = 'Write tests for the streak service') => {
    const r = await api('POST', '/api/projects/core/agents', { task });
    expect(r.status).toBe(200);
    return r.body as Agent;
  };

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [], calls: [] };
    script = () => [
      { tool: { name: 'Read', input: { file_path: 'lib/streaks.ts' } } },
      { tool: { name: 'Write', input: { file_path: 'tests/streaks.test.ts', content: 'test\n' } } },
      { text: 'Added tests for the streak service.' },
    ];
    d = await testDaemon({ runner: fakeRunner((req) => script(req.prompt), log) });
    cookie = await d.login();
    dir = path.join(d.projectsDir, 'core');
    gitInit(dir);
    write(path.join(dir, 'lib', 'streaks.ts'), 'export const s = 1;\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'streaks');
  });
  afterEach(() => d.cleanup());

  it('reads the "Needs you" list from an agent report', () => {
    expect(
      splitReport(
        'Added split().\nTests pass.\n\n**Needs you:**\n- Push the branch with `git push origin HEAD`\n',
      ),
    ).toEqual({
      body: 'Added split().\nTests pass.',
      needs: ['Push the branch with `git push origin HEAD`'],
    });
    expect(splitReport('Done.\n## Needs you\n1. `npm publish`\n\nReady to merge')).toEqual({
      body: 'Done.\nReady to merge',
      needs: ['npm publish'],
    });
    expect(splitReport('Needs you: nothing')).toEqual({ body: '', needs: [] });
    expect(splitReport('All done.')).toEqual({ body: 'All done.', needs: [] });
  });

  it('a "Needs you" list in the report shows as Needs you, with a clean summary', async () => {
    script = () => [
      {
        text: 'Added the split function. Tests pass.\n\nNeeds you:\n- Push the branch with `git push origin HEAD`',
      },
    ];
    const a = await startAgent('Add split and push');
    const done = await until(a.id, (x) => x.status === 'done');
    expect(done.needsYou).toEqual(['Push the branch with `git push origin HEAD`']);
    expect(done.summary).toBe('Added the split function. Tests pass.');
  });

  it('makes a slug from the task', () => {
    expect(slugify('Write tests for the streak service')).toBe('tests-streak-service');
    expect(slugify('!!!')).toBe('task');
  });

  it('runs in its own worktree, edits without asking, commits on agent/<slug>', async () => {
    const notices: unknown[] = [];
    d.hub.listen((topic, ev) => {
      if (topic === 'notices') notices.push(ev);
    });
    const a = await startAgent();
    expect(a.branch).toBe('agent/tests-streak-service');
    const done = await until(a.id, (x) => x.status === 'done');
    expect(done.summary).toBe('Added tests for the streak service.');
    expect(done.changes).toEqual({ files: 1, added: 1, removed: 0 });
    expect(notices).toEqual([
      expect.objectContaining({
        type: 'notice',
        kind: 'agent.done',
        projectId: 'core',
        title: 'Agent done: Write tests for the streak service',
        body: 'Added tests for the streak service.',
        link: `/p/core/agents?agent=${a.id}`,
      }),
    ]);
    // The worktree lives outside the project, under the projects folder's dot-folder.
    const wt = path.join(d.projectsDir, '.cherry-worktrees', 'core', 'tests-streak-service');
    expect(log.requests[0]!.cwd).toBe(wt);
    expect(log.permissions).toEqual([{ tool: 'Write', allowed: true }]);
    expect(d.approvals.list()).toEqual([]);
    expect(git(dir, 'log', '--format=%s', '-1', a.branch)).toMatch(/^agent: Write tests/);
    // The main checkout is untouched until Accept.
    expect(existsSync(path.join(dir, 'tests', 'streaks.test.ts'))).toBe(false);
    expect(git(dir, 'status', '--porcelain')).toBe('');

    const diff = await api('GET', `/api/agents/${a.id}/diff`);
    expect(diff.body.files[0]).toMatchObject({ path: 'tests/streaks.test.ts', isNew: true });

    const acc = await api('POST', `/api/agents/${a.id}/accept`);
    expect(acc.body.status).toBe('accepted');
    expect(readFileSync(path.join(dir, 'tests', 'streaks.test.ts'), 'utf8')).toBe('test\n');
    expect(existsSync(wt)).toBe(false);
    expect(git(dir, 'branch', '--list', 'agent/*')).toBe('');
    expect((await api('GET', '/api/projects/core/agents')).body.agents).toEqual([]);
  });

  // Must-pass safety test 8.
  it('Discard removes the worktree and branch and leaves the main checkout unchanged', async () => {
    const head = git(dir, 'rev-parse', 'HEAD');
    const a = await startAgent();
    await until(a.id, (x) => x.status === 'done');
    const r = await api('POST', `/api/agents/${a.id}/discard`);
    expect(r.body.status).toBe('discarded');
    expect(
      existsSync(path.join(d.projectsDir, '.cherry-worktrees', 'core', 'tests-streak-service')),
    ).toBe(false);
    expect(git(dir, 'branch', '--list', 'agent/*')).toBe('');
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('always runs in Auto: commands run without asking or a card', async () => {
    script = () => [
      { tool: { name: 'Bash', input: { command: 'npm install -D vitest' } } },
      { text: 'Done.' },
    ];
    // An older client may still send auto: false; agents run in Auto anyway (ADR-0028).
    const r = await api('POST', '/api/projects/core/agents', { task: 'Add vitest', auto: false });
    expect(r.body.auto).toBe(true);
    const done = await until(r.body.id, (x) => x.status === 'done');
    expect(done.needsYou).toEqual([]);
    expect(log.permissions).toEqual([expect.objectContaining({ tool: 'Bash', allowed: true })]);
    expect(d.approvals.list()).toEqual([]);
    expect(log.requests[0]?.prompt).toMatch(/auto mode/);
  });

  it('skips push, publish and rm -r without asking, then needs you and continues in chat', async () => {
    const notices: { kind: string; title: string }[] = [];
    d.hub.listen((topic, ev) => {
      if (topic === 'notices') notices.push(ev as never);
    });
    script = (prompt) =>
      prompt.includes('left these steps for me')
        ? [{ text: 'Here is what each step does.' }]
        : [
            { tool: { name: 'Bash', input: { command: 'npm test' } } },
            { tool: { name: 'Bash', input: { command: 'git push origin HEAD' } } },
            { tool: { name: 'Bash', input: { command: 'npm publish' } } },
            { tool: { name: 'Bash', input: { command: 'sudo rm -rf /' } } },
            { text: 'Done. Needs you: push and publish.' },
          ];
    const a = await startAgent('Ship the release');
    const done = await until(a.id, (x) => x.status === 'done');
    expect(done.needsYou).toEqual(['git push origin HEAD', 'npm publish', 'sudo rm -rf /']);
    expect(d.approvals.list()).toEqual([]);
    expect(log.permissions.map((p) => p.allowed)).toEqual([true, false, false, false]);
    expect(log.permissions[1]!.message).toMatch(/Skip this step/);
    // A serious command is skipped like a push (ADR-0033).
    expect(log.permissions[3]!.message).toMatch(/Skip this step/);
    expect(notices).toEqual([
      expect.objectContaining({ kind: 'agent.needs', title: 'Agent needs you: Ship the release' }),
    ]);

    const c = await api('POST', `/api/agents/${a.id}/continue`);
    expect(c.status).toBe(200);
    const sent = log.requests.at(-1)!;
    expect(sent.cwd).toBe(dir);
    expect(sent.prompt).toContain(`branch ${a.branch} (not merged yet)`);
    expect(sent.prompt).toContain('- git push origin HEAD');
    expect(sent.prompt).toContain('- npm publish');
    expect(sent.prompt).toContain('- sudo rm -rf /');
  });

  it('refuses Continue in chat for an agent that skipped nothing', async () => {
    const a = await startAgent();
    await until(a.id, (x) => x.status === 'done');
    expect((await api('POST', `/api/agents/${a.id}/continue`)).status).toBe(409);
  });

  it('Merge with agent: a conflict gets fixed on the agent branch, then it merges', async () => {
    const notices: { title: string }[] = [];
    d.hub.listen((topic, ev) => {
      if (topic === 'notices') notices.push(ev as never);
    });
    script = (prompt) =>
      prompt.includes('have conflicts')
        ? [
            {
              tool: {
                name: 'Write',
                input: { file_path: 'lib/streaks.ts', content: 'export const s = 23;\n' },
              },
            },
            { tool: { name: 'Bash', input: { command: 'npm test' } } },
            { text: 'Kept both changes. Tests pass.\nReady to merge' },
          ]
        : [
            {
              tool: {
                name: 'Write',
                input: { file_path: 'lib/streaks.ts', content: 'export const s = 2;\n' },
              },
            },
            { text: 'Set s to 2.' },
          ];
    const a = await startAgent('Change the streak');
    await until(a.id, (x) => x.status === 'done');
    // Meanwhile the user changed the same line on main.
    write(path.join(dir, 'lib', 'streaks.ts'), 'export const s = 3;\n');
    git(dir, 'commit', '-qam', 'three');

    const merge = await api('POST', `/api/agents/${a.id}/accept`);
    expect(merge.status).toBe(409);
    expect(merge.body.error.code).toBe('merge_conflict');
    expect(git(dir, 'status', '--porcelain')).toBe('');

    const r = await api('POST', `/api/agents/${a.id}/resolve`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('running');
    expect(log.requests.at(-1)!.prompt).toMatch(/git merge main[\s\S]*- lib\/streaks.ts/);
    expect(log.requests.at(-1)!.cwd).toBe(log.requests[0]!.cwd);
    await until(a.id, (x) => x.status === 'accepted');
    expect(readFileSync(path.join(dir, 'lib', 'streaks.ts'), 'utf8')).toBe(
      'export const s = 23;\n',
    );
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(notices.at(-1)).toMatchObject({ title: 'Merged: Change the streak' });
  });

  it('Merge with agent stops when conflict markers are left', async () => {
    script = (prompt) =>
      prompt.includes('have conflicts')
        ? [{ text: 'Could not fix it.' }]
        : [
            {
              tool: {
                name: 'Write',
                input: { file_path: 'lib/streaks.ts', content: 'export const s = 2;\n' },
              },
            },
            { text: 'Set s to 2.' },
          ];
    const a = await startAgent('Change the streak');
    await until(a.id, (x) => x.status === 'done');
    write(path.join(dir, 'lib', 'streaks.ts'), 'export const s = 3;\n');
    git(dir, 'commit', '-qam', 'three');
    await api('POST', `/api/agents/${a.id}/resolve`);
    const failed = await until(a.id, (x) => x.status === 'failed');
    expect(failed.error).toMatch(/Conflicts are still in lib\/streaks.ts/);
    expect(readFileSync(path.join(dir, 'lib', 'streaks.ts'), 'utf8')).toBe('export const s = 3;\n');
  });

  it('refuses edits outside the worktree', async () => {
    script = () => [
      { tool: { name: 'Write', input: { file_path: path.join(dir, 'hack.txt'), content: 'x' } } },
      { text: 'Tried.' },
    ];
    const a = await startAgent('Escape');
    await until(a.id, (x) => x.status === 'done');
    expect(existsSync(path.join(dir, 'hack.txt'))).toBe(false);
    expect(log.permissions[0]).toMatchObject({ tool: 'Write', allowed: false });
    expect(log.permissions[0]!.message).toMatch(/inside (their worktree|the project folder)/);
  });

  // Security review 2026-10-11, high finding: a committed symlink must not let an agent write
  // outside its worktree, and reads stay inside it too.
  it('refuses edits through a symlink that points out of the worktree, and outside reads', async () => {
    const outside = tempDir();
    write(path.join(outside, 'bashrc'), 'original\n');
    mkdirSync(path.join(dir, 'tools'), { recursive: true });
    symlinkSync(path.join(outside, 'bashrc'), path.join(dir, 'tools', 'env.sh'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'link');
    script = () => [
      { tool: { name: 'Write', input: { file_path: 'tools/env.sh', content: 'pwned\n' } } },
      { tool: { name: 'Read', input: { file_path: path.join(outside, 'bashrc') } } },
      { text: 'Tried.' },
    ];
    const a = await startAgent('Update env');
    await until(a.id, (x) => x.status === 'done');
    expect(readFileSync(path.join(outside, 'bashrc'), 'utf8')).toBe('original\n');
    expect(log.permissions.map((p) => [p.tool, p.allowed])).toEqual([
      ['Write', false],
      ['Read', false],
    ]);
  });

  it('queues agents over the limit and starts them when one finishes', async () => {
    d.config.update({ agents: { maxRunning: 1 } });
    script = () => [{ wait: 120 }, { text: 'ok' }];
    const a = await startAgent('first task');
    const b = await startAgent('second task');
    expect(agent(a.id).status).toBe('running');
    expect(agent(b.id).status).toBe('queued');
    await until(a.id, (x) => x.status === 'done');
    await until(b.id, (x) => x.status === 'running' || x.status === 'done');
    await until(b.id, (x) => x.status === 'done');
  });

  it('a failed agent can be tried again', async () => {
    script = () => [{ wait: 3000 }, { text: 'never' }];
    const a = await startAgent('Check deps');
    await until(a.id, (x) => x.status === 'running');
    await api('POST', `/api/agents/${a.id}/stop`);
    const failed = await until(a.id, (x) => x.status === 'failed');
    expect(failed.error).toBe('Stopped.');
    script = () => [{ text: 'All good.' }];
    const r = await api('POST', `/api/agents/${a.id}/retry`);
    expect(r.body.task).toBe('Check deps');
    expect(r.body.branch).toBe('agent/check-deps');
    await until(r.body.id, (x) => x.status === 'done');
    expect(agent(a.id).status).toBe('discarded');
  });

  it('needs a repository with a commit', async () => {
    write(path.join(d.projectsDir, 'plain', 'a.txt'), 'x');
    const r = await api('POST', '/api/projects/plain/agents', { task: 'do things' });
    expect(r.status).toBe(409);
  });
});
