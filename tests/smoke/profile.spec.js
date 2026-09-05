import { expect, test } from '@playwright/test';

test('homepage renders the verified professional profile', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Reinforcement Learning, Planning and Research Software',
    }),
  ).toBeVisible();
  await expect(page.getByText('Currently working on')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Planning for energy-aware control' }),
  ).toHaveAttribute('href', '/live.html#energy-control');
  await expect(page.locator('.home-stream')).toHaveCount(3);

  await expect(page.getByText('Recent publications')).toBeVisible();
  await expect(page.locator('.home-publication')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /All \d+ publications/ })).toHaveAttribute(
    'href',
    '/papers.html',
  );

  await expect(page.getByRole('heading', { name: 'Ask about my research' })).toBeVisible();

  const html = await page.locator('body').innerText();
  expect(html).not.toMatch(/\+44\s?\d/);
  expect(html).not.toContain('80% faster first-response time');
});

test('published CV is downloadable as the approved PDF', async ({ request }) => {
  const response = await request.get('/assets/docs/Ibrahim_CV.pdf');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  const body = await response.body();
  expect(body.byteLength).toBeGreaterThan(80_000);
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
});

test('navigation exposes one stable CV destination', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const cvLinks = page.locator('a[href="/assets/docs/Ibrahim_CV.pdf"]');
  expect(await cvLinks.count()).toBeGreaterThanOrEqual(1);

  // Every route to the CV, on any page, resolves to the same published PDF.
  for (const route of ['/', '/work.html']) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const hrefs = await page
      .locator('a')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute('href') || '')
          .filter((href) => /cv/i.test(href)),
      );
    expect(new Set(hrefs), route + ' should expose one CV path').toEqual(
      new Set(['/assets/docs/Ibrahim_CV.pdf']),
    );
  }
});
test('research guide is collapsed by default and opens accessibly', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const header = page.locator('#chat-header');
  const panel = page.locator('#chat-panel');

  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  if (await header.isVisible()) {
    await header.click();
  } else {
    await page.locator('#ask-research-link').click();
  }
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
});
