import type { Page } from '@playwright/test';

// Aparência do conteúdo `rt-*` comparada por estilo computado: N13 (spec 05b1, editor ×
// página estática) e L3 (spec 06, H20: editor × rota `render`).

/** Seletores do N13 (cada ocorrência dentro do contêiner é comparada). */
export const CONTENT_SELECTORS: readonly string[] = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul > li',
  'ol',
  'blockquote:not(.rt-pullquote blockquote)',
  'hr',
  ':not(pre) > code',
  'pre',
  'a',
  'sup',
  'sub',
  'th',
  'td',
  'li.rt-task',
  '.rt-figure--left',
  '.rt-figure--center',
  '.rt-figure--right',
  '.rt-figure--full',
  '.rt-figure--video',
  'figcaption',
  '.rt-credit',
  '.rt-embed',
  '.rt-pullquote',
  '.rt-callout--info',
  '.rt-callout--success',
  '.rt-callout--warning',
  '.rt-callout--danger',
  '.rt-callout__title',
  '.rt-read-also',
  '.rt-read-also__title',
  'span[data-rt-color]',
  'mark[data-rt-color]',
];

/** Propriedades do N13. */
export const CONTENT_PROPS: readonly string[] = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'color',
  'background-color',
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-left-width',
  'border-left-style',
  'border-left-color',
  'float',
  'list-style-type',
];

/**
 * Estilos do atributo `style` que a H8 reaplica por CSSOM (spec 06, R5): `text-align` só em
 * `p`/`h2`–`h4`, `width` só em `col`, `aspect-ratio` só em `iframe`.
 */
export const RENDER_EXTRA_PROPS = [
  'text-align',
  'aspect-ratio',
  'width',
] as const;

/** Seletor → propriedades do `RENDER_EXTRA_PROPS` conferidas nele. */
export const RENDER_EXTRA_SELECTORS: Readonly<
  Record<string, readonly (typeof RENDER_EXTRA_PROPS)[number][]>
> = {
  p: ['text-align'],
  h2: ['text-align'],
  h3: ['text-align'],
  h4: ['text-align'],
  col: ['width'],
  iframe: ['aspect-ratio'],
};

export type ContentStyles = Record<string, Record<string, string>[]>;

/** Um bloco filho direto do contêiner (geometria da H20). */
export interface ContentBlock {
  tag: string;
  width: number;
  height: number;
  /** Tabela mais larga que o rolador (a altura dela fica fora da H20). */
  wide?: boolean;
  /**
   * Bloco de texto (`p`, `h1`–`h6`) vazio: sem nós, ou só com o `br.ProseMirror-trailingBreak` que o editor põe
   * para o cursor caber (DOM só da edição: no editor tem uma linha de altura, na página 0).
   */
  empty?: boolean;
}

/**
 * Iguala a geometria do contêiner por CSSOM (permitido pela CSP): o editor tem `padding` e a
 * página não, e margens `auto` (figura centralizada) dependem da largura disponível.
 */
export async function equalizeContainer(
  page: Page,
  rootSelector: string,
): Promise<void> {
  await page.evaluate((selector) => {
    const root = document.querySelector(selector) as HTMLElement | null;
    if (!root) throw new Error(`contêiner ausente: ${selector}`);
    root.style.setProperty('box-sizing', 'border-box');
    root.style.setProperty('width', '640px');
    root.style.setProperty('padding', '12px 16px');
  }, rootSelector);
}

/** Estilos computados de `props` para todo elemento de cada seletor dentro do contêiner. */
export function collectStyles(
  page: Page,
  rootSelector: string,
  selectors: readonly string[],
  props: readonly string[],
): Promise<ContentStyles> {
  return page.evaluate(
    ({ rootSelector, selectors, props }) => {
      const root = document.querySelector(rootSelector);
      if (!root) throw new Error(`contêiner ausente: ${rootSelector}`);
      const out: Record<string, Record<string, string>[]> = {};
      for (const selector of selectors) {
        out[selector] = [...root.querySelectorAll(selector)].map((el) => {
          const style = getComputedStyle(el);
          return Object.fromEntries(
            props.map((prop) => [prop, style.getPropertyValue(prop)]),
          );
        });
      }
      return out;
    },
    { rootSelector, selectors, props },
  );
}

/**
 * Largura e altura de cada filho direto do contêiner. Os invólucros de tabela (`.tableWrapper`
 * do editor, `.rte-table-scroll` da exibição) contam como a própria `table` (ruling 9 da spec
 * 06: as tabelas entram na geometria; só a altura das largas sai, H20). Os nós internos do
 * ProseMirror (`ProseMirror-*`) não são blocos do conteúdo.
 */
export function collectBlocks(
  page: Page,
  rootSelector: string,
): Promise<ContentBlock[]> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`contêiner ausente: ${selector}`);
    const blocks: {
      tag: string;
      width: number;
      height: number;
      wide?: boolean;
      empty?: boolean;
    }[] = [];
    for (const child of root.children) {
      if ([...child.classList].some((c) => c.startsWith('ProseMirror-')))
        continue;
      const wrapper = child.matches('.tableWrapper, .rte-table-scroll')
        ? child
        : null;
      const el = wrapper ? wrapper.querySelector(':scope > table') : child;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const block: (typeof blocks)[number] = {
        tag: el.localName,
        width: rect.width,
        height: rect.height,
      };
      if (wrapper) block.wide = wrapper.scrollWidth > wrapper.clientWidth;
      if (
        el.matches('p, h1, h2, h3, h4, h5, h6') &&
        [...el.childNodes].every(
          (n) =>
            n instanceof HTMLBRElement &&
            n.classList.contains('ProseMirror-trailingBreak'),
        )
      )
        block.empty = true;
      blocks.push(block);
    }
    return blocks;
  }, rootSelector);
}

/**
 * Largura da primeira coluna da primeira tabela do contêiner (célula da 1ª linha). O WebKit
 * devolve `0px` no `width` computado de `col` (sem caixa própria), então a `width` da coluna
 * vinda do HTML (R5) também é conferida pela geometria.
 */
export function firstColumnWidth(
  page: Page,
  rootSelector: string,
): Promise<number> {
  return page.evaluate((selector) => {
    const cell = document.querySelector(
      `${selector} table tr:first-child > :first-child`,
    );
    if (!cell) throw new Error(`tabela ausente: ${selector}`);
    return cell.getBoundingClientRect().width;
  }, rootSelector);
}
