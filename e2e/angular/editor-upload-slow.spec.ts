import { expect, test } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';
import {
  paddedWebmFile,
  tray,
  uniqueName,
  uploadInPage,
  uploadLog,
} from './helpers/upload';

// N64 (spec 08b, R4; §4): envio em rede lenta. `Network.emulateNetworkConditions` (CDP, só
// Chromium) limita o envio a ~100 kbps. O `<progress>` da bandeja cresce, a região `aria-live`
// NÃO anuncia o progresso (ADR 0013, E8: um anúncio por gesto, progresso não é anunciado) e o
// cancelamento a meio de verdade aborta a requisição (marcador some, o servidor a vê abortada).

const ID = 'upload';
const BYTES = 200 * 1024;
/** ~100 kbps em bytes por segundo. */
const THROUGHPUT = 12_500;

for (const zone of [false, true]) {
  test.describe(`N64 envio em rede lenta (${zone ? 'zone.js' : 'zoneless'})`, () => {
    test.skip(
      ({ browserName }) => browserName !== 'chromium',
      'N64 usa o CDP (Network.emulateNetworkConditions), só no Chromium',
    );

    test('progresso cresce sem inundar a região viva e o cancelamento a meio aborta', async ({
      page,
      context,
      request,
    }) => {
      test.setTimeout(120_000);
      await gotoApp(page, '/upload', { zone });
      await waitForEditor(page, ID);
      await page.evaluate(() => window.rteE2e.setUpload('upload', 'http'));

      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 50,
        downloadThroughput: -1,
        uploadThroughput: THROUGHPUT,
      });

      const live = page.locator(
        `rte-editor[data-testid="${ID}"] [aria-live="polite"]`,
      );
      // registra cada mudança de texto das regiões vivas do editor
      await page.evaluate((id) => {
        const w = window as unknown as { __announced: string[] };
        w.__announced = [];
        const host = document.querySelector(`rte-editor[data-testid="${id}"]`);
        const seen = (): void => {
          for (const el of host?.querySelectorAll('[aria-live]') ?? []) {
            const text = el.textContent?.trim();
            if (text && w.__announced.at(-1) !== text) w.__announced.push(text);
          }
        };
        new MutationObserver(seen).observe(host as Node, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      }, ID);

      const name = uniqueName('lento', 'webm');
      expect(await uploadInPage(page, ID, [paddedWebmFile(name, BYTES)])).toBe(
        1,
      );
      const bar = tray(page, ID).locator('progress').first();
      await expect(bar).toBeVisible();

      // o valor do <progress> cresce em pelo menos duas leituras distintas
      const values: number[] = [];
      await expect
        .poll(
          async () => {
            const value = await bar.getAttribute('value');
            if (value !== null) {
              const n = Number(value);
              if (values.at(-1) !== n) values.push(n);
            }
            return values.length;
          },
          { timeout: 30_000, intervals: [250] },
        )
        .toBeGreaterThanOrEqual(2);
      expect(values[values.length - 1]).toBeGreaterThan(values[0] ?? 0);

      // progresso não é anunciado: só o anúncio do gesto, sem percentuais
      const announced = await page.evaluate(
        () => (window as unknown as { __announced: string[] }).__announced,
      );
      expect(announced.length).toBeLessThanOrEqual(2);
      for (const text of announced) expect(text).not.toMatch(/\d+\s?%/);
      await expect(live.first()).toBeAttached();

      // cancelamento a meio: aborta de verdade
      await expect(
        editableOf(page, ID).locator('.rte-upload-marker'),
      ).toBeVisible();
      await tray(page, ID)
        .locator('button.rte-uploads__cancel')
        .first()
        .click();
      await expect(tray(page, ID)).toHaveCount(0);
      await expect(
        editableOf(page, ID).locator('.rte-upload-marker'),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => window.rteE2e.pendingUploads('upload')),
      ).toBe(0);
      await expect
        .poll(
          async () =>
            (await uploadLog(request))
              .filter((e) => e.name === name)
              .map((e) => e.aborted),
          { timeout: 15_000 },
        )
        .toEqual([true]);
      expect(
        await page.locator(`rte-editor[data-testid="${ID}"] video`).count(),
      ).toBe(0);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    });
  });
}
