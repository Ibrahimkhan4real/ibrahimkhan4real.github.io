import { expect, test } from '@playwright/test';
import path from 'node:path';

const workerPattern = /ibrahim-research-chat\.immicoc1\.workers\.dev/;

async function openGuide(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Ask about my research' }).click();
  await expect(page.locator('#chat-widget')).not.toHaveClass(/minimized/);
  await expect(page.locator('#chat-input')).toBeFocused();
}

test('research guide renders cited answers and clears history', async ({ page }, testInfo) => {
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'Monte Carlo Tree Search (MCTS) looks ahead by simulating possible decisions and focusing search on promising choices.',
        mode: 'rag',
        sources: [
          {
            id: 'concept-monte-carlo-tree-search',
            title: 'Interactive research demos',
            url: 'https://ibrahimkhan4real.github.io/demos.html',
            kind: 'concept',
            date: '2026-09-02'
          },
          {
            id: 'unsafe',
            title: 'Unsafe source',
            url: 'javascript:alert(1)',
            kind: 'website',
            date: ''
          }
        ],
        freshness: {},
        meta: { corpusVersion: 'test', retrieval: 'lexical', provider: 'test', fresh: true }
      })
    });
  });

  await openGuide(page);
  await expect(page.locator('#chat-privacy')).toContainText('may use Google Gemini');
  await expect(page.locator('#chat-input')).toHaveAttribute('maxlength', '1000');

  await page.locator('#chat-input').fill('Explain MCTS.');
  await page.locator('#chat-input').press('Enter');

  const answer = page.locator('.chat-message.bot').filter({ hasText: 'looks ahead by simulating' });
  await expect(answer).toBeVisible();
  await expect(answer.getByRole('link', { name: 'Interactive research demos' })).toHaveAttribute(
    'href',
    'https://ibrahimkhan4real.github.io/demos.html',
  );
  await expect(answer.getByRole('link', { name: 'Unsafe source' })).toHaveCount(0);

  if (process.env.SITE_CAPTURE_SCREENSHOTS) {
    await page.screenshot({
      path: path.join('artifacts', 'screenshots', testInfo.project.name, 'chat-open.png'),
      fullPage: false,
    });
  }

  await page.locator('#chat-clear').click();
  await expect(page.getByText('Conversation cleared. You can start a new public-source question.')).toBeVisible();
  await expect(page.locator('.chat-message.user')).toHaveCount(0);
  await expect(page.locator('#chat-input')).toBeFocused();
});


test('research guide renders backend text without executing HTML', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Safe-rendering check runs once.');
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: '<img src=x onerror=alert(1)> Literal backend text.',
        mode: 'rag',
        sources: [],
        freshness: {},
        meta: { corpusVersion: 'test', retrieval: 'lexical', provider: 'test', fresh: true }
      })
    });
  });

  await openGuide(page);
  await page.locator('#chat-input').fill('Test safe rendering.');
  await page.locator('#chat-send').click();

  const answer = page.locator('.chat-message.bot').filter({ hasText: 'Literal backend text' });
  await expect(answer).toContainText('<img src=x onerror=alert(1)>');
  await expect(answer.locator('img')).toHaveCount(0);
});

test('research guide explains rate limits', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Error-state checks run once.');
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Too many requests', code: 'rate_limited' })
    });
  });

  await openGuide(page);
  await page.locator('#chat-input').fill('Who is Ibrahim?');
  await page.locator('#chat-send').click();
  await expect(page.getByText('The guide has received too many requests. Please wait a moment and try again.')).toBeVisible();
});

test('research guide rejects malformed backend responses', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Error-state checks run once.');
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ answer: 42, sources: [] })
    });
  });

  await openGuide(page);
  await page.locator('#chat-input').fill('What is BOPTEST?');
  await page.locator('#chat-send').click();
  await expect(page.getByText('The research guide is temporarily unavailable. Please try again shortly.')).toBeVisible();
});

test('research guide displays privacy refusals without sources', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Refusal-state checks run once.');
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'That is private information and is not part of the public professional profile.',
        mode: 'decline',
        sources: [],
        freshness: {},
        meta: { corpusVersion: 'test', retrieval: 'none', provider: 'none', fresh: false }
      })
    });
  });

  await openGuide(page);
  await page.locator('#chat-input').fill('What is his phone number?');
  await page.locator('#chat-send').click();
  const refusal = page.locator('.chat-message.bot').filter({ hasText: 'private information' });
  await expect(refusal).toBeVisible();
  await expect(refusal.locator('.chat-sources')).toHaveCount(0);
});

test('home page guide answers in place and cites its sources', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Inline guide checks run once.');
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: '<b>Planning</b> under deadlines is the core of the work.',
        mode: 'rag',
        sources: [
          {
            id: 'concept-monte-carlo-tree-search',
            title: 'Interactive research demos',
            url: 'https://ibrahimkhan4real.github.io/demos.html',
            kind: 'concept',
            date: '2026-09-02'
          }
        ],
        freshness: {},
        meta: { corpusVersion: 'test', retrieval: 'lexical', provider: 'test', fresh: true }
      })
    });
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  const answer = page.locator('#home-ask-answer');
  await expect(answer).toBeHidden();

  await page.locator('#home-ask-input').fill('What is your PhD about?');
  await page.locator('#home-ask-send').click();

  await expect(answer).toBeVisible();
  // Backend text is rendered literally, never as markup.
  await expect(page.locator('#home-ask-answer-text')).toContainText('<b>Planning</b>');
  await expect(answer.locator('b')).toHaveCount(0);
  await expect(
    answer.getByRole('link', { name: 'Interactive research demos' }),
  ).toHaveAttribute('href', 'https://ibrahimkhan4real.github.io/demos.html');

  // The side panel stays closed; the home guide answers in place.
  await expect(page.locator('#chat-widget')).toHaveClass(/minimized/);
});

test('home page guide suggestions ask their question', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'Inline guide checks run once.');
  await page.route(workerPattern, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Too many requests', code: 'rate_limited' })
    });
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'MCTS in simple words' }).click();

  await expect(page.locator('#home-ask-input')).toHaveValue('Explain MCTS in simple words.');
  await expect(page.locator('#home-ask-answer-text')).toHaveText(
    'The guide has received too many requests. Please wait a moment and try again.',
  );
});
