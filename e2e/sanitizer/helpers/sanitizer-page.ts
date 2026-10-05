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
 * `securitypolicyviolation` em `window.__sanitizerViolations`.
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
    window.__sanitizerViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__sanitizerViolations.push(
        `${e.effectiveDirective} ${e.blockedURI}`,
      );
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

/** Violações de `script-src*` gravadas até agora na página. */
export function scriptViolations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.__sanitizerViolations.filter((v) => v.startsWith('script-src')),
  );
}

/**
 * Espera os recursos de `#root` assentarem: cada `img` termina de carregar ou
 * falha (é aí que um `onerror` dispararia), depois uma tarefa, um quadro e
 * 100 ms para os `securitypolicyviolation` assíncronos chegarem. Imagens
 * `loading="lazy"` fora da tela nunca carregam sem rolagem (e nunca disparam
 * `onerror`), então não entram na espera; um teto de 5 s evita travar o teste.
 */
export async function settleRoot(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const imgs = [
      ...document.querySelectorAll<HTMLImageElement>('#root img'),
    ].filter((img) => !img.complete && img.loading !== 'lazy');
    const settled = Promise.all(
      imgs.map(
        (img) =>
          new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          }),
      ),
    );
    await Promise.race([settled, new Promise((res) => setTimeout(res, 5000))]);
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => requestAnimationFrame(() => res(0)));
    await new Promise((res) => setTimeout(res, 100));
  });
}

/**
 * Controle positivo do ouvinte de CSP: insere HTML **não sanitizado** com
 * handlers inline (`<img onerror>` e `<a onclick>`, que é clicado). O CSP
 * (sem `unsafe-inline`) bloqueia os handlers, então `__xss` nunca roda; o
 * sinal é a violação de `script-src*` gravada pelo ouvinte. Sem este controle,
 * "nenhuma violação de `script-src`" nos testes não provaria nada.
 */
export async function insertUnsanitizedHandlers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    root.innerHTML =
      '<img src="x" onerror="alert(1)"><a id="control" href="#" onclick="alert(1)">x</a>';
  });
  await page.click('#control');
}
