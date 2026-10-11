import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TasksFile } from '@cherry/shared';
import { fakeRunner, type Step } from '../src/claude/fake-runner.ts';
import { HOST, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('Overview box: tasks and notes', () => {
  let d: TestDaemon;
  let cookie: string;
  let script: Step[] = [];
  const api = async (url: string, payload: unknown) => {
    const res = await d.app.inject({
      method: 'POST',
      url,
      headers: { host: HOST, cookie },
      payload: payload as object,
    });
    return { status: res.statusCode, body: res.json() };
  };

  beforeAll(async () => {
    d = await testDaemon({ runner: fakeRunner(() => script) });
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'README.md'), '# Core\n');
    write(
      path.join(d.projectsDir, 'site', '_project', 'tasks.json'),
      JSON.stringify({
        schema: 1,
        tasks: [
          { id: 't1', phase: 'plan', title: 'PRD', status: 'done', dependsOn: [] },
          { id: 't2', phase: 'design', title: 'Wireframes', status: 'todo', dependsOn: [] },
        ],
      }),
    );
  });
  afterAll(() => d.cleanup());

  it('adds a task to the current phase', async () => {
    const r = await api('/api/projects/site/tasks', { title: 'Fix the hero section' });
    expect(r.status).toBe(200);
    expect((r.body as TasksFile).tasks.at(-1)).toEqual({
      id: 't3',
      phase: 'design',
      title: 'Fix the hero section',
      status: 'todo',
      dependsOn: [],
    });
  });

  it('creates tasks.json when the project has none', async () => {
    const r = await api('/api/projects/core/tasks', { title: 'First task' });
    expect(r.status).toBe(200);
    const file = path.join(d.projectsDir, 'core', '_project', 'tasks.json');
    expect(JSON.parse(readFileSync(file, 'utf8')).tasks[0]).toMatchObject({
      id: 't1',
      title: 'First task',
    });
  });

  it('organises a note into notes.md as an addition', async () => {
    const file = path.join(d.projectsDir, 'core', '_project', 'notes.md');
    write(file, '## Ideas\n\n- Dark mode\n');
    script = [
      { call: { name: 'save_note', input: { section: 'Ideas', markdown: '- Hero video' } } },
    ];
    const r = await api('/api/projects/core/notes/organise', { text: 'hero vidoe maybe' });
    expect(r.status).toBe(200);
    expect(r.body.section).toBe('Ideas');
    expect(readFileSync(file, 'utf8')).toBe('## Ideas\n\n- Dark mode\n\n- Hero video\n');
  });

  it('keeps notes.md as it was when the note-taker does not save', async () => {
    const file = path.join(d.projectsDir, 'core', '_project', 'notes.md');
    const before = readFileSync(file, 'utf8');
    script = [{ text: 'I forgot to save.' }];
    const r = await api('/api/projects/core/notes/organise', { text: 'another note' });
    expect(r.status).toBe(502);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
