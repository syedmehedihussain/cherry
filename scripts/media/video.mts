// Records the walkthrough video (chat → approvals → changes → Run → the app) from the demo daemon.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, type Locator, type Page } from '@playwright/test';

const S = process.env.S!;
const BASE = 'http://127.0.0.1:4400';
const OUT = path.join(S, 'media', 'video');

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
// A visible pointer: headless video has none.
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 4px rgba(255,255,255,.18),0 2px 8px rgba(0,0,0,.6);pointer-events:none;transition:transform .12s;left:-50px;top:-50px';
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
let mouse = { x: 720, y: 450 };
const pause = (ms: number) => page.waitForTimeout(ms);
async function to(p: Page, l: Locator) {
  await l.scrollIntoViewIfNeeded();
  const b = (await l.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await p.mouse.move(x, y, { steps: 25 });
  mouse = { x, y };
  await p.waitForTimeout(250);
}
async function click(p: Page, l: Locator) {
  await to(p, l);
  await p.mouse.down();
  await p.mouse.up();
}

await page.goto(`${BASE}/#login=${code}`);
await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
await page.mouse.move(mouse.x, mouse.y);
await pause(1800);
await click(page, page.getByRole('link', { name: 'orbit-notes', exact: true }).first());
await expect(page.getByLabel('Message Claude')).toBeVisible();
await pause(1200);
await click(page, page.getByLabel('Message Claude'));
await page.keyboard.type('Add a theme toggle in the header, saved between visits', { delay: 38 });
await pause(500);
await page.keyboard.press('Enter');
const card = () => page.getByRole('group', { name: /^Claude wants to/ }).first();
for (let i = 0; i < 3; i++) {
  await expect(card()).toBeVisible({ timeout: 15000 });
  await pause(i === 0 ? 2200 : 1200);
  await click(page, card().getByRole('button', { name: 'Allow', exact: true }));
  await pause(400);
}
await expect(page.getByText('Next step from STATUS.md')).toBeVisible({ timeout: 15000 });
await pause(1500);
await click(page, page.getByRole('button', { name: /Changed 2 files/ }));
await pause(2500);
await click(
  page,
  page.getByRole('banner').getByRole('button', { name: 'Run the app on localhost' }),
);
await expect(page.getByRole('link', { name: 'Open localhost:5180' })).toBeVisible({
  timeout: 15000,
});
await pause(2000);
await to(page, page.getByRole('link', { name: 'Open localhost:5180' }));
await pause(400);
await page.goto('http://localhost:5180/');
await page.mouse.move(700, 420, { steps: 10 });
await pause(2500);
await page.goto(`${BASE}/p/orbit-notes/run`);
await pause(800);
await click(page, page.getByRole('button', { name: 'Stop' }));
await pause(1200);
await click(page, page.getByRole('banner').getByRole('button', { name: /Open the status report/ }));
await pause(2500);

const video = page.video()!;
await ctx.close();
console.log(await video.path());
await browser.close();
