import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectCard } from '@cherry/shared';
import { folderId } from '../src/projects/opened.ts';
import { HOST, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('folderId', () => {
  it('makes a safe id and avoids names already taken', () => {
    expect(folderId('my app', new Set())).toBe('my-app');
    expect(folderId('.hidden', new Set())).toBe('hidden');
    expect(folderId('core', new Set(['core', 'core-2']))).toBe('core-3');
  });
});

describe('Project list (ADR-0032)', () => {
  let d: TestDaemon;
  let cookie: string;
  let outside: string;
  const api = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await d.app.inject({
      method,
      url,
      headers: { host: HOST, cookie },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json() };
  };
  const cards = async (): Promise<ProjectCard[]> => (await api('GET', '/api/projects')).body.cards;

  beforeEach(async () => {
    d = await testDaemon();
    d.config.setProjects([]);
    cookie = await d.login();
    mkdirSync(path.join(d.projectsDir, 'core'));
    outside = tempDir('cherry-outside-');
    write(path.join(outside, 'core', 'README.md'), '# Elsewhere\n');
  });
  afterEach(async () => {
    await d.cleanup();
    rmSync(outside, { recursive: true, force: true });
  });

  it('starts empty: folders in the new projects folder are not listed', async () => {
    expect(await cards()).toEqual([]);
    expect((await api('GET', '/api/projects/core')).status).toBe(404);
  });

  it('Open folder adds a folder from anywhere; Remove from Cherry forgets it', async () => {
    const dir = path.join(outside, 'core');
    expect((await api('POST', '/api/projects/open', { path: dir })).body).toEqual({ id: 'core' });
    expect((await cards()).map((c) => c.id)).toEqual(['core']);
    const tree = await api('GET', '/api/projects/core/tree');
    expect(tree.status).toBe(200);
    expect(JSON.stringify(tree.body)).toContain('README.md');
    expect(JSON.parse(readFileSync(path.join(d.home, 'config.json'), 'utf8')).projects).toEqual([
      { id: 'core', path: dir },
    ]);
    // Opening it again gives the same id; another folder with the same name gets core-2.
    expect((await api('POST', '/api/projects/open', { path: dir })).body).toEqual({ id: 'core' });
    const r = await api('POST', '/api/projects/open', { path: path.join(d.projectsDir, 'core') });
    expect(r.body).toEqual({ id: 'core-2' });

    expect((await api('POST', '/api/projects/core/remove')).status).toBe(200);
    expect((await cards()).map((c) => c.id)).toEqual(['core-2']);
    expect((await api('GET', '/api/projects/core')).status).toBe(404);
    expect(existsSync(path.join(dir, 'README.md'))).toBe(true);
    expect((await api('POST', '/api/projects/nope/remove')).status).toBe(404);
  });

  it('a listed folder that was moved shows as missing and can be removed', async () => {
    const dir = path.join(outside, 'core');
    await api('POST', '/api/projects/open', { path: dir });
    rmSync(dir, { recursive: true });
    await d.projects.rescan();
    expect((await cards())[0]).toMatchObject({ id: 'core', missing: true });
    expect((await api('POST', '/api/projects/core/remove')).status).toBe(200);
    expect(await cards()).toEqual([]);
  });

  it("refuses the disk, Cherry's folder and anything that is not a folder", async () => {
    const refuse = async (p: string, msg: RegExp) => {
      const r = await api('POST', '/api/projects/open', { path: p });
      expect(r.status).toBe(400);
      expect(r.body.error.message).toMatch(msg);
    };
    await refuse('/', /whole disk/);
    await refuse(d.home, /Cherry's own data/);
    await refuse(path.join(outside, 'core', 'README.md'), /not a folder/);
    await refuse(path.join(outside, 'nope'), /not a folder/);
    expect(d.config.get().projects).toEqual([]);
  });

  it('the CLI opens a folder with its secret', async () => {
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/cli/open-folder',
      headers: { host: HOST, 'x-cherry-cli': d.cliSecret },
      payload: { path: path.join(outside, 'core') },
    });
    expect(res.json()).toEqual({ id: 'core' });
    const denied = await d.app.inject({
      method: 'POST',
      url: '/api/cli/open-folder',
      headers: { host: HOST },
      payload: { path: outside },
    });
    expect(denied.statusCode).toBe(401);
  });
});
