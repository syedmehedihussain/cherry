import { describe, expect, it } from 'vitest';
import { suggest } from './suggest.ts';

const items = [
  { name: 'tdd', description: 'Write the tests first, then the code that makes them pass.' },
  { name: 'handoff', description: 'Hand a finished stage to the next agent.' },
  { name: 'write-a-skill', description: 'Write a new skill for a stage agent.' },
];

describe('suggest (ADR-0062)', () => {
  it('matches on two shared words, not on one', () => {
    const got = suggest('Build it from the design handoff. Write the tests first.', items);
    expect(got.map((i) => i.name)).toEqual(['tdd']);
  });

  it('suggests nothing for a short reply', () => {
    expect(suggest('Yes, go ahead.', items)).toEqual([]);
  });
});
