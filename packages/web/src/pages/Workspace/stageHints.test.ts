import { describe, expect, it } from 'vitest';
import type { ChatItem } from '@cherry/shared';
import { stuckReason } from './StageHints.tsx';
import { handoffDraft } from './stageMoves.ts';

const user = (id: string, text: string): ChatItem => ({ kind: 'user', id, at: 0, text });
const end = (id: string, ok: boolean, stopped = false): ChatItem => ({
  kind: 'turn-end',
  id,
  at: 0,
  turnId: id,
  ok,
  stopped,
  error: ok ? null : 'boom',
  durationMs: 1,
});

describe('Stuck? (V3 r12)', () => {
  it('shows after two failed replies in a row', () => {
    expect(stuckReason([user('a', 'x'), end('1', false), user('b', 'y'), end('2', false)])).toBe(
      'The last two replies failed.',
    );
    expect(
      stuckReason([user('a', 'x'), end('1', false), user('b', 'y'), end('2', true)]),
    ).toBeNull();
  });
  it('a stop is not a failure', () => {
    expect(
      stuckReason([user('a', 'x'), end('1', false, true), user('b', 'y'), end('2', false)]),
    ).toBeNull();
  });
  it('shows when the same message was sent twice', () => {
    expect(
      stuckReason([user('a', 'Fix it'), end('1', true), user('b', 'fix it '), end('2', true)]),
    ).toBe('You sent the same message twice.');
  });
});

describe('handoff draft', () => {
  it('starts with the note and asks the next agent to begin', () => {
    expect(handoffDraft('plan', 'design', 'Wrote `docs/prd.md`.')).toBe(
      'Handoff from Plan:\nWrote `docs/prd.md`.\n\nStart Design: read what Plan made, say what you understood and what you will do first.',
    );
  });
});
