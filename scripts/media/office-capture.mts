// Captures the V4 landing page screenshots from the office demo daemon (setup-office-demo.py).
// S=<work folder> PORT=4410 node --import tsx scripts/media/office-capture.mts [name=path ...]
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const S = process.env.S!;
const BASE = `http://127.0.0.1:${process.env.PORT ?? '4410'}`;
const OUT = path.join(S, 'shots');
mkdirSync(OUT, { recursive: true });

const info = JSON.parse(readFileSync(path.join(S, 'demo/.cherry/run/daemon.json'), 'utf8'));
const res = await fetch(`${BASE}/api/cli/login-code`, {
  method: 'POST',
  headers: { 'x-cherry-cli': info.cliSecret },
});
const { code } = (await res.json()) as { code: string };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
// The one-time Live screen is seen already.
await ctx.addInitScript(() => {
  for (const v of ['1.0', '1.1']) localStorage.setItem(`cherry:live-seen:water-demo:${v}`, '1');
});
const page = await ctx.newPage();
await page.goto(`${BASE}/#login=${code}`);
await page.waitForTimeout(2500);

async function shot(p: Page, name: string) {
  await p.waitForTimeout(1200);
  await p.mouse.move(2, 2);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
}

// name=path, or name=path#Button to click a tab or button by its name first.
for (const arg of process.argv.slice(2)) {
  const [name, rest] = arg.split('=');
  const [url, button] = rest!.split('#');
  await page.goto(`${BASE}${url}`);
  await page.waitForTimeout(1500);
  if (button)
    await page
      .getByRole('button', { name: button, exact: true })
      .or(page.getByRole('tab', { name: button, exact: true }))
      .or(page.getByRole('radio', { name: button, exact: true }))
      .first()
      .click();
  await shot(page, name!);
}
await browser.close();
