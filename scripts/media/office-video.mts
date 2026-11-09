// Records the V4 walkthrough (projects, a client waiting, the rooms, the crew, usage, invoice)
// from the office demo daemon (setup-office-demo.py). Read-only: it sends no message to Claude.
// S=<work folder> PORT=4410 node --import tsx scripts/media/office-video.mts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, type Locator } from '@playwright/test';

const S = process.env.S!;
const BASE = `http://127.0.0.1:${process.env.PORT ?? '4410'}`;
const OUT = path.join(S, 'video');

const info = JSON.parse(readFileSync(path.join(S, 'demo/.cherry/run/daemon.json'), 'utf8'));
const res = await fetch(`${BASE}/api/cli/login-code`, {
  method: 'POST',
  headers: { 'x-cherry-cli': info.cliSecret },
});
const { code } = (await res.json()) as { code: string };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
await ctx.addInitScript(() => {
  for (const v of ['1.0', '1.1']) localStorage.setItem(`cherry:live-seen:water-demo:${v}`, '1');
  // A visible pointer: headless video has none.
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 4px rgba(255,255,255,.18),0 2px 8px rgba(0,0,0,.6);pointer-events:none;transition:transform .12s;left:var(--x,720px);top:var(--y,450px)';
    document.body.appendChild(dot);
    addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    addEventListener('mousedown', () => (dot.style.transform = 'scale(.7)'));
    addEventListener('mouseup', () => (dot.style.transform = ''));
  });
});
const page = await ctx.newPage();
const pause = (ms: number) => page.waitForTimeout(ms);
// Quick moves: the pointer travels in 12 steps.
async function to(l: Locator) {
  await l.scrollIntoViewIfNeeded();
  const b = (await l.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await pause(150);
}
async function click(l: Locator) {
  await to(l);
  await page.mouse.down();
  await page.mouse.up();
}
const tab = (name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .or(page.getByRole('tab', { name, exact: true }))
    .first();

// Projects: client and personal work, each with its stage.
await page.goto(`${BASE}/#login=${code}`);
await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
await expect(page.getByRole('link', { name: 'clinic-booking', exact: true }).first()).toBeVisible();
await page.mouse.move(720, 450);
await pause(1200);
await click(page.getByRole('link', { name: 'clinic-booking', exact: true }).first());

// A client project: Design waits for the client's approval.
await expect(page.getByRole('heading', { name: 'clinic-booking' })).toBeVisible();
await pause(500);
await to(page.getByText('waiting for client').first());
await pause(1100);

// The Plan room: the architect's decision card (an ADR).
await page.goto(`${BASE}/p/water-demo/s/plan`);
await pause(700);
await to(page.getByRole('button', { name: 'Approve' }).first());
await pause(1300);

// The Design room: the screens on a canvas, then the accessibility check in its crew.
await page.goto(`${BASE}/p/water-demo/s/design`);
await expect(tab('Crew')).toBeVisible();
await pause(700);
await pause(1100);
await click(tab('Crew'));
await pause(1500);

// Development: the prototype gate.
await page.goto(`${BASE}/p/water-demo/s/development`);
await expect(tab('Gate')).toBeVisible();
await pause(400);
await click(tab('Gate'));
await pause(1300);

// Testing: the summary for the client.
await page.goto(`${BASE}/p/water-demo/s/testing`);
await expect(page.getByRole('heading', { name: /Testing summary/ }).first()).toBeVisible();
await pause(1400);

// Claude usage per stage, then the invoice.
await page.goto(`${BASE}/p/water-demo/usage`);
await expect(page.getByText('By stage').first()).toBeVisible();
await pause(1400);
await page.goto(`${BASE}/p/clinic-booking/invoice`);
await expect(page.getByText('Northwind Physio').first()).toBeVisible();
await pause(1300);

// Live: the maintenance office after Deployment.
await page.goto(`${BASE}/p/water-demo`);
await expect(page.getByText('New version').first()).toBeVisible();
await pause(400);
await to(page.getByText('New version').first());
await pause(1300);

const video = page.video()!;
await ctx.close();
console.log(await video.path());
await browser.close();
