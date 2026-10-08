import { defineConfig, devices } from '@playwright/test';

const chrome = process.env['CHROME'];

export default defineConfig({
  testDir: '.',
  retries: process.env['CI'] ? 2 : 0,
  // No CI o repórter `json` alimenta `tools/quality-summary.mjs` (spec 08a, X11): um teste que
  // passou só na repetição aparece como `flaky`.
  reporter: process.env['CI']
    ? [
        ['list'],
        ['json', { outputFile: 'test-results/report.json' }],
        // versões dos motores para o resumo de qualidade (spec 08b)
        ['./helpers/versions-reporter.ts'],
      ]
    : 'list',
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
