import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { PlanUsage, PlanWindow } from '@cherry/shared';

/** How long one answer is reused; the UI asks every minute. */
const TTL_MS = 60_000;

type RawWindow = { utilization: number | null; resets_at: string | null } | null | undefined;

function toWindow(w: RawWindow): PlanWindow | null {
  if (!w || w.utilization === null) return null;
  const at = w.resets_at ? Date.parse(w.resets_at) : NaN;
  return { usedPercent: w.utilization, resetsAt: Number.isNaN(at) ? null : at };
}

export const noPlanUsage = (): PlanUsage => ({
  available: false,
  plan: null,
  fiveHour: null,
  week: null,
  fetchedAt: Date.now(),
});

/**
 * Asks Claude Code for the data behind `/usage` without starting a turn: the session opens
 * with a prompt that never yields, so no tokens are spent. The SDK marks this API
 * experimental; any failure reads as "not available".
 */
export async function fetchPlanUsage(): Promise<PlanUsage> {
  const idle: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }),
  };
  const q = query({ prompt: idle, options: { settingSources: [], stderr: () => undefined } });
  try {
    const u = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
      skipBehaviors: true,
    });
    const limits = u.rate_limits_available ? u.rate_limits : null;
    return {
      available: limits !== null,
      plan: u.subscription_type,
      fiveHour: toWindow(limits?.five_hour),
      week: toWindow(limits?.seven_day),
      fetchedAt: Date.now(),
    };
  } finally {
    q.close();
  }
}

/** Caches the plan usage for a minute and shares one request between callers. */
export class PlanUsageService {
  private current: PlanUsage | null = null;
  private pending: Promise<PlanUsage> | null = null;

  constructor(
    private readonly fetch: () => Promise<PlanUsage> = fetchPlanUsage,
    private readonly now: () => number = Date.now,
  ) {}

  get(): Promise<PlanUsage> {
    if (this.current && this.now() - this.current.fetchedAt < TTL_MS) {
      return Promise.resolve(this.current);
    }
    this.pending ??= this.fetch()
      .catch(() => noPlanUsage())
      .then((u) => {
        this.current = { ...u, fetchedAt: this.now() };
        return this.current;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
