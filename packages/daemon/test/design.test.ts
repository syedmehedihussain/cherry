import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listScreens } from '../src/design/screens.ts';
import { HOST, ORIGIN, tempDir, testDaemon, write, type TestDaemon } from './helpers.ts';

describe('design screens (V3 r7)', () => {
  let root: string;
  beforeEach(() => {
    root = tempDir('cherry-design-');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists screens in name order with their titles, CSS and images inlined', () => {
    write(
      path.join(root, 'design', 'tokens.css'),
      ':root{--brand:#ff5a36}.logo{background:url(assets/dot.svg)}',
    );
    write(
      path.join(root, 'design', 'assets', 'dot.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    write(
      path.join(root, 'design', 'screens', 'today.html'),
      '<html><head><title>Today</title><link rel="stylesheet" href="../tokens.css"></head><body><img src="../assets/dot.svg"></body></html>',
    );
    write(path.join(root, 'design', 'screens', 'after.html'), '<p>no title</p>');
    write(path.join(root, 'design', 'screens', 'notes.txt'), 'skip me');
    const screens = listScreens(root);
    expect(screens.map((s) => [s.name, s.title, s.path])).toEqual([
      ['after', 'after', 'design/screens/after.html'],
      ['today', 'Today', 'design/screens/today.html'],
    ]);
    const today = screens[1]!.html;
    expect(today).toContain('--brand:#ff5a36');
    expect(today).not.toContain('href="../tokens.css"');
    expect(today).toContain('src="data:image/svg+xml;base64,');
    expect(today).toContain('url("data:image/svg+xml;base64,');
  });

  it('never inlines files outside the project, secrets or web addresses', () => {
    const outside = tempDir('cherry-outside-');
    try {
      write(path.join(outside, 'leak.css'), 'body{--secret:1}');
      write(path.join(root, '.env'), 'TOKEN=1');
      const rel = path.relative(
        path.join(root, 'design', 'screens'),
        path.join(outside, 'leak.css'),
      );
      write(
        path.join(root, 'design', 'screens', 'x.html'),
        `<link rel="stylesheet" href="${rel}"><link rel="stylesheet" href="../../.env"><link rel="stylesheet" href="https://fonts.googleapis.com/css">`,
      );
      const html = listScreens(root)[0]!.html;
      expect(html).not.toContain('--secret');
      expect(html).not.toContain('TOKEN=1');
      expect(html).toContain('href="https://fonts.googleapis.com/css"');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('serves them from the API', async () => {
    const d: TestDaemon = await testDaemon();
    try {
      const cookie = await d.login();
      write(
        path.join(d.projectsDir, 'core', 'design', 'screens', 'home.html'),
        '<title>Home</title>',
      );
      const res = await d.app.inject({
        method: 'GET',
        url: '/api/projects/core/design/screens',
        headers: { host: HOST, origin: ORIGIN, cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().screens[0]).toMatchObject({ name: 'home', title: 'Home' });
    } finally {
      await d.cleanup();
    }
  });
});
