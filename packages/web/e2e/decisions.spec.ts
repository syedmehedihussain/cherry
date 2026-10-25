import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode, runCommand } from './fixture.ts';

const adrDir = path.join(E2E_PROJECTS, 'core', 'docs', 'adr');

// The ADRs this test writes would show as changes in the git tests that run after it.
test.afterEach(() =>
  rmSync(path.join(E2E_PROJECTS, 'core', 'docs'), { recursive: true, force: true }),
);

test('decisions: Claude proposes, the user approves one in the chat and rejects the other', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.evaluate(() => fetch('/api/projects/core/chat/new', { method: 'POST' }));
  await page.goto('/p/core');
  await page.getByLabel('Message Claude').fill('Propose: storage and name');
  await page.getByLabel('Message Claude').press('Enter');
  await expect(page.getByText('I proposed two decisions.')).toBeVisible();
  await expect(page.getByText('Propose decision', { exact: true })).toHaveCount(2);

  // Decisions is a view in the palette, with the pending count on it (ADR-0045).
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search or run a command' }).fill('Decisions');
  await expect(page.getByRole('option', { name: /Decisions/ })).toContainText('2 proposed');
  await page.keyboard.press('Escape');

  // Each proposal also shows as a card in the chat; approve one right there.
  const sqlite = page.getByRole('article', { name: 'Move streaks to SQLite' });
  await expect(sqlite).toContainText('ADR-0001');
  await expect(sqlite).toContainText('Claude (chat)');
  await expect(page.getByRole('article', { name: 'Rename core to hub' })).toBeVisible();
  await sqlite.getByRole('button', { name: /Approve/ }).click();
  await sqlite.getByRole('menuitem', { name: /Approve & apply in chat/ }).click();
  await expect(page.getByText('Switched to SQLite.')).toBeVisible();
  await runCommand(page, 'Decisions');
  const view = page.getByRole('main');
  await expect(view.getByRole('article', { name: 'Move streaks to SQLite' })).toHaveCount(0);

  const rename = view.getByRole('article', { name: 'Rename core to hub' });
  await rename.getByRole('button', { name: 'Reject' }).click();
  await rename.getByPlaceholder('Why not? (optional)').fill('core is fine');
  await rename.getByRole('button', { name: 'Reject' }).click();
  await expect(rename).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search or run a command' }).fill('Decisions');
  await expect(page.getByRole('option', { name: /Decisions/ })).not.toContainText('proposed');
  await page.keyboard.press('Escape');

  await view.getByRole('button', { name: /History/ }).click();
  const history = view.getByRole('region', { name: 'Decision history' });
  await expect(
    history.getByRole('listitem').filter({ hasText: 'Move streaks to SQLite' }),
  ).toContainText('Done');
  await expect(
    history.getByRole('listitem').filter({ hasText: 'Rename core to hub' }),
  ).toContainText('Rejected');

  const sqliteFile = readFileSync(path.join(adrDir, '0001-move-streaks-to-sqlite.md'), 'utf8');
  expect(sqliteFile).toContain('- **Status:** Accepted');
  expect(sqliteFile).toMatch(/- \*\*Done:\*\* \d{4}-\d\d-\d\d/);
  const renameFile = readFileSync(path.join(adrDir, '0002-rename-core-to-hub.md'), 'utf8');
  expect(renameFile).toContain('- **Status:** Rejected');
  expect(renameFile).toContain('- **Rejected because:** core is fine');

  // The title opens the ADR in the Docs tab.
  await history.getByRole('link', { name: 'Rename core to hub' }).click();
  await expect(page).toHaveURL(/\/p\/core\/docs\/docs\/adr\/0002-rename-core-to-hub\.md$/);
});
