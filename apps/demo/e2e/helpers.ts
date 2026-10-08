import { expect, type Page } from '@playwright/test';

const PORT = Number(process.env['RTE_DEMO_PORT'] ?? 4318);

/** Origens dos três servidores do `webServer` (ver `playwright.config.ts`). */
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const ORIGIN_NO_CSP_HEADER = `http://127.0.0.1:${PORT + 1}`;
export const ORIGIN_WITH_SERVER = `http://127.0.0.1:${PORT + 2}`;

/** As 8 rotas do demo (W5). */
export const ROUTES = [
  '/',
  '/editor',
  '/toolbar',
  '/forms',
  '/i18n',
  '/files',
  '/render',
  '/theme',
] as const;

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
    const url = r.url();
    if (!/^(data|blob|about):/.test(url)) origins.add(new URL(url).origin);
  });
  return { messages, origins };
}

/** Espera o editor de um bloco do demo ficar editável. */
export async function editable(page: Page, scope = page.locator('main')) {
  const area = scope.locator('.ProseMirror').first();
  await expect(area).toBeVisible({ timeout: 30_000 });
  return area;
}

/** HTML canônico do primeiro `textarea[data-testid]` ou `pre[data-testid]`. */
export async function textOf(page: Page, testId: string): Promise<string> {
  const el = page.getByTestId(testId);
  return el.evaluate((node) =>
    node instanceof HTMLTextAreaElement ? node.value : (node.textContent ?? ''),
  );
}

/** Espera dois quadros: o ProseMirror lê a seleção do DOM em `selectionchange`, depois do teclado. */
export function frames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
