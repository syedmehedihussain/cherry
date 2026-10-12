import { spawn } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

test('runs the app from the Play button, shows its output and address, and stops it', async ({
  page,
}) => {
  await page.goto('/p/cctop');
  const bar = page.getByRole('banner');
  await bar.getByRole('button', { name: 'Run the app on localhost' }).click();
  await expect(page).toHaveURL(/\/p\/cctop\/run$/);
  await expect(page.getByRole('log', { name: 'App output' })).toContainText(
    'ready on http://localhost:4998/',
  );
  await expect(page.getByRole('log', { name: 'App output' })).not.toContainText(
    '$ npm run dev\n$ npm run dev',
  );
  await expect(bar.getByRole('button', { name: /App running at localhost:4998/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open localhost:4998' })).toHaveAttribute(
    'href',
    'http://localhost:4998/',
  );
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Run the app on localhost' })).toBeVisible();
});

test('a project Cherry cannot run has no Play button', async ({ page }) => {
  await page.goto('/p/atlas');
  await expect(page.getByRole('button', { name: /Open the status report/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run the app on localhost' })).toHaveCount(0);
});

test('a site Claude or a terminal already started shows as a link that opens in a new tab', async ({
  page,
}) => {
  // Something else (say Claude's Bash) runs a web server from inside the atlas folder.
  const child = spawn(
    process.execPath,
    [
      '-e',
      "require('http').createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', function () { console.log(this.address().port) })",
    ],
    {
      cwd: path.join(E2E_PROJECTS, 'atlas'),
      stdio: ['ignore', 'pipe', 'pipe'],
      // A clean env: the Playwright worker's IPC channel and loader must not come along.
      env: { PATH: process.env.PATH },
    },
  );
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let out = '';
      child.stdout!.on('data', (b: Buffer) => {
        out += b.toString();
        const m = /^(\d+)$/m.exec(out);
        if (m) resolve(Number(m[1]));
      });
      child.stderr!.on('data', (b: Buffer) => reject(new Error(b.toString())));
    });
    await page.goto('/p/atlas');
    const link = page
      .getByRole('banner')
      .getByRole('link', { name: `Open localhost:${port} in a new tab`, exact: false });
    await expect(link).toHaveAttribute('href', `http://localhost:${port}/`);
    await expect(link).toHaveAttribute('target', '_blank');
  } finally {
    child.kill();
  }
});
