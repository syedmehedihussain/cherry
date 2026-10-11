import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// The GitHub view lists the changes as commits; a click explains one, and Commit makes it as the user.
test('ready to commit: expand, read, commit as the user', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'shop', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: 'GitHub' }).click();

  const box = aside.getByRole('region', { name: 'Ready to commit' });
  await expect(box).toContainText('as E2E User');
  const row = box.getByRole('button', { name: /fix\(hero\): show the new hero value/ });
  await row.click();
  await expect(box).toContainText('This commit changes the hero value from 1 to 2.');
  await expect(box.getByRole('list', { name: 'Files in this commit' })).toContainText(
    'src/hero.ts',
  );

  await box.getByRole('button', { name: 'Commit as E2E User' }).click();
  await expect(box.getByRole('status')).toContainText('Committed');
  await expect(box).toContainText('Nothing to commit');

  const log = execFileSync('git', ['log', '-1', '--format=%an|%s|%b'], {
    cwd: path.join(E2E_PROJECTS, 'shop'),
    encoding: 'utf8',
  }).trim();
  expect(log).toBe('E2E User|fix(hero): show the new hero value|');
});
