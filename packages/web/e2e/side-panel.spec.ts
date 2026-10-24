import { expect, test } from '@playwright/test';
import { loginCode, openSide } from './fixture.ts';

// The right rail (ADR-0045): closed by default, one view at a time, the choice remembered.
test('side panel switches between views and remembers the choice', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  const rail = page.getByRole('navigation', { name: 'Side views' });
  await expect(rail.getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('complementary', { name: /Overview|Live|GitHub|Chat/ })).toHaveCount(
    0,
  );

  const overview = await openSide(page, 'Overview');
  await expect(overview.getByRole('region', { name: 'Agents' })).toBeVisible();

  const github = await openSide(page, 'GitHub');
  await expect(github.getByRole('list', { name: 'Recent commits' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agents' })).toHaveCount(0);

  await page.reload();
  await expect(rail.getByRole('button', { name: 'GitHub' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A second click on the open view closes it; Ctrl+B brings it back.
  await rail.getByRole('button', { name: 'GitHub' }).click();
  await expect(page.getByRole('complementary', { name: 'GitHub' })).toHaveCount(0);
  await page.keyboard.press('Control+b');
  await expect(page.getByRole('complementary', { name: 'GitHub' })).toBeVisible();
  await page.getByRole('button', { name: 'Close GitHub' }).click();
  await expect(page.getByRole('complementary', { name: 'GitHub' })).toHaveCount(0);
});

// The Overview box adds a task to the task list and opens the Notes & Tasks tab in the centre.
test('side Chat tab adds a task, and Magnet answers about this project', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  // The box moved from Overview to the Chat view (ADR-0039).
  const overview = await openSide(page, 'Overview');
  await expect(overview.getByRole('form', { name: 'Quick add' })).toHaveCount(0);
  const aside = await openSide(page, 'Chat');

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
  const aside = await openSide(page, 'Overview');
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
  const aside = await openSide(page, 'Live');
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

// ADR-0038: Chrome steps are one row in the chat; Live shows them. V3 (ADR-0045): Live does
// not open by itself; the row opens it.
test('Chrome steps show in Live, not as rows in the chat', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'core', exact: true }).first().click();

  await page.getByLabel('Message Claude').fill('Check the app in Chrome');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.getByRole('button', { name: /Using Chrome|Used Chrome/ }).click();
  const aside = page.getByRole('complementary', { name: 'Live' });
  const chrome = aside.getByRole('region', { name: 'Chrome' });
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
  const aside = await openSide(page, 'Live');

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
  await expect(page.getByText('(Explore: Find the streak code)')).toBeVisible();
});
