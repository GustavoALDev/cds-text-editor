import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const PORT = Number(process.env['RTE_DOCS_PORT'] ?? 4320);

/** Prefixo da publicação (X2): todo E2E roda sob ele. */
export const BASE = '/cds-text-editor/';

/** Origens dos dois servidores do `webServer` (ver `playwright.config.ts`). */
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const ORIGIN_NO_CSP_HEADER = `http://127.0.0.1:${PORT + 1}`;

const here = fileURLToPath(new URL('.', import.meta.url));
const consumer = process.env['RTE_CONSUMER_DIR'];
const siteDir = process.env['RTE_DOCS_DIR'];

/** Pasta que o `serve.mjs` lê: `RTE_DOCS_DIR` ou o `browser/` do consumidor; `null` sem nenhum dos dois. */
export const BROWSER = siteDir
  ? resolve(siteDir)
  : consumer
    ? resolve(consumer, 'dist', 'docs', 'browser')
    : null;

interface NavFile {
  sections: { items: { page: string }[] }[];
}

/** Páginas do guia, da `nav.json`. */
export const GUIDE_ROUTES: string[] = (
  JSON.parse(
    readFileSync(resolve(here, '../content/nav.json'), 'utf8'),
  ) as NavFile
).sections.flatMap((s) => s.items.map((i) => i.page));

/** Páginas de API, lidas do HTML pré-renderizado (`api/<entry>/index.html`). */
export const API_ROUTES: string[] = (() => {
  if (!BROWSER) return [];
  const dir = join(BROWSER, 'api');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort()
    .map((name) => `api/${name}`);
})();

/** Guia + API: a lista da I1. */
export const ROUTES: string[] = [...GUIDE_ROUTES, ...API_ROUTES];

/** URL absoluta de uma rota sob o prefixo. */
export const url = (origin: string, route: string): string =>
  `${origin}${BASE}${route}`;

export interface Problems {
  /** Erros e avisos de console, `pageerror` e violações de CSP. */
  readonly messages: string[];
  /** Origens das requisições feitas pela página. */
  readonly origins: Set<string>;
}

/**
 * Instala, antes de qualquer script, o coletor de `securitypolicyviolation` e registra erros e
 * avisos de console, `pageerror` e as origens das requisições. O array é preenchido ao vivo.
 */
export async function watch(page: Page): Promise<Problems> {
  const messages: string[] = [];
  const origins = new Set<string>();
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `CSP: ${event.effectiveDirective} bloqueou ${event.blockedURI}`,
      );
    });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      messages.push(`${m.type()}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(data|blob|about):/.test(u)) origins.add(new URL(u).origin);
  });
  return { messages, origins };
}

/** Espera o app Angular ficar estável (rota carregada e hidratada). */
export async function ready(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.locator('h1').first().waitFor();
}
