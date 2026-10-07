// Spec 04, §6.3 S3: renderização segura do fixture sanitizado num documento
// vivo com CSP: embeds com o `sandbox` do esquema, nenhum `on*` no DOM, cores
// da paleta pelo `computedStyle` e nenhuma violação de `script-src`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  insertUnsanitizedHandlers,
  loadSanitizerPage,
  scriptViolations,
} from './helpers/sanitizer-page';

const fixture = readFileSync(
  resolve(__dirname, '../../fixtures/content/all-features.html'),
  'utf8',
).replace(/\r\n?/g, '\n');

test('S3: o fixture sanitizado renderiza com sandbox, sem on* e com as cores da paleta', async ({
  page,
}) => {
  await loadSanitizerPage(page);

  const r = await page.evaluate(async (html) => {
    const lab = window.RteSanitizerLab;
    const root = document.getElementById('root')!;
    root.innerHTML = lab.sanitizeRichText(html);
    // `securitypolicyviolation` é assíncrono: uma tarefa, um quadro e 100 ms.
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => requestAnimationFrame(() => res(0)));
    await new Promise((res) => setTimeout(res, 100));
    const red = root.querySelector<HTMLElement>('span[data-rt-color=red]');
    const yellow = root.querySelector<HTMLElement>(
      'mark[data-rt-color=yellow]',
    );
    return {
      sandbox:
        lab.getHtmlSchema().elements['iframe']!.attributes['sandbox']!.default,
      iframes: [...root.querySelectorAll('iframe')].map((f) =>
        f.getAttribute('sandbox'),
      ),
      handlers: [...root.querySelectorAll('*')].flatMap((el) =>
        [...el.attributes]
          .filter((a) => a.name.toLowerCase().startsWith('on'))
          .map((a) => `<${el.localName}> ${a.name}`),
      ),
      red: red === null ? null : getComputedStyle(red).color,
      yellow: yellow === null ? null : getComputedStyle(yellow).backgroundColor,
      violations: [...window.__violations],
      calls: window.__xssCalls,
      scriptViolations: window.__violations.filter((v) =>
        v.startsWith('script-src'),
      ),
    };
  }, fixture);

  expect(r.sandbox).toBeTruthy();
  expect(r.iframes.length).toBeGreaterThan(0);
  for (const sandbox of r.iframes) expect(sandbox).toBe(r.sandbox);
  expect(r.handlers).toEqual([]);
  expect(r.red).toBe('rgb(179, 38, 30)');
  expect(r.yellow).toBe('rgb(255, 243, 163)');
  expect(r.calls).toBe(0);
  expect(r.scriptViolations).toEqual([]);
  // Controle: o CSP está ativo e o ouvinte registra (imagens externas bloqueadas);
  // sem isto o `toEqual([])` acima não provaria nada.
  expect(r.violations.some((v) => v.startsWith('img-src'))).toBe(true);
});

test('controle: o ouvinte grava a violação de script-src de handlers inline não sanitizados', async ({
  page,
}) => {
  await loadSanitizerPage(page);
  await insertUnsanitizedHandlers(page);
  await expect
    .poll(async () => (await scriptViolations(page)).length)
    .toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__xssCalls)).toBe(0);
});
