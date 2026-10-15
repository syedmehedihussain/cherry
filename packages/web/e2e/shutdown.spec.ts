import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

// A real shutdown would stop the daemon the other e2e tests share, so the request is answered here.
test('home: Shut down asks once, then says Cherry is off', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/shutdown', async (route) => {
    calls += 1;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/#login=${await loginCode()}`);
  await page.getByRole('button', { name: 'Shut down Cherry' }).click();
  const confirm = page.getByRole('group', { name: 'Shut down Cherry' });
  await expect(confirm).toContainText('Running chats, agents and apps stop too.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Shut down Cherry' })).toBeVisible();
  expect(calls).toBe(0);

  await page.getByRole('button', { name: 'Shut down Cherry' }).click();
  await page
    .getByRole('group', { name: 'Shut down Cherry' })
    .getByRole('button', { name: 'Shut down' })
    .click();
  await expect(page.getByRole('heading', { name: 'Cherry is off' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('run cherry in a terminal');
  expect(calls).toBe(1);
});
