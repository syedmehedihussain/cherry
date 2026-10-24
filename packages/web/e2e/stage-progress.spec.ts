import { rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode, openSide } from './fixture.ts';

test.afterEach(() => {
  for (const p of ['kite-log', 'orbit-log'])
    rmSync(path.join(E2E_PROJECTS, p), { recursive: true, force: true });
});

// V2.1 w5: the Planner ticks its checklist while you talk; the Overview bar and the stage tab
// follow; at 100% Move to Design opens the next stage.
test('the Plan bar fills as the Planner works, then Move to Design', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.goto('/new');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A kite log for windy days');
  await page.getByLabel('Folder name').fill('kite-log');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/p\/kite-log$/);

  const aside = await openSide(page, 'Overview');
  const card = aside.getByRole('region', { name: 'Plan progress' });
  await expect(card).toContainText('0%');
  await expect(card).toContainText('6 left');
  await expect(card).toContainText('Problem and who it is for');

  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Two of six done.')).toBeVisible();
  await expect(card).toContainText('33%');
  await expect(card).toContainText('4 left');
  await expect(card).not.toContainText('Problem and who it is for');

  await page.getByPlaceholder(/^Reply to Claude/).fill('Finish the plan');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(card).toContainText('100%');
  await expect(card).toContainText('ready for Design');
  await card.getByRole('button', { name: 'Move to Design' }).click();
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await expect(stages.getByRole('button', { name: 'Design' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByPlaceholder(/^Reply to Claude|^Message/)).toHaveValue(
    /^Plan is finished\./,
  );
  await expect(aside.getByRole('region', { name: 'Design progress' })).toContainText('5 left');
});

// ADR-0041: plan the next piece in Plan, Approve plan, and the Builder starts in Development.
test('Approve plan opens Development and the Builder starts on the tasks', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.goto('/new');
  await page.getByRole('textbox', { name: 'Idea' }).fill('An orbit log');
  await page.getByLabel('Folder name').fill('orbit-log');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/p\/orbit-log$/);

  // Plan opens in Auto: the Planner writes its spec without an approval card.
  const composer = page.getByPlaceholder(/^Reply to Claude|^Message/);
  await composer.fill('Plan offline mode');
  await page.getByRole('button', { name: 'Send' }).click();
  const card = page.getByRole('region', { name: 'Plan: Offline mode' });
  await expect(card).toContainText('Cache the data');
  await expect(card.getByRole('link', { name: 'docs/specs/offline.md' })).toBeVisible();
  await card.getByRole('button', { name: 'Approve plan' }).click();

  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await expect(stages.getByRole('button', { name: 'Development' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/^Build the approved plan "Offline mode"/)).toBeVisible();
  await expect(page.getByText('Cache done.')).toBeVisible();
  const aside = await openSide(page, 'Overview');
  const dev = aside.getByRole('region', { name: 'Development progress' });
  await expect(dev).toContainText('4 left');
  await expect(dev).toContainText('Sync on reconnect');
});
