import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/config.ts';
import { HOST, ORIGIN, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('welcome screen', () => {
  let d: TestDaemon;
  let cookie: string;
  const headers = () => ({ host: HOST, origin: ORIGIN, cookie });

  beforeAll(async () => {
    d = await testDaemon();
    cookie = await d.login();
  });
  afterAll(() => d.cleanup());

  it('a fresh config is not onboarded; an existing one without the field is', () => {
    const fresh = tempDir();
    expect(new ConfigStore(fresh).get().onboarded).toBe(false);
    const old = tempDir();
    write(path.join(old, 'config.json'), JSON.stringify({ schema: 1, projectsDir: '~/Code' }));
    expect(new ConfigStore(old).get().onboarded).toBe(true);
    rmSync(fresh, { recursive: true });
    rmSync(old, { recursive: true });
  });

  it('lists sub-folder names without hidden ones', async () => {
    const root = tempDir();
    mkdirSync(path.join(root, 'b'));
    mkdirSync(path.join(root, 'a'));
    mkdirSync(path.join(root, '.hidden'));
    write(path.join(root, 'file.txt'), 'x');
    const res = await d.app.inject({
      url: `/api/folders?path=${encodeURIComponent(root)}`,
      headers: headers(),
    });
    expect(res.json()).toMatchObject({ exists: true, dirs: ['a', 'b'] });
    const missing = await d.app.inject({
      url: `/api/folders?path=${encodeURIComponent(path.join(root, 'nope'))}`,
      headers: headers(),
    });
    expect(missing.json()).toMatchObject({ exists: false, dirs: [] });
    rmSync(root, { recursive: true });
  });

  it('setup creates the folder, saves it and marks the install onboarded', async () => {
    const target = path.join(tempDir(), 'My Projects');
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: headers(),
      payload: { projectsDir: target },
    });
    expect(res.statusCode).toBe(200);
    expect(existsSync(target)).toBe(true);
    const saved = JSON.parse(readFileSync(path.join(d.home, 'config.json'), 'utf8'));
    expect(saved).toMatchObject({ projectsDir: target, onboarded: true });
    rmSync(path.dirname(target), { recursive: true });
  });

  it('setup refuses a file', async () => {
    const root = tempDir();
    write(path.join(root, 'f'), 'x');
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: headers(),
      payload: { projectsDir: path.join(root, 'f') },
    });
    expect(res.statusCode).toBe(400);
    rmSync(root, { recursive: true });
  });
});
