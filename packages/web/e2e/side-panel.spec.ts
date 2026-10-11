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

  await views.getByRole('tab', { name: 'Tasks' }).click();
  await expect(aside.getByRole('heading', { name: 'Tasks' })).toBeVisible();

  await views.getByRole('tab', { name: 'Notes' }).click();
  await expect(aside.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(aside.getByRole('heading', { name: 'Tasks' })).toHaveCount(0);

  await page.reload();
  await expect(views.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
});

// The Overview box adds a task to the task list and shows it in the Tasks view.
test('overview box adds a task and opens Tasks', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: 'Overview' }).click();

  await aside.getByLabel('Add as').selectOption('task');
  await expect(aside.getByLabel('Model')).toHaveCount(0);
  await aside.getByLabel('Task').fill('Fix the hero section');
  await aside.getByRole('button', { name: 'Add' }).click();

  await expect(aside.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
  await expect(aside.getByRole('button', { name: /Fix the hero section/ })).toBeVisible();

  await aside.getByRole('tab', { name: 'Overview' }).click();
  await aside.getByLabel('Add as').selectOption('agent');
  await expect(aside.getByLabel('Model')).toBeVisible();
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
