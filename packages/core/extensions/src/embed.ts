import { Node } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import { toEmbed } from '../../src/embeds/to-embed';
import { normalizeAttribute } from '../../src/schema/rules';
import { sanitizeStyle } from '../../src/schema/style';
import type { RteAttrRule, RteEmbedProvider } from '../../src/schema/types';
import type { RteExtensionContext } from './context';
import { replaceEmptyParagraphWith } from './insert';
import { truncateText } from './limits';
import {
  captionSpec,
  cleanText,
  figcaptionOf,
  meaningfulChildren,
  nodeAttributes,
  ruleOf,
  selected,
  tagOf,
  textWithout,
  update,
} from './media';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtEmbed: {
      /**
       * Insere o embed da URL de página (via `toEmbed` com os provedores
       * ativos; lição 14: substitui o parágrafo vazio do cursor). URL sem
       * provedor ou legenda que não seja texto devolve `false`.
       */
      setEmbed: (url: string, options?: { caption?: string }) => ReturnType;
      /** Troca a legenda do embed selecionado. */
      updateEmbed: (attrs: { caption: string }) => ReturnType;
    };
  }
}

type Attrs = Record<string, unknown>;

const WIDTH = 640;
/** Teto de altura do `int(1, 10000)` do esquema para o `iframe`. */
const HEIGHT_MAX = 10000;

const EMBED_DEFAULTS: Attrs = {
  provider: null,
  src: null,
  title: '',
  // Sem tamanho no JSON a renderização deriva 640 × altura pela proporção.
  width: null,
  height: null,
  aspectRatio: null,
  caption: '',
};

/** `src` aceito e o provedor dono dele (mais as dicas do `toEmbed`). */
interface Resolved {
  provider: RteEmbedProvider;
  src: string;
  aspectRatio: string | null;
  height: number | null;
}

/**
 * `iframe` da `figure` (03a §4.8): filho direto, com no máximo um
 * `figcaption` sem mídia ao lado. Qualquer outro conteúdo devolve `null` e a
 * leitura genérica preserva tudo (A1: o texto fica).
 */
function iframeOf(figure: Element): Element | null {
  const children = meaningfulChildren(figure);
  if (!children) return null;
  let iframe: Element | null = null;
  let captions = 0;
  for (const child of children) {
    const name = tagOf(child);
    if (name === 'figcaption') {
      captions += 1;
      if (captions > 1 || child.querySelector('img, video, iframe')) {
        return null;
      }
    } else if (name === 'iframe' && !iframe) iframe = child;
    else return null;
  }
  return iframe;
}

/**
 * Embeds (spec 03b, §4 embeds; 03a §4.8): nó atômico `rtEmbed` com
 * `figure.rt-embed > iframe`. O `src` passa pela regra do `iframe` do esquema
 * (hosts e padrões dos provedores ativos) ou é convertido por `toEmbed`;
 * `srcdoc` nunca é lido. `sandbox`, `allow` e `referrerpolicy` vêm do esquema.
 * A renderização revalida tudo: `src` fora dos provedores sai sem `src`.
 */
export function createEmbedExtension(ctx: RteExtensionContext): AnyExtension {
  const schema = ctx.schema;
  const srcRule = ruleOf(schema, 'iframe', 'src');
  const titleRule = ruleOf(schema, 'iframe', 'title');
  const sizeRule = ruleOf(schema, 'iframe', 'width');
  const titleMax = titleRule.kind === 'text' ? titleRule.maxLength : 300;
  const iframeSpec = schema.elements['iframe'];
  const styles = iframeSpec?.styles ?? {};
  const ratioRule: RteAttrRule | undefined = Object.hasOwn(
    styles,
    'aspect-ratio',
  )
    ? styles['aspect-ratio']
    : undefined;

  /** Valor fixo do esquema (`default` do atributo). */
  const fixed = (name: string): string => {
    const spec =
      iframeSpec && Object.hasOwn(iframeSpec.attributes, name)
        ? iframeSpec.attributes[name]
        : undefined;
    if (spec?.default === undefined) {
      throw new TypeError(`Esquema sem valor fixo para iframe[${name}].`);
    }
    return spec.default;
  };
  const referrerpolicy = fixed('referrerpolicy');
  const allow = fixed('allow');
  const sandbox = fixed('sandbox');

  const byId = new Map(ctx.providers.map((p) => [p.id, p]));
  const patterns = ctx.providers.map((provider) => ({
    provider,
    regexps: provider.srcPatterns.map((p) => new RegExp(p)),
  }));

  /** `src` já de embed aceito pelo esquema; provedor = o 1º cujo padrão casa. */
  function direct(value: unknown): Resolved | null {
    if (typeof value !== 'string') return null;
    const src = normalizeAttribute(srcRule, value);
    if (src === null) return null;
    const owner = patterns.find((p) => p.regexps.some((r) => r.test(src)));
    return owner
      ? { provider: owner.provider, src, aspectRatio: null, height: null }
      : null;
  }

  /**
   * Dicas de altura e proporção do `toEmbed` para um `src` já de embed que o
   * provedor reconhece e devolve igual: a URL de página e a de `/embed/` dão a
   * mesma saída.
   */
  function withHints(found: Resolved): Resolved {
    const embed = toEmbed(found.src, ctx.providers);
    if (
      !embed ||
      embed.provider !== found.provider.id ||
      direct(embed.src)?.src !== found.src
    ) {
      return found;
    }
    return {
      ...found,
      aspectRatio: embed.aspectRatio ?? null,
      height: embed.height,
    };
  }

  /** `src` direto ou convertido de URL de página por `toEmbed`. */
  function resolve(value: unknown): Resolved | null {
    const found = direct(value);
    if (found) return withHints(found);
    if (typeof value !== 'string') return null;
    const embed = toEmbed(value, ctx.providers);
    const provider = embed ? byId.get(embed.provider) : undefined;
    // O `src` do `toEmbed` passa de novo pela regra do esquema.
    const checked = embed ? direct(embed.src) : null;
    if (!embed || !provider || checked?.provider !== provider) return null;
    return {
      provider,
      src: checked.src,
      aspectRatio: embed.aspectRatio ?? null,
      height: embed.height,
    };
  }

  function ratioOf(value: unknown): string | null {
    if (!ratioRule || typeof value !== 'string') return null;
    return normalizeAttribute(ratioRule, value);
  }

  /** Proporção do `style` da entrada (só `aspect-ratio`, pelo esquema). */
  function styleRatio(style: string | null): string | null {
    if (style === null) return null;
    const clean = sanitizeStyle(styles, style);
    const m = /^aspect-ratio: (.+)$/.exec(clean);
    return m ? ratioOf(m[1]) : null;
  }

  function sizeOf(value: unknown): number | null {
    const raw =
      typeof value === 'number' && Number.isInteger(value)
        ? String(value)
        : value;
    if (typeof raw !== 'string') return null;
    const out = normalizeAttribute(sizeRule, raw);
    return out === null ? null : Number(out);
  }

  /** `width`/`height` válidos, ou 640 × altura pela proporção (16 / 9 sem). */
  function dimensions(
    width: unknown,
    height: unknown,
    ratio: string | null,
    hint: number | null,
  ): { width: number; height: number } {
    const w = sizeOf(width);
    const h = sizeOf(height);
    if (w !== null && h !== null) return { width: w, height: h };
    const parts = ratio?.split(' / ').map(Number);
    const fallback =
      parts && parts[0] && parts[1]
        ? Math.round((WIDTH * parts[1]) / parts[0])
        : (hint ?? Math.round((WIDTH * 9) / 16));
    // Proporção extrema (1 / 16, 9999 / 1) não pode sair do int(1, 10000).
    return {
      width: WIDTH,
      height: Math.min(HEIGHT_MAX, Math.max(1, fallback)),
    };
  }

  function titleOf(value: unknown, provider: RteEmbedProvider | null): string {
    const title =
      typeof value === 'string' ? truncateText(value, titleMax) : '';
    return /^[ \t\n\f\r]*$/.test(title) ? (provider?.name ?? '') : title;
  }

  function readEmbed(iframe: Element, figure: Element | null): Attrs | false {
    const found = resolve(iframe.getAttribute('src'));
    if (!found) return false;
    const ratio = styleRatio(iframe.getAttribute('style')) ?? found.aspectRatio;
    const caption = figcaptionOf(figure);
    return {
      provider: found.provider.id,
      src: found.src,
      title: titleOf(iframe.getAttribute('title'), found.provider),
      ...dimensions(
        iframe.getAttribute('width'),
        iframe.getAttribute('height'),
        ratio,
        found.height,
      ),
      aspectRatio: ratio,
      caption: caption ? cleanText(textWithout(caption)) : '',
    };
  }

  return Node.create({
    name: 'rtEmbed',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes: () => nodeAttributes(EMBED_DEFAULTS),
    parseHTML() {
      return [
        {
          tag: 'figure',
          getAttrs: (figure) => {
            const iframe = iframeOf(figure);
            return iframe ? readEmbed(iframe, figure) : false;
          },
        },
        { tag: 'iframe', getAttrs: (iframe) => readEmbed(iframe, null) },
        // `iframe` recusado some com o conteúdo (texto de fallback não vira texto).
        { tag: 'iframe', ignore: true, priority: 0 },
      ];
    },
    renderHTML({ node }) {
      const a = node.attrs as Attrs;
      // Só `src` já de embed: a renderização nunca converte nem confia no JSON.
      const found = direct(a['src']);
      const id = a['provider'];
      const provider =
        found?.provider ??
        (typeof id === 'string' ? (byId.get(id) ?? null) : null);
      // Proporção ausente = a do provedor para o `src` (a mesma que a leitura
      // do HTML acrescenta): a saída é ponto fixo da releitura.
      const hints = found ? withHints(found) : null;
      const ratio = ratioOf(a['aspectRatio']) ?? hints?.aspectRatio ?? null;
      const size = dimensions(
        a['width'],
        a['height'],
        ratio,
        hints?.height ?? null,
      );
      const caption =
        typeof a['caption'] === 'string' ? cleanText(a['caption']) : '';
      return [
        'figure',
        {
          class: provider ? `rt-embed rt-embed--${provider.id}` : 'rt-embed',
          'data-rt-provider': provider?.id ?? null,
        },
        [
          'iframe',
          {
            src: found?.src ?? null,
            title: titleOf(a['title'], provider),
            width: String(size.width),
            height: String(size.height),
            style: ratio ? `aspect-ratio: ${ratio}` : null,
            loading: 'lazy',
            referrerpolicy,
            allow,
            allowfullscreen: '',
            sandbox,
          },
        ],
        ...captionSpec(caption),
      ];
    },
    addCommands() {
      const type = () => this.type;
      return {
        setEmbed: (url, options) => (props) => {
          if (
            options !== undefined &&
            (options === null || typeof options !== 'object')
          ) {
            return false;
          }
          const caption: unknown = options?.caption ?? '';
          if (typeof caption !== 'string' || typeof url !== 'string') {
            return false;
          }
          const embed = toEmbed(url, ctx.providers);
          const found = embed ? direct(embed.src) : null;
          if (!embed || !found || found.provider.id !== embed.provider) {
            return false;
          }
          const node = type().create({
            provider: found.provider.id,
            src: found.src,
            title: embed.title,
            width: embed.width,
            height: embed.height,
            aspectRatio: embed.aspectRatio ?? null,
            caption: cleanText(caption),
          });
          return replaceEmptyParagraphWith(node)(props);
        },
        updateEmbed: (input) => (props) => {
          const found = selected(props, type());
          const caption: unknown = (input as { caption?: unknown } | null)
            ?.caption;
          if (!found || typeof caption !== 'string') return false;
          return update(props, found.pos, {
            ...found.node.attrs,
            caption: cleanText(caption),
          });
        },
      };
    },
  });
}
