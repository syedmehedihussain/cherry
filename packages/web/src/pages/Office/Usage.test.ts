import { describe, expect, it } from 'vitest';
import type { OfficeFile } from '@cherry/shared';
import { fmtSpan, shortModel, wallTimes } from './Usage.tsx';

describe('Claude usage tab', () => {
  // Finding #16: short model names, one line each.
  it.each([
    ['claude-opus-5-5', 'Opus 5.5'],
    ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
    ['claude-sonnet-4-20250514', 'Sonnet 4'],
    ['claude-opus-4-1-20250805', 'Opus 4.1'],
    ['claude-3-5-sonnet-20241022', 'Sonnet 3.5'],
    ['claude-fable-5-1[1m]', 'Fable 5.1'],
    ['gpt-x', 'gpt-x'],
  ])('%s → %s', (id, name) => expect(shortModel(id)).toBe(name));

  // Finding #17: wall time per stage, from the sign-off before it to its own.
  it('times each stage from the sign-off before it, the open one to now', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 10, 8, h)).toISOString();
    const signed = (h: number) => ({
      state: 'signed',
      ready: true,
      sentAt: null,
      signOffs: [{ by: 'you', date: '2026-11-08', notes: '', internal: true, at: at(h) }],
    });
    const open = { state: 'active', ready: false, sentAt: null, signOffs: [] };
    const locked = { ...open, state: 'locked' };
    const office = {
      cycles: [
        {
          startedAt: at(0),
          stages: {
            idea: signed(1),
            requirements: signed(4),
            plan: open,
            design: locked,
            development: locked,
            testing: locked,
            deployment: locked,
          },
        },
      ],
    } as unknown as OfficeFile;
    const w = wallTimes(office, Date.parse(at(6)));
    expect(w).toEqual({ idea: 3_600_000, requirements: 3 * 3_600_000, plan: 2 * 3_600_000 });
    expect(fmtSpan(w.requirements!)).toBe('3.0 h');
    expect(fmtSpan(45 * 60_000)).toBe('45 min');
  });
});
