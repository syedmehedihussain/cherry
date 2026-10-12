import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test('the About page credits the author with working links', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.goto('/settings/about');
  await expect(page.getByRole('heading', { name: 'A side quest of smh' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Website/ })).toHaveAttribute(
    'href',
    'https://syedmehedihussain.codes/',
  );
  await expect(page.getByRole('link', { name: /^GitHub github/ })).toHaveAttribute(
    'href',
    'https://github.com/syedmehedihussain',
  );
  await expect(page.getByRole('link', { name: /Email/ })).toHaveAttribute(
    'href',
    'mailto:syedmehedihussain@gmail.com',
  );
});
