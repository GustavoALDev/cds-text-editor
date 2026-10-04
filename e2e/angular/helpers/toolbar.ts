import { expect, type Locator, type Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { editableOf, editorHost } from './app';

/**
 * Botão da barra do editor `id` pelo `aria-label`. Só os filhos diretos da
 * `.rte-toolbar`: o menu (`[role=menu]`) tem o mesmo `aria-label` do gatilho.
 */
export function toolbarButton(
  page: Page,
  id: RteE2eId,
  label: string,
): Locator {
  // `JSON.stringify` dá uma string CSS válida (rótulos com aspas).
  return editorHost(page, id).locator(
    `.rte-toolbar > .rte-toolbar__button[aria-label=${JSON.stringify(label)}]`,
  );
}

/** Menu (`[role=menu]`) controlado pelo gatilho `label` do editor `id`. */
export async function menuOf(
  page: Page,
  id: RteE2eId,
  label: string,
): Promise<Locator> {
  const controls = await toolbarButton(page, id, label).getAttribute(
    'aria-controls',
  );
  if (!controls) throw new Error(`gatilho "${label}" sem aria-controls`);
  return editorHost(page, id).locator(`#${controls}`);
}

/** Abre o menu `label` por clique e devolve o `[role=menu]` visível. */
export async function openMenu(
  page: Page,
  id: RteE2eId,
  label: string,
): Promise<Locator> {
  await toolbarButton(page, id, label).click();
  const menu = await menuOf(page, id, label);
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'menu');
  return menu;
}

/** Item de menu pelo texto visível (o nome acessível). */
export function menuItem(menu: Locator, label: string): Locator {
  return menu.locator('.rte-menu__item', {
    has: menu.page().locator('.rte-menu__label', {
      hasText: new RegExp(`^${escapeRegExp(label)}$`),
    }),
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Retângulo do menu aberto (`:popover-open`) do editor `id`. */
export async function menuRect(page: Page, id: RteE2eId): Promise<DOMRect> {
  const rect = await editorHost(page, id)
    .locator('.rte-menu:popover-open')
    .evaluate((menu) => menu.getBoundingClientRect().toJSON());
  return rect as DOMRect;
}

/** Seleção do documento do editor `id` (posições do ProseMirror). */
export function selectionOf(
  page: Page,
  id: RteE2eId,
): Promise<{ from: number; to: number }> {
  return editorHost(page, id).evaluate((host) => {
    const editor = window.rteE2e.getRteEditor(host);
    if (!editor) throw new Error('editor ausente');
    const { from, to } = editor.state.selection;
    return { from, to };
  });
}

/** `getRteHtml` do editor vivo `id` (o documento, não o modelo da página). */
export async function rteHtml(page: Page, id: RteE2eId): Promise<string> {
  const html = await editorHost(page, id).evaluate((host) =>
    window.rteE2e.rteHtml(host),
  );
  if (html === null) throw new Error('editor ausente');
  return html;
}

/**
 * Carrega `html` no editor `id` pela ponte e espera o documento chegar
 * (`getRteHtml` igual a `expected`, por padrão o próprio `html`). Espera
 * antes um render: com `[(value)]`, a ligação compara com o último valor
 * ligado, e voltar o modelo ao valor anterior antes da detecção de mudanças
 * que segue uma emissão do editor (o comando anterior) não chegaria a ele
 * (semântica do `model()` do Angular).
 */
export async function loadDoc(
  page: Page,
  id: RteE2eId,
  html: string,
  expected = html,
): Promise<void> {
  await frames(page);
  await page.evaluate(({ id, html }) => window.rteE2e.setValue(id, html), {
    id,
    html,
  });
  await expect.poll(() => rteHtml(page, id)).toBe(expected);
}

/**
 * Foca o editor `id` e seleciona, no primeiro bloco de texto que contém
 * `text`, de `from` a `to` (deslocamentos dentro de `text`; como o
 * `selectText` dos unitários: `to` padrão é o fim de `text` com `from` 0, ou
 * `from`, cursor recolhido). Espera o foco e dois quadros (segundo `focus` do
 * Tiptap no WebKit).
 */
export async function selectIn(
  page: Page,
  id: RteE2eId,
  text: string,
  from = 0,
  to = from === 0 ? text.length : from,
): Promise<void> {
  await expect
    .poll(() =>
      editorHost(page, id).evaluate(
        (host, { text, from, to }) => {
          const editor = window.rteE2e.getRteEditor(host);
          if (!editor) return false;
          let range = null as [number, number] | null;
          editor.state.doc.descendants((node, pos) => {
            if (range) return false;
            if (!node.isTextblock) return true;
            const index = node.textContent.indexOf(text);
            if (index < 0) return false;
            // blocos só com texto (marcas não ocupam posições)
            range = [pos + 1 + index + from, pos + 1 + index + to];
            return false;
          });
          if (!range) return false;
          const [a, b] = range;
          editor.chain().focus().setTextSelection({ from: a, to: b }).run();
          return true;
        },
        { text, from, to },
      ),
    )
    .toBe(true);
  await expect(editableOf(page, id)).toBeFocused();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/** `aria-label` (ou texto) do elemento focado. */
export function focusedLabel(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return (
      el.getAttribute('aria-label') ??
      el.querySelector('.rte-menu__label')?.textContent?.trim() ??
      null
    );
  });
}

/**
 * Com o foco na barra, anda com `ArrowRight` até o item `label` (no máximo
 * uma volta).
 */
export async function arrowToButton(page: Page, label: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await focusedLabel(page)) === label) return;
    await page.keyboard.press('ArrowRight');
  }
  throw new Error(`item "${label}" não alcançado pelas setas`);
}

/** Com o foco num menu, anda com `ArrowDown` até o item `label`. */
export async function arrowToMenuItem(
  page: Page,
  label: string,
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await focusedLabel(page)) === label) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`item de menu "${label}" não alcançado pelas setas`);
}

/** Espera dois quadros (render e reposicionamento por quadro). */
export function frames(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/**
 * Espera a seleção do DOM coincidir com a do documento do editor `id` e
 * confere que ela é `expected`. No WebKit, focar o editável põe o cursor do
 * DOM no início por alguns milissegundos até o ProseMirror reescrever a
 * seleção (temporizador de 20 ms do `focus`): digitar nessa janela cairia no
 * início. Nenhum usuário digita nessa janela; o teste espera por ela.
 */
export async function expectSelection(
  page: Page,
  id: RteE2eId,
  expected: { from: number; to: number },
): Promise<void> {
  await expect
    .poll(() =>
      editorHost(page, id).evaluate((host) => {
        const editor = window.rteE2e.getRteEditor(host);
        const sel = host.ownerDocument.getSelection();
        if (!editor || !sel?.anchorNode || !sel.focusNode) return null;
        const { dom } = editor.view;
        if (!dom.contains(sel.anchorNode) || !dom.contains(sel.focusNode))
          return null;
        const a = editor.view.posAtDOM(sel.anchorNode, sel.anchorOffset);
        const b = editor.view.posAtDOM(sel.focusNode, sel.focusOffset);
        const { from, to } = editor.state.selection;
        return from === Math.min(a, b) && to === Math.max(a, b)
          ? { from, to }
          : null;
      }),
    )
    .toEqual(expected);
}

/** O foco está no item ativo (a parada de Tab) da barra do editor `id`. */
export async function expectToolbarFocused(
  page: Page,
  id: RteE2eId,
): Promise<void> {
  await expect(
    editorHost(page, id).locator('.rte-toolbar > [tabindex="0"]'),
  ).toBeFocused();
}
