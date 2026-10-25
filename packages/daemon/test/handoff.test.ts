import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { componentList, exportZip, writeHandoff } from '../src/design/handoff.ts';
import { listScreens } from '../src/design/screens.ts';
import { zip } from '../src/design/zip.ts';
import { tempDir, write } from './helpers.ts';

describe('design handoff (V3 r9)', () => {
  let root: string;
  beforeEach(() => {
    root = tempDir('cherry-handoff-');
    write(path.join(root, 'design', 'tokens.css'), ':root{--hot:#ff5a36}');
    write(
      path.join(root, 'design', 'screens', 'home.html'),
      '<title>Home</title><link rel="stylesheet" href="../tokens.css"><div class="card"><button class="btn">Go</button></div>',
    );
    write(
      path.join(root, 'design', 'screens', 'item.html'),
      '<title>Item</title><div class="card"></div><div class="card"></div>',
    );
    write(
      path.join(root, 'design', 'brief.json'),
      JSON.stringify({
        colours: { primary: '#FF5A36' },
        fonts: { heading: { family: 'Geist', weight: 800 } },
      }),
    );
    write(path.join(root, 'docs', 'prd.md'), '# PRD');
    write(path.join(root, '.env'), 'TOKEN=1');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists shared classes first', () => {
    const comps = componentList(listScreens(root));
    expect(comps[0]).toEqual({ name: 'card', screens: ['home', 'item'], uses: 3 });
    expect(comps.map((c) => c.name)).toContain('btn');
  });

  it('writes standalone screens, tokens, components and notes, keeping the Designer notes', () => {
    write(path.join(root, 'design', 'handoff', 'notes.md'), 'mine');
    const { files } = writeHandoff(root, new Date('2026-10-25T12:00:00Z'));
    expect(files).toEqual([
      'design/handoff/screens/home.html',
      'design/handoff/screens/item.html',
      'design/handoff/tokens.css',
      'design/handoff/components.md',
      'design/handoff/README.md',
    ]);
    const home = readFileSync(path.join(root, 'design', 'handoff', 'screens', 'home.html'), 'utf8');
    expect(home).toContain('--hot:#ff5a36');
    const readme = readFileSync(path.join(root, 'design', 'handoff', 'README.md'), 'utf8');
    expect(readme).toContain('Approved 2026-10-25');
    expect(readme).toContain('| primary | `#FF5A36` |');
    expect(readme).toContain('| heading | Geist | 800 |');
    expect(readFileSync(path.join(root, 'design', 'handoff', 'notes.md'), 'utf8')).toBe('mine');
  });

  it('refuses with no screens', () => {
    rmSync(path.join(root, 'design', 'screens'), { recursive: true });
    expect(() => writeHandoff(root)).toThrow(/no screens/);
  });

  it('exports the plan and the design as a zip unzip can read, without secrets', () => {
    writeHandoff(root);
    const file = path.join(root, 'out.zip');
    writeFileSync(file, exportZip(root, 'shop'));
    const list = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n');
    expect(list).toContain('shop/docs/prd.md');
    expect(list).toContain('shop/design/handoff/README.md');
    expect(list.some((l) => l.includes('.env'))).toBe(false);
    const out = tempDir('cherry-unzip-');
    try {
      execFileSync('unzip', ['-q', file, '-d', out]);
      expect(readFileSync(path.join(out, 'shop', 'docs', 'prd.md'), 'utf8')).toBe('# PRD');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('zips text and binary data that round-trips', () => {
    const file = path.join(root, 'b.zip');
    const bin = Buffer.from([0, 1, 2, 255, 254]);
    writeFileSync(
      file,
      zip([
        { name: 'a/ü.txt', data: Buffer.from('hello') },
        { name: 'b.bin', data: bin },
      ]),
    );
    const read = (name: string) =>
      execFileSync('python3', [
        '-c',
        'import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
        file,
        name,
      ]);
    expect(read('a/ü.txt').toString('utf8')).toBe('hello');
    expect(read('b.bin')).toEqual(bin);
    expect(existsSync(file)).toBe(true);
  });
});
