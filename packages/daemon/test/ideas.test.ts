import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HOST, ORIGIN, testDaemon, type TestDaemon } from './helpers.ts';

describe('project ideas (ADR-0027)', () => {
  let d: TestDaemon | null = null;
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const cookie = await d!.login();
    return d!.app.inject({
      method,
      url,
      headers: { host: HOST, origin: ORIGIN, cookie },
      ...(body === undefined ? {} : { payload: body as object }),
    });
  };

  it('adds, lists newest first, edits and removes ideas in ~/.cherry/ideas.json', async () => {
    d = await testDaemon();
    expect((await call('GET', '/api/ideas')).json()).toEqual({ ideas: [] });

    const a = (
      await call('POST', '/api/ideas', {
        name: ' Recipe planner ',
        description: 'Meals for a week',
      })
    ).json();
    expect(a.idea).toMatchObject({ name: 'Recipe planner', description: 'Meals for a week' });
    expect(a.idea.id).toMatch(/^idea_[0-9a-f]{10}$/);
    const b = (await call('POST', '/api/ideas', { name: 'Bird log' })).json();
    expect(b.idea.description).toBe('');

    const list = (await call('GET', '/api/ideas')).json();
    expect(list.ideas.map((i: { name: string }) => i.name)).toEqual(['Bird log', 'Recipe planner']);

    const edited = await call('PATCH', `/api/ideas/${a.idea.id}`, {
      name: 'Meal planner',
      description: 'x',
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().idea.name).toBe('Meal planner');

    expect((await call('DELETE', `/api/ideas/${b.idea.id}`)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/ideas/${b.idea.id}`)).statusCode).toBe(404);

    const file = path.join(d.home, 'ideas.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.schema).toBe(1);
    expect(saved.ideas).toHaveLength(1);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // No folder is made for an idea.
    expect((await call('GET', '/api/projects')).json().cards).toEqual([]);
  });

  it('refuses an empty name, a bad id and never overwrites a broken file', async () => {
    d = await testDaemon();
    expect((await call('POST', '/api/ideas', { name: '  ' })).statusCode).toBe(400);
    expect((await call('DELETE', '/api/ideas/../config')).statusCode).toBe(404);
    expect((await call('PATCH', '/api/ideas/nope', { name: 'x' })).statusCode).toBe(400);

    const file = path.join(d.home, 'ideas.json');
    writeFileSync(file, '{ not json');
    expect((await call('POST', '/api/ideas', { name: 'x' })).statusCode).toBe(500);
    expect(readFileSync(file, 'utf8')).toBe('{ not json');
  });
});
