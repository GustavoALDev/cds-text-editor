import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  appUrl,
  caretAfter,
  collectConsole,
  editableOf,
  gotoApp,
  waitForEditor,
} from './helpers/app';
import { contrastRatio, effectiveBackground, toRgb } from './helpers/contrast';
import {
  cancelDialog,
  dialogField,
  openDialogFrom,
  submitDialog,
} from './helpers/dialogs';
import {
  dropFiles,
  pasteFiles,
  pngFile,
  slowPngFile,
  tray,
  uniqueName,
  uploadInPage,
} from './helpers/upload';

// N38 (spec 05c2a, R11, R14, R15; Tarefa 13): o que o N36 (axe da bandeja,
// CSP da `upload-preview`) não cobre: axe com a bandeja em envio determinado,
// indeterminado (fila) e com o diálogo em "Arquivo" (sem e com erro), em claro,
// escuro e `forced-colors` (emulação antes da carga, como no N14); contraste
// do nome, do botão e da dica (>= 4,5) e do `<progress>` (>= 3); alvos >= 24 x
// 24; a região `aria-live` (início, conclusão, cancelamento, erro; nada no
// progresso); 0 violações de CSP na rota `upload` em todas as fases; HTML do
// servidor com a região vazia e sem bandeja/marcador; console sem `NG05`; e,
// no build zone, no máximo um `tick` da zona por quadro durante um envio.

const ID = 'upload';

async function severe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
}

const STATUS = `rte-editor[data-testid="${ID}"] .rte-uploads__status`;

/** Contraste (cor do texto ou do `accent-color`) sobre o fundo efetivo do `selector`. */
async function ratio(
  page: Page,
  selector: string,
  prop: 'color' | 'accentColor',
): Promise<number> {
  const fg = await page.evaluate(
    ({ selector, prop }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`sem ${selector}`);
      return getComputedStyle(el)[prop];
    },
    { selector, prop },
  );
  const bg = await effectiveBackground(page, selector);
  return contrastRatio(await toRgb(page, fg), bg);
}

for (const scheme of ['light', 'dark', 'forced'] as const) {
  test(`N38 (${scheme}): axe, contraste e alvos da bandeja e do diálogo "Arquivo"`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    if (scheme === 'forced') {
      await page.emulateMedia({ forcedColors: 'active' });
    } else {
      await page.emulateMedia({ colorScheme: scheme });
    }
    await gotoApp(page, '/upload');
    await waitForEditor(page, ID);
    if (scheme === 'forced') {
      const active = await page.evaluate(
        () => matchMedia('(forced-colors: active)').matches,
      );
      if (browserName === 'chromium') expect(active).toBe(true);
      test.skip(
        !active,
        `${browserName}: emulateMedia({forcedColors}) não ativa (forced-colors: active) neste motor`,
      );
    }

    // Bandeja: envio determinado (?slow=1), depois indeterminado (na fila).
    await page.evaluate(() =>
      window.rteE2e.setUpload('upload', 'http', '?slow=1'),
    );
    const slow = uniqueName('det', 'png');
    expect(await uploadInPage(page, ID, [slowPngFile(slow)])).toBe(1);
    const bar = tray(page, ID).locator('progress').first();
    await expect(bar).toHaveAttribute('value', /.+/, { timeout: 15_000 });
    expect(await severe(page), 'bandeja determinada: axe').toEqual([]);
    await page.evaluate(() => window.rteE2e.cancelAllUploads('upload'));
    await expect(tray(page, ID)).toHaveCount(0);

    await page.evaluate(() => window.rteE2e.setUpload('upload', 'http'));
    const names = ['a', 'b', 'c'].map((n) => uniqueName(n, 'png', 4000));
    expect(await uploadInPage(page, ID, names.map(pngFile))).toBe(3);
    const items = tray(page, ID).locator('.rte-uploads__item');
    await expect(items).toHaveCount(3);
    const queued = items.nth(2).locator('progress');
    expect(await queued.getAttribute('value')).toBeNull();
    expect(await severe(page), 'bandeja indeterminada e na fila: axe').toEqual(
      [],
    );

    const sel = (part: string) =>
      `rte-editor[data-testid="${ID}"] .rte-uploads__item:first-child ${part}`;
    const small = await tray(page, ID)
      .locator('button')
      .evaluateAll((els) =>
        els
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { name: el.tagName, w: r.width, h: r.height };
          })
          .filter((s) => s.h < 24 || s.w < 24),
      );
    expect(small, 'alvos da bandeja').toEqual([]);
    if (scheme !== 'forced') {
      expect(
        await ratio(page, sel('.rte-uploads__name'), 'color'),
        'nome',
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await ratio(page, sel('button'), 'color'),
        'botão',
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await ratio(page, sel('progress'), 'accentColor'),
        'progress',
      ).toBeGreaterThanOrEqual(3);
    }
    await page.evaluate(() => window.rteE2e.cancelAllUploads('upload'));
    await expect(tray(page, ID)).toHaveCount(0);

    // Diálogo "Arquivo", sem e com erro.
    await caretAfter(page, ID, 'Upload here');
    const dialog = await openDialogFrom(page, ID, 'toolbar', 'image');
    await expect(dialogField(dialog, 'File')).toBeChecked();
    await expect(dialog).toHaveAccessibleName('Insert image');
    expect(await severe(page), 'diálogo Arquivo: axe').toEqual([]);
    await submitDialog(dialog);
    await expect(dialog.locator('.rte-dialog__error').first()).toBeVisible();
    expect(await severe(page), 'diálogo Arquivo com erro: axe').toEqual([]);
    const targets = await dialog
      .locator('input, select, button')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => {
            const input = el as HTMLInputElement;
            const label = input.labels?.[0]?.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return {
              name: `${el.tagName}.${el.className}`,
              w: Math.max(r.width, label?.width ?? 0),
              h: Math.max(r.height, label?.height ?? 0),
            };
          })
          .filter((s) => s.w < 24 || s.h < 24),
      );
    expect(targets, 'alvos do diálogo').toEqual([]);
    if (scheme !== 'forced') {
      expect(
        await ratio(page, 'dialog .rte-dialog__hint', 'color'),
        'dica do diálogo',
      ).toBeGreaterThanOrEqual(4.5);
    }
    await cancelDialog(dialog);
  });
}

test.describe('N38: região aria-live, CSP, SSR e ticks', () => {
  test('anuncia início, conclusão, cancelamento e erro; nada durante o progresso; 0 violações de CSP', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoApp(page, '/upload');
    await waitForEditor(page, ID);
    const status = page.locator(STATUS);
    await expect(status).toHaveText('');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await page.evaluate((sel) => {
      const w = window as unknown as { __said: string[] };
      w.__said = [];
      const el = document.querySelector(sel) as Element;
      new MutationObserver(() => {
        const text = (el.textContent ?? '').trim();
        if (text && w.__said.at(-1) !== text) w.__said.push(text);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    }, STATUS);
    const said = () =>
      page.evaluate(() => (window as unknown as { __said: string[] }).__said);

    // Início e conclusão, com progresso contínuo no meio (nada anunciado nele).
    await page.evaluate(() =>
      window.rteE2e.setUpload('upload', 'http', '?slow=1'),
    );
    const done = uniqueName('ok', 'png');
    expect(await uploadInPage(page, ID, [slowPngFile(done)])).toBe(1);
    await expect(status).toHaveText('Uploading 1 file.');
    await expect(status).toHaveText(`${done} uploaded.`, { timeout: 20_000 });
    expect(await said()).toEqual(['Uploading 1 file.', `${done} uploaded.`]);

    // Cancelamento.
    await page.evaluate(() => window.rteE2e.setUpload('upload', 'http'));
    const cancelled = uniqueName('cx', 'png', 6000);
    expect(await uploadInPage(page, ID, [pngFile(cancelled)])).toBe(1);
    await tray(page, ID)
      .getByRole('button', { name: `Cancel upload of ${cancelled}` })
      .click();
    await expect(status).toHaveText(`Upload of ${cancelled} cancelled.`);

    // Erro.
    await page.evaluate(() =>
      window.rteE2e.setUpload('upload', 'http', '?status=500'),
    );
    const bad = uniqueName('er', 'png');
    expect(await uploadInPage(page, ID, [pngFile(bad)])).toBe(1);
    await expect(status).toContainText(`Could not upload ${bad}`);

    // Colar e soltar na mesma rota (fases pedidas para a CSP).
    await page.evaluate(() => window.rteE2e.setUpload('upload', 'http'));
    await caretAfter(page, ID, 'Upload here');
    await pasteFiles(page, ID, [pngFile(uniqueName('pa', 'png', 300))]);
    await expect(tray(page, ID)).toHaveCount(0, { timeout: 15_000 });
    await dropFiles(page, ID, [pngFile(uniqueName('dr', 'png', 300))]);
    await expect(tray(page, ID)).toHaveCount(0, { timeout: 15_000 });
    await expect(editableOf(page, ID)).toBeVisible();
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  for (const zone of [false, true]) {
    test(`SSR com a região vazia, sem bandeja nem marcador; console sem NG05 (${zone ? 'zone' : 'zoneless'})`, async ({
      page,
      request,
    }) => {
      const raw = await (await request.get(appUrl('/upload', { zone }))).text();
      expect(raw).toContain('data-testid="upload"');
      expect(raw).toMatch(/class="rte-uploads__status"[^>]*>(<!---->)?<\/div>/);
      expect(raw).not.toContain('rte-uploads"');
      expect(raw).not.toContain('rte-upload-marker');
      const messages = collectConsole(page);
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, ID);
      await expect(page.locator(STATUS)).toHaveText('');
      expect(messages.filter((m) => /NG0\d/.test(m))).toEqual([]);
    });
  }

  test('build zone: no máximo um tick da zona por quadro durante um envio', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoApp(page, '/upload', { zone: true });
    await waitForEditor(page, ID);
    await page.evaluate(() =>
      window.rteE2e.setUpload('upload', 'http', '?slow=1'),
    );
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number; __raf: boolean };
      w.__frames = 0;
      w.__raf = true;
      const loop = () => {
        w.__frames++;
        if (w.__raf) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const before = await page.evaluate(() => window.rteE2e.zoneTurns());
    const name = uniqueName('tk', 'png');
    expect(await uploadInPage(page, ID, [slowPngFile(name)])).toBe(1);
    await expect(tray(page, ID)).toHaveCount(1);
    await expect(tray(page, ID)).toHaveCount(0, { timeout: 30_000 });
    const { turns, frames } = await page.evaluate(() => {
      const w = window as unknown as { __frames: number; __raf: boolean };
      w.__raf = false;
      return { turns: window.rteE2e.zoneTurns(), frames: w.__frames };
    });
    expect(turns - before).toBeGreaterThan(0);
    expect(turns - before).toBeLessThanOrEqual(frames + 5);
  });
});
