import { expect, test, type Page } from '@playwright/test';
import { editableOf, gotoApp, waitForEditor } from './helpers/app';

// N41 (spec 05c2b, S11, R7): URL colada num parágrafo vazio vira embed; no
// meio do texto segue como hoje. Rota `paste-external`, CSP estrita, nos
// builds zoneless e zone.js. Chromium. (O iframe do provedor é bloqueado pela
// CSP desta rota: esperado; só o DOM importa.)

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/** Despacha um `paste` cancelável com `text/plain`; devolve `defaultPrevented`. */
function paste(page: Page, text: string): Promise<boolean> {
  return page.evaluate((text) => {
    const target = document.querySelector(
      'rte-editor[data-testid="paste-external"] .ProseMirror',
    ) as HTMLElement;
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, text);
}

for (const zone of [false, true]) {
  test.describe(`N41 colar URL (${zone ? 'zone.js' : 'zoneless'})`, () => {
    test.skip(
      ({ browserName }) => browserName !== 'chromium',
      'N41 roda só no Chromium',
    );

    async function open(page: Page): Promise<void> {
      await gotoApp(page, '/paste-external', { zone });
      await waitForEditor(page, 'paste-external');
    }

    test('URL em parágrafo vazio vira embed; Mod+Z desfaz', async ({
      page,
    }) => {
      await open(page);
      const editable = editableOf(page, 'paste-external');
      await editable.locator('p').first().click();
      expect(await paste(page, YT)).toBe(true);
      await expect(editable.locator('iframe')).toHaveCount(1);
      await expect(page.getByTestId('html')).toContainText('rt-embed');
      await page.keyboard.press('ControlOrMeta+z');
      await expect(editable.locator('iframe')).toHaveCount(0);
    });

    test('no meio do texto segue como hoje', async ({ page }) => {
      await open(page);
      const editable = editableOf(page, 'paste-external');
      await editable.locator('p').nth(1).click();
      await page.keyboard.press('End');
      // Digitar sincroniza a seleção do ProseMirror (o clique é assíncrono).
      await page.keyboard.type('!');
      await expect(editable.locator('p').nth(1)).toHaveText('Texto!');
      await paste(page, YT);
      await expect(editable.locator('iframe')).toHaveCount(0);
      await expect(editable.locator('p').nth(1)).toContainText(YT);
      await expect(editable.locator('p a')).toHaveCount(1);
    });
  });
}
