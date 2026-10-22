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

describe('Open folder (ADR-0031)', () => {
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
    cookie = await d.login();
    mkdirSync(path.join(d.projectsDir, 'core'));
    outside = tempDir('cherry-outside-');
    write(path.join(outside, 'core', 'README.md'), '# Elsewhere\n');
  });
  afterEach(async () => {
    await d.cleanup();
    rmSync(outside, { recursive: true, force: true });
  });

  it('opens a folder from anywhere; it works like any project; Remove from list forgets it', async () => {
    const dir = path.join(outside, 'core');
    const r = await api('POST', '/api/projects/open', { path: dir });
    // "core" is taken by the projects folder, so the opened one gets core-2.
    expect(r.body).toEqual({ id: 'core-2' });
    const card = (await cards()).find((c) => c.id === 'core-2');
    expect(card).toMatchObject({ opened: true, name: 'core-2' });
    expect((await cards()).find((c) => c.id === 'core')).toMatchObject({ opened: false });
    const tree = await api('GET', '/api/projects/core-2/tree');
    expect(tree.status).toBe(200);
    expect(JSON.stringify(tree.body)).toContain('README.md');
    expect(JSON.parse(readFileSync(path.join(d.home, 'config.json'), 'utf8')).openFolders).toEqual([
      { id: 'core-2', path: dir },
    ]);

    // Opening it again gives the same id.
    expect((await api('POST', '/api/projects/open', { path: dir })).body).toEqual({ id: 'core-2' });

    expect((await api('POST', '/api/projects/core-2/close')).status).toBe(200);
    expect((await cards()).some((c) => c.id === 'core-2')).toBe(false);
    expect((await api('GET', '/api/projects/core-2')).status).toBe(404);
    expect(existsSync(path.join(dir, 'README.md'))).toBe(true);
    // Only opened folders can be removed from the list.
    expect((await api('POST', '/api/projects/core/close')).status).toBe(404);
  });

  it('a folder inside the projects folder is already a project', async () => {
    const r = await api('POST', '/api/projects/open', {
      path: path.join(d.projectsDir, 'core'),
    });
    expect(r.body).toEqual({ id: 'core' });
    expect(d.config.get().openFolders).toEqual([]);
  });

  it("refuses the disk, Cherry's folder, a folder holding the projects folder, and files", async () => {
    const refuse = async (p: string, msg: RegExp) => {
      const r = await api('POST', '/api/projects/open', { path: p });
      expect(r.status).toBe(400);
      expect(r.body.error.message).toMatch(msg);
    };
    await refuse('/', /whole disk/);
    await refuse(d.home, /Cherry's own data/);
    // /tmp holds both test folders, so either reason may come first.
    await refuse(path.dirname(d.projectsDir), /holds your projects folder|Cherry's own data/);
    await refuse(d.projectsDir, /your projects folder/);
    await refuse(path.join(outside, 'core', 'README.md'), /not a folder/);
    await refuse(path.join(outside, 'nope'), /not a folder/);
    expect(d.config.get().openFolders).toEqual([]);
  });

  it('the CLI opens a folder with its secret', async () => {
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/cli/open-folder',
      headers: { host: HOST, 'x-cherry-cli': d.cliSecret },
      payload: { path: path.join(outside, 'core') },
    });
    expect(res.json()).toEqual({ id: 'core-2' });
    const denied = await d.app.inject({
      method: 'POST',
      url: '/api/cli/open-folder',
      headers: { host: HOST },
      payload: { path: outside },
    });
    expect(denied.statusCode).toBe(401);
  });
});
