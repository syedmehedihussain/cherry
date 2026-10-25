import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// V3 r8: the Brief keeps references, colours and fonts in design/brief.json.
test('Design: the brief keeps references, a link, colours and fonts', async ({ page }) => {
  await page.goto('/p/torongo');
  await page
    .getByRole('navigation', { name: 'Lifecycle stages' })
    .getByRole('button', { name: 'Design' })
    .click();
  const brief = page.getByRole('complementary', { name: 'Brief' });
  const refs = brief.getByRole('region', { name: 'References' });
  await refs.locator('input[type=file]').setInputFiles({
    name: 'Mood.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(refs.getByRole('img', { name: 'mood.png' })).toBeVisible();
  await refs.getByLabel('Paste a reference link').fill('https://dribbble.com/shots/42');
  await refs.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(refs.getByRole('link', { name: 'dribbble.com/shots/42' })).toBeVisible();
  await expect(refs.getByRole('link', { name: /Mobbin/ })).toHaveAttribute('target', '_blank');

  const colours = brief.getByRole('region', { name: 'Colours' });
  await colours.getByLabel('Text colour').fill('#ffffff');
  await colours.getByLabel('Surface colour').fill('#000000');
  await expect(colours).toContainText('AAA 21');
  await brief.getByLabel('Headings font').selectOption('Geist');

  const file = path.join(design, 'brief.json');
  await expect.poll(() => existsSync(file) && readFileSync(file, 'utf8')).toContain('"Geist"');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  expect(saved.references).toEqual([
    { kind: 'file', value: 'design/references/mood.png', note: '' },
    { kind: 'link', value: 'https://dribbble.com/shots/42', note: '' },
  ]);
  expect(saved.colours).toMatchObject({ text: '#FFFFFF', surface: '#000000' });
  expect(saved.fonts.heading).toEqual({ family: 'Geist', weight: 400 });
  expect(existsSync(path.join(design, 'references', 'mood.png'))).toBe(true);
});

// V3 r9: Approve design writes design/handoff/ and opens Development; Export is a zip.
test('Design: Approve design writes the handoff, Export downloads a zip', async ({ page }) => {
  await page.goto('/p/torongo');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await stages.getByRole('button', { name: 'Design' }).click();
  const canvas = page.getByRole('region', { name: 'Design canvas' });

  const href = await canvas.getByRole('link', { name: 'Export' }).getAttribute('href');
  const zip = await page.request.get(href!);
  expect(zip.status()).toBe(200);
  expect(zip.headers()['content-type']).toBe('application/zip');
  expect((await zip.body()).subarray(0, 2).toString()).toBe('PK');

  await canvas.getByRole('button', { name: 'Approve design' }).click();
  const dialog = page.getByRole('dialog', { name: 'Approve design' });
  await expect(dialog).toContainText('2 screens');
  await dialog.getByRole('button', { name: 'Approve and open Development' }).click();
  await expect(stages.getByRole('button', { name: 'Development' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Message Claude')).toHaveValue(/^The design is approved\./);
  await expect.poll(() => existsSync(path.join(design, 'handoff', 'README.md'))).toBe(true);
  expect(readFileSync(path.join(design, 'handoff', 'screens', 'home.html'), 'utf8')).toContain(
    'font-size:48px',
  );
});
