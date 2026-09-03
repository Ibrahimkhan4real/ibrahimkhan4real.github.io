import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const primaryRoutes = [
  { path: '/', slug: 'home' },
  { path: '/live.html', slug: 'live' },
  { path: '/papers.html', slug: 'papers' },
  { path: '/blog.html', slug: 'blog' },
  { path: '/demos.html', slug: 'demos' },
  { path: '/work.html', slug: 'work' },
  { path: '/404.html', slug: '404' },
];

for (const route of primaryRoutes) {
  test(`${route.slug} renders without structural failures`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto(route.path, { waitUntil: 'networkidle' });
    expect(response, `${route.path} should return a response`).not.toBeNull();
    expect(response.status(), `${route.path} should return HTTP 200`).toBe(200);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    expect(await page.title()).toMatch(/\S/);
    await expect(page.locator('main')).toBeVisible();
    const stylesheetCount = await page.locator('link[rel="stylesheet"]').count();
    expect(stylesheetCount).toBeGreaterThan(0);
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();

    const brokenImages = await page.locator('img').evaluateAll((images) =>
      images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute('src')),
    );
    expect(brokenImages, `${route.path} should not contain broken images`).toEqual([]);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow, `${route.path} should not overflow horizontally`).toBe(false);

    expect(pageErrors, `${route.path} should not raise page errors`).toEqual([]);

    if (process.env.SITE_CAPTURE_SCREENSHOTS === '1') {
      const screenshotDirectory = resolve('artifacts', 'screenshots', testInfo.project.name);
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: resolve(screenshotDirectory, `${route.slug}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
}
