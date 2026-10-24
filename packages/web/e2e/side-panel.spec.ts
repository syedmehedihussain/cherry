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

  // Agents, Decisions and Notes & Tasks are centre tabs, not side views.
  await expect(views.getByRole('tab')).toHaveText(['Overview', 'Live', 'GitHub', 'Chat']);

  await page.reload();
  await expect(views.getByRole('tab', { name: 'GitHub' })).toHaveAttribute('aria-selected', 'true');
});

// The Overview box adds a task to the task list and opens the Notes & Tasks tab in the centre.
test('side Chat tab adds a task, and Magnet answers about this project', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  // The box moved from Overview to the Chat tab (ADR-0039).
  await aside.getByRole('tab', { name: 'Overview' }).click();
  await expect(aside.getByRole('form', { name: 'Quick add' })).toHaveCount(0);
  await aside.getByRole('tab', { name: 'Chat' }).click();

  await aside.getByRole('button', { name: /^Type/ }).click();
  await aside.getByRole('menuitemradio', { name: /Task/ }).click();
  await expect(aside.getByRole('button', { name: /^Model/ })).toHaveCount(0);
  await aside.getByRole('textbox', { name: 'Task' }).fill('Fix the hero section');
  await aside.getByRole('button', { name: 'Add' }).click();

  await expect(page).toHaveURL(/\/p\/core\/notes$/);
  await expect(page.getByRole('button', { name: /Fix the hero section/ })).toBeVisible();

  await aside.getByRole('button', { name: /^Type/ }).click();
  await aside.getByRole('menuitemradio', { name: /Agent/ }).click();
  await expect(aside.getByRole('button', { name: 'Model: Opus' })).toBeVisible();

  // Magnet, in this project's own conversation.
  await aside.getByRole('button', { name: 'Where are we?' }).click();
  await expect(aside.getByText('Where are we?').last()).toBeVisible();
  await expect(aside.getByText('I have no script for that.')).toBeVisible();
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

// ADR-0038: Chrome steps are one row in the chat; Live shows them, and opens by itself.
test('Chrome steps show in Live, not as rows in the chat', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: /^Overview/ }).click();

  await page.getByLabel('Message Claude').fill('Check the app in Chrome');
  await page.getByRole('button', { name: 'Send' }).click();

  const chrome = aside.getByRole('region', { name: 'Chrome' });
  await expect(chrome.getByText('Chrome is in use')).toBeVisible();
  await expect(aside.getByRole('tab', { name: /^Live/ })).toHaveAttribute('aria-selected', 'true');
  await expect(chrome.getByText('Last Chrome session')).toBeVisible();
  await expect(chrome).toContainText('On http://localhost:5173');
  await expect(chrome).toContainText('4 steps');
  await expect(chrome).toContainText('left click in the page');
  await expect(page.getByRole('button', { name: /Used Chrome · 4 steps/ })).toBeVisible();
  await expect(page.getByText('The page loads and the console is clean.')).toBeVisible();
});

// V2.1 w7.5: a subagent is one row in the chat and a card in Live, and starts without asking.
test('subagents show as one row and in Live', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: /^Live/ }).click();

  await page.getByLabel('Message Claude').fill('Look around with an explorer');
  await page.getByRole('button', { name: 'Send' }).click();

  const card = aside.getByRole('region', { name: 'Subagents' });
  await expect(card.getByText('1 subagent working')).toBeVisible();
  await expect(card).toContainText('Find the streak code');
  await expect(card).toContainText(/\d steps? · (Read|Grep)/);
  await expect(page.getByText('The explorer found the streak code.')).toBeVisible();
  await expect(card).toContainText('3 steps');
  await expect(card.getByText('1 subagent working')).toBeHidden();
  await expect(page.getByText('Approval needed')).toBeHidden();
  await expect(page.getByText('Explore agent', { exact: true })).toBeVisible();
});
