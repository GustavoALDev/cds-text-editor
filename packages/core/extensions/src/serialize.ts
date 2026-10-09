import type { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { createHeadingIds } from '../../src/headings';
import { RTE_DEFAULT_ID_PREFIX } from '../../src/schema/id-prefix';
import { resolveContentLabels } from './labels';
import { withRenderDocument } from './render-document';
import {
  StringElement,
  StringFragment,
  createStringDocument,
  writeHtml,
} from './string-dom';
import type {
  RteCalloutVariant,
  RteContentLabels,
  RteContentLabelsSource,
} from './types';

export interface RteSerializeHtmlOptions {
  /** Prefixo dos ids de título (padrão `'rt-'`). */
  idPrefix?: string;
  /** Rótulos dos títulos vazios de caixa (padrão `en`). */
  labels?: RteContentLabelsSource;
}

export interface RteHeading {
  pos: number;
  level: 2 | 3 | 4;
  text: string;
  id: string;
}

const HEADING_TAGS = new Set(['h2', 'h3', 'h4']);
const CALLOUT_VARIANT = 'rt-callout--';

/**
 * Serialização canônica (spec 03b, §5): `DOMSerializer` sobre um documento de
 * strings, escrita pelo algoritmo do HTML e só duas normalizações: ids dos
 * títulos e títulos vazios de caixa. Idêntica em Node, jsdom e navegadores.
 */
export function serializeRteHtml(
  doc: ProseMirrorNode,
  options: RteSerializeHtmlOptions = {},
): string {
  // lança RangeError para prefixo inválido antes de renderizar
  const nextId = createHeadingIds({
    prefix: options.idPrefix ?? RTE_DEFAULT_ID_PREFIX,
  });
  const labels = resolveContentLabels(options.labels);
  const document = createStringDocument();
  const fragment = withRenderDocument(document, () =>
    DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content, {
      document,
    }),
  ) as unknown as StringFragment;
  normalize(fragment, [], nextId, labels);
  return writeHtml(fragment);
}

/**
 * Saída oficial do editor (spec 03b, §5): `serializeRteHtml` com o prefixo e
 * os rótulos guardados pela fábrica em `editor.storage.rtContent`. Lança
 * `TypeError` se o editor não foi criado com `createEditorExtensions`.
 */
export function getRteHtml(editor: Editor): string {
  const storage = editor.storage as Partial<Editor['storage']>;
  const content = Object.hasOwn(storage, 'rtContent')
    ? storage.rtContent
    : undefined;
  if (!content) {
    throw new TypeError(
      'getRteHtml: o editor não foi criado com createEditorExtensions (falta a extensão rtContent).',
    );
  }
  return serializeRteHtml(editor.state.doc, {
    idPrefix: content.idPrefix,
    labels: content.labels,
  });
}

/** Títulos do documento em ordem, com os mesmos ids de `serializeRteHtml`. */
export function getRteHeadings(
  doc: ProseMirrorNode,
  options: { idPrefix?: string } = {},
): RteHeading[] {
  const nextId = createHeadingIds({
    prefix: options.idPrefix ?? RTE_DEFAULT_ID_PREFIX,
  });
  const headings: RteHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    const text = node.textContent;
    headings.push({
      pos,
      level: clampLevel(node.attrs['level']),
      text,
      id: nextId(text),
    });
    return false;
  });
  return headings;
}

/** Nível do título limitado a 2–4 (JSON pode trazer qualquer valor). */
export function clampLevel(level: unknown): 2 | 3 | 4 {
  const n = Math.trunc(Number(level));
  if (!(n > 2)) return 2;
  return n >= 4 ? 4 : (n as 3);
}

function normalize(
  parent: StringFragment | StringElement,
  ancestors: StringElement[],
  nextId: (text: string) => string,
  labels: RteContentLabels,
): void {
  for (const child of parent.childNodes) {
    if (!(child instanceof StringElement)) continue;
    if (child.isHtml && HEADING_TAGS.has(child.tagName)) {
      // (a) id calculado, primeiro atributo, substituindo qualquer id
      const id = nextId(child.textContent);
      const at = child.attributes.findIndex(([name]) => name === 'id');
      if (at >= 0) child.attributes.splice(at, 1);
      child.attributes.unshift(['id', id]);
    } else if (child.isHtml && child.tagName === 'p') {
      // (b) título vazio de caixa recebe o rótulo
      const classes = child.classTokens;
      if (child.textContent === '') {
        if (classes.includes('rt-callout__title')) {
          child.textContent = labels.calloutTitles[calloutVariant(ancestors)];
        } else if (classes.includes('rt-read-also__title')) {
          child.textContent = labels.readAlsoTitle;
        }
      }
    }
    ancestors.push(child);
    normalize(child, ancestors, nextId, labels);
    ancestors.pop();
  }
}

/** Variante pela classe do `aside.rt-callout` mais próximo; senão `info`. */
function calloutVariant(ancestors: StringElement[]): RteCalloutVariant {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const tokens = (ancestors[i] as StringElement).classTokens;
    if (!tokens.includes('rt-callout')) continue;
    for (const token of tokens) {
      if (!token.startsWith(CALLOUT_VARIANT)) continue;
      const variant = token.slice(CALLOUT_VARIANT.length);
      if (
        variant === 'info' ||
        variant === 'success' ||
        variant === 'warning' ||
        variant === 'danger'
      ) {
        return variant;
      }
    }
    break;
  }
  return 'info';
}
