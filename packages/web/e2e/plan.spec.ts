import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.afterEach(() =>
  rmSync(path.join(E2E_PROJECTS, 'kite-docs'), { recursive: true, force: true }),
);

// V3 r3: Plan is a chat that writes documents; the Documents panel ticks and reads them.
test('Plan: the Planner writes a document, the panel ticks it, Ask about this and Edit', async ({
  page,
}) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.goto('/new');
  await page.getByRole('textbox', { name: 'Idea' }).fill('A kite log');
  await page.getByLabel('Folder name').fill('kite-docs');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/p\/kite-docs$/);

  const panel = page.getByRole('complementary', { name: 'Documents' });
  await expect(panel).toContainText('0 of 9');
  await expect(panel.getByRole('button', { name: /PRD/ })).toBeDisabled();
  // No file tree in Plan.
  await expect(page.getByRole('complementary', { name: 'Files' })).toHaveCount(0);

  const box = page.getByLabel('Message Claude');
  await box.fill('Write the PRD');
  await box.press('Enter');
  await expect(page.getByText('Wrote docs/prd.md. Next')).toBeVisible();
  await expect(panel).toContainText('1 of 9');
  await expect(panel.getByRole('button', { name: /PRD/ })).toBeEnabled();

  // The file the Planner wrote is one line with Open in the chat.
  await page.getByRole('button', { name: 'Open docs/prd.md' }).click();
  const reader = panel.getByRole('region', { name: 'Document docs/prd.md' });
  await expect(reader.getByRole('heading', { name: 'Kite log — PRD' })).toBeVisible();

  // Select a sentence: Ask about this quotes it in the composer.
  const goal = reader.getByText('Log a session in ten seconds.');
  await goal.selectText();
  await goal.dispatchEvent('mouseup');
  await reader.getByRole('button', { name: /Ask about this/ }).click();
  await expect(box).toHaveValue('About docs/prd.md:\n> Log a session in ten seconds.\n\n');

  // Edit in the built-in editor, Save with Ctrl+S.
  await reader.getByRole('button', { name: 'Edit' }).click();
  const editor = reader.getByRole('textbox', { name: 'Edit docs/prd.md' });
  await editor.fill('# Kite log — PRD\n\nShort and sweet.\n');
  await editor.press('Control+s');
  await expect(reader.getByText('Short and sweet.')).toBeVisible();
  expect(readFileSync(path.join(E2E_PROJECTS, 'kite-docs', 'docs', 'prd.md'), 'utf8')).toContain(
    'Short and sweet.',
  );
});
