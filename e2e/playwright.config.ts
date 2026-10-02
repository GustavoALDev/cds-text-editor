import { defineConfig, devices } from '@playwright/test';

const chrome = process.env['CHROME'];

export default defineConfig({
  testDir: '.',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chrome ? { launchOptions: { executablePath: chrome } } : {}),
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
