import { describe, expect, it } from 'vitest';
import { resetText } from './PlanUsage.tsx';

describe('resetText', () => {
  const now = Date.parse('2026-10-11T00:00:00Z');

  it('counts down hours and minutes inside a day', () => {
    expect(resetText(now + 72 * 60_000, now)).toBe('resets in 1h 12m');
    expect(resetText(now + 5 * 60_000, now)).toBe('resets in 5m');
    expect(resetText(now - 1, now)).toBe('resets now');
  });

  it('names the day when the reset is further away', () => {
    expect(resetText(now + 3 * 86_400_000, now)).toMatch(/^resets \S+ \d/);
  });
});
