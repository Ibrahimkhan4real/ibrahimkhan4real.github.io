import { expect, test } from '@playwright/test';

const productionOrigin = 'https://ibrahimkhan4real.github.io';
const pages = [
  '/',
  '/live.html',
  '/work.html',
  '/demos.html',
  '/papers.html',
  '/blog.html',
  '/2026/08/26/deadlines-to-decisions.html',
];

for (const route of pages) {
  test(route + ' publishes production canonical and social metadata', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Metadata checks run once.');
    await page.goto(route);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const openGraphUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    expect(canonical).toBe(productionOrigin + route);
    expect(openGraphUrl).toBe(canonical);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /^https:\/\//,
    );
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      'content',
      /Muhammad Ibrahim Khan/,
    );
    await expect(page.locator('link[type="application/atom+xml"]')).toHaveAttribute(
      'href',
      productionOrigin + '/feed.xml',
    );

    const head = await page.locator('head').textContent();
    expect(head).not.toContain('localhost');
    expect(head).not.toContain('0.0.0.0');
  });
}

test('home and posts expose valid structured data and article metadata', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Metadata checks run once.');

  await page.goto('/');
  const person = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent(),
  );
  expect(person['@type']).toBe('Person');
  expect(person.name).toBe('Muhammad Ibrahim Khan');
  expect(person.sameAs).toContain('https://github.com/Ibrahimkhan4real');

  await page.goto('/2026/08/26/deadlines-to-decisions.html');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    'content',
    'article',
  );
  await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute(
    'content',
    /^2026-08-26T/,
  );
  await expect(page.locator('time')).toHaveAttribute('datetime', /^2026-08-26T/);
  const posting = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent(),
  );
  expect(posting['@type']).toBe('BlogPosting');
  expect(posting.author.name).toBe('Muhammad Ibrahim Khan');
});

test('new-tab links use opener protection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Link security runs once.');

  for (const route of pages) {
    await page.goto(route);
    const unsafe = await page.locator('a[target="_blank"]').evaluateAll((links) =>
      links
        .filter((link) => {
          const tokens = new Set((link.getAttribute('rel') || '').split(/\s+/));
          return !tokens.has('noopener') || !tokens.has('noreferrer');
        })
        .map((link) => link.getAttribute('href')),
    );
    expect(unsafe, route + ' should protect every new-tab link').toEqual([]);
  }
});
