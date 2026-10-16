import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
});

test('the app opens on a dark page with the top bar', async ({ page }) => {
  await expect(page).toHaveTitle('Cherry');
  await expect(page.getByRole('link', { name: 'Cherry home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Magnet' })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(0, 0, 0)'); // Just black, the default theme
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain('Geist');
});

test('Home lists the projects, with Calibrate on folders not set up', async ({ page }) => {
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(6);
  const row = (name: string) =>
    table.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(row('core')).toContainText('Development');
  await expect(row('core')).toContainText('1 change');
  // No State column: a folder Cherry has not set up offers Calibrate instead.
  await expect(row('cctop').getByRole('link', { name: 'Calibrate' })).toBeVisible();
  await expect(row('core').getByRole('link', { name: 'Calibrate' })).toHaveCount(0);
  await expect(page.getByText('Next: Build the Study Room floor')).toBeVisible();
});

test('search filters the table', async ({ page }) => {
  // Search the loaded list, not the empty one shown while projects load.
  await expect(
    page.getByRole('table').getByRole('link', { name: 'cctop', exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder('Search projects').fill('terminal');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
});

test('the login link works once and the cookie keeps you in', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/); // the code is stripped from the URL
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

test('a used login link is refused', async ({ page, context }) => {
  const code = await loginCode();
  await page.goto(`/#login=${code}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await context.clearCookies();
  await page.goto(`/#login=${code}`);
  await expect(page.getByRole('heading', { name: 'That login link has expired' })).toBeVisible();
});
