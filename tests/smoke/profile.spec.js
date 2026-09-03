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
  await expect(page.getByText('Research Software Developer', { exact: true })).toBeVisible();
  await expect(page.getByText('Doctoral Researcher', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biography' })).toBeVisible();

  const cvLink = page.getByRole('link', { name: /Download CV/ });
  await expect(cvLink).toHaveAttribute('href', '/assets/docs/Ibrahim_CV.pdf');

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
  expect(await cvLinks.count()).toBeGreaterThanOrEqual(2);
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
