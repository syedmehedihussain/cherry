import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_ROOT, loginCode } from './fixture.ts';

const outside = path.join(E2E_ROOT, 'elsewhere', 'notes-app');
test.beforeAll(() => {
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(outside, 'README.md'), '# Notes app\n');
});
test.afterAll(() => rmSync(path.join(E2E_ROOT, 'elsewhere'), { recursive: true, force: true }));

// Open folder (ADR-0032): a folder from anywhere joins Cherry's list, then leaves it again.
test('open a folder from anywhere, work in it, and remove it from Cherry', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('button', { name: 'Open folder…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open folder' });
  await dialog.getByLabel('Folder to open').fill(outside);
  await expect(dialog.getByRole('button', { name: 'Up', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();

  await expect(page).toHaveURL(/\/p\/notes-app$/);
  await expect(page.getByRole('treeitem', { name: /README\.md/ })).toBeVisible();

  await page.getByRole('link', { name: 'Cherry home' }).click();
  const row = page
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'notes-app', exact: true }) });
  await row.getByRole('button', { name: 'Remove notes-app from Cherry' }).click();
  await expect(row).toHaveCount(0);
  expect(existsSync(path.join(outside, 'README.md'))).toBe(true);

  // Refusals come back in the dialog.
  await page.getByRole('button', { name: 'Open folder…' }).first().click();
  await dialog.getByLabel('Folder to open').fill('/');
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('whole disk');
});
