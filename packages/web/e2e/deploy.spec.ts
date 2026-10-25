import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
  for (const stage of ['development', 'deployment'])
    await page.evaluate(
      (s) => fetch(`/api/projects/cctop/chat/new?stage=${s}`, { method: 'POST' }),
      stage,
    );
});

// V3 r10: the cockpit runs the checks on a click; a failure goes to the Builder.
test('Deployment: checks run, a failure goes to Development', async ({ page }) => {
  await page.goto('/p/cctop');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await stages.getByRole('button', { name: 'Deployment' }).click();
  const checks = page.getByRole('list', { name: 'Checks' });
  await expect(checks.getByRole('button')).toHaveText([/Lint/, /Unit tests/]);
  await expect(page.getByText('Not checked yet')).toBeVisible();
  await expect(page.getByText('The app is not running.')).toBeVisible();

  await page.getByRole('button', { name: 'Run all' }).click();
  await expect(checks.getByRole('button', { name: /Unit tests/ })).toContainText('7 passed');
  await expect(checks.getByRole('button', { name: /Lint/ })).toContainText('1 error');
  await expect(page.getByText('Almost ready')).toBeVisible();
  await checks.getByRole('button', { name: /Lint/ }).click();
  await expect(page.getByLabel('Lint output')).toContainText('$ npm run lint');

  await page.getByRole('button', { name: 'Fix in Development' }).click();
  await expect(stages.getByRole('button', { name: 'Development' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/^The lint check fails in the Deployment cockpit/)).toBeVisible();
});

// V3 r10: Deploy asks once with what, where and the version, then the Shipper works.
test('Deployment: Deploy asks once, then hands it to the Shipper', async ({ page }) => {
  await page.goto('/p/cctop');
  await page
    .getByRole('navigation', { name: 'Lifecycle stages' })
    .getByRole('button', { name: 'Deployment' })
    .click();
  await expect(page.getByRole('region', { name: 'Deploy' })).toContainText(
    'A tag and a GitHub release',
  );
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Deploy' });
  await expect(dialog).toContainText('Where');
  await expect(dialog).toContainText('It leaves this computer.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await dialog.getByRole('button', { name: 'Deploy' }).click();
  await expect(page.getByRole('tab', { name: /Shipper/ })).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText(/^Deploy the current commit to A tag and a GitHub release/),
  ).toBeVisible();
});
