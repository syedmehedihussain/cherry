import { spawn } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

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

// V3 r11: the quiet browser test: one row per step with its screenshot, no prompts.
test('Deployment: the browser test shows one row per step', async ({ page }) => {
  // A site already running from the atlas folder, as Claude or a terminal would start it.
  const child = spawn(
    process.execPath,
    [
      '-e',
      "require('http').createServer((q, r) => r.end('<h1>atlas</h1>')).listen(0, '127.0.0.1', function () { console.log(this.address().port) })",
    ],
    {
      cwd: path.join(E2E_PROJECTS, 'atlas'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH },
    },
  );
  const setChrome = (on: boolean) =>
    page.evaluate(
      (chrome) =>
        fetch('/api/config', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ claude: { chrome } }),
        }),
      on,
    );
  try {
    await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
    await page.goto('/p/atlas');
    await page
      .getByRole('navigation', { name: 'Lifecycle stages' })
      .getByRole('button', { name: 'Deployment' })
      .click();
    const section = page.getByRole('region', { name: 'Browser test' });
    await expect(section).toContainText('Claude in Chrome is off');
    await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeDisabled();

    await setChrome(true);
    await page.reload();
    await expect(section).toContainText('allow it on localhost for good');
    await section.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    const steps = section.getByRole('list', { name: 'Test steps' });
    await expect(steps.getByRole('listitem').first()).toContainText('Home opens');
    await expect(steps.getByRole('button', { name: 'Screenshot of Home opens' })).toBeVisible();
    await expect(steps).toContainText('week shows 0.0 km');
    await expect(section).toContainText('1 of 2 steps pass.');
    await expect(page.getByText('1 browser step failed.')).toBeVisible();
    // Quiet: no prompt in the page, the log only on a click.
    await expect(page.getByText('Do you want to proceed?')).toHaveCount(0);
    await section.getByRole('button', { name: 'Full log' }).click();
    await expect(page.getByLabel('Browser test log')).toContainText('navigate');

    await steps.getByRole('button', { name: 'Screenshot of Home opens' }).click();
    await expect(page.getByRole('dialog', { name: 'Screenshot of Home opens' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await section.getByRole('button', { name: 'Fix in Development' }).click();
    await expect(page.getByText(/^The browser test failed at step 2/)).toBeVisible();
  } finally {
    child.kill();
    await setChrome(false);
  }
});
