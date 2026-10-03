import { Node } from '@tiptap/core';
import type { AnyExtension, KeyboardShortcutCommand } from '@tiptap/core';
import { Fragment, NodeRange, Slice } from '@tiptap/pm/model';
import type {
  DOMOutputSpec,
  Node as ProseMirrorNode,
  ResolvedPos,
} from '@tiptap/pm/model';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import {
  ReplaceAroundStep,
  findWrapping,
  liftTarget,
} from '@tiptap/pm/transform';
import type { RteExtensionContext } from './context';
import { emptyParagraph, insertionPoint } from './insert';
import { createItemKeymap } from './item-keymap';
import { createLangExtension } from './lang';
import { cleanText, meaningfulChildren, tagOf, textWithout } from './media';
import type { RteCalloutVariant } from './types';

/** Atributos de `rtPullquote` (B10: texto puro). */
export interface RtePullquoteAttrs {
  author?: string;
  role?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtPullquote: {
      /** Envolve os parágrafos da seleção numa citação em destaque. */
      setPullquote: (attrs?: RtePullquoteAttrs) => ReturnType;
      /** Muda autor/cargo da citação do cursor. */
      updatePullquote: (attrs: RtePullquoteAttrs) => ReturnType;
      /** Devolve os parágrafos da citação do cursor ao pai dela. */
      unsetPullquote: () => ReturnType;
    };
    rtCallout: {
      /** Envolve os blocos da seleção numa caixa; título = rótulo atual. */
      setCallout: (variant: RteCalloutVariant) => ReturnType;
      /**
       * Troca a variante da caixa do cursor; o título também, se for o
       * rótulo da variante anterior.
       */
      setCalloutVariant: (variant: RteCalloutVariant) => ReturnType;
      /**
       * Desfaz a caixa do cursor: título vazio ou igual ao rótulo da
       * variante é descartado; outro vira parágrafo.
       */
      unsetCallout: () => ReturnType;
    };
    rtReadAlso: {
      /** Insere título + um item vazio, com o cursor no item. */
      insertReadAlso: () => ReturnType;
    };
  }
}

const PULLQUOTE = 'rtPullquote';
const CALLOUT = 'rtCallout';
const CALLOUT_TITLE = 'rtCalloutTitle';
const READ_ALSO = 'rtReadAlso';
const READ_ALSO_TITLE = 'rtReadAlsoTitle';
const READ_ALSO_LIST = 'rtReadAlsoList';
const READ_ALSO_ITEM = 'rtReadAlsoItem';
const CALLOUT_TITLE_CLASS = 'rt-callout__title';
const READ_ALSO_TITLE_CLASS = 'rt-read-also__title';
const VARIANT_CLASS = 'rt-callout--';
// Acima das regras oficiais (50), como as das tarefas.
const PRIORITY = 60;

const VARIANTS: readonly RteCalloutVariant[] = [
  'info',
  'success',
  'warning',
  'danger',
];
// Blocos aceitos na caixa, depois do título.
const CALLOUT_BLOCKS = new Set(['paragraph', 'bulletList', 'orderedList']);

function variantOf(value: unknown): RteCalloutVariant | null {
  return VARIANTS.find((variant) => variant === value) ?? null;
}

function classTokens(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/[ \t\n\f\r]+/);
}

function hasClass(element: Element, token: string): boolean {
  return classTokens(element).includes(token);
}

const isTitle = (element: Element | undefined, cls: string): boolean =>
  element !== undefined && tagOf(element) === 'p' && hasClass(element, cls);

/** `ul` de tarefas (formato da 03a ou do Tiptap). */
function isTaskList(element: Element): boolean {
  return (
    hasClass(element, 'rt-tasks') ||
    element.getAttribute('data-type') === 'taskList'
  );
}

/**
 * Filhos de uma caixa na estrutura esperada: título opcional primeiro e
 * depois só blocos que `accept` aceita. Senão `null`: a regra não casa e a
 * leitura genérica preserva o texto (A1).
 */
function boxChildren(
  element: Element,
  titleClass: string,
  accept: (children: Element[]) => boolean,
): Element[] | null {
  const children = meaningfulChildren(element);
  if (!children) return null;
  const rest = isTitle(children[0], titleClass) ? children.slice(1) : children;
  if (rest.some((child) => isTitle(child, titleClass))) return null;
  return accept(rest) ? children : null;
}

function calloutChildren(element: Element): Element[] | null {
  return boxChildren(element, CALLOUT_TITLE_CLASS, (rest) =>
    rest.every((child) => {
      const tag = tagOf(child);
      return (
        tag === 'p' || tag === 'ol' || (tag === 'ul' && !isTaskList(child))
      );
    }),
  );
}

// Filhos de bloco: o `li` com algum deles não é um item de texto.
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

/**
 * Item do "Leia também": `li` que não é tarefa, com conteúdo inline ou um
 * único `p` (sem nada além de espaço e comentários).
 */
function isReadAlsoItem(li: Element): boolean {
  if (tagOf(li) !== 'li' || hasClass(li, 'rt-task')) return false;
  if (li.getAttribute('data-type') === 'taskItem') return false;
  const blocks = Array.from(li.children).filter((child) =>
    BLOCK_TAGS.has(tagOf(child)),
  );
  if (blocks.length === 0) return true;
  const only = meaningfulChildren(li);
  const block = only?.length === 1 ? only[0] : undefined;
  return block !== undefined && block === blocks[0] && tagOf(block) === 'p';
}

function readAlsoChildren(element: Element): Element[] | null {
  return boxChildren(element, READ_ALSO_TITLE_CLASS, (rest) => {
    const list = rest[0];
    if (rest.length !== 1 || !list) return false;
    if (tagOf(list) !== 'ul' || isTaskList(list)) return false;
    const items = meaningfulChildren(list);
    return items !== null && items.length > 0 && items.every(isReadAlsoItem);
  });
}

/**
 * Conteúdo da caixa para a leitura (B12): a própria caixa, se o título vem
 * primeiro; senão um `div` novo, fora do documento, com um título vazio e
 * cópias dos filhos — o ProseMirror não preenche o título obrigatório antes
 * do primeiro bloco e expulsaria o conteúdo. A entrada nunca é alterada.
 */
function withTitle(element: HTMLElement, titleClass: string): HTMLElement {
  const children = meaningfulChildren(element);
  if (isTitle(children?.[0], titleClass)) return element;
  const doc = element.ownerDocument;
  const box = doc.createElement('div');
  const title = doc.createElement('p');
  title.setAttribute('class', titleClass);
  box.appendChild(title);
  for (const child of Array.from(element.childNodes)) {
    box.appendChild(child.cloneNode(true));
  }
  return box;
}

/** Partes da citação em destaque: um `blockquote` e até um `figcaption`. */
function pullquoteParts(
  figure: Element,
): { quote: HTMLElement; caption: Element | null } | null {
  const children = meaningfulChildren(figure);
  if (!children) return null;
  let quote: HTMLElement | null = null;
  let caption: Element | null = null;
  for (const child of children) {
    const tag = tagOf(child);
    if (tag === 'blockquote' && !quote) quote = child as HTMLElement;
    else if (tag === 'figcaption' && !caption) caption = child;
    else return null;
  }
  return quote ? { quote, caption } : null;
}

/** Autor (`figcaption > cite`) e cargo (o resto, sem a vírgula inicial). */
function captionAttrs(caption: Element | null): {
  author: string;
  role: string;
} {
  if (!caption) return { author: '', role: '' };
  const cite =
    Array.from(caption.children).find((child) => tagOf(child) === 'cite') ??
    null;
  const author = cite ? cleanText(textWithout(cite)) : '';
  const rest = textWithout(caption, (element) => element === cite);
  return { author, role: roleText(rest) };
}

/**
 * Cargo canônico: texto puro sem vírgulas e espaços iniciais (a vírgula da
 * saída separa autor e cargo), para saída → leitura → saída ser ponto fixo.
 */
function roleText(value: string): string {
  // Depois do cleanText, o único espaço possível é o U+0020.
  return cleanText(value).replace(/^[, ]+/, '');
}

/** Texto puro canônico de autor/cargo; `null` se não for texto. */
function plainText(value: unknown): string | null {
  return typeof value === 'string' ? cleanText(value) : null;
}

/** Atributos de citação da entrada de comando; `null` se inválidos. */
function pullquoteInput(
  base: Record<string, unknown>,
  input: unknown,
): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object') return null;
  const given = input as Record<string, unknown>;
  const out = { ...base };
  for (const name of ['author', 'role']) {
    if (given[name] === undefined) continue;
    const value = plainText(given[name]);
    if (value === null) return null;
    out[name] = name === 'role' ? roleText(value) : value;
  }
  return out;
}

/** Profundidade do ancestral `type` da seleção (nó selecionado incluso). */
function ancestor(
  state: EditorState,
  type: string,
): {
  node: ProseMirrorNode;
  pos: number;
  $pos: ResolvedPos;
  depth: number;
} | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === type) {
    const $pos = state.doc.resolve(selection.from + 1);
    return {
      node: selection.node,
      pos: selection.from,
      $pos,
      depth: $pos.depth,
    };
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === type) {
      return { node, pos: $from.before(depth), $pos: $from, depth };
    }
  }
  return null;
}

/** `Enter` no fim de um título de caixa: cursor no primeiro bloco da caixa. */
function titleEnter(titleType: string): KeyboardShortcutCommand {
  return ({ editor }) => {
    const { selection, doc } = editor.state;
    const { $from } = selection;
    if (
      !selection.empty ||
      $from.parent.type.name !== titleType ||
      $from.parentOffset !== $from.parent.content.size
    ) {
      return false;
    }
    const next = Selection.findFrom(doc.resolve($from.after()), 1, true);
    if (!next) return false;
    editor.view.dispatch(editor.state.tr.setSelection(next).scrollIntoView());
    return true;
  };
}

/** Nó de título com o texto `label` (vazio se o rótulo for vazio). */
function titleNode(
  state: EditorState,
  type: string,
  label: string,
): ProseMirrorNode | null {
  const nodeType = state.schema.nodes[type];
  if (!nodeType) return null;
  return nodeType.create(null, label ? state.schema.text(label) : null);
}

/**
 * Citação em destaque, caixas de destaque e "Leia também" (spec 03b, B12 e
 * §4) e a marca de idioma. Os títulos de caixa são nós editáveis; título
 * ausente na leitura é sintetizado vazio e sai com o rótulo traduzido na
 * serialização (§5.3 b). Rótulos sempre por `ctx.labels()` (lição 4).
 */
export function createNewsBlockExtensions(
  ctx: RteExtensionContext,
): AnyExtension[] {
  const pullquote = Node.create({
    name: PULLQUOTE,
    group: 'block',
    content: 'paragraph+',
    defining: true,
    addAttributes() {
      return {
        // `parseHTML` nulo: os valores só entram pela regra abaixo.
        author: { default: '', rendered: false, parseHTML: () => null },
        role: { default: '', rendered: false, parseHTML: () => null },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'figure.rt-pullquote',
          priority: PRIORITY,
          getAttrs: (element) => {
            const parts = pullquoteParts(element);
            return parts ? captionAttrs(parts.caption) : false;
          },
          contentElement: (element) =>
            pullquoteParts(element as HTMLElement)?.quote ??
            (element as HTMLElement),
        },
      ];
    },
    renderHTML({ node }) {
      // Revalida (JSON não passa pela leitura, B9).
      const author = plainText(node.attrs['author']) ?? '';
      const role = roleText(plainText(node.attrs['role']) ?? '');
      const quote: DOMOutputSpec = ['blockquote', 0];
      if (!author && !role) return ['figure', { class: 'rt-pullquote' }, quote];
      // Texto solto é filho válido de um array de saída do ProseMirror.
      const caption: (DOMOutputSpec | string)[] = [];
      if (author) caption.push(['cite', author]);
      if (author && role) caption.push(`, ${role}`);
      else if (role) caption.push(role);
      return [
        'figure',
        { class: 'rt-pullquote' },
        quote,
        ['figcaption', ...caption],
      ];
    },
    addCommands() {
      return {
        setPullquote:
          (attrs = {}) =>
          ({ state, tr, dispatch }) => {
            const type = state.schema.nodes[PULLQUOTE];
            const values = pullquoteInput({ author: '', role: '' }, attrs);
            const { $from, $to } = state.selection;
            const range = $from.blockRange($to);
            if (!type || !values || !range) return false;
            const wrapping = findWrapping(range, type, values);
            if (!wrapping) return false;
            if (dispatch) tr.wrap(range, wrapping).scrollIntoView();
            return true;
          },
        updatePullquote:
          (attrs) =>
          ({ state, tr, dispatch }) => {
            const found = ancestor(state, PULLQUOTE);
            if (!found) return false;
            const values = pullquoteInput(found.node.attrs, attrs);
            if (!values) return false;
            if (dispatch) tr.setNodeMarkup(found.pos, undefined, values);
            return true;
          },
        unsetPullquote:
          () =>
          ({ state, tr, dispatch }) => {
            const found = ancestor(state, PULLQUOTE);
            if (!found) return false;
            const { doc } = state;
            const start = found.pos + 1;
            const range = new NodeRange(
              doc.resolve(start),
              doc.resolve(start + found.node.content.size),
              found.depth,
            );
            const target = liftTarget(range);
            if (target === null) return false;
            if (dispatch) tr.lift(range, target).scrollIntoView();
            return true;
          },
      };
    },
  });

  const callout = Node.create({
    name: CALLOUT,
    group: 'block',
    content: `${CALLOUT_TITLE} (paragraph | bulletList | orderedList)+`,
    defining: true,
    addAttributes() {
      return {
        variant: { default: 'info', rendered: false, parseHTML: () => null },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'aside.rt-callout',
          priority: PRIORITY,
          getAttrs: (element) => {
            if (!calloutChildren(element)) return false;
            for (const token of classTokens(element)) {
              if (!token.startsWith(VARIANT_CLASS)) continue;
              const variant = variantOf(token.slice(VARIANT_CLASS.length));
              if (variant) return { variant };
            }
            return { variant: 'info' };
          },
          contentElement: (element) =>
            withTitle(element as HTMLElement, CALLOUT_TITLE_CLASS),
        },
      ];
    },
    renderHTML({ node }) {
      const variant = variantOf(node.attrs['variant']) ?? 'info';
      return [
        'aside',
        { class: `rt-callout ${VARIANT_CLASS}${variant}`, role: 'note' },
        0,
      ];
    },
    addCommands() {
      return {
        setCallout:
          (variant) =>
          ({ state, tr, dispatch }) => {
            const type = state.schema.nodes[CALLOUT];
            if (!type || variantOf(variant) === null) return false;
            const title = titleNode(
              state,
              CALLOUT_TITLE,
              ctx.labels().calloutTitles[variant],
            );
            if (!title) return false;
            const { $from, $to } = state.selection;
            // Sobe até um intervalo de blocos aceitos num pai que aceite a caixa.
            for (
              let range = $from.blockRange($to);
              range;
              range =
                range.depth > 0
                  ? new NodeRange($from, $to, range.depth - 1)
                  : null
            ) {
              const blocks: ProseMirrorNode[] = [];
              for (let i = range.startIndex; i < range.endIndex; i += 1) {
                blocks.push(range.parent.child(i));
              }
              if (!blocks.every((block) => CALLOUT_BLOCKS.has(block.type.name)))
                continue;
              const node = type.create({ variant }, [title, ...blocks]);
              if (
                !range.parent.canReplace(
                  range.startIndex,
                  range.endIndex,
                  Fragment.from(node),
                )
              ) {
                continue;
              }
              if (dispatch) {
                // Um passo "em volta" dos blocos: a seleção acompanha.
                tr.step(
                  new ReplaceAroundStep(
                    range.start,
                    range.end,
                    range.start,
                    range.end,
                    new Slice(
                      Fragment.from(type.create({ variant }, title)),
                      0,
                      0,
                    ),
                    1 + title.nodeSize,
                    true,
                  ),
                ).scrollIntoView();
              }
              return true;
            }
            return false;
          },
        setCalloutVariant:
          (variant) =>
          ({ state, tr, dispatch }) => {
            const found = ancestor(state, CALLOUT);
            if (!found || variantOf(variant) === null) return false;
            if (!dispatch) return true;
            const labels = ctx.labels().calloutTitles;
            const previous = variantOf(found.node.attrs['variant']) ?? 'info';
            tr.setNodeMarkup(found.pos, undefined, {
              ...found.node.attrs,
              variant,
            });
            const title = found.node.firstChild;
            if (
              title?.type.name === CALLOUT_TITLE &&
              title.textContent !== '' &&
              title.textContent === labels[previous]
            ) {
              const start = found.pos + 2;
              const label = labels[variant];
              const end = start + title.content.size;
              if (label) tr.replaceWith(start, end, state.schema.text(label));
              else tr.delete(start, end);
            }
            return true;
          },
        unsetCallout:
          () =>
          ({ state, tr, dispatch }) => {
            const found = ancestor(state, CALLOUT);
            const paragraph = state.schema.nodes['paragraph'];
            if (!found || !paragraph) return false;
            const { node, pos, $pos, depth } = found;
            const title = node.firstChild;
            if (title?.type.name !== CALLOUT_TITLE) return false;
            const variant = variantOf(node.attrs['variant']) ?? 'info';
            const label = ctx.labels().calloutTitles[variant];
            const text = title.textContent;
            const kept =
              text !== '' && text !== label
                ? paragraph.create(null, title.content)
                : null;
            const rest = node.content.cut(title.nodeSize);
            const fragment = kept ? rest.addToStart(kept) : rest;
            const index = $pos.index(depth - 1);
            if (!$pos.node(depth - 1).canReplace(index, index + 1, fragment)) {
              return false;
            }
            if (!dispatch) return true;
            const titleStart = pos + 2;
            const { from, to } = state.selection;
            const inTitle =
              from >= titleStart && to <= titleStart + title.content.size;
            tr.step(
              new ReplaceAroundStep(
                pos,
                pos + node.nodeSize,
                pos + 1 + title.nodeSize,
                pos + node.nodeSize - 1,
                new Slice(kept ? Fragment.from(kept) : Fragment.empty, 0, 0),
                kept ? kept.nodeSize : 0,
                false,
              ),
            );
            if (inTitle && kept) {
              // O título virou o parágrafo em `pos`: mesmo deslocamento.
              const shift = pos + 1 - titleStart;
              tr.setSelection(
                TextSelection.create(tr.doc, from + shift, to + shift),
              );
            }
            tr.scrollIntoView();
            return true;
          },
      };
    },
  });

  const calloutTitle = Node.create({
    name: CALLOUT_TITLE,
    content: 'inline*',
    parseHTML() {
      return [
        {
          tag: `p.${CALLOUT_TITLE_CLASS}`,
          context: `${CALLOUT}/`,
          priority: PRIORITY,
        },
      ];
    },
    renderHTML() {
      return ['p', { class: CALLOUT_TITLE_CLASS }, 0];
    },
    addKeyboardShortcuts() {
      return { Enter: titleEnter(CALLOUT_TITLE) };
    },
  });

  const readAlso = Node.create({
    name: READ_ALSO,
    group: 'block',
    content: `${READ_ALSO_TITLE} ${READ_ALSO_LIST}`,
    defining: true,
    parseHTML() {
      return [
        {
          tag: 'aside.rt-read-also',
          priority: PRIORITY,
          getAttrs: (element) => (readAlsoChildren(element) ? null : false),
          contentElement: (element) =>
            withTitle(element as HTMLElement, READ_ALSO_TITLE_CLASS),
        },
      ];
    },
    renderHTML() {
      return ['aside', { class: 'rt-read-also', role: 'note' }, 0];
    },
    addCommands() {
      return {
        insertReadAlso:
          () =>
          ({ state, tr, dispatch }) => {
            const { nodes } = state.schema;
            const type = nodes[READ_ALSO];
            const list = nodes[READ_ALSO_LIST];
            const item = nodes[READ_ALSO_ITEM];
            const title = titleNode(
              state,
              READ_ALSO_TITLE,
              ctx.labels().readAlsoTitle,
            );
            if (!type || !list || !item || !title) return false;
            const node = type.create(null, [
              title,
              list.create(null, item.create()),
            ]);
            // Lição 14: o parágrafo vazio do cursor é substituído.
            const range = emptyParagraph(tr.selection, node);
            const at = range ? range[0] : insertionPoint(tr.selection, node);
            if (at === null) return false;
            if (!dispatch) return true;
            tr.replaceWith(at, range ? range[1] : at, node);
            // Dentro do item: aside, título, ul, li.
            tr.setSelection(
              TextSelection.create(tr.doc, at + 1 + title.nodeSize + 2),
            );
            tr.scrollIntoView();
            return true;
          },
      };
    },
  });

  const readAlsoTitle = Node.create({
    name: READ_ALSO_TITLE,
    content: 'inline*',
    parseHTML() {
      return [
        {
          tag: `p.${READ_ALSO_TITLE_CLASS}`,
          context: `${READ_ALSO}/`,
          priority: PRIORITY,
        },
      ];
    },
    renderHTML() {
      return ['p', { class: READ_ALSO_TITLE_CLASS }, 0];
    },
    addKeyboardShortcuts() {
      return { Enter: titleEnter(READ_ALSO_TITLE) };
    },
  });

  const readAlsoList = Node.create({
    name: READ_ALSO_LIST,
    content: `${READ_ALSO_ITEM}+`,
    parseHTML() {
      return [{ tag: 'ul', context: `${READ_ALSO}/`, priority: PRIORITY }];
    },
    renderHTML() {
      return ['ul', 0];
    },
  });

  const readAlsoItem = Node.create({
    name: READ_ALSO_ITEM,
    content: 'inline*',
    defining: true,
    parseHTML() {
      return [
        { tag: 'li', context: `${READ_ALSO_LIST}/`, priority: PRIORITY },
        // `li > p` único: o `p` é transparente (o texto vira o item).
        {
          tag: 'p',
          context: `${READ_ALSO_ITEM}/`,
          priority: PRIORITY,
          skip: true,
          getAttrs: (element) => {
            const parent = element.parentElement;
            const children = parent ? meaningfulChildren(parent) : null;
            return children?.length === 1 ? null : false;
          },
        },
      ];
    },
    renderHTML() {
      return ['li', 0];
    },
    addKeyboardShortcuts() {
      return createItemKeymap(READ_ALSO_ITEM, {
        splitContainer: true,
        // Sem a caixa, só um título editado sobra (como no unsetCallout).
        orphan: (node) => {
          const text = node.textContent;
          const paragraph = node.type.schema.nodes['paragraph'];
          if (!paragraph || text === '') return null;
          if (text === ctx.labels().readAlsoTitle) return null;
          return paragraph.create(null, node.content);
        },
      });
    },
  });

  return [
    pullquote,
    callout,
    calloutTitle,
    readAlso,
    readAlsoTitle,
    readAlsoList,
    readAlsoItem,
    createLangExtension(ctx),
  ];
}
