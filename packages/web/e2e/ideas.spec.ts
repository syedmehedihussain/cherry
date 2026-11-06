import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.afterEach(() => rmSync(path.join(E2E_PROJECTS, 'bird-log'), { recursive: true, force: true }));

// Upcoming on Home: save an idea for later, edit it, then start it as a new project.
test('ideas: add, edit, remove, and start one as a project', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  const upcoming = page.getByRole('region', { name: 'Upcoming' });
  await expect(upcoming).toContainText('Have a project in mind?');

  await upcoming.getByRole('button', { name: 'Add idea' }).click();
  await upcoming.getByLabel('Idea name').fill('Recipe planner');
  await upcoming.getByLabel('Description').fill('Plan meals for a week');
  await upcoming.getByRole('button', { name: 'Add idea' }).click();
  const recipe = upcoming.getByRole('listitem', { name: 'Recipe planner' });
  await expect(recipe).toContainText('Plan meals for a week');

  await upcoming.getByRole('button', { name: 'Add idea' }).click();
  await upcoming.getByLabel('Idea name').fill('Bird log');
  await upcoming.getByRole('button', { name: 'Add idea' }).click();
  await expect(upcoming.getByRole('listitem')).toHaveCount(2);

  await recipe.getByRole('button', { name: 'Edit Recipe planner' }).click();
  await upcoming.getByLabel('Description').fill('Plan meals and a shopping list');
  await upcoming.getByRole('button', { name: 'Save' }).click();
  await expect(recipe).toContainText('Plan meals and a shopping list');

  await recipe.getByRole('button', { name: 'Remove Recipe planner' }).click();
  await recipe.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(recipe).toHaveCount(0);

  // Ideas survive a reload: they live in ~/.cherry/ideas.json.
  await page.reload();
  const bird = upcoming.getByRole('listitem', { name: 'Bird log' });
  await bird.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('textbox', { name: 'Idea' })).toHaveValue('Bird log');
  await expect(page.getByLabel('Folder name')).toHaveValue('bird-log');
  await page.getByRole('radio', { name: 'Personal project' }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  // V4: the project page, with only Idea open.
  await expect(page).toHaveURL(/\/p\/bird-log$/);
  await expect(page.getByRole('heading', { level: 1, name: 'bird-log' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Idea, On-going' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Requirements, locked' })).toBeVisible();
  const office = JSON.parse(
    readFileSync(path.join(E2E_PROJECTS, 'bird-log', '_project', 'office.json'), 'utf8'),
  );
  expect(office.kind).toBe('personal');
  expect(
    readFileSync(path.join(E2E_PROJECTS, 'bird-log', '_project', 'STATUS.md'), 'utf8'),
  ).toContain('Bird log');

  // Started: the idea leaves the Upcoming list.
  await page.goto('/');
  await expect(upcoming).toContainText('Have a project in mind?');
});
