import { expect, test } from '@playwright/test';

function desktopOnly(testInfo) {
  test.skip(testInfo.project.name !== 'desktop-light', 'Discovery checks run once.');
}

test('sitemap, Atom feed, robots and public RAG feed are valid', async ({ request }, testInfo) => {
  desktopOnly(testInfo);

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  const sitemap = await sitemapResponse.text();
  for (const route of ['/', '/live.html', '/work.html', '/papers.html', '/blog.html']) {
    expect(sitemap).toContain('https://ibrahimkhan4real.github.io' + route);
  }
  expect(sitemap).toContain('/2026/08/26/deadlines-to-decisions.html');
  expect(sitemap).not.toContain('404.html');
  expect(sitemap).not.toContain('rag-feed.json');
  expect(sitemap).not.toContain('Gemfile');

  const feedResponse = await request.get('/feed.xml');
  expect(feedResponse.status()).toBe(200);
  const feed = await feedResponse.text();
  expect(feed).toContain('<feed');
  expect(feed).toContain('From deadlines to decisions');
  expect(feed).toContain('Some projects I have made public');

  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.status()).toBe(200);
  const robots = await robotsResponse.text();
  expect(robots).toContain('User-agent: *');
  expect(robots).toContain('Allow: /');
  expect(robots).toContain(
    'Sitemap: https://ibrahimkhan4real.github.io/sitemap.xml',
  );

  const ragResponse = await request.get('/rag-feed.json');
  expect(ragResponse.status()).toBe(200);
  const rag = await ragResponse.json();
  expect(rag.posts).toHaveLength(2);
  expect(rag.live).toBeTruthy();
});

test('custom 404 is useful and obsolete/tooling routes stay unpublished', async ({ page, request }, testInfo) => {
  desktopOnly(testInfo);

  const missing = await request.get('/this-route-does-not-exist');
  expect(missing.status()).toBe(404);

  await page.goto('/404.html');
  await expect(
    page.getByRole('heading', { name: 'That page is not part of this site' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Research profile' })).toBeVisible();

  const unpublished = [
    '/Gemfile',
    '/Gemfile.lock',
    '/.ruby-version',
    '/blog/posts/posts.json',
    '/blog/posts/welcome-to-the-blog.md',
    '/blog/posts/welcome-to-the-blog.html',
  ];
  for (const route of unpublished) {
    const response = await request.get(route);
    expect(response.status(), route + ' should not be public').toBe(404);
  }
});
