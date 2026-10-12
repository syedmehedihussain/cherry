import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

// The right column shows one view at a time, picked from the row at its top.
test('side panel switches between views and remembers the choice', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  const views = aside.getByRole('tablist', { name: 'Side panel' });

  await expect(aside.getByRole('tabpanel', { name: 'Overview' })).toBeVisible();
  await expect(aside.getByRole('region', { name: 'Agents' })).toBeVisible();

  await views.getByRole('tab', { name: 'GitHub' }).click();
  await expect(aside.getByRole('list', { name: 'Recent commits' })).toBeVisible();
  await expect(aside.getByRole('region', { name: 'Agents' })).toHaveCount(0);

  await views.getByRole('tab', { name: 'Agents' }).click();
  await expect(aside.getByRole('tabpanel', { name: 'Agents' })).toBeVisible();
  await expect(aside.getByLabel('Task')).toBeVisible();

  // Tasks and notes share one view: tasks on top, notes below.
  await views.getByRole('tab', { name: 'Notes' }).click();
  await expect(aside.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(aside.getByRole('heading', { name: 'Notes' })).toBeVisible();

  await page.reload();
  await expect(views.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
});

// The Overview box adds a task to the task list and shows it in the Tasks view.
test('overview box adds a task and opens Notes', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: 'Overview' }).click();

  await aside.getByRole('button', { name: /^Type/ }).click();
  await aside.getByRole('menuitemradio', { name: /Task/ }).click();
  await expect(aside.getByRole('button', { name: /^Model/ })).toHaveCount(0);
  await aside.getByRole('textbox', { name: 'Task' }).fill('Fix the hero section');
  await aside.getByRole('button', { name: 'Add' }).click();

  await expect(aside.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  await expect(aside.getByRole('button', { name: /Fix the hero section/ })).toBeVisible();

  await aside.getByRole('tab', { name: 'Overview' }).click();
  await aside.getByRole('button', { name: /^Type/ }).click();
  await aside.getByRole('menuitemradio', { name: /Agent/ }).click();
  await expect(aside.getByRole('button', { name: 'Model: Opus' })).toBeVisible();
});

// The Overview boxes minimize to one line and stay that way after a reload.
test('repository box minimizes and remembers it', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: 'Overview' }).click();
  const repo = aside.getByRole('region', { name: 'Repository' });

  await repo.getByRole('button', { name: 'Minimize repository' }).click();
  await expect(repo.getByRole('button', { name: 'Pull' })).toHaveCount(0);
  await page.reload();
  await expect(repo.getByRole('button', { name: 'Expand repository' })).toBeVisible();
  await repo.getByRole('button', { name: 'Expand repository' }).click();
  await expect(repo.getByRole('button', { name: 'Pull' })).toBeVisible();
});

// Claude's plan shows in the Live view and fills in one step at a time.
test("live view follows Claude's plan", async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: /^Live/ }).click();
  await expect(aside.getByText('Claude is idle')).toBeVisible();

  await page.getByLabel('Message Claude').fill('Plan the hero fix');
  await page.getByRole('button', { name: 'Send' }).click();

  const plan = aside.getByRole('region', { name: 'Plan' });
  await expect(plan.getByText('1 of 2 done')).toBeVisible();
  await expect(plan.getByText('Fixing the layout…')).toBeVisible();
  await expect(aside.getByText('Claude is working')).toBeVisible();
  await expect(plan.getByText('2 of 2 done')).toBeVisible();
  await expect(aside.getByText('Claude is idle')).toBeVisible();
});
