import { mergeAttributes } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { Bold } from '@tiptap/extension-bold';
import { Code } from '@tiptap/extension-code';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Heading } from '@tiptap/extension-heading';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Italic } from '@tiptap/extension-italic';
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
} from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Strike } from '@tiptap/extension-strike';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Text } from '@tiptap/extension-text';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { normalizeAttribute } from '../../src/schema/rules';
import type { RteAttrRule } from '../../src/schema/types';
import type { RteExtensionContext } from './context';
import { clampLevel } from './serialize';

/** `heading` com níveis 2–4, sem `id` guardado (B8). */
function createHeading() {
  return Heading.configure({ levels: [2, 3, 4] }).extend({
    addAttributes() {
      return { level: { default: 2, rendered: false } };
    },
    parseHTML() {
      return [
        { tag: 'h1', attrs: { level: 2 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 4 } },
        { tag: 'h6', attrs: { level: 4 } },
      ];
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        `h${clampLevel(node.attrs['level'])}`,
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
        0,
      ];
    },
  });
}

/** `start` pela regra do esquema (`ol.start`); ausente ou inválido → 1. */
function normalizeStart(rule: RteAttrRule, value: unknown): number {
  if (value === null || value === undefined) return 1;
  const out = normalizeAttribute(rule, String(value));
  return out === null ? 1 : Number(out);
}

/** `orderedList` só com `start` (`type`/`list-style-type` descartados). */
function createOrderedList(ctx: RteExtensionContext) {
  const elements = ctx.schema.elements;
  const ol = Object.hasOwn(elements, 'ol') ? elements['ol'] : undefined;
  const spec =
    ol && Object.hasOwn(ol.attributes, 'start')
      ? ol.attributes['start']
      : undefined;
  if (!spec) throw new TypeError('Esquema sem a regra de ol[start].');
  const rule = spec.rule;
  return OrderedList.extend({
    addAttributes() {
      return {
        start: {
          default: 1,
          parseHTML: (element: HTMLElement) =>
            normalizeStart(rule, element.getAttribute('start')),
          renderHTML: (attributes: Record<string, unknown>) => {
            const start = normalizeStart(rule, attributes['start']);
            return start === 1 ? {} : { start: String(start) };
          },
        },
      };
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'ol',
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
        0,
      ];
    },
  });
}

/**
 * Recursos base (spec 03b, §4), com instâncias novas a cada chamada, na
 * ordem da spec §6: de `doc` a `superscript`.
 */
export function createBaseExtensions(ctx: RteExtensionContext): AnyExtension[] {
  return [
    Document.configure(),
    Paragraph.configure(),
    Text.configure(),
    createHeading(),
    Blockquote.configure(),
    HorizontalRule.configure(),
    HardBreak.configure(),
    BulletList.configure(),
    createOrderedList(ctx),
    ListItem.configure(),
    ListKeymap.configure(),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    Bold.configure(),
    Italic.configure(),
    Underline.configure(),
    Strike.configure(),
    Code.configure(),
    Subscript.configure(),
    Superscript.configure(),
  ];
}
