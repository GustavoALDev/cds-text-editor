import { Mark } from '@tiptap/core';
import type { MarkConfig } from '@tiptap/core';
import { applyStyleFrom } from '../../src/schema/style';
import type { RteElementSpec } from '../../src/schema/types';
import type { RteExtensionContext } from './context';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtTextColor: {
      /** Aplica a cor de texto da paleta; nome fora da paleta devolve `false`. */
      setTextColor: (name: string) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    rtHighlight: {
      /** Aplica o marca-texto da paleta; nome fora da paleta devolve `false`. */
      setHighlight: (name: string) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
  }
}

type StyleFrom = NonNullable<RteElementSpec['styleFrom']>;

function styleFromOf(ctx: RteExtensionContext, tag: string): StyleFrom {
  const elements = ctx.schema.elements;
  const spec = Object.hasOwn(elements, tag) ? elements[tag] : undefined;
  if (!spec?.styleFrom) {
    throw new TypeError(
      `O esquema não tem styleFrom para <${tag}> (recurso "colors" desligado?).`,
    );
  }
  return spec.styleFrom;
}

/** Nome da paleta (só chave própria: `constructor`/`__proto__` não valem). */
function paletteName(spec: StyleFrom, value: unknown): string | null {
  return typeof value === 'string' && Object.hasOwn(spec.map, value)
    ? value
    : null;
}

interface ColorMarkOptions {
  name: 'rtTextColor' | 'rtHighlight';
  tag: 'span' | 'mark';
  spec: StyleFrom;
  /** Nome aceito no lugar de um inválido lido do HTML (`mark` solto). */
  fallback: string | null;
}

function createColorMark(o: ColorMarkOptions) {
  const { spec, tag } = o;
  const config: MarkConfig = {
    name: o.name,
    addAttributes() {
      return {
        // `parseHTML` nulo: o nome só entra pelas regras abaixo (A3/B13).
        color: { default: null, rendered: false, parseHTML: () => null },
      };
    },
    parseHTML() {
      return [
        {
          tag: tag === 'span' ? 'span[data-rt-color]' : 'mark',
          // `consuming: false`: `lang` no mesmo `span` também casa.
          consuming: false,
          getAttrs: (dom: HTMLElement | string) => {
            if (typeof dom === 'string') return false;
            const name = paletteName(spec, dom.getAttribute('data-rt-color'));
            if (name !== null) return { color: name };
            return o.fallback === null ? false : { color: o.fallback };
          },
        },
      ];
    },
    renderHTML({ mark }) {
      const name = paletteName(spec, mark.attrs['color']);
      const style = name === null ? null : applyStyleFrom(spec, name);
      if (name === null || style === null) return [tag, 0];
      return [tag, { 'data-rt-color': name, style }, 0];
    },
  };
  return config;
}

/**
 * Cores por marcas próprias (spec 03b, B13): o nome da paleta vem só de
 * `data-rt-color`; o `style` é sempre regenerado da paleta, nunca lido.
 */
export function createColorExtensions(ctx: RteExtensionContext): Mark[] {
  const text = styleFromOf(ctx, 'span');
  const highlight = styleFromOf(ctx, 'mark');
  const rtTextColor = Mark.create({
    ...createColorMark({
      name: 'rtTextColor',
      tag: 'span',
      spec: text,
      fallback: null,
    }),
    addCommands() {
      return {
        setTextColor:
          (name) =>
          ({ commands }) =>
            paletteName(text, name) !== null &&
            commands.setMark(this.name, { color: name }),
        unsetTextColor:
          () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
      };
    },
  });
  const rtHighlight = Mark.create({
    ...createColorMark({
      name: 'rtHighlight',
      tag: 'mark',
      spec: highlight,
      fallback: 'yellow',
    }),
    addCommands() {
      return {
        setHighlight:
          (name) =>
          ({ commands }) =>
            paletteName(highlight, name) !== null &&
            commands.setMark(this.name, { color: name }),
        unsetHighlight:
          () =>
          ({ commands }) =>
            commands.unsetMark(this.name),
      };
    },
  });
  return [rtTextColor, rtHighlight];
}
