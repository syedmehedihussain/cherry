import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

test('runs the app from the Play button, shows its output and address, and stops it', async ({
  page,
}) => {
  await page.goto('/p/cctop');
  const bar = page.getByRole('banner');
  await bar.getByRole('button', { name: 'Run the app on localhost' }).click();
  await expect(page).toHaveURL(/\/p\/cctop\/run$/);
  await expect(page.getByRole('log', { name: 'App output' })).toContainText(
    'ready on http://localhost:4998/',
  );
  await expect(page.getByRole('log', { name: 'App output' })).not.toContainText(
    '$ npm run dev\n$ npm run dev',
  );
  await expect(bar.getByRole('button', { name: /App running at localhost:4998/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open localhost:4998' })).toHaveAttribute(
    'href',
    'http://localhost:4998/',
  );
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText(/Stopped \(exit/)).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Run the app on localhost' })).toBeVisible();
});

test('a project Cherry cannot run has no Play button', async ({ page }) => {
  await page.goto('/p/atlas');
  await expect(page.getByRole('button', { name: /Open the status report/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run the app on localhost' })).toHaveCount(0);
});
