import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { editorHost, gotoApp, waitForEditor } from './helpers/app';
import { contrastRatio, toRgb } from './helpers/contrast';
import {
  cancelDialog,
  dialogField,
  openDialogFrom,
  openDialogOf,
  submitDialog,
  type DialogKind,
} from './helpers/dialogs';
import { rteHtml, selectIn } from './helpers/toolbar';

// N19 (spec 05b2a, R14, R15, R16): cada diálogo aberto, sem e com erro
// visível, em claro, escuro e `forced-colors` (emulação antes da carga, como
// no N14) → axe sem `serious`/`critical`; nome acessível = título; contraste
// de rótulos, dicas e erros; foco visível (`--rte-focus-width`) em campo e
// botão; alvos >= 24 x 24; o "Aplicar" herda a primária do tema de cada
// instância; troca de idioma ao vivo com o diálogo aberto; viewport de 320 px
// sem rolagem horizontal.

interface DialogCase {
  kind: DialogKind;
  /** Texto e posição da seleção que tornam o diálogo aplicável. */
  select: [text: string, from?: number, to?: number];
  title: string;
  /** Deixa um erro visível (envio inválido). */
  invalidate(dialog: Locator): Promise<void>;
}

const CASES: DialogCase[] = [
  {
    kind: 'link',
    select: ['Fim', 3],
    title: 'Insert link',
    invalidate: (dialog) => submitDialog(dialog),
  },
  {
    kind: 'lang',
    select: ['Fim'],
    title: 'Mark language',
    invalidate: async (dialog) => {
      await dialogField(dialog, 'Language').selectOption({ label: 'Other…' });
      await dialogField(dialog, 'Language code (BCP 47)').fill('en_US');
      await submitDialog(dialog);
    },
  },
  {
    kind: 'quoteAuthor',
    select: ['Uma frase marcante.', 3],
    title: 'Quote author',
    invalidate: async (dialog) => {
      // O `maxlength` nativo impede digitar além de 200 (pré-voo 2).
      await dialogField(dialog, 'Author').evaluate(
        (input: HTMLInputElement) => {
          input.value = 'a'.repeat(201);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        },
      );
      await submitDialog(dialog);
    },
  },
  {
    kind: 'table',
    select: ['Fim', 3],
    title: 'Insert table',
    invalidate: async (dialog) => {
      await dialogField(dialog, 'Rows').fill('0');
      await submitDialog(dialog);
    },
  },
];

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

/**
 * Contraste (WCAG 2) de cada rótulo, dica e erro do diálogo sobre o fundo
 * efetivo (o primeiro ancestral com fundo não transparente).
 */
async function textContrasts(page: Page, dialog: Locator) {
  const pairs = await dialog.evaluate((d) =>
    [
      ...d.querySelectorAll(
        '.rte-dialog__title, .rte-dialog__label, .rte-dialog__hint, .rte-dialog__error',
      ),
    ].map((el) => {
      let node: Element | null = el;
      let bg = 'rgb(255, 255, 255)';
      while (node) {
        const value = getComputedStyle(node).backgroundColor;
        if (value !== 'transparent' && !/\/ 0\)$|, 0\)$/.test(value)) {
          bg = value;
          break;
        }
        node = node.parentElement;
      }
      return {
        text: (el.textContent ?? '').trim().slice(0, 30),
        fg: getComputedStyle(el).color,
        bg,
      };
    }),
  );
  const out: { text: string; ratio: number }[] = [];
  for (const { text, fg, bg } of pairs) {
    const ratio = contrastRatio(await toRgb(page, fg), await toRgb(page, bg));
    out.push({ text, ratio: Math.round(ratio * 100) / 100 });
  }
  return out;
}

/** Controles do diálogo menores que 24 x 24. */
function smallTargets(dialog: Locator) {
  return dialog.locator('input, select, button').evaluateAll((els) =>
    els
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: `${el.tagName}.${el.className}`,
          width: r.width,
          height: r.height,
        };
      })
      .filter((s) => s.width < 24 || s.height < 24),
  );
}

async function openCase(page: Page, c: DialogCase): Promise<Locator> {
  await selectIn(page, 'dialogs', ...c.select);
  return openDialogFrom(page, 'dialogs', 'toolbar', c.kind);
}

for (const scheme of ['light', 'dark', 'forced'] as const) {
  test(`N19 (${scheme}): cada diálogo sem e com erro: axe, nome acessível, contraste e alvos`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);
    if (scheme === 'forced') {
      await page.emulateMedia({ forcedColors: 'active' });
    } else {
      await page.emulateMedia({ colorScheme: scheme });
    }
    // Firefox não reavalia @media de folhas já carregadas ao mudar a
    // emulação: a emulação vem antes da carga (como no N14).
    await gotoApp(page, '/dialogs');
    await waitForEditor(page, 'dialogs');
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
    for (const c of CASES) {
      const dialog = await openCase(page, c);
      await expect(dialog).toHaveAccessibleName(c.title);
      expect(await severe(page), `${c.kind} sem erro`).toEqual([]);
      expect(await smallTargets(dialog), c.kind).toEqual([]);

      await c.invalidate(dialog);
      await expect(dialog.locator('.rte-dialog__error').first()).toBeVisible();
      expect(await severe(page), `${c.kind} com erro`).toEqual([]);
      // O erro é ligado ao campo pelo `aria-describedby` (sem `aria-live`).
      const errorId = await dialog
        .locator('.rte-dialog__error')
        .first()
        .getAttribute('id');
      expect(errorId).toBeTruthy();
      await expect(
        dialog.locator('[aria-invalid="true"]').first(),
      ).toHaveAttribute('aria-describedby', new RegExp(`\\b${errorId}\\b`));
      await expect(dialog.locator('[aria-live]')).toHaveCount(0);
      if (scheme !== 'forced') {
        const low = (await textContrasts(page, dialog)).filter(
          (r) => r.ratio < 4.5,
        );
        expect(low, `${c.kind}: contraste < 4,5`).toEqual([]);
      }
      await cancelDialog(dialog);
      await expect(openDialogOf(page, 'dialogs')).toHaveCount(0);
    }
  });
}

test('N19: foco visível (outline de --rte-focus-width) em campo e botão', async ({
  page,
}) => {
  await gotoApp(page, '/dialogs');
  await waitForEditor(page, 'dialogs');
  const outline = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return {
        cls: el.className,
        width: s.outlineWidth,
        style: s.outlineStyle,
        token: s.getPropertyValue('--rte-focus-width').trim(),
      };
    });
  await selectIn(page, 'dialogs', 'Fim', 3);
  const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
  await expect(dialogField(dialog, 'Address (URL)')).toBeFocused();
  const field = await outline();
  expect(field.cls).toContain('rte-dialog__input');
  expect(field.style).toBe('solid');
  expect(field.width).toBe(field.token);
  // Teclado até o "Aplicar" (URL → Texto → nova aba → Cancelar → Aplicar).
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  await expect(dialog.locator('.rte-dialog__apply')).toBeFocused();
  const button = await outline();
  expect(button.style).toBe('solid');
  expect(button.width).toBe(button.token);
  expect(button.width).toBe('2px');
});

test('N19 (R14): o "Aplicar" herda a primária do tema de cada instância', async ({
  page,
}) => {
  await gotoApp(page, '/dialogs');
  await waitForEditor(page, 'dialogs');
  await waitForEditor(page, 'dialogs-api');
  const applyColor = (dialog: Locator) =>
    dialog
      .locator('.rte-dialog__apply')
      .evaluate((b) => getComputedStyle(b).backgroundColor);

  await selectIn(page, 'dialogs', 'Fim', 3);
  let dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
  const main = await applyColor(dialog);
  await cancelDialog(dialog);

  await selectIn(page, 'dialogs-api', 'Fim', 3);
  dialog = await openDialogFrom(page, 'dialogs-api', 'api', 'link');
  const alt = await applyColor(dialog);
  await cancelDialog(dialog);

  expect(main).not.toBe(alt);
  // Cada um igual ao `--rte-primary` do próprio host.
  for (const [id, color] of [
    ['dialogs', main],
    ['dialogs-api', alt],
  ] as const) {
    const primary = await editorHost(page, id).evaluate((host) => {
      const probe = host.ownerDocument.createElement('span');
      probe.className = 'e2e-probe';
      host.append(probe);
      probe.style.setProperty('color', 'var(--rte-primary)');
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    expect(await toRgb(page, color)).toBe(await toRgb(page, primary));
  }
});

test('N19 (R16): idioma ao vivo com o diálogo aberto e o erro visível', async ({
  page,
}) => {
  await gotoApp(page, '/dialogs');
  await waitForEditor(page, 'dialogs');
  const before = await rteHtml(page, 'dialogs');
  await selectIn(page, 'dialogs', 'Fim', 3);
  const dialog = await openDialogFrom(page, 'dialogs', 'toolbar', 'link');
  await dialogField(dialog, 'Address (URL)').fill('javascript:x');
  await dialogField(dialog, 'Text').fill('texto');
  await submitDialog(dialog);
  await expect(dialog.locator('.rte-dialog__error')).toHaveText(
    'Address not accepted. Check the format or use another address.',
  );

  await page.evaluate(() => window.rteE2e.setLang('pt-BR'));
  await expect(dialog).toHaveAccessibleName('Inserir link');
  await expect(dialog.locator('.rte-dialog__title')).toHaveText('Inserir link');
  await expect(dialogField(dialog, 'Endereço (URL)')).toHaveValue(
    'javascript:x',
  );
  await expect(dialogField(dialog, 'Texto')).toHaveValue('texto');
  await expect(dialog.locator('.rte-dialog__hint')).toHaveText(
    'Por exemplo: site.com, nome@site.com ou https://site.com/pagina',
  );
  await expect(dialog.locator('.rte-dialog__error')).toHaveText(
    'Endereço não aceito. Confira o formato ou use outro endereço.',
  );
  await expect(dialog.locator('.rte-dialog__cancel')).toHaveText('Cancelar');
  await expect(dialog.locator('.rte-dialog__apply')).toHaveText('Aplicar');
  await expect(dialog).toBeVisible();
  expect(await rteHtml(page, 'dialogs')).toBe(before);
});

test('N19 (Review Focus 5): viewport de 320 px, diálogo <= 288 px e sem rolagem horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await gotoApp(page, '/dialogs');
  await waitForEditor(page, 'dialogs');
  for (const c of CASES) {
    const dialog = await openCase(page, c);
    const width = await dialog.evaluate((d) => d.getBoundingClientRect().width);
    expect(width, c.kind).toBeLessThanOrEqual(288);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      c.kind,
    ).toBeLessThanOrEqual(320);
    await cancelDialog(dialog);
  }
});
