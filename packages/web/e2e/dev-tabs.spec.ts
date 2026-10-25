import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { E2E_PROJECTS, loginCode } from './fixture.ts';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#login=${await loginCode()}`);
  await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
});

// V3 r4: Development is the explorer and one tabbed area; Claude is pinned first.
test('files open as tabs next to Claude, switch back and forth, and close', async ({ page }) => {
  await page.goto('/p/core');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await stages.getByRole('button', { name: 'Development' }).click();
  const tabs = page.getByRole('tablist', { name: 'Open tabs' });
  await expect(tabs.getByRole('tab')).toHaveText(['Claude']);
  await expect(tabs.getByRole('button', { name: /^Close/ })).toHaveCount(0);

  const files = page.getByRole('complementary', { name: 'Files' });
  await files.getByRole('treeitem', { name: /README\.md/ }).click();
  await files.getByRole('treeitem', { name: /lib/ }).click();
  await files.getByRole('treeitem', { name: /streaks\.ts/ }).click();
  await expect(tabs.getByRole('tab')).toHaveText(['Claude', /README\.md/, /streaks\.ts/]);
  await expect(page).toHaveURL(/\/p\/core\/files\/lib\/streaks\.ts$/);
  await expect(tabs.getByRole('tab', { name: /streaks\.ts/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Back to Claude: the chat shows, the file tabs stay.
  await tabs.getByRole('tab', { name: 'Claude' }).click();
  await expect(page).toHaveURL(/\/p\/core$/);
  await expect(page.getByLabel('Message Claude')).toBeVisible();
  await expect(tabs.getByRole('tab')).toHaveCount(3);

  await tabs.getByRole('tab', { name: /README\.md/ }).click();
  await expect(page).toHaveURL(/\/p\/core\/files\/README\.md$/);
  await tabs.getByRole('button', { name: 'Close README.md' }).click();
  await expect(tabs.getByRole('tab')).toHaveText(['Claude', /streaks\.ts/]);
  await tabs.getByRole('button', { name: 'Close streaks.ts' }).click();
  await expect(page).toHaveURL(/\/p\/core$/);
  await expect(tabs.getByRole('tab')).toHaveText(['Claude']);
});

test('a file opened from another stage opens Development with its tab', async ({ page }) => {
  await page.goto('/p/core');
  const stages = page.getByRole('navigation', { name: 'Lifecycle stages' });
  await stages.getByRole('button', { name: 'Design' }).click();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill('>streaks');
  await page.getByRole('option', { name: /lib\/streaks\.ts/ }).click();
  await expect(page).toHaveURL(/\/p\/core\/files\/lib\/streaks\.ts$/);
  await expect(stages.getByRole('button', { name: 'Development' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('tablist', { name: 'Open tabs' }).getByRole('tab', { name: /streaks\.ts/ }),
  ).toHaveAttribute('aria-selected', 'true');
  // The More menu closes every tab and goes back to Claude.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Close all tabs' }).click();
  await expect(page).toHaveURL(/\/p\/core$/);
});

// V3 r5: a file Claude changed shows a band with Show diff and Undo.
test('a file Claude changed shows the band, its diff, and Undo', async ({ page }) => {
  const hero = path.join(E2E_PROJECTS, 'shop', 'src', 'hero.ts');
  const before = readFileSync(hero, 'utf8');
  try {
    await page.evaluate(() => fetch('/api/projects/shop/chat/new', { method: 'POST' }));
    await page.goto('/p/shop');
    await page
      .getByRole('navigation', { name: 'Lifecycle stages' })
      .getByRole('button', { name: 'Development' })
      .click();
    const box = page.getByLabel('Message Claude');
    await box.fill('Bump the hero');
    await box.press('Enter');
    // The prompt has focus: 1 is Yes, like the CLI.
    await expect(page.getByRole('group', { name: /Claude wants to edit/ })).toBeFocused();
    await page.keyboard.press('1');
    await expect(page.getByText('Hero bumped.')).toBeVisible();

    const files = page.getByRole('complementary', { name: 'Files' });
    await files.getByRole('treeitem', { name: /^src/ }).click();
    await files.getByRole('treeitem', { name: /hero\.ts/ }).click();
    const code = page.getByRole('region', { name: 'Contents of src/hero.ts' });
    await expect(code.getByText(/Claude changed this file/)).toBeVisible();
    await expect(code).toContainText(/hero\s=\s3/);
    await code.getByRole('button', { name: 'Show diff' }).click();
    await expect(code.getByRole('button', { name: 'Hide diff' })).toBeVisible();
    await code.getByRole('button', { name: 'Undo' }).click();
    // Undo puts the last commit's text in the editor; nothing is saved until Ctrl+S.
    await expect(code.getByText('Not saved · Ctrl+S')).toBeVisible();
    await expect(code).not.toContainText(/hero\s=\s3/);
    expect(readFileSync(hero, 'utf8')).toContain('hero = 3');
  } finally {
    writeFileSync(hero, before);
  }
});

// V3 r6: a terminal tab is a real shell in the project folder; it outlasts a tab switch and a
// reload, and closing the tab ends it.
test('a terminal tab runs a shell in the project folder', async ({ page }) => {
  await page.goto('/p/cctop');
  await page
    .getByRole('navigation', { name: 'Lifecycle stages' })
    .getByRole('button', { name: 'Development' })
    .click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New terminal' }).click();
  await expect(page).toHaveURL(/\/p\/cctop\/term\/t_/);
  const tabs = page.getByRole('tablist', { name: 'Open tabs' });
  await expect(tabs.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const screen = page.getByRole('region', { name: 'Terminal' });
  await screen.click();
  await page.keyboard.type('echo cherry-$((6*7)) && ls\n');
  await expect(screen).toContainText('cherry-42');
  await expect(screen).toContainText('edit-me.txt');

  await tabs.getByRole('tab', { name: 'Claude' }).click();
  await tabs.getByRole('tab', { name: 'Terminal' }).click();
  await expect(screen).toContainText('cherry-42');

  await page.reload();
  await expect(tabs.getByRole('tab', { name: 'Terminal' })).toBeVisible();
  await tabs.getByRole('tab', { name: 'Terminal' }).click();
  await expect(page.getByRole('region', { name: 'Terminal' })).toContainText('cherry-42');

  await tabs.getByRole('button', { name: 'Close Terminal' }).click();
  await expect(tabs.getByRole('tab', { name: 'Terminal' })).toHaveCount(0);
  await page.reload();
  await expect(tabs.getByRole('tab')).toHaveText(['Claude']);
});
