import { expect, test, type Page } from '@playwright/test';
import {
  appUrl,
  collectConsole,
  editorHost,
  gotoApp,
  waitForEditor,
} from './helpers/app';

test.describe('compat: angular/editor-ssr', { tag: '@compat' }, () => {
  // N4 (spec 05a, R12, D19): o HTML pré-renderizado traz só a casca (moldura,
  // editável falso com nome acessível e placeholder), sem `.ProseMirror` nem o
  // HTML do valor; no navegador a hidratação reaproveita o DOM do servidor, sem
  // mensagens `NG05xx`, e a casca troca pelo editor sem mudar a altura da
  // moldura do editor vazio. Nos builds zoneless e `zone`. Spec 05b1 (R7, U10):
  // a barra `article` sai na casca com todos os botões `disabled` nativos e a
  // moldura com a barra não muda de altura na troca casca → editor.

  /** Altura da moldura do editor `plain` (`''`). */
  function frameHeight(page: Page): Promise<number> {
    return editorHost(page, 'plain')
      .locator('.rte-editor__frame')
      .evaluate((el) => el.getBoundingClientRect().height);
  }

  for (const zone of [false, true]) {
    const build = zone ? 'zone' : 'zoneless';

    test(`N4 (${build}): HTML do servidor só com a casca, sem o valor`, async ({
      request,
    }) => {
      const forms = await (
        await request.get(appUrl('/forms', { zone }))
      ).text();
      expect(forms.match(/rte-editor__shell/g)).toHaveLength(3);
      expect(forms).toContain('role="textbox"');
      expect(forms).toContain('aria-label="Signal Forms"');
      expect(forms).toContain('aria-label="Plain value"');
      expect(forms).toContain('data-placeholder="Write here"');
      expect(forms).not.toContain('ProseMirror');
      // A barra na casca: uma por editor, todos os botões `disabled`.
      expect(forms.match(/<rte-toolbar[^>]*role="toolbar"/g)).toHaveLength(3);
      const buttons =
        forms.match(/<button[^>]*rte-toolbar__button[^>]*>/g) ?? [];
      expect(buttons.length).toBeGreaterThan(3 * 15);
      expect(buttons.filter((b) => !/\sdisabled(?:=""|\s|>)/.test(b))).toEqual(
        [],
      );

      // `/labels` tem valor inicial (tarefa e caixa): o servidor não o renderiza.
      const labels = await (
        await request.get(appUrl('/labels', { zone }))
      ).text();
      expect(labels).toContain('rte-editor__shell');
      expect(labels).toContain('aria-label="Rich text editor"');
      expect(labels).not.toContain('ProseMirror');
      expect(labels).not.toContain('rt-task');
      expect(labels).not.toContain('rt-callout');
      expect(labels).not.toContain('data-placeholder');
    });

    test(`N4 (${build}): hidratação sem NG05xx, DOM reaproveitado e moldura do mesmo tamanho`, async ({
      browser,
      page,
    }) => {
      // Sem JavaScript: a casca do servidor.
      const noJs = await browser.newContext({ javaScriptEnabled: false });
      const staticPage = await noJs.newPage();
      await staticPage.goto(appUrl('/forms', { zone }));
      await expect(
        editorHost(staticPage, 'plain').locator('.rte-editor__shell'),
      ).toBeVisible();
      await expect(staticPage.locator('.ProseMirror')).toHaveCount(0);
      const toolbar = editorHost(staticPage, 'plain').locator('.rte-toolbar');
      await expect(toolbar).toBeVisible();
      expect(
        await toolbar.locator('.rte-toolbar__button:not(:disabled)').count(),
      ).toBe(0);
      const shellHeight = await frameHeight(staticPage);
      await noJs.close();
      expect(shellHeight).toBeGreaterThan(0);

      // Com JavaScript: o host do servidor é guardado assim que o parser o cria.
      const messages = collectConsole(page);
      await page.addInitScript(() => {
        const w = window as unknown as { __ssrHost?: Element };
        new MutationObserver((_, observer) => {
          const host = document.querySelector(
            'rte-editor[data-testid="plain"]',
          );
          if (host && !w.__ssrHost) {
            w.__ssrHost = host;
            observer.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await gotoApp(page, '/forms', { zone });
      for (const id of ['signal', 'reactive', 'plain'] as const) {
        await waitForEditor(page, id);
      }
      await expect
        .poll(() =>
          page.evaluate(() => window.rteE2e.readyAt.plain !== undefined),
        )
        .toBe(true);
      const host = editorHost(page, 'plain');
      await expect(host.locator('.rte-editor__shell')).toHaveCount(0);
      await expect(host.locator('.ProseMirror')).toHaveCount(1);

      // Hidratação (não uma renderização destrutiva): o mesmo elemento host.
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __ssrHost?: Element }).__ssrHost ===
            document.querySelector('rte-editor[data-testid="plain"]'),
        ),
      ).toBe(true);

      const editorHeight = await frameHeight(page);
      expect(Math.abs(editorHeight - shellHeight)).toBeLessThanOrEqual(0.5);

      // Editor funcional depois da hidratação.
      await host.locator('.ProseMirror').click();
      await page.keyboard.type('ok');
      await expect
        .poll(() => page.evaluate(() => window.rteE2e.value('plain')))
        .toBe('<p>ok</p>');

      expect(messages.filter((m) => /NG0?5\d\d/.test(m))).toEqual([]);
      expect(messages.filter((m) => /^(error|pageerror):/.test(m))).toEqual([]);
    });
  }
});
