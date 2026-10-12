// Captures README / landing page screenshots from the demo daemon on 4400.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';

const S = process.env.S!;
const BASE = 'http://127.0.0.1:4400';
const OUT = path.join(S, 'media', 'shots');

async function code(): Promise<string> {
  const info = JSON.parse(readFileSync(path.join(S, 'demo/.cherry/run/daemon.json'), 'utf8'));
  const res = await fetch(`${BASE}/api/cli/login-code`, {
    method: 'POST',
    headers: { 'x-cherry-cli': info.cliSecret },
  });
  return ((await res.json()) as { code: string }).code;
}
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(500);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
};
const allow = async (page: Page) => {
  const card = page.getByRole('group', { name: /^Claude wants to/ }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(card)
    .toHaveCount(0, { timeout: 15000 })
    .catch(() => undefined);
};

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.goto(`${BASE}/#login=${await code()}`);

// Welcome
await expect(page.getByRole('heading', { name: 'Welcome to Cherry' })).toBeVisible();
await shot(page, 'welcome');
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await expect(page.getByRole('heading', { name: 'Check your tools' })).toBeVisible();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Continue' }).click();
await shot(page, 'welcome-theme');
await page.getByRole('button', { name: 'Start using Cherry' }).click();

// Home
await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
await page.waitForTimeout(1500);
await shot(page, 'home');

// Chat with approvals
await page.goto(`${BASE}/p/orbit-notes`);
await page
  .getByLabel('Message Claude')
  .fill('Add a theme toggle in the header, saved between visits');
await page.getByLabel('Message Claude').press('Enter');
await expect(page.getByRole('group', { name: /^Claude wants to/ }).first()).toBeVisible({
  timeout: 15000,
});
await shot(page, 'chat-approval');
await allow(page);
await allow(page);
await allow(page);
await expect(page.getByText('Next step from STATUS.md')).toBeVisible({ timeout: 15000 });
await page.getByRole('button', { name: /Changed 2 files/ }).click();
await shot(page, 'chat-changes');

// Diff, docs, status
await page.goto(`${BASE}/p/orbit-notes/files/src/theme.ts`);
await expect(page.getByRole('switch', { name: 'Show changes' })).toBeVisible();
await shot(page, 'diff');
await page.goto(`${BASE}/p/orbit-notes/files/docs/prd.md`);
await shot(page, 'markdown');
await page.goto(`${BASE}/p/orbit-notes/status`);
await shot(page, 'status');

// Run
await page.goto(`${BASE}/p/orbit-notes`);
await page.getByRole('banner').getByRole('button', { name: 'Run the app on localhost' }).click();
await expect(page.getByRole('link', { name: 'Open localhost:5180' })).toBeVisible({
  timeout: 15000,
});
await shot(page, 'run');
const app = await ctx.newPage();
await app.goto('http://localhost:5180/');
await shot(app, 'demo-app');
await app.close();
await page.getByRole('button', { name: 'Stop' }).click();

// Scan agent report
await page.goto(`${BASE}/p/orbit-notes`);
const aside = page.getByRole('complementary', { name: 'Repository and agents' });
await aside
  .getByRole('tablist', { name: 'Side panel' })
  .getByRole('tab', { name: 'Agents' })
  .click();
const scans = aside.getByRole('region', { name: 'Scan agents' });
await scans.getByRole('button', { name: 'Run Security review' }).click();
await scans
  .getByRole('button', { name: 'Open the Security review report' })
  .click({ timeout: 20000 });
await expect(page.getByRole('heading', { name: 'Security review', level: 1 })).toBeVisible();
await shot(page, 'scan-report');

// Magnet
await page.goto(`${BASE}/`);
await page.getByRole('button', { name: 'Open Magnet' }).click();
await page.getByRole('button', { name: "What's stuck this week?" }).click();
await page.waitForTimeout(3000);
await shot(page, 'magnet');
await page.keyboard.press('Escape');

// Themes
await page.goto(`${BASE}/settings/appearance`);
await shot(page, 'themes');
await page.goto(`${BASE}/settings/about`);
await shot(page, 'about');

// Survey
await page.goto(`${BASE}/`);
await page.getByRole('link', { name: 'Start project' }).first().click();
await page.getByLabel('Idea').fill("A printable QR code that opens a business's review page.");
await page.getByLabel('Folder name').fill('review-qr');
await page.getByRole('button', { name: 'Confirm' }).click();
const card = page.getByRole('region', { name: 'Who is review-qr for?' });
await expect(card).toBeVisible();
await card.getByRole('radio').first().click();
await shot(page, 'survey');

await browser.close();
