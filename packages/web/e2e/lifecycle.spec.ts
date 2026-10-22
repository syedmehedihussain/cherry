import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

// ADR-0034 and ADR-0035: stages with their own agents, and Issues feeding the next Plan.
test('stage tabs open each agent, and a picked issue becomes the next plan', async ({ page }) => {
  await page.goto('/p/shop');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await stages.getByRole('button', { name: 'Design' }).click();
  await expect(page.getByRole('heading', { name: 'Design: the Designer' })).toBeVisible();
  await expect(stages.getByRole('button', { name: 'Design' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await stages.getByRole('button', { name: 'Issues' }).click();
  await expect(page).toHaveURL(/\/p\/shop\/issues$/);
  await page.getByRole('button', { name: 'New issue' }).click();
  const form = page.getByRole('form', { name: 'New issue' });
  await form.getByLabel('Title').fill('Cart total ignores discounts');
  await form.getByLabel('Details').fill('Add a coupon, the total stays the same.');
  await form.getByRole('button', { name: 'Save issue' }).click();
  await expect(page.getByRole('link', { name: 'Cart total ignores discounts' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Pick Cart total ignores discounts' }).check();
  await page.getByRole('button', { name: 'Plan selected (1)' }).click();
  await expect(page).toHaveURL(/\/p\/shop$/);
  await expect(stages.getByRole('button', { name: 'Plan' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Plan: the Planner' })).toBeVisible();
  await expect(page.getByPlaceholder(/^Reply to Claude/)).toHaveValue(
    /docs\/issues\/0001-cart-total-ignores-discounts\.md/,
  );
});

test('Settings lists the stage agents and their bundled skills', async ({ page }) => {
  await page.goto('/settings/agents');
  await expect(page.getByRole('heading', { name: 'Stage agents' })).toBeVisible();
  await expect(page.getByText('Deployment: the Shipper')).toBeVisible();
  await expect(page.getByText('release', { exact: true })).toBeVisible();
  await expect(page.getByText('project-readiness', { exact: true })).toBeVisible();
});
