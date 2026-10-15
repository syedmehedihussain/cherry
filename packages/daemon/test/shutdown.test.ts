import { afterEach, describe, expect, it } from 'vitest';
import { HOST, ORIGIN, testDaemon, type TestDaemon } from './helpers.ts';

describe('shut down from the UI', () => {
  let d: TestDaemon | null = null;
  afterEach(async () => {
    await d?.cleanup();
    d = null;
  });

  it('answers first, then stops the daemon', async () => {
    let stopped = 0;
    d = await testDaemon({ onShutdown: () => (stopped += 1) });
    const cookie = await d.login();
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/shutdown',
      headers: { host: HOST, origin: ORIGIN, cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 120));
    expect(stopped).toBe(1);
  });

  it('needs a session and the right origin', async () => {
    let stopped = 0;
    d = await testDaemon({ onShutdown: () => (stopped += 1) });
    const cookie = await d.login();
    const noSession = await d.app.inject({
      method: 'POST',
      url: '/api/shutdown',
      headers: { host: HOST, origin: ORIGIN },
    });
    expect(noSession.statusCode).toBe(401);
    const otherSite = await d.app.inject({
      method: 'POST',
      url: '/api/shutdown',
      headers: { host: HOST, origin: 'https://evil.example', cookie },
    });
    expect(otherSite.statusCode).toBe(403);
    await new Promise((r) => setTimeout(r, 120));
    expect(stopped).toBe(0);
  });

  it('is refused where the daemon has no way to stop itself', async () => {
    d = await testDaemon();
    const cookie = await d.login();
    const res = await d.app.inject({
      method: 'POST',
      url: '/api/shutdown',
      headers: { host: HOST, origin: ORIGIN, cookie },
    });
    expect(res.statusCode).toBe(409);
  });
});
