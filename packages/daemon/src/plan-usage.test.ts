import { describe, expect, it, vi } from 'vitest';
import type { PlanUsage } from '@cherry/shared';
import { PlanUsageService } from './plan-usage.ts';

const sample: PlanUsage = {
  available: true,
  plan: 'pro',
  fiveHour: { usedPercent: 56, resetsAt: 1 },
  week: { usedPercent: 78, resetsAt: 2 },
  fetchedAt: 0,
};

describe('PlanUsageService', () => {
  it('reuses one answer for a minute', async () => {
    let t = 1_000;
    const fetch = vi.fn(async () => sample);
    const s = new PlanUsageService(fetch, () => t);
    await Promise.all([s.get(), s.get()]);
    t += 59_000;
    expect((await s.get()).week?.usedPercent).toBe(78);
    expect(fetch).toHaveBeenCalledTimes(1);
    t += 2_000;
    await s.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reads a failure as not available', async () => {
    const s = new PlanUsageService(async () => {
      throw new Error('claude not found');
    });
    expect(await s.get()).toMatchObject({ available: false, fiveHour: null, week: null });
  });
});
