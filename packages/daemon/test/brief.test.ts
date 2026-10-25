import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Brief } from '@cherry/shared';
import { HOST, ORIGIN, testDaemon, write, type TestDaemon } from './helpers.ts';

// V3 r8: the Design brief in design/brief.json, files under design/.
describe('design brief', () => {
  let d: TestDaemon;
  let cookie: string;
  const headers = () => ({ host: HOST, origin: ORIGIN, cookie });
  beforeEach(async () => {
    d = await testDaemon();
    cookie = await d.login();
    write(path.join(d.projectsDir, 'core', 'README.md'), '# core');
  });
  afterEach(async () => d.cleanup());
  const core = (...p: string[]) => path.join(d.projectsDir, 'core', ...p);

  it('starts empty, keeps colours and fonts, and rejects bad values', async () => {
    const empty = await d.app.inject({
      method: 'GET',
      url: '/api/projects/core/design/brief',
      headers: headers(),
    });
    expect(empty.json<Brief>()).toMatchObject({ references: [], colours: { primary: null } });
    const brief = {
      ...empty.json<Brief>(),
      colours: { ...empty.json<Brief>().colours, primary: '#FF5A36' },
      fonts: { heading: { family: 'Geist', weight: 600 }, body: null, numbers: null },
      references: [{ kind: 'link', value: 'https://dribbble.com/shots/1', note: 'dark' }],
    };
    const put = await d.app.inject({
      method: 'PUT',
      url: '/api/projects/core/design/brief',
      headers: headers(),
      payload: brief,
    });
    expect(put.statusCode).toBe(200);
    const saved = JSON.parse(readFileSync(core('design', 'brief.json'), 'utf8')) as Brief;
    expect(saved.colours.primary).toBe('#FF5A36');
    expect(saved.fonts.heading).toEqual({ family: 'Geist', weight: 600 });
    const bad = await d.app.inject({
      method: 'PUT',
      url: '/api/projects/core/design/brief',
      headers: headers(),
      payload: { ...brief, colours: { ...brief.colours, primary: 'red; x' } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('stores dropped files in the list folder, serves them, and removes them', async () => {
    const up = await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/design/brief/files?list=references&name=Mood%20Board.PNG',
      headers: { ...headers(), 'content-type': 'application/octet-stream' },
      payload: Buffer.from('png-bytes'),
    });
    expect(up.statusCode).toBe(200);
    const item = up.json<Brief>().references[0]!;
    expect(item).toEqual({ kind: 'file', value: 'design/references/mood-board.png', note: '' });
    expect(existsSync(core('design', 'references', 'mood-board.png'))).toBe(true);

    const file = await d.app.inject({
      method: 'GET',
      url: `/api/projects/core/design/file?path=${encodeURIComponent(item.value)}`,
      headers: headers(),
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-security-policy']).toContain('sandbox');

    const wrong = await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/design/brief/files?list=images&name=run.sh',
      headers: { ...headers(), 'content-type': 'application/octet-stream' },
      payload: Buffer.from('rm -rf /'),
    });
    expect(wrong.statusCode).toBe(400);

    const del = await d.app.inject({
      method: 'DELETE',
      url: `/api/projects/core/design/brief/item?list=references&value=${encodeURIComponent(item.value)}`,
      headers: headers(),
    });
    expect(del.json<Brief>().references).toEqual([]);
    expect(existsSync(core('design', 'references', 'mood-board.png'))).toBe(false);
  });

  it('serves only files under design/, never secrets or other folders', async () => {
    write(core('.env'), 'TOKEN=1');
    write(core('design', '.env'), 'TOKEN=1');
    for (const p of ['.env', 'README.md', 'design/.env', 'design/../.env'])
      expect(
        (
          await d.app.inject({
            method: 'GET',
            url: `/api/projects/core/design/file?path=${encodeURIComponent(p)}`,
            headers: headers(),
          })
        ).statusCode,
      ).not.toBe(200);
  });

  it("copies another project's tokens as a design system", async () => {
    write(path.join(d.projectsDir, 'site', 'design', 'tokens.css'), ':root{--a:1}');
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/projects/core/design/brief/tokens-from',
      headers: headers(),
      payload: { from: 'site' },
    });
    expect(res.json<Brief>().system[0]!.value).toBe('design/system/site-tokens.css');
    expect(readFileSync(core('design', 'system', 'site-tokens.css'), 'utf8')).toBe(':root{--a:1}');
  });

  it('lists fonts', async () => {
    const res = await d.app.inject({ method: 'GET', url: '/api/fonts', headers: headers() });
    expect(res.json()).toMatchObject({ bundled: ['Geist', 'Geist Mono'] });
    expect(Array.isArray(res.json().families)).toBe(true);
  });
});
