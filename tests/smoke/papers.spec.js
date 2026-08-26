import { expect, test } from '@playwright/test';

test.describe('server-rendered publications', () => {
  test.use({ javaScriptEnabled: false });

  test('all publications remain visible without JavaScript', async ({ page }) => {
    const response = await page.goto('/papers.html', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    await expect(page.locator('[data-publication]')).toHaveCount(4);
    await expect(
      page.getByRole('heading', {
        name: 'Deadline-Aware, Energy-Efficient Control of Domestic Immersion Hot Water Heaters',
      }),
    ).toBeVisible();
    await expect(page.getByText('MI Khan, B Pradeep, J Brusey')).toBeVisible();
    await expect(page.locator('.publication-summary')).toContainText('4');
    await expect(page.locator('.publications-tools')).toBeHidden();

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Loading publications');
    expect(body).not.toContain('Sync pending');
  });
});

test('optional publication filter enhances the rendered list', async ({ page }) => {
  await page.goto('/papers.html', { waitUntil: 'networkidle' });
  const filter = page.getByLabel('Filter by title, author, venue or year');
  await expect(filter).toBeVisible();
  await filter.fill('SINDy');

  await expect(page.locator('[data-publication]:visible')).toHaveCount(1);
  await expect(page.locator('#publication-filter-status')).toHaveText('1 publication match “SINDy”.');
  await expect(page.getByText('Learning from Less: SINDy Surrogates in RL')).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('[data-publication]:visible')).toHaveCount(4);
});

test('raw publication source files are not exposed as public routes', async ({ request }) => {
  expect((await request.get('/site_data/papers.json')).status()).toBe(404);
  expect((await request.get('/_data/papers.json')).status()).toBe(404);
});
