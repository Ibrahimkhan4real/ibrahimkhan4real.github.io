import { expect, test } from '@playwright/test';

test('Work replaces the personal Travel section with professional content', async ({ page }) => {
  const response = await page.goto('/work.html', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Turning research questions into reliable software',
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A reproducible research loop' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selected public projects' })).toBeVisible();
  await expect(page.getByText('Research Software Developer', { exact: true })).toBeVisible();
  await expect(page.getByText('Doctoral Researcher', { exact: true })).toBeVisible();
  await expect(page.locator('.public-project-card')).toHaveCount(4);

  await expect(page.getByRole('heading', { name: 'Questions I work on' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Teaching, funding and awards' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technical toolkit' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download CV/ })).toHaveAttribute(
    'href',
    '/assets/docs/Ibrahim_CV.pdf',
  );

  const workBody = await page.locator('body').innerText();
  expect(workBody).not.toMatch(/\+44\s?\d/);
  expect(workBody).not.toContain('80% faster first-response time');
});

test('blog contains the complete replacement article and no placeholder copy', async ({ page }) => {
  const response = await page.goto('/blog.html', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);

  const replacement = page.getByRole('link', {
    name: 'From deadlines to decisions: a planning view of hot-water control',
  });
  await expect(replacement).toBeVisible();
  await expect(replacement).toHaveAttribute(
    'href',
    '/2026/08/26/deadlines-to-decisions.html',
  );

  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Then you continue the full content here');
  expect(body).not.toContain('Hybrid MCTS for Heat Pump Control');
});

test('removed personal and placeholder routes are no longer published', async ({ request }) => {
  expect((await request.get('/travel.html')).status()).toBe(404);
  expect((await request.get('/2025/11/09/test-post.html')).status()).toBe(404);
});
