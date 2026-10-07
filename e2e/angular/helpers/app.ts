import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId, RteE2eState } from '../window';

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
export function editorHost(
  page: Page,
  id: RteE2eId | 'lifecycle' | 'draft' | 'draft-save' | 'paste-external',
): Locator {
  return page.locator(`rte-editor[data-testid="${id}"]`);
}

/** Espera o `Editor` do Tiptap existir no host (depois da hidratação). */
export async function waitForEditor(
  page: Page,
  id: RteE2eId | 'lifecycle' | 'draft' | 'draft-save' | 'paste-external',
): Promise<void> {
  // `expect.poll` + `evaluate`, não `waitForFunction`: no WebKit, com o
  // zone.js carregando, o `waitForFunction` às vezes resolve com uma promessa
  // da zona (valor "verdadeiro") antes de o predicado valer.
  await expect
    .poll(
      () =>
        page.evaluate((testId) => {
          const host = document.querySelector(
            `rte-editor[data-testid="${testId}"]`,
          );
          return (
            !!host &&
            !!window.rteE2e &&
            window.rteE2e.getRteEditor(host) !== null
          );
        }, id),
      // Firefox sob carga (2 workers) às vezes passa de 5 s para criar o editor
      // da página `media` (vídeo e iframes no documento).
      { timeout: 20_000 },
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

/** O editável (`.ProseMirror`) de um editor do app. */
export function editableOf(
  page: Page,
  id: RteE2eId | 'lifecycle' | 'draft' | 'draft-save' | 'paste-external',
): Locator {
  return editorHost(page, id).locator('.ProseMirror');
}

/** Valor do modelo do editor `id` (pela ponte). */
export function modelValue(page: Page, id: RteE2eId): Promise<string> {
  return page.evaluate((i) => window.rteE2e.value(i), id);
}

/** Estado do formulário do editor `id` (pela ponte). */
export function formState(page: Page, id: RteE2eId): Promise<RteE2eState> {
  return page.evaluate((i) => window.rteE2e.state(i), id);
}

/**
 * Foca o editor `id` com o cursor no fim do primeiro nó de texto `text`
 * (por posição do documento, sem depender do layout). Espera o texto chegar
 * ao documento (a carga pela ponte é aplicada na detecção de mudanças).
 */
export async function caretAfter(
  page: Page,
  id: RteE2eId,
  text: string,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ({ id, text }) => {
          const host = document.querySelector(
            `rte-editor[data-testid="${id}"]`,
          );
          const editor = host && window.rteE2e.getRteEditor(host);
          if (!editor) return false;
          let target = -1;
          editor.state.doc.descendants((node, pos) => {
            if (target < 0 && node.isText && node.text === text)
              target = pos + text.length;
            return target < 0;
          });
          if (target < 0) return false;
          editor.commands.focus(target);
          return true;
        },
        { id, text },
      ),
    )
    .toBe(true);
  // O `focus` do Tiptap é assíncrono (lição 17) e, no WebKit, foca já e de
  // novo no quadro seguinte: espera esse quadro para um `Tab` logo depois não
  // ser desfeito pelo segundo `focus`.
  await expect(editableOf(page, id)).toBeFocused();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/** Mensagens de console (todas) e erros da página, desde a chamada. */
export function collectConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  return messages;
}
