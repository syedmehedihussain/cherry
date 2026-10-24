import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.beforeEach(async ({ page, request }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  // Each test starts a fresh conversation.
  await page.evaluate(() => fetch('/api/projects/core/chat/new', { method: 'POST' }));
  void request;
});

test('chat: send, approve an edit, see it in the timeline and on disk', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('Please bump the streak');
  await page.getByLabel('Message Claude').press('Enter');
  await expect(page.getByText("I'll bump the streak value")).toBeVisible();
  const card = page.getByRole('group', { name: 'Claude wants to edit 1 file' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('lib/streaks.ts');
  await expect(page.getByText('Approval needed')).toBeVisible();
  await expect(page.getByText('Claude is paused until you answer above.')).toBeVisible();
  await card.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByText('Done. The streak is now 3.')).toBeVisible();
  await expect(page.getByText('Edited')).toBeVisible();
  await expect(page.getByText('Allowed', { exact: true })).toBeVisible();
  expect(readFileSync(path.join(E2E_PROJECTS, 'core', 'lib', 'streaks.ts'), 'utf8')).toContain(
    'streaks = 3',
  );
  // The change summary is closed until clicked, and opening it calls no Claude.
  const summary = page.getByRole('button', { name: /Changed 1 file/ });
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await summary.click();
  await expect(page.getByRole('link', { name: 'lib/streaks.ts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explain with Claude' })).toBeVisible();
});

test('chat: a decision card waits for the answer', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('Where should we store streaks?');
  await page.getByLabel('Message Claude').press('Enter');
  const card = page.getByRole('region', { name: 'How should streaks be stored?' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Recommended')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await card.getByRole('radio', { name: /Compute from activity/ }).click();
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText("Good choice. I'll compute it at read time.")).toBeVisible();
  await expect(page.getByText('Data model:')).toBeVisible();
});

test('chat: a command approval can be denied with a reason', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('run the tests');
  await page.getByLabel('Message Claude').press('Enter');
  const card = page.getByRole('group', { name: 'Claude wants to run a command' });
  await expect(card).toContainText('npm test');
  await card.getByRole('button', { name: 'Deny' }).click();
  await page.getByLabel('Tell Claude why (optional)').fill('Not now');
  await card.getByRole('button', { name: 'Deny' }).click();
  await expect(page.getByText('Denied', { exact: true }).first()).toBeVisible();
});

test('chat: Auto mode runs commands without a card, but git push still asks', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByRole('button', { name: 'Mode: Ask' }).click();
  await page.getByRole('menuitemradio', { name: /Auto/ }).click();
  await expect(page.getByRole('button', { name: 'Mode: Auto' })).toBeVisible();
  await page.getByLabel('Message Claude').fill('Auto: test and push');
  await page.getByLabel('Message Claude').press('Enter');
  const card = page.getByRole('group', { name: 'Claude wants to run a command' });
  await expect(card).toContainText('git push origin main');
  await expect(page.getByRole('group', { name: 'Claude wants to run a command' })).toHaveCount(1);
  await card.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByText('Pushed.')).toBeVisible();
  // The mode is remembered for the project; put it back for the other tests.
  await page.reload();
  await page.getByRole('button', { name: 'Mode: Auto' }).click();
  await page.getByRole('menuitemradio', { name: /Ask/ }).click();
});

// V2.1 w7.1: slash commands, like the CLI.
test('chat: slash commands switch the model, the mode and expand /review', async ({ page }) => {
  await page.goto('/p/core');
  const box = page.getByLabel('Message Claude');
  await box.fill('/');
  const menu = page.getByRole('listbox', { name: 'Commands' });
  await expect(menu.getByRole('option', { name: /\/clear/ })).toBeVisible();
  await expect(menu.getByRole('option', { name: /\/compact/ })).toBeVisible();
  await box.fill('/mod');
  await box.press('Enter');
  await expect(box).toHaveValue('/model ');
  await box.pressSequentially('haiku');
  await box.press('Enter');
  await expect(box).toHaveValue('');
  await expect(page.getByRole('button', { name: /Model: Haiku/ })).toBeVisible();

  await box.fill('/aut');
  await box.press('Enter');
  await expect(page.getByRole('button', { name: /Mode: Auto/ })).toBeVisible();

  await box.fill('/review the streak code');
  await box.press('Escape');
  await box.press('Enter');
  await expect(page.getByText(/^Review the uncommitted changes/)).toBeVisible();
  await expect(page.getByText('Focus: the streak code')).toBeVisible();
});

// V2.1 w7.2: @ file mentions, like the CLI.
test('chat: @ opens a file menu and inserts the picked path', async ({ page }) => {
  await page.goto('/p/core');
  const box = page.getByLabel('Message Claude');
  await box.fill('look at @strea');
  const menu = page.getByRole('listbox', { name: 'Files' });
  await expect(menu.getByRole('option', { name: /lib\/streaks\.ts/ })).toBeVisible();
  await box.press('Enter');
  await expect(box).toHaveValue('look at @lib/streaks.ts ');
  await expect(menu).toBeHidden();
  await box.press('Enter');
  await expect(page.getByText('look at @lib/streaks.ts')).toBeVisible();
});

// V2.1 w7.3: the context meter, with Compact when it is nearly full.
test('chat: the context meter fills and Compact frees it', async ({ page }) => {
  await page.goto('/p/core');
  const box = page.getByLabel('Message Claude');
  await box.fill('Fill the context please');
  await box.press('Enter');
  const meter = page.getByRole('meter', { name: 'Context used' });
  await expect(meter).toHaveText('85%');
  await expect(meter).toHaveAttribute('title', '170k of 200k tokens in context');
  await page.getByRole('button', { name: 'Compact', exact: true }).click();
  await expect(page.getByText('Compacted the conversation.')).toBeVisible();
  await expect(meter).toHaveText('15%');
  await expect(page.getByRole('button', { name: 'Compact', exact: true })).toBeHidden();
});

// V2.1 w7.4: thinking folds into one row at the top of the reply.
test('chat: thinking shows as one folded row that opens', async ({ page }) => {
  await page.goto('/p/core');
  const box = page.getByLabel('Message Claude');
  await box.fill('Think it over');
  await box.press('Enter');
  await expect(page.getByText('I thought it over.')).toBeVisible();
  const row = page.getByRole('button', { name: /^Thought for \ds$/ });
  await expect(row).toHaveCount(1);
  await expect(page.getByText('The streak lives in')).toBeHidden();
  await row.click();
  await expect(page.getByText('The streak lives in')).toBeVisible();
});

// V2.1 w7.6: History lists the stage's earlier chats and opens one again, like /resume.
test('chat: History and /resume open an earlier chat', async ({ page }) => {
  await page.goto('/p/core');
  const box = page.getByLabel('Message Claude');
  await box.fill('An older question about history');
  await box.press('Enter');
  await expect(page.getByText('An older question about history')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByText('An older question about history')).toBeHidden();

  await box.fill('/resu');
  await box.press('Enter');
  const menu = page.getByRole('menu', { name: 'Chat history' });
  await menu
    .getByRole('menuitemradio', { name: /An older question about history/ })
    .first()
    .click();
  await expect(menu).toBeHidden();
  await expect(page.getByText('An older question about history')).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(
    menu.getByRole('menuitemradio', { name: /An older question about history.*open now/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

// V2.1 w7.7, ADR-0043: Always allow here is kept for the project; Settings removes it.
test('chat: Always allow here skips the card next time, Settings removes it', async ({ page }) => {
  await page.goto('/p/core');
  const box = page.getByLabel('Message Claude');
  await box.fill('Run the unit tests');
  await box.press('Enter');
  const card = page.getByRole('group', { name: 'Claude wants to run a command' });
  await card.getByRole('button', { name: 'Always allow here' }).click();
  await expect(page.getByText('Always allowed here')).toBeVisible();
  await expect(page.getByText('The unit tests pass.')).toBeVisible();

  await page.getByRole('button', { name: 'New chat' }).click();
  await box.fill('Run the unit tests');
  await box.press('Enter');
  await expect(page.getByText('The unit tests pass.')).toBeVisible();
  await expect(card).toBeHidden();

  await box.fill('/permissions');
  await box.press('Enter');
  await expect(page.getByRole('heading', { name: 'Permissions' })).toBeVisible();
  const core = page.getByRole('region', { name: 'core' });
  await expect(core).toContainText('pnpm vitest run');
  await core.getByRole('button', { name: 'Remove pnpm vitest run' }).click();
  await expect(page.getByText('Nothing yet.')).toBeVisible();
});
