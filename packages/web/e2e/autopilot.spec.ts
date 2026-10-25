import { rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

// The ADR Magnet writes would show as a change in the git specs that run later.
test.afterEach(() =>
  rmSync(path.join(E2E_PROJECTS, 'core', 'docs'), { recursive: true, force: true }),
);

// ADR-0046: Magnet asks once, flies the stage, decides what the documents do not, leaves the
// push for the user, and reports in ASD-STE100.
test('Autopilot: Magnet asks, flies the job, and reports', async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  await page.evaluate(() =>
    fetch('/api/projects/core/chat/new?stage=development', { method: 'POST' }),
  );
  await page.goto('/p/core');
  const top = page.getByRole('banner');
  await top.getByRole('button', { name: 'Autopilot' }).click();
  const ask = page.getByRole('group', { name: 'Magnet asks' });
  await expect(ask).toContainText('What should I do, sir?');
  await expect(ask.getByRole('button', { name: 'Only the next task' })).toBeVisible();
  // Nothing runs until the answer; Esc cancels.
  await page.locator('body').press('Escape');
  await expect(ask).toBeHidden();
  await top.getByRole('button', { name: 'Autopilot' }).click();
  await expect(ask).toBeVisible();

  const box = page.getByPlaceholder('Tell Magnet the job');
  await box.fill('Fly the test job');
  await box.press('Enter');

  await expect(
    page.getByText('Yes, sir. The job has 2 tasks. I report when it is done.'),
  ).toBeVisible();
  await expect(page.getByText('MAGNET → BUILDER').first()).toBeVisible();
  await expect(page.getByText('Task one of the test flight: add the streak test.')).toBeVisible();
  await expect(page.getByText('Magnet decided')).toBeVisible();

  const report = page.getByRole('region', { name: 'Autopilot report' });
  await expect(report).toContainText('Welcome back, sir. Fly the test job is complete.');
  await expect(report).toContainText('2 of 2 tasks are complete.');
  await expect(report).toContainText('Streaks reset at midnight');
  await expect(report).toContainText('Push: git push origin main');
  await expect(report).toContainText('ASD-STE100');
  await expect(top.getByRole('button', { name: 'Autopilot' })).toBeVisible();

  await report.getByRole('button', { name: 'Keep' }).click();
  await expect(report).toContainText('Kept');
  await report.getByRole('button', { name: 'Open Deployment' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Lifecycle stages' }).getByRole('button', {
      name: 'Deployment',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  // No Autopilot in Deployment: it leaves the machine.
  await expect(top.getByRole('button', { name: 'Autopilot' })).toHaveCount(0);
});
