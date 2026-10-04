import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from '../window';

/** Servidor de `e2e/angular/serve.mjs` (iniciado pelo `webServer` do Playwright). */
export const APP_URL = `http://127.0.0.1:${process.env['RTE_E2E_PORT'] ?? 4317}`;

const FIXTURES = resolve(__dirname, '../../../fixtures/content');

/** URL de uma rota do app; `zone: true` usa o build com zone.js (`/zone/…`). */
export function appUrl(path: string, options: { zone?: boolean } = {}): string {
  return `${APP_URL}${options.zone ? '/zone' : ''}${path}`;
}

/**
 * Abre uma rota do app com os coletores instalados antes de qualquer script:
 * `window.__violations` (`securitypolicyviolation`) e `window.__styleAdds`
 * (todo `<style>` acrescentado ao documento).
 */
export async function gotoApp(
  page: Page,
  path: string,
  options: { zone?: boolean } = {},
): Promise<void> {
  await page.addInitScript(() => {
    if (window.__violations) return;
    window.__violations = [];
    window.__styleAdds = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__violations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI,
        sample: e.sample,
      });
    });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const styles = node.matches('style')
            ? [node]
            : [...node.querySelectorAll('style')];
          for (const style of styles) {
            window.__styleAdds.push((style.textContent ?? '').slice(0, 80));
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(appUrl(path, options));
}

/** O elemento host `rte-editor` de um editor do app. */
export function editorHost(page: Page, id: RteE2eId | 'lifecycle'): Locator {
  return page.locator(`rte-editor[data-testid="${id}"]`);
}

/** Espera o `Editor` do Tiptap existir no host (depois da hidratação). */
export async function waitForEditor(
  page: Page,
  id: RteE2eId | 'lifecycle',
): Promise<void> {
  // `expect.poll` + `evaluate`, não `waitForFunction`: no WebKit, com o
  // zone.js carregando, o `waitForFunction` às vezes resolve com uma promessa
  // da zona (valor "verdadeiro") antes de o predicado valer.
  await expect
    .poll(() =>
      page.evaluate((testId) => {
        const host = document.querySelector(
          `rte-editor[data-testid="${testId}"]`,
        );
        return (
          !!host && !!window.rteE2e && window.rteE2e.getRteEditor(host) !== null
        );
      }, id),
    )
    .toBe(true);
}

/** Conteúdo de `fixtures/content/<name>`. */
export function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8');
}

/** Deixa os eventos assíncronos (violações de CSP) chegarem: tarefa, quadro, tarefa. */
export async function settlePage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    await new Promise((r) => setTimeout(r, 100));
  });
}
