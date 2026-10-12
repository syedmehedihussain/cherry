import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test('the welcome screen checks Claude Code, git and GitHub', async ({ page }) => {
  // Pretend this is a first start without touching the shared e2e config.
  await page.route('**/api/config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), onboarded: false } });
  });
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'Welcome to Cherry' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Check your tools' })).toBeVisible();
  const tools = page.getByRole('list', { name: 'Tools' });
  await expect(tools).toContainText('Claude Code');
  await expect(tools).toContainText('git');
  await expect(tools).toContainText('GitHub');
  await page.getByRole('button', { name: 'Check again' }).click();
  // The real tool check can take a while when the whole suite is running.
  await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a theme' })).toBeVisible();
});
