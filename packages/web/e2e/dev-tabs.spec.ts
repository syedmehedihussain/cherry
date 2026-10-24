import { expect, test } from '@playwright/test';
import { loginCode } from './fixture.ts';

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
