import { textblockTypeInputRule } from '@tiptap/core';
import {
  CodeBlock,
  backtickInputRegex,
  tildeInputRegex,
} from '@tiptap/extension-code-block';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { RteCodeLanguage } from '../../code-languages/src/index';
import { isAllowedClass } from '../../src/schema/classes';
import type { RteElementSpec } from '../../src/schema/types';
import { changedRanges } from './changed-ranges';
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

/** `mode` dos dados de colagem do VS Code; JSON malformado ou sem `mode` → null. */
function vscodeMode(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const mode: unknown = (parsed as { mode?: unknown }).mode;
    return typeof mode === 'string' && mode !== '' ? mode : null;
  } catch {
    return null;
  }
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
            const raw = attributes?.language as unknown;
            // Sem linguagem: alterna qualquer bloco de código (atributos
            // vazios no teste de "ativo" do toggleNode), como o oficial.
            if (raw === undefined || raw === null) {
              return commands.toggleNode(this.name, 'paragraph');
            }
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
    addProseMirrorPlugins() {
      const type = this.type;
      const editor = this.editor;
      // Substitui o plugin de colagem do VS Code do oficial: linguagem
      // resolvida e dados malformados ignorados em vez de lançar.
      return [
        new Plugin({
          key: new PluginKey('rtCodeBlockVSCodePaste'),
          props: {
            handlePaste: (view, event) => {
              const data = event.clipboardData;
              if (!data || editor.isActive(type.name)) return false;
              const text = data.getData('text/plain');
              const mode = vscodeMode(data.getData('vscode-editor-data'));
              if (!text || mode === null) return false;
              const tr = view.state.tr;
              tr.replaceSelectionWith(
                type.create(
                  { language: resolve(mode) },
                  view.state.schema.text(text.replace(/\r\n?/g, '\n')),
                ),
              );
              if (tr.selection.$from.parent.type !== type) {
                tr.setSelection(
                  TextSelection.near(
                    tr.doc.resolve(Math.max(0, tr.selection.from - 2)),
                  ),
                );
              }
              tr.setMeta('paste', true);
              view.dispatch(tr);
              return true;
            },
          },
        }),
        new Plugin({
          key: new PluginKey('rtCodeBlockLanguage'),
          // `language` canônico (ou null) nos blocos tocados pela transação,
          // venham de JSON, colagem ou comandos de terceiros. Idempotente:
          // a segunda rodada não acha nada e devolve null (sem laço).
          appendTransaction(transactions, _old, state) {
            const doc = state.doc;
            const fixes = new Map<number, string | null>();
            for (const [a, b] of changedRanges(transactions, doc)) {
              doc.nodesBetween(a, b, (node, pos) => {
                if (node.type !== type) return true;
                const current: unknown = node.attrs['language'];
                const canon = resolve(current);
                if (canon !== current) fixes.set(pos, canon);
                return false;
              });
            }
            if (fixes.size === 0) return null;
            const tr = state.tr;
            for (const [pos, language] of fixes) {
              tr.setNodeAttribute(pos, 'language', language);
            }
            return tr;
          },
        }),
      ];
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
