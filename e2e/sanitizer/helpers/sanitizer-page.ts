import type { Page } from '@playwright/test';
import { sanitizerBundle } from './sanitizer-bundle';

export const ORIGIN = 'https://sanitizer.test';

/**
 * CSP da página (pré-voo 6 do plano da spec 04): sem `unsafe-inline` para
 * scripts; `style-src-attr` liberado para o `computedStyle` das cores. Toda
 * violação com `effectiveDirective` começando por `script-src` conta como XSS.
 */
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; media-src 'self'; frame-src 'self'";

const HTML =
  '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>';

/**
 * Abre `ORIGIN/` com o CSP acima e o bundle em `/bundle.js`; toda outra
 * requisição (imagens, mídia e embeds) é abortada. Antes de qualquer script da
 * página, define a sentinela `window.__xss` (conta em `window.__xssCalls`;
 * `alert`, `confirm` e `prompt` passam por ela) e grava cada
 * `securitypolicyviolation` em `window.__violations`.
 */
export async function loadSanitizerPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__xssCalls = 0;
    window.__xss = () => {
      window.__xssCalls++;
    };
    // Os payloads dos corpora chamam `alert(1)`: os diálogos também são a sentinela.
    window.alert = () => {
      window.__xss();
    };
    window.confirm = () => {
      window.__xss();
      return false;
    };
    window.prompt = () => {
      window.__xss();
      return null;
    };
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  const headers = { 'content-security-policy': CSP };
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === `${ORIGIN}/`) {
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'text/html; charset=utf-8',
        body: HTML,
      });
    }
    if (url === `${ORIGIN}/bundle.js`) {
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'text/javascript; charset=utf-8',
        body: sanitizerBundle(),
      });
    }
    return route.abort();
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => typeof window.RteSanitizerLab === 'object');
}
