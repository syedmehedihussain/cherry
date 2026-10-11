import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlanUsageSchema } from '@cherry/shared';
import { HOST, testDaemon, type TestDaemon } from './helpers.ts';

describe('GET /api/claude/usage', () => {
  let d: TestDaemon;
  let cookie: string;

  beforeAll(async () => {
    d = await testDaemon();
    cookie = await d.login();
  });
  afterAll(() => d.cleanup());

  it('needs a session', async () => {
    const res = await d.app.inject({
      method: 'GET',
      url: '/api/claude/usage',
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns the 5-hour and weekly windows', async () => {
    const res = await d.app.inject({
      method: 'GET',
      url: '/api/claude/usage',
      headers: { host: HOST, cookie },
    });
    expect(res.statusCode).toBe(200);
    const u = PlanUsageSchema.parse(res.json());
    expect(u.fiveHour?.usedPercent).toBe(56);
    expect(u.week?.usedPercent).toBe(78);
  });
});
