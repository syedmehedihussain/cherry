import { describe, expect, it } from 'vitest';
import { normaliseGroups, parsePorcelain } from './commits.ts';

describe('parsePorcelain', () => {
  it('reads modified, new, deleted and renamed files', () => {
    const out = [' M src/a.ts', '?? new.md', ' D old.ts', 'R  b2.ts', 'b.ts', ''].join('\0');
    expect(parsePorcelain(out)).toEqual([
      { path: 'src/a.ts', letter: 'M', origPath: null },
      { path: 'new.md', letter: 'U', origPath: null },
      { path: 'old.ts', letter: 'D', origPath: null },
      { path: 'b2.ts', letter: 'R', origPath: 'b.ts' },
    ]);
  });
});

describe('normaliseGroups', () => {
  it('uses each file once, drops unknown files and keeps leftovers', () => {
    const groups = normaliseGroups(
      ['a.ts', 'b.ts', 'c.ts'],
      [
        { message: 'feat: a\nextra', explanation: 'Adds a.', files: ['a.ts', 'nope.ts'] },
        { message: 'fix: dup', explanation: 'Dup.', files: ['a.ts'] },
        { message: 'fix: b', explanation: 'Fixes b.', files: ['b.ts'] },
      ],
    );
    expect(groups.map((g) => [g.message, g.files])).toEqual([
      ['feat: a', ['a.ts']],
      ['fix: b', ['b.ts']],
      ['chore: other changes', ['c.ts']],
    ]);
  });
});
