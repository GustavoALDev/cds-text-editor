import { expect, test, type Page } from '@playwright/test';
import {
  collectConsole,
  editableOf,
  editorHost,
  formState,
  gotoApp,
  waitForEditor,
} from './helpers/app';
import {
  cancelDialog,
  dialogField,
  openDialogFrom,
  openDialogOf,
  submitDialog,
} from './helpers/dialogs';
import { rteHtml, selectIn, toolbarButton } from './helpers/toolbar';

// N18 (spec 05b2a, R3, R4, R8): foco e modal com o teclado real, nos builds
// zoneless e `zone`. `showModal()` dá a inércia e o ciclo de `Tab` do
// navegador (sem *focus trap* próprio, G2): o foco começa no primeiro campo e
// não sai do diálogo; o clique no `::backdrop` não fecha (sem *light
// dismiss*, G3); `Escape` cancela e devolve o foco à origem (G4), também duas
// vezes seguidas (o *close watcher* do Chromium); aplicar devolve o foco ao
// editável com o cursor depois do trecho; nada disso toca o `[formField]`
// (D11); a seleção pendente (G13) aparece só com o diálogo aberto e não entra
// no histórico; uma carga externa com o diálogo aberto fecha como
// cancelamento (G5).

const URL_LABEL = 'Address (URL)';
const INITIAL =
  '<p>Visite <a href="https://example.com/">o site</a> e diga <span lang="fr">bonjour</span>.</p>' +
  '<figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote><figcaption><cite>Fulana de Tal</cite>, editora</figcaption></figure>' +
  '<p>Fim</p>';

function touched(page: Page): Promise<boolean> {
  return formState(page, 'dialogs').then((s) => s.touched);
}

/** Conta os eventos `close` do `<dialog>` do editor `dialogs` desde a chamada. */
async function countCloses(page: Page): Promise<() => Promise<number>> {
  await editorHost(page, 'dialogs')
    .locator('dialog.rte-dialog')
    .evaluate((d) => {
      const w = window as unknown as { __closes: number };
      w.__closes = 0;
      d.addEventListener('close', () => w.__closes++);
    });
  return () =>
    page.evaluate(() => (window as unknown as { __closes: number }).__closes);
}

for (const zone of [false, true]) {
  test.describe(`N18 (${zone ? 'zone' : 'zoneless'})`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoApp(page, '/dialogs', { zone });
      await waitForEditor(page, 'dialogs');
      await expect.poll(() => rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('foco no primeiro campo; Tab e Shift+Tab ciclam só dentro do diálogo; a página fica inerte', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'Fim', 3);
      const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await expect(dialogField(dialog, URL_LABEL)).toBeFocused();
      // Modal de verdade: o resto da página é inerte (não recebe o ponteiro).
      expect(
        await page.evaluate(() => {
          const d = document.querySelector('dialog.rte-dialog[open]');
          return !!d && d.matches(':modal');
        }),
      ).toBe(true);
      // Nenhum elemento da página fora do diálogo recebe o foco.
      await page.evaluate(() => {
        const w = window as unknown as { __outside: string[] };
        w.__outside = [];
        document.addEventListener('focusin', (e) => {
          const t = e.target as Element;
          if (!t.closest('dialog.rte-dialog'))
            w.__outside.push(`${t.tagName}.${t.className}`);
        });
      });
      // Ciclo nativo (G2, sem *focus trap* próprio): depois do último
      // controle, o Chromium e o WebKit levam o foco à interface do navegador
      // (`document.hasFocus()` falso, `activeElement` = `body`) e o próximo
      // `Tab` volta ao diálogo; o Firefox (sem interface no modo headless)
      // fica no último. Em nenhum motor o foco cai na página.
      const where = () =>
        dialog.evaluate((d) => {
          const doc = d.ownerDocument;
          if (d.contains(doc.activeElement)) return 'dialog';
          return !doc.hasFocus() && doc.activeElement === doc.body
            ? 'browser'
            : `page:${doc.activeElement?.tagName}`;
        });
      const seen = new Set<string>();
      for (const key of ['Tab', 'Shift+Tab']) {
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press(key);
          const at = await where();
          seen.add(at);
          expect(['dialog', 'browser'], `${key} ${i + 1}: ${at}`).toContain(at);
        }
      }
      expect(seen.has('dialog')).toBe(true);
      expect(
        await page.evaluate(
          () => (window as unknown as { __outside: string[] }).__outside,
        ),
      ).toEqual([]);
      // Inerte: o botão da página não recebe foco nem por `focus()`.
      expect(
        await page.evaluate(() => {
          const button = document.querySelector<HTMLElement>('#after-dialogs');
          button?.focus();
          return document.activeElement === button;
        }),
      ).toBe(false);
      await expect(dialog).toBeVisible();
      // Sem conferir o `touched` aqui: o `Tab` que leva o foco à interface do
      // navegador (Chromium, WebKit) tira o foco da janela, e isso é saída do
      // host pela regra da 05a (troca de janela, `document.hasFocus()` falso).
    });

    test('clique no ::backdrop não fecha nem muda nada', async ({ page }) => {
      await selectIn(page, 'dialogs', 'Fim');
      const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await dialogField(dialog, URL_LABEL).fill('site.com');
      const box = await dialog.boundingBox();
      if (!box) throw new Error('diálogo sem caixa');
      // Fora da caixa do diálogo: o `::backdrop` (cobre a viewport).
      await page.mouse.click(box.x / 2, box.y + box.height / 2);
      await page.mouse.click(4, 4);
      await expect(dialog).toBeVisible();
      await expect(dialogField(dialog, URL_LABEL)).toHaveValue('site.com');
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
      expect(await touched(page)).toBe(false);
    });

    test('Escape fecha e foca a origem; duas vezes seguidas fecha uma vez, sem erro', async ({
      page,
    }) => {
      const messages = collectConsole(page);
      await selectIn(page, 'dialogs', 'Fim');
      let dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await page.keyboard.press('Escape');
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect(toolbarButton(page, 'dialogs', 'Link')).toBeFocused();
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);

      await selectIn(page, 'dialogs', 'Fim');
      dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      const closes = await countCloses(page);
      await dialogField(dialog, URL_LABEL).fill('site.com');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await page.waitForTimeout(200);
      expect(await closes()).toBe(1);
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
      // O 2º Escape cai na barra (U3: volta ao editável); o foco segue no host.
      expect(
        await editorHost(page, 'dialogs').evaluate((h) =>
          h.contains(h.ownerDocument.activeElement),
        ),
      ).toBe(true);
      expect(await touched(page)).toBe(false);
      expect(messages.filter((m) => /^(error|pageerror)/.test(m))).toEqual([]);
    });

    test('aplicar devolve o foco ao editável e o texto digitado cai depois do trecho; nada toca o formulário', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'Fim');
      expect(await touched(page)).toBe(false);
      const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      expect(await touched(page)).toBe(false);
      await dialogField(dialog, URL_LABEL).fill('site.com');
      await submitDialog(dialog);
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect(editableOf(page, 'dialogs')).toBeFocused();
      await page.keyboard.type('z');
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toBe(
          INITIAL.replace(
            '<p>Fim</p>',
            '<p><a href="https://site.com/">Fim</a>z</p>',
          ),
        );
      expect(await touched(page)).toBe(false);

      // Cancelar pelo botão: foco na origem, sem toque.
      await selectIn(page, 'dialogs', 'bonjour');
      const lang = await openDialogFrom(page, 'dialogs', 'toolbar', 'lang');
      await cancelDialog(lang);
      await expect(
        toolbarButton(page, 'dialogs', 'Edit language'),
      ).toBeFocused();
      expect(await touched(page)).toBe(false);

      // Sair do host com o diálogo fechado continua tocando (N3 da 05a).
      await page.locator('#after-dialogs').focus();
      await expect.poll(() => touched(page)).toBe(true);
    });

    test('origem desabilitada (readonly com o diálogo aberto): fecha, o foco fica no editável e nada é tocado', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'Fim');
      await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await page.evaluate(() => window.rteE2e.toggle('readonly'));
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect(editableOf(page, 'dialogs')).toBeFocused();
      await page.waitForTimeout(200);
      expect(await touched(page)).toBe(false);
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('seleção pendente visível só com o diálogo aberto; Mod+Z depois de cancelar não muda nada', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'o site', 2);
      const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      const pending = editableOf(page, 'dialogs').locator(
        '.rte-pending-selection',
      );
      await expect(pending).toBeVisible();
      await expect(pending).toHaveText('o site');
      await cancelDialog(dialog);
      await expect(pending).toHaveCount(0);
      await selectIn(page, 'dialogs', 'Fim', 3);
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(200);
      expect(await rteHtml(page, 'dialogs')).toBe(INITIAL);
    });

    test('G5: carga externa com o diálogo aberto fecha como cancelamento e o documento novo fica intacto', async ({
      page,
    }) => {
      await selectIn(page, 'dialogs', 'Fim');
      const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
      await dialogField(dialog, URL_LABEL).fill('site.com');
      await page.evaluate(() =>
        window.rteE2e.setValue('dialogs', '<p>Novo documento</p>'),
      );
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
      await expect
        .poll(() => rteHtml(page, 'dialogs'))
        .toBe('<p>Novo documento</p>');
      await expect(
        editableOf(page, 'dialogs').locator('.rte-pending-selection'),
      ).toHaveCount(0);
      await page.waitForTimeout(200);
      expect(await rteHtml(page, 'dialogs')).toBe('<p>Novo documento</p>');
      expect(await touched(page)).toBe(false);
    });
  });
}
