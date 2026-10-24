import { expect, test } from '@playwright/test';
import { loginCode, openSide, runCommand } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

test('opens a project with status, stage tabs and git box', async ({ page }) => {
  await page.getByRole('link', { name: 'core', exact: true }).first().click();
  await expect(page).toHaveURL(/\/p\/core$/);
  await expect(page.getByRole('navigation', { name: 'Lifecycle stages' })).toBeVisible();
  // V3 (ADR-0045): four stages; the Status report is a view in the palette.
  await expect(
    page.getByRole('navigation', { name: 'Lifecycle stages' }).getByRole('button'),
  ).toHaveText([/Plan/, /Design/, /Development/, /Deployment/]);
  await expect(page.getByText('Finished the HUD.')).toHaveCount(0);
  await runCommand(page, 'Status report');
  await expect(page).toHaveURL(/\/p\/core\/status$/);
  const report = page.getByRole('article', { name: 'Status report' });
  await expect(report.getByRole('region', { name: 'Where we left off' })).toContainText(
    'Finished the HUD.',
  );
  await expect(report.getByRole('region', { name: 'Next step' })).toContainText(
    'Build the Study Room floor',
  );
  await expect(report.getByRole('button', { name: 'Update status' })).toBeVisible();
  await page.getByRole('button', { name: 'Close Status' }).click();
  await expect(page).toHaveURL(/\/p\/core$/);
  await expect(page.getByRole('contentinfo')).toContainText('1 changed');
  const repo = (await openSide(page, 'Overview')).getByRole('region', { name: 'Repository' });
  await expect(repo.getByText('1 uncommitted')).toBeVisible();
});

test('browses the tree and shows changes in a file', async ({ page }) => {
  await page.goto('/p/core');
  await page.getByRole('treeitem', { name: /lib/ }).click();
  await page.getByRole('treeitem', { name: /streaks\.ts/ }).click();
  await expect(page).toHaveURL(/\/p\/core\/files\/lib\/streaks\.ts$/);
  await expect(page.getByRole('button', { name: 'Edit file' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Show changes' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const code = page.getByRole('region', { name: 'Contents of lib/streaks.ts' });
  await expect(code).toContainText('streaks = 1');
  await expect(code).toContainText(/streaks = [23]/); // the chat e2e may have bumped it
  await page.getByRole('switch', { name: 'Show changes' }).click();
  await expect(code).not.toContainText('streaks = 1');
});

test('edits and saves a file in the built-in editor', async ({ page }) => {
  await page.goto('/p/cctop/files/edit-me.txt');
  await page.getByRole('button', { name: 'Edit file' }).click();
  const editor = page.getByRole('textbox', { name: 'Edit edit-me.txt' });
  await editor.fill('one\ntwo\n');
  await editor.press('Control+s');
  const code = page.getByRole('region', { name: 'Contents of edit-me.txt' });
  await expect(code).toContainText('two');
  await expect(page.getByRole('button', { name: 'Edit file' })).toBeVisible();
});

test('previews a Markdown file, with the source one click away', async ({ page }) => {
  await page.goto('/p/torongo/files/README.md');
  const preview = page.getByRole('region', { name: 'Preview of README.md' });
  await expect(preview.getByRole('heading', { level: 1, name: 'torongo' })).toBeVisible();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Contents of README.md' })).toContainText(
    '# torongo',
  );
});

test('reads docs in the Docs tab', async ({ page }) => {
  await page.goto('/p/core/docs');
  await expect(page.getByRole('navigation', { name: 'Documents' })).toContainText('README.md');
  await page.getByRole('link', { name: /README\.md/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'core' })).toBeVisible();
});

test('saves notes to _project/notes.md', async ({ page }) => {
  await page.goto('/p/core/notes');
  await page.getByLabel('Notes for this project').fill('Remember the streaks bug.');
  await expect(page.getByText('· Saved', { exact: false })).toBeVisible();
  await expect(page.getByText('Unsaved')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Notes for this project')).toHaveValue('Remember the streaks bug.');
});

test('a project not in Cherry says so', async ({ page }) => {
  await page.goto('/p/nope');
  await expect(page.getByRole('heading', { name: 'This project is not in Cherry' })).toBeVisible();
});

// V3 (ADR-0045): the explorer belongs to Development; Plan has no file tree.
test('the explorer shows in Development only', async ({ page }) => {
  await page.goto('/p/core');
  const files = page.getByRole('complementary', { name: 'Files' });
  await expect(files.getByRole('button', { name: 'Project files' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(files.getByRole('treeitem', { name: /lib/ })).toBeVisible();
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await stages.getByRole('button', { name: 'Plan' }).click();
  await expect(files).toHaveCount(0);
  await stages.getByRole('button', { name: 'Development' }).click();
  await expect(files.getByRole('treeitem', { name: /lib/ })).toBeVisible();
});
