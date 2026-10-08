import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// E2E do demo (spec 07b, W12): o `webServer` serve o `browser/` do consumidor (RTE_CONSUMER_DIR,
// construído por `node tools/consumer.mjs pack prepare install build`) com `serve.mjs`. Três
// servidores: o padrão (CSP por cabeçalho e `<meta>`), `--no-csp-header` (só a `<meta>`) e
// `--with-server` (API de exemplo, J5 no Chromium). Local só Chromium; o CI roda os 3 motores.
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../../..');
const chrome = process.env['CHROME'];
const base = Number(process.env['RTE_DEMO_PORT'] ?? 4318);

const server = (port: number, flags = '') => ({
  command: `node apps/demo/serve.mjs ${flags}`.trim(),
  cwd: repo,
  env: { RTE_DEMO_PORT: String(port) },
  url: `http://127.0.0.1:${port}/__health`,
  reuseExistingServer: false,
  timeout: 60_000,
});

export default defineConfig({
  testDir: here,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: { baseURL: `http://127.0.0.1:${base}` },
  webServer: [
    server(base),
    server(base + 1, '--no-csp-header'),
    server(base + 2, '--with-server'),
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chrome ? { launchOptions: { executablePath: chrome } } : {}),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
