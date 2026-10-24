import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

// ADR-0034, ADR-0045: four stages, each with its own agent; Preparation and Issues are gone.
test('stage tabs open each agent', async ({ page }) => {
  await page.goto('/p/shop');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await expect(stages.getByRole('button', { name: 'Issues' })).toHaveCount(0);
  await expect(stages.getByRole('button', { name: 'Preparation' })).toHaveCount(0);
  for (const [stage, agent] of [
    ['Design', 'Designer'],
    ['Deployment', 'Shipper'],
    ['Plan', 'Planner'],
  ]) {
    await stages.getByRole('button', { name: stage }).click();
    await expect(page.getByRole('heading', { name: `${stage}: the ${agent}` })).toBeVisible();
    await expect(stages.getByRole('button', { name: stage })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await expect(page.getByRole('contentinfo')).toContainText('Planner');
});

test('Settings lists the stage agents and their bundled skills', async ({ page }) => {
  await page.goto('/settings/agents');
  await expect(page.getByRole('heading', { name: 'Stage agents' })).toBeVisible();
  await expect(page.getByText('Deployment: the Shipper')).toBeVisible();
  await expect(page.getByText('release', { exact: true })).toBeVisible();
  await expect(page.getByText('project-readiness', { exact: true })).toBeVisible();
});
