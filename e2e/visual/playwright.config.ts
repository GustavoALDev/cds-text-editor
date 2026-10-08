import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Regressão visual (spec 08b, O1–O3). Só roda no contêiner oficial do Playwright
// (`RTE_VISUAL_CONTAINER=1`, ver `helpers/shot.ts`). Baselines: workflow `visual-update.yml`.

const root = resolve(__dirname, '..');
const inCi = !!process.env['CI'];

// Só Chromium (O4): a cor é CSS (já provada nos 3 motores por ΔE e propriedade) e a emulação de
// forced-colors/prefers-contrast só é confiável nele. testIgnore, não skip, para não esconder nada.
const CHROMIUM_ONLY = [
  '**/theme-matrix.spec.ts',
  '**/forced-colors.spec.ts',
  '**/contrast-more.spec.ts',
];

export default defineConfig({
  testDir: '.',
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  outputDir: resolve(root, 'test-results/visual'),
  retries: 1,
  reporter: inCi
    ? [
        [
          'html',
          {
            open: 'never',
            outputFolder: resolve(root, '../playwright-report/visual'),
          },
        ],
        [
          'json',
          { outputFile: resolve(root, 'test-results/report-visual.json') },
        ],
        ['list'],
      ]
    : 'list',
  expect: {
    toHaveScreenshot: { threshold: 0.2, maxDiffPixels: 10 },
  },
  use: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  },
  // Mesmo app de teste do E2E funcional (porta 4317).
  webServer: {
    command: 'npx nx run angular-e2e-app:serve-static',
    url: 'http://127.0.0.1:4317/__health',
    reuseExistingServer: !inCi,
    timeout: 600_000,
  },
  projects: [
    {
      name: 'visual-chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
    {
      name: 'visual-firefox',
      use: { ...devices['Desktop Firefox'], deviceScaleFactor: 1 },
      testIgnore: CHROMIUM_ONLY,
    },
    {
      name: 'visual-webkit',
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
      testIgnore: CHROMIUM_ONLY,
    },
  ],
});
