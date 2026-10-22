import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STAGES, type ChatState } from '@cherry/shared';
import { chatSystemPrompt } from '../src/chat/service.ts';
import { fakeRunner, type FakeLog, type Step } from '../src/claude/fake-runner.ts';
import { isDocsPath, stageGuard, stageProfile } from '../src/stages/profiles.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

// ADR-0034: one agent per lifecycle stage.
describe('stage profiles', () => {
  it.each(STAGES)('loads the %s agent from its AGENT.md', (stage) => {
    const p = stageProfile(stage);
    expect(p.name).toMatch(/^[A-Z][a-z]+$/);
    expect(p.summary.length).toBeGreaterThan(20);
    expect(p.persona).toMatch(/^You are the \*\*/);
    expect(p.persona).not.toMatch(/^---/m);
  });

  it('puts the persona in the system prompt, with no phase line', () => {
    const prompt = chatSystemPrompt('plan');
    expect(prompt).toContain('You are the **Planner**');
    expect(prompt).not.toMatch(/Current phase|phase is unknown/);
    expect(chatSystemPrompt('development')).toContain('You are the **Builder**');
  });

  it.each([
    ['docs/prd.md', true],
    ['docs/design/home.html', true],
    ['design/tokens.css', true],
    ['_project/STATUS.md', true],
    ['README.md', true],
    ['CLAUDE.md', true],
    ['src/app.ts', false],
    ['package.json', false],
    ['lib/README.md', false],
    ['../other/docs/x.md', false],
  ])('docs path %s → %s', (rel, ok) => expect(isDocsPath(rel)).toBe(ok));

  it('refuses code edits for Plan, Design and Issues, not for the others', () => {
    const cwd = '/home/x/p';
    const edit = { file_path: '/home/x/p/src/app.ts' };
    for (const s of ['plan', 'design', 'issues'] as const) {
      expect(stageGuard(s, cwd)('Write', edit)).toMatch(/Development tab/);
      expect(stageGuard(s, cwd)('Edit', { file_path: 'docs/prd.md' })).toBeNull();
      expect(stageGuard(s, cwd)('Bash', { command: 'ls' })).toBeNull();
    }
    for (const s of ['preparation', 'development', 'deployment'] as const)
      expect(stageGuard(s, cwd)('Write', edit)).toBeNull();
  });
});

describe('a chat per stage', () => {
  let d: TestDaemon;
  let cookie: string;
  let log: FakeLog;
  let script: Step[];

  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const until = async (pred: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > ms) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const idle = () => until(() => STAGES.every((s) => !d.chat.state('core', s).running));

  beforeEach(async () => {
    log = { requests: [], permissions: [], decisions: [] };
    script = [];
    d = await testDaemon({ runner: fakeRunner(() => script, log) });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'src', 'app.ts'), 'export const a = 1;\n');
  });
  afterEach(() => d.cleanup());

  it('keeps each stage in its own conversation with its own agent', async () => {
    script = [{ text: 'ok' }];
    await api('POST', '/api/projects/core/chat', { text: 'plan it', stage: 'plan' });
    await idle();
    await api('POST', '/api/projects/core/chat', { text: 'build it' });
    await idle();
    const plan = (await api('GET', '/api/projects/core/chat?stage=plan')).body as ChatState;
    const dev = (await api('GET', '/api/projects/core/chat')).body as ChatState;
    expect(plan.conversationId).not.toBe(dev.conversationId);
    expect(plan.items.find((i) => i.kind === 'user')).toMatchObject({ text: 'plan it' });
    expect(dev.items.find((i) => i.kind === 'user')).toMatchObject({ text: 'build it' });
    expect(log.requests[0]?.appendSystemPrompt).toContain('**Planner**');
    expect(log.requests[1]?.appendSystemPrompt).toContain('**Builder**');
    // Each resumes its own Claude session, never the other's.
    expect(log.requests[1]?.resume).toBeNull();
    const bad = await api('GET', '/api/projects/core/chat?stage=testing');
    expect(bad.status).toBe(400);
  });

  it('the Plan agent cannot edit code, and no approval is shown for it', async () => {
    script = [
      { tool: { name: 'Write', input: { file_path: 'src/app.ts', content: 'x' } } },
      { text: 'That belongs in Development.' },
    ];
    await api('POST', '/api/projects/core/chat', { text: 'fix the bug', stage: 'plan' });
    await idle();
    expect(d.approvals.list()).toHaveLength(0);
    expect(log.permissions[0]).toMatchObject({ tool: 'Write', allowed: false });
    expect(log.permissions[0]?.message).toMatch(/Planner .* only writes docs/);
  });

  it('New conversation only replaces that stage', async () => {
    script = [{ text: 'ok' }];
    await api('POST', '/api/projects/core/chat', { text: 'a', stage: 'design' });
    await api('POST', '/api/projects/core/chat', { text: 'b' });
    await idle();
    await api('POST', '/api/projects/core/chat/new?stage=design');
    expect(d.chat.state('core', 'design').conversationId).toBeNull();
    expect(d.chat.state('core').conversationId).not.toBeNull();
  });
});

describe('stage skills', () => {
  it('loads the user skills into a skills-only plugin, user over bundled', async () => {
    const { tempDir } = await import('./helpers.ts');
    const { existsSync, readdirSync, readFileSync } = await import('node:fs');
    const { buildStagePlugin, stageSkills } = await import('../src/stages/skills.ts');
    const home = tempDir();
    const skill = path.join(home, 'skills', 'plan', 'specs');
    write(path.join(skill, 'SKILL.md'), '---\nname: specs\ndescription: Write specs\n---\nBody\n');
    write(path.join(skill, 'template.md'), 'T');
    // Not a skill: no SKILL.md.
    write(path.join(home, 'skills', 'plan', 'notes', 'README.md'), 'x');

    expect(stageSkills(home, 'plan')).toContainEqual({
      name: 'specs',
      description: 'Write specs',
      source: 'user',
    });
    expect(stageSkills(home, 'plan').some((s) => s.name === 'notes')).toBe(false);

    const root = buildStagePlugin(home, 'plan')!;
    expect(
      JSON.parse(readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')),
    ).toMatchObject({ name: 'cherry-plan' });
    expect(readdirSync(root).sort()).toEqual(['.cherry-signature', '.claude-plugin', 'skills']);
    expect(existsSync(path.join(root, 'skills', 'specs', 'template.md'))).toBe(true);
    // Same skills: the folder is reused, not rebuilt.
    expect(buildStagePlugin(home, 'plan')).toBe(root);
  });

  it('passes the plugin and the Skill tool to the stage chat', async () => {
    const log: FakeLog = { requests: [], permissions: [], decisions: [] };
    const d = await testDaemon({ runner: fakeRunner(() => [{ text: 'ok' }], log) });
    try {
      write(path.join(d.projectsDir, 'core', 'README.md'), '# core\n');
      write(path.join(d.home, 'skills', 'design', 'taste', 'SKILL.md'), '---\nname: taste\n---\n');
      d.chat.send('core', { text: 'x', stage: 'design', mode: 'ask', attachments: [] });
      d.chat.send('core', { text: 'y', stage: 'issues', mode: 'ask', attachments: [] });
      const design = log.requests[0]!;
      expect(design.plugins).toEqual([path.join(d.home, 'plugins', 'design')]);
      expect(design.allowedTools).toContain('Skill');
      // A stage with no skills gets no plugin.
      expect(log.requests[1]?.plugins).toBeUndefined();
      // Cherry's own skills ship in the stage folders.
      const { stageSkills } = await import('../src/stages/skills.ts');
      expect(stageSkills(d.home, 'deployment')).toContainEqual(
        expect.objectContaining({ name: 'release', source: 'bundled' }),
      );
      expect(stageSkills(d.home, 'preparation')).toContainEqual(
        expect.objectContaining({ name: 'project-readiness', source: 'bundled' }),
      );
    } finally {
      await d.cleanup();
    }
  });
});

describe('stage focus', () => {
  it('lists each stage its own files and checks readiness from files only', async () => {
    const { tempDir } = await import('./helpers.ts');
    const { readiness, stageFiles } = await import('../src/stages/focus.ts');
    const dir = tempDir();
    write(path.join(dir, 'docs', 'prd.md'), '# PRD');
    write(path.join(dir, 'docs', 'specs', 'search.md'), '# Search');
    write(path.join(dir, 'docs', 'specs', 'notes.bin'), 'x');
    write(path.join(dir, 'docs', 'architecture.md'), '# A');
    write(path.join(dir, 'CHANGELOG.md'), '# Changes');
    write(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    write(path.join(dir, '.github', 'workflows', 'ci.yml'), 'on: push');

    expect(stageFiles(dir, 'plan')).toEqual(['docs/prd.md', 'docs/specs/search.md']);
    expect(stageFiles(dir, 'design')).toEqual(['docs/architecture.md']);
    expect(stageFiles(dir, 'deployment')).toEqual(['CHANGELOG.md', '.github/workflows/ci.yml']);
    expect(stageFiles(dir, 'development')).toEqual([]);

    const r = Object.fromEntries(readiness(dir).map((i) => [i.id, i.ok]));
    expect(r).toMatchObject({ plan: true, tests: true, ci: true, git: false, gitignore: false });
  });

  it('serves the focus route, readiness only for Preparation', async () => {
    const d = await testDaemon();
    try {
      write(path.join(d.projectsDir, 'core', 'docs', 'roadmap.md'), '# R');
      const cookie = await d.login();
      const get = (stage: string) =>
        d.app.inject({
          method: 'GET',
          url: `/api/projects/core/stage?stage=${stage}`,
          headers: { host: HOST, cookie },
        });
      const plan = (await get('plan')).json();
      expect(plan).toEqual({ files: ['docs/roadmap.md'], readiness: null });
      const prep = (await get('preparation')).json();
      expect(prep.readiness.find((i: { id: string }) => i.id === 'roadmap')).toMatchObject({
        ok: true,
      });
      expect((await get('nope')).statusCode).toBe(400);
    } finally {
      await d.cleanup();
    }
  });
});
