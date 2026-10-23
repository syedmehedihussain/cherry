import { rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.afterEach(() => rmSync(path.join(E2E_PROJECTS, 'kite-log'), { recursive: true, force: true }));

// V2.1 w5: the Planner ticks its checklist while you talk; the Overview bar and the stage tab
// follow; at 100% Move to Design opens the next stage.
test('the Plan bar fills as the Planner works, then Move to Design', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.goto('/new');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A kite log for windy days');
  await page.getByLabel('Folder name').fill('kite-log');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/p\/kite-log$/);

  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: 'Overview' }).click();
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
