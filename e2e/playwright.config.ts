import { defineConfig, devices } from '@playwright/test';

const chrome = process.env['CHROME'];

export default defineConfig({
  testDir: '.',
  retries: process.env['CI'] ? 2 : 0,
  // App de teste Angular (spec 05a, D22): builds zoneless e zone pré-renderizados
  // (em cache do Nx), servidos com CSP estrita por `e2e/angular/serve.mjs`.
  webServer: {
    command: 'npx nx run angular-e2e-app:serve-static',
    url: 'http://127.0.0.1:4317/__health',
    reuseExistingServer: !process.env['CI'],
    timeout: 600_000,
  },
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
