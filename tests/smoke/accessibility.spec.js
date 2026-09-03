import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  '/',
  '/live.html',
  '/work.html',
  '/demos.html',
  '/papers.html',
  '/blog.html',
  '/404.html',
];

for (const route of routes) {
  test(route + ' has no serious automated WCAG violations', async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }));

    expect(blocking).toEqual([]);
  });
}

test('skip link and current-page navigation work from the keyboard', async ({ page }) => {
  await page.goto('/papers.html');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Papers', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const primaryNavigation = page.locator('aside nav[aria-label="Primary navigation"]');
  await expect(primaryNavigation).toHaveCount(1);
  await expect(primaryNavigation.locator('ul')).toHaveCount(1);
  await expect(primaryNavigation.locator('li')).toHaveCount(11);
});

test('canvas demonstrations expose keyboard-operable alternatives and feedback', async ({ page }) => {
  await page.goto('/demos.html');

  await page.getByRole('spinbutton', { name: 'Row', exact: true }).fill('3');
  await page.getByRole('spinbutton', { name: 'Column', exact: true }).fill('4');
  const toggleWall = page.getByRole('button', { name: 'Toggle wall' });
  await toggleWall.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ql-edit-status')).toContainText(
    'Wall added at row 3, column 4.',
  );

  const setGoal = page.getByRole('button', { name: 'Set goal' });
  await setGoal.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ql-edit-status')).toContainText(
    'Goal moved to row 3, column 4.',
  );

  await expect(page.getByLabel('Strategy', { exact: true })).toBeVisible();
  const pullArm = page.getByRole('button', { name: 'Pull arm 2' });
  await pullArm.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bandit-stats')).toContainText('Pulls: 1');
});
