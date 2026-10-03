import { textblockTypeInputRule } from '@tiptap/core';
import {
  CodeBlock,
  backtickInputRegex,
  tildeInputRegex,
} from '@tiptap/extension-code-block';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import { isAllowedClass } from '../../src/schema/classes';
import type { RteElementSpec } from '../../src/schema/types';
import type { RteExtensionContext } from './context';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtCodeBlock: {
      /**
       * Troca a linguagem do bloco de código da seleção (alias do catálogo
       * vira o `id`); `null` remove. Nome não aceito ou seleção fora de um
       * bloco de código devolve `false`.
       */
      setCodeBlockLanguage: (language: string | null) => ReturnType;
    };
  }
}

const LANGUAGE_PREFIX = 'language-';

// Índice alias/id → id por catálogo (Map: nenhum nome herdado de Object).
const indexCache = new WeakMap<
  readonly RteCodeLanguage[],
  Map<string, string>
>();

function catalogIndex(
  catalog: readonly RteCodeLanguage[],
): Map<string, string> {
  let index = indexCache.get(catalog);
  if (!index) {
    index = new Map();
    for (const language of catalog) {
      index.set(language.id, language.id);
      for (const alias of language.aliases) index.set(alias, language.id);
    }
    indexCache.set(catalog, index);
  }
  return index;
}

/** Minúsculas só em A–Z (sem regras de caixa do Unicode). */
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 32),
  );
}

/**
 * Linguagem guardada no `codeBlock` (spec 03b, §4 code): minúsculas ASCII,
 * alias do catálogo resolvido para o `id`, aceita se o esquema aceitar a
 * classe `language-<id>`; senão `null` (bloco sem linguagem).
 */
export function resolveCodeLanguage(
  raw: string,
  catalog: readonly RteCodeLanguage[],
  codeSpec: RteElementSpec,
): string | null {
  const lower = asciiLower(raw);
  const id = catalogIndex(catalog).get(lower) ?? lower;
  return isAllowedClass(codeSpec, LANGUAGE_PREFIX + id) ? id : null;
}

/** Primeiro token `language-*` do `code` filho do `pre`. */
function languageClassOf(pre: HTMLElement): string | null {
  const code = pre.firstElementChild;
  if (!code || code.tagName.toLowerCase() !== 'code') return null;
  for (const token of code.classList) {
    if (token.startsWith(LANGUAGE_PREFIX)) {
      return token.slice(LANGUAGE_PREFIX.length);
    }
  }
  return null;
}

/**
 * `codeBlock`: o CodeBlock oficial com a linguagem resolvida na leitura, nos
 * comandos, nas regras de entrada e na renderização (spec 03b, B15). `Tab`
 * não é capturado (WCAG 2.1.2) e o `pre` não guarda atributos.
 */
export function createCodeBlockExtension(ctx: RteExtensionContext) {
  const elements = ctx.schema.elements;
  const codeSpec = Object.hasOwn(elements, 'code')
    ? elements['code']
    : undefined;
  if (!codeSpec?.classes) {
    throw new TypeError('Esquema sem as classes de code (recurso code).');
  }
  const catalog = ctx.codeLanguages;
  const resolve = (value: unknown): string | null =>
    typeof value === 'string'
      ? resolveCodeLanguage(value, catalog, codeSpec)
      : null;

  return CodeBlock.extend({
    addAttributes() {
      return {
        language: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const raw = languageClassOf(element);
            return raw === null ? null : resolve(raw);
          },
          rendered: false,
        },
      };
    },
    renderHTML({ node }) {
      const id = resolve(node.attrs['language']);
      return [
        'pre',
        {},
        ['code', id === null ? {} : { class: LANGUAGE_PREFIX + id }, 0],
      ];
    },
    addCommands() {
      // `language` explícito e não aceito devolve `false` (spec 03b, §6).
      const attrsFor = (
        attributes: { language?: unknown } | undefined,
      ): { language: string | null } | null => {
        const raw = attributes?.language;
        if (raw === undefined || raw === null) return { language: null };
        const id = resolve(raw);
        return id === null ? null : { language: id };
      };
      return {
        setCodeBlock:
          (attributes) =>
          ({ commands }) => {
            const attrs = attrsFor(attributes);
            return attrs !== null && commands.setNode(this.name, attrs);
          },
        toggleCodeBlock:
          (attributes) =>
          ({ commands }) => {
            const attrs = attrsFor(attributes);
            return (
              attrs !== null &&
              commands.toggleNode(this.name, 'paragraph', attrs)
            );
          },
        setCodeBlockLanguage:
          (language) =>
          ({ state, commands }) => {
            if (state.selection.$from.parent.type !== this.type) return false;
            const id = language === null ? null : resolve(language);
            if (language !== null && id === null) return false;
            return commands.updateAttributes(this.name, { language: id });
          },
      };
    },
    addInputRules() {
      const getAttributes = (match: RegExpMatchArray) => ({
        language: match[1] === undefined ? null : resolve(match[1]),
      });
      return [
        textblockTypeInputRule({
          find: backtickInputRegex,
          type: this.type,
          getAttributes,
        }),
        textblockTypeInputRule({
          find: tildeInputRegex,
          type: this.type,
          getAttributes,
        }),
      ];
    },
  }).configure({
    languageClassPrefix: LANGUAGE_PREFIX,
    defaultLanguage: null,
    enableTabIndentation: false,
    HTMLAttributes: {},
  });
}
