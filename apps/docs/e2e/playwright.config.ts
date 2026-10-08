import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// E2E do site de documentação (spec 07c, I1–I6): o `webServer` serve o `browser/` do consumidor
// (RTE_CONSUMER_DIR, construído por `node tools/consumer.mjs --app docs pack prepare install test
// build`) com `serve.mjs` SOB o prefixo `/cds-text-editor/`. Dois servidores: o padrão (CSP por
// cabeçalho e `<meta>`) e `--no-csp-header` (só a `<meta>`). Local só Chromium; o CI roda os 3 motores.
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../../..');
const chrome = process.env['CHROME'];
const base = Number(process.env['RTE_DOCS_PORT'] ?? 4320);
// RTE_DOCS_DIR: serve outra pasta (o site montado do job `pages`, com o demo em `demo/`).
const dir = process.env['RTE_DOCS_DIR'];

const server = (port: number, flags = '') => ({
  command:
    `node apps/docs/serve.mjs --base /cds-text-editor/ ${dir ? `--dir "${dir}" ` : ''}${flags}`.trim(),
  cwd: repo,
  env: { RTE_DOCS_PORT: String(port) },
  url: `http://127.0.0.1:${port}/cds-text-editor/__health`,
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
  webServer: [server(base), server(base + 1, '--no-csp-header')],
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
