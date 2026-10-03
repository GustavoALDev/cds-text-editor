import { Mark } from '@tiptap/core';
import { normalizeAttribute } from '../../src/schema/rules';
import type { RteExtensionContext } from './context';
import { ruleOf } from './media';

/** Direção do texto de `rtLang` (só minúsculas). */
export type RteTextDirection = 'ltr' | 'rtl';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtLang: {
      /**
       * Marca o idioma da seleção; `lang` fora da regra do esquema ou `dir`
       * diferente de `ltr`/`rtl` devolve `false`.
       */
      setLang: (attrs: {
        lang: string;
        dir?: RteTextDirection | null;
      }) => ReturnType;
      unsetLang: () => ReturnType;
    };
  }
}

function direction(value: unknown): RteTextDirection | null {
  return value === 'ltr' || value === 'rtl' ? value : null;
}

/**
 * Idioma de um trecho (spec 03b, §4): `span[lang]` pela regra `lang` do
 * esquema, `dir` só `ltr`/`rtl` em minúsculas. A regra não consome o `span`
 * (`consuming: false`), como a da cor: cor e idioma no mesmo `span` viram
 * duas marcas, que saem aninhadas (a cor por fora).
 */
export function createLangExtension(ctx: RteExtensionContext) {
  const rule = ruleOf(ctx.schema, 'span', 'lang');
  const tag = (value: unknown): string | null =>
    typeof value === 'string' ? normalizeAttribute(rule, value) : null;
  return Mark.create({
    name: 'rtLang',
    addAttributes() {
      return {
        // `parseHTML` nulo: os valores só entram pela regra abaixo.
        lang: { default: null, rendered: false, parseHTML: () => null },
        dir: { default: null, rendered: false, parseHTML: () => null },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'span[lang]',
          consuming: false,
          getAttrs: (dom: HTMLElement | string) => {
            if (typeof dom === 'string') return false;
            const lang = tag(dom.getAttribute('lang'));
            if (lang === null) return false;
            return { lang, dir: direction(dom.getAttribute('dir')) };
          },
        },
      ];
    },
    renderHTML({ mark }) {
      // Revalida (JSON não passa pela leitura, B9).
      // Sem `lang` válido, `dir` sozinho não sai (o `lang` é obrigatório).
      const lang = tag(mark.attrs['lang']);
      if (lang === null) return ['span', 0];
      const dir = direction(mark.attrs['dir']);
      return ['span', dir === null ? { lang } : { lang, dir }, 0];
    },
    addCommands() {
      return {
        setLang:
          (attrs) =>
          ({ commands }) => {
            const lang = tag(attrs?.lang);
            const dir: unknown = attrs?.dir ?? null;
            if (lang === null || (dir !== null && direction(dir) === null)) {
              return false;
            }
            return commands.setMark(this.name, { lang, dir });
          },
        unsetLang:
          () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
      };
    },
  });
}
