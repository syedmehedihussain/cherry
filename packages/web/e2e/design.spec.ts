import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

const design = path.join(E2E_PROJECTS, 'torongo', 'design');

test.beforeEach(async ({ page }) => {
  mkdirSync(path.join(design, 'screens'), { recursive: true });
  writeFileSync(
    path.join(design, 'tokens.css'),
    ':root{--hot:#ff5a36}[data-theme=light] body{background:#fff}.big{font-size:48px}',
  );
  writeFileSync(
    path.join(design, 'screens', 'home.html'),
    '<html><head><title>Home</title><link rel="stylesheet" href="../tokens.css"></head><body><p class="big">12 orders</p></body></html>',
  );
  writeFileSync(path.join(design, 'screens', 'item.html'), '<title>Item</title><p>Blue mug</p>');
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});
test.afterEach(() => rmSync(design, { recursive: true, force: true }));

// V3 r7: the Design canvas shows design/screens/*.html; a comment on an element goes to chat.
test('Design: screens on the canvas, open large, and a comment on an element', async ({ page }) => {
  await page.evaluate(() =>
    fetch('/api/projects/torongo/chat/new?stage=design', { method: 'POST' }),
  );
  await page.goto('/p/torongo');
  await page
    .getByRole('navigation', { name: 'Lifecycle stages' })
    .getByRole('button', { name: 'Design' })
    .click();
  const canvas = page.getByRole('region', { name: 'Design canvas' });
  await expect(canvas).toContainText('2 screens');
  const home = page.frameLocator('iframe[title="Screen Home"]');
  // The screen's own stylesheet came along, inlined.
  await expect(home.locator('.big')).toHaveCSS('font-size', '48px');
  await expect(
    page.frameLocator('iframe[title="Screen Item"]').getByText('Blue mug'),
  ).toBeVisible();

  // Light and dark set data-theme on the screen.
  await canvas.getByRole('button', { name: 'Light' }).click();
  await expect(home.locator('html')).toHaveAttribute('data-theme', 'light');

  await canvas.getByRole('button', { name: /^Focus Home/ }).dblclick();
  const large = page.getByRole('dialog', { name: 'Home, large' });
  await expect(large).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(large).toBeHidden();

  await canvas.getByRole('button', { name: 'Comment on an element' }).click();
  await home.locator('.big').click();
  const form = canvas.getByRole('form', { name: 'Comment' });
  await expect(form).toContainText('Home › p.big');
  await form.getByRole('textbox').fill('Make the number bigger.');
  await form.getByRole('button', { name: 'Send to chat' }).click();
  await expect(form).toBeHidden();
  await expect(
    page.getByText(/Comment on design\/screens\/home\.html, element `p\.big` \("12 orders"\)/),
  ).toBeVisible();
});
