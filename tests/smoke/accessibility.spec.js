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

test('every demonstration is operable from the keyboard and announces what changed', async ({ page }) => {
  await page.goto('/demos.html');

  // 01 — play a square, the planner replies, the status says so.
  const status = page.locator('#tt-status');
  await expect(status).toHaveText('Your move — you are X.');
  await page.getByRole('button', { name: /^Square 5/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Square 5/ })).toHaveAccessibleName(/X$/);
  await expect(page.locator('#tt-detail')).toContainText('400 simulations');

  // 02 — pulling an arm moves both scoreboards.
  await page.getByRole('button', { name: 'Pull 2' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bandit-you-pulls')).toHaveText('1');
  await expect(page.locator('#bandit-ucb-pulls')).toHaveText('1');

  // 03 — cutting a branch redistributes the simulations.
  const treeStatus = page.locator('#tree-status');
  const beforeCut = await treeStatus.textContent();
  await page.getByRole('button', { name: /^Branch A/ }).focus();
  await page.keyboard.press('Enter');
  await expect(treeStatus).not.toHaveText(beforeCut);

  // 04 — the objective re-solves when a weight changes.
  const deadline = page.getByLabel('Deadline penalty');
  await deadline.focus();
  await deadline.fill('0');
  await deadline.dispatchEvent('change');
  await expect(page.locator('#hack-met')).toHaveText('missed');
  await expect(page.locator('#hack-verdict')).toContainText('deadline penalty');

  // 05 — editing the world is announced.
  await page.getByRole('button', { name: 'Row 3, column 4, empty' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Row 3, column 4, wall' })).toBeVisible();
  await expect(page.locator('#ql-status')).toContainText('Untrained');

  // 06 — the two claims are computed from the same twelve runs.
  await expect(page.locator('.seed-row')).toHaveCount(12);
  await expect(page.locator('#seed-claim-best')).toContainText('one run out of twelve');

  // 07 — term selection changes the recovered equation and the held-out error.
  await page.getByRole('button', { name: /^Add T² / }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sindy-equation')).toContainText('T²');
  await expect(page.locator('#sindy-count')).toHaveText('4');
});

test('the planner demo keeps its search statistics optional', async ({ page }) => {
  await page.goto('/demos.html');
  const toggle = page.getByRole('button', { name: /search statistics/ });
  await expect(toggle).toHaveText('Hide the search statistics');
  await toggle.click();
  await expect(toggle).toHaveText('Show the search statistics');
});
