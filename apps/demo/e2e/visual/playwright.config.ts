import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Regressão visual do demo (spec 08b, O5): só Chromium, no contêiner oficial do Playwright
// (`RTE_VISUAL_CONTAINER=1`, ver `e2e/visual/helpers/shot.ts`). Serve o `browser/` do build do demo:
// `RTE_DEMO_DIR` (artefato `demo-static` do job `demo`) ou `RTE_CONSUMER_DIR` (build local de
// `node tools/consumer.mjs pack prepare install build`). Baselines: workflow `visual-update.yml`.
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../../../..');
const port = Number(process.env['RTE_DEMO_PORT'] ?? 4318);
const dir = process.env['RTE_DEMO_DIR'];
const inCi = !!process.env['CI'];

export default defineConfig({
  testDir: here,
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  outputDir: resolve(repo, 'apps/demo/e2e/test-results/visual'),
  retries: 1,
  workers: 1,
  reporter: inCi
    ? [
        [
          'html',
          {
            open: 'never',
            outputFolder: resolve(repo, 'playwright-report/visual-demo'),
          },
        ],
        ['list'],
      ]
    : 'list',
  expect: { toHaveScreenshot: { threshold: 0.2, maxDiffPixels: 10 } },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `node apps/demo/serve.mjs${dir ? ` --dir "${dir}"` : ''}`,
    cwd: repo,
    env: { RTE_DEMO_PORT: String(port) },
    url: `http://127.0.0.1:${port}/__health`,
    reuseExistingServer: !inCi,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'visual-demo-chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
  ],
});
