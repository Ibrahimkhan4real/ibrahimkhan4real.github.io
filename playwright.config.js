import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.SITE_BASE_URL;
const commonUse = {
  baseURL: externalBaseURL || 'http://127.0.0.1:4000',
  reducedMotion: 'reduce',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
};

export default defineConfig({
  testDir: './tests/smoke',
  outputDir: './artifacts/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]]
    : 'line',
  use: commonUse,
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'bundle exec jekyll serve --host 127.0.0.1 --port 4000 --no-watch --quiet',
        url: 'http://127.0.0.1:4000/',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'desktop-light',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'light',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-light',
      use: {
        ...devices['Pixel 7'],
        colorScheme: 'light',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'mobile-dark',
      use: {
        ...devices['Pixel 7'],
        colorScheme: 'dark',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
