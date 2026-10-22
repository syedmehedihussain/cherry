import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// The GitHub view lists changes VS Code style: stage, Write message (Haiku), Commit as the user.
test('source control: stage, write a message, commit as the user', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('link', { name: 'shop', exact: true }).first().click();
  const aside = page.getByRole('complementary', { name: 'Repository and agents' });
  await aside.getByRole('tab', { name: 'GitHub' }).click();

  const box = aside.getByRole('region', { name: 'Source control' });
  await expect(box).toContainText('as E2E User');
  await expect(box.getByRole('switch', { name: 'Auto commit' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const changes = box.getByRole('list', { name: 'Changes' });
  await expect(changes).toContainText('src/hero.ts');
  await expect(box.getByRole('button', { name: /^Commit as/ })).toBeDisabled();

  await changes.getByRole('button', { name: 'Stage src/hero.ts' }).click();
  await expect(box.getByRole('list', { name: 'Staged' })).toContainText('src/hero.ts');
  await box.getByRole('button', { name: 'Write message' }).click();
  await expect(box.getByLabel('Commit message')).toHaveValue('fix(hero): show the new hero value');
  await page.screenshot({ path: 'test-results/source-control.png' });

  await box.getByRole('button', { name: 'Commit as E2E User' }).click();
  await expect(box.getByRole('status')).toContainText('Committed');
  await expect(box).toContainText('Nothing to commit');

  const log = execFileSync('git', ['log', '-1', '--format=%an|%s|%b'], {
    cwd: path.join(E2E_PROJECTS, 'shop'),
    encoding: 'utf8',
  }).trim();
  expect(log).toBe('E2E User|fix(hero): show the new hero value|');

  // Auto commit is a switch per project.
  await box.getByRole('switch', { name: 'Auto commit' }).click();
  await expect(box).toContainText('Auto commit is on');
  await box.getByRole('switch', { name: 'Auto commit' }).click();
  await expect(box).not.toContainText('Auto commit is on');
});
