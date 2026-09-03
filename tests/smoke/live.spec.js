import { expect, test } from '@playwright/test';

test('Live renders verified structured workstreams without client-side loading', async ({ page }) => {
  const response = await page.goto('/live.html', { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1, name: 'What I am working on now' })).toBeVisible();
  await expect(page.locator('time')).toHaveAttribute('datetime', '2026-08-26');
  await expect(page.locator('.now-card')).toHaveCount(3);
  await expect(page.locator('.now-status-strip a')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Planning for energy-aware control' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reliable reinforcement learning' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reproducible AI research software' })).toBeVisible();

  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Loading current status');
  expect(body).not.toContain('effect the whole training run');
});

test('Live exposes public evidence while stating publication boundaries', async ({ page }) => {
  await page.goto('/live.html', { waitUntil: 'networkidle' });

  await expect(page.getByRole('link', { name: /Deadline-aware hot-water paper/ })).toHaveAttribute(
    'href',
    'https://arxiv.org/abs/2601.18123',
  );
  await expect(page.getByRole('link', { name: /Professional work overview/ })).toHaveAttribute(
    'href',
    '/work.html',
  );
  await expect(page.getByRole('heading', { name: 'What this page deliberately leaves out' })).toBeVisible();
  await expect(page.getByText(/anonymous-review identity/)).toBeVisible();
});
