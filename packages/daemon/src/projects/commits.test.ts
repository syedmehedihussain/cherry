import { describe, expect, it } from 'vitest';
import { parseStatus, splitStatus } from './commits.ts';

describe('parseStatus and splitStatus', () => {
  it('puts staged and not-staged changes in their lists, like VS Code', () => {
    const out = [
      ' M src/a.ts',
      '?? new.md',
      ' D old.ts',
      'R  b2.ts',
      'b.ts',
      'MM both.ts',
      'A  added.ts',
      '',
    ].join('\0');
    expect(splitStatus(parseStatus(out))).toEqual({
      staged: [
        { path: 'b2.ts', letter: 'R', origPath: 'b.ts' },
        { path: 'both.ts', letter: 'M', origPath: null },
        { path: 'added.ts', letter: 'A', origPath: null },
      ],
      changes: [
        { path: 'src/a.ts', letter: 'M', origPath: null },
        { path: 'new.md', letter: 'U', origPath: null },
        { path: 'old.ts', letter: 'D', origPath: null },
        { path: 'both.ts', letter: 'M', origPath: null },
      ],
    });
  });
});
