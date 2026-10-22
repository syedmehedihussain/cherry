import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { summaryOf } from '../src/start/service.ts';
import { HOST, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('Start project (ADR-0036)', () => {
  let d: TestDaemon;
  let cookie: string;
  const start = async (payload: object) => {
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/projects/start',
      headers: { host: HOST, cookie },
      payload,
    });
    return { status: res.statusCode, body: res.json() };
  };

  beforeEach(async () => {
    d = await testDaemon();
    d.config.setProjects([]);
    cookie = await d.login();
  });
  afterEach(() => d.cleanup());

  it('makes the folder in the Plan phase with the idea in STATUS.md and lists it', async () => {
    const r = await start({ name: 'review-qr', idea: 'A QR code that opens a review page.' });
    expect(r.status).toBe(200);
    const dir = path.join(d.projectsDir, 'review-qr');
    expect(r.body).toEqual({ id: 'review-qr', path: dir });
    const pj = JSON.parse(readFileSync(path.join(dir, '_project', 'project.json'), 'utf8'));
    expect(pj).toMatchObject({ name: 'review-qr', phase: 'plan', createdBy: 'manual' });
    const status = readFileSync(path.join(dir, '_project', 'STATUS.md'), 'utf8');
    expect(status).toContain('## Idea\n\nA QR code that opens a review page.');
    expect(status).toContain('- [ ] Write the PRD');
    expect(existsSync(path.join(dir, '_project', 'tasks.json'))).toBe(true);
    // git, with _project/ kept out of it, and nothing else written.
    expect(readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8')).toContain('_project/');
    expect(readFileSync(path.join(d.home, 'config.json'), 'utf8').includes('review-qr')).toBe(true);
    const card = (
      await d.app.inject({ method: 'GET', url: '/api/projects', headers: { host: HOST, cookie } })
    ).json().cards[0];
    expect(card).toMatchObject({ id: 'review-qr', state: 'ready', phase: 'plan' });
  });

  it('creates it in another folder when asked', async () => {
    const other = tempDir('cherry-start-');
    try {
      const r = await start({ name: 'bird-log', idea: 'Log birds.', parentDir: other });
      expect(r.body.path).toBe(path.join(other, 'bird-log'));
      expect(existsSync(path.join(other, 'bird-log', '_project', 'STATUS.md'))).toBe(true);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('refuses a folder that already has files, a bad name and an empty idea', async () => {
    write(path.join(d.projectsDir, 'taken', 'README.md'), '# Mine\n');
    const taken = await start({ name: 'taken', idea: 'Something.' });
    expect(taken.status).toBe(409);
    expect(readFileSync(path.join(d.projectsDir, 'taken', 'README.md'), 'utf8')).toBe('# Mine\n');
    expect(existsSync(path.join(d.projectsDir, 'taken', '_project'))).toBe(false);
    expect((await start({ name: '../up', idea: 'x' })).status).toBe(400);
    expect((await start({ name: 'ok', idea: '  ' })).status).toBe(400);
    // An empty folder is fine.
    mkdirSync(path.join(d.projectsDir, 'empty'));
    expect((await start({ name: 'empty', idea: 'Fill it.' })).status).toBe(200);
  });

  it('keeps the summary to one line of 120 characters', () => {
    expect(summaryOf('Two\nlines')).toBe('Two lines');
    expect(summaryOf('x'.repeat(200))).toHaveLength(120);
  });
});
