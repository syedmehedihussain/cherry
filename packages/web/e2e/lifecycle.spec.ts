import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(
    page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)$/ }),
  ).toBeVisible();
});

// ADR-0034, ADR-0045: four stages, each with its own agent; Preparation and Issues are gone.
test('stage tabs open each agent', async ({ page }) => {
  await page.goto('/p/shop');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await expect(stages.getByRole('button', { name: 'Issues' })).toHaveCount(0);
  await expect(stages.getByRole('button', { name: 'Preparation' })).toHaveCount(0);
  for (const [stage, agent] of [
    ['Design', 'UI/UX Designer'],
    ['Deployment', 'DevOps Engineer'],
    ['Plan', 'System Architect'],
  ]) {
    await stages.getByRole('button', { name: stage }).click();
    // Deployment is the cockpit; its agent's chat is the DevOps Engineer tab (V3 r10).
    if (stage === 'Deployment') await page.getByRole('tab', { name: 'DevOps Engineer' }).click();
    await expect(page.getByRole('heading', { name: `${stage}: the ${agent}` })).toBeVisible();
    await expect(stages.getByRole('button', { name: stage })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await expect(page.getByRole('contentinfo')).toContainText('System Architect');
});

test('Settings, Agents: the seven staff agents, their skills and their personas', async ({
  page,
}) => {
  await page.goto('/settings/agents');
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  for (const name of [
    'Business Analyst, Idea',
    'System Analyst, Requirements',
    'QA Engineer, Testing',
    'DevOps Engineer, Deployment',
  ])
    await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText('release', { exact: true })).toBeVisible();
  await expect(page.getByText('tdd', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Preparation: the /)).toHaveCount(0);
  // ADR-0061: the ECC specialists and their models.
  const dev = page
    .getByRole('region', { name: 'Development Team' })
    .getByRole('list', { name: 'Specialists' });
  await expect(dev.getByText('code-reviewer', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'System Architect' })
      .getByRole('listitem')
      .filter({ hasText: 'planner' }),
  ).toContainText('opus');

  // V4 o17: edit a persona into ~/.cherry/staff/, then reset it.
  const qa = page.getByRole('region', { name: 'QA Engineer' });
  await qa.getByRole('button', { name: 'Edit' }).click();
  const text = qa.getByLabel('QA Engineer persona');
  await expect(text).toHaveValue(/You are the \*\*QA Engineer\*\*/);
  await text.fill('---\nname: QA Engineer\n---\nTest on a cheap Android phone first.\n');
  await qa.getByRole('button', { name: 'Save' }).click();
  await expect(qa.getByText('~/.cherry/staff/qa-engineer.md')).toBeVisible();
  await qa.getByRole('button', { name: 'Reset' }).click();
  await expect(qa.getByText('bundled persona')).toBeVisible();
});
