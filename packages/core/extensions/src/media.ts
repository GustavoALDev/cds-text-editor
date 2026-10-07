import { Node } from '@tiptap/core';
import type { AnyExtension, Attributes, CommandProps } from '@tiptap/core';
import type { DOMOutputSpec, NodeType } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { normalizeAttribute } from '../../src/schema/rules';
import type { RteAttrRule, RteHtmlSchema } from '../../src/schema/types';
import type { RteExtensionContext } from './context';
import { ImageView } from './image-view';
import { replaceEmptyParagraphWith } from './insert';
import { truncateText } from './limits';
import type {
  RteImageAlign,
  RteImageAttrs,
  RteVideoAttrs,
  RteVideoTrack,
} from './types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rtImage: {
      /**
       * Insere a imagem (lição 14: substitui o parágrafo vazio do cursor).
       * Com `at` (05c2a E9), as regras usam essa posição em vez da seleção,
       * sem mexer na seleção nem rolar; `at` inválido devolve `false`.
       */
      setImage: (attrs: RteImageAttrs, options?: { at?: number }) => ReturnType;
      /** Muda atributos da imagem selecionada. */
      updateImage: (attrs: Partial<RteImageAttrs>) => ReturnType;
      /** Largura da imagem selecionada; a altura segue a proporção. */
      setImageSize: (size: { width: number }) => ReturnType;
      setImageAlign: (align: RteImageAlign) => ReturnType;
    };
    rtVideo: {
      /**
       * Insere o vídeo (lição 14: substitui o parágrafo vazio do cursor).
       * Faixas inválidas são descartadas, não recusadas; só `tracks` que não
       * seja lista devolve `false`. `at`: como no `setImage`.
       */
      setVideo: (attrs: RteVideoAttrs, options?: { at?: number }) => ReturnType;
      /** Muda atributos do vídeo selecionado (faixas inválidas descartadas). */
      updateVideo: (attrs: Partial<RteVideoAttrs>) => ReturnType;
    };
  }
}

const ALIGNS: readonly RteImageAlign[] = ['left', 'center', 'right', 'full'];
const ALT_MAX = 1000;
const LABEL_MAX = 100;
const BLANK = /^[ \t\n\f\r]*$/;
// Valor recusado por uma checagem (o `null` é valor legítimo de "ausente").
const INVALID = Symbol('invalid');

type Check = (value: unknown) => unknown;
type Checks = Record<string, Check>;
type Attrs = Record<string, unknown>;

/** Regra de um atributo do esquema (o recurso do elemento precisa estar ligado). */
export function ruleOf(
  schema: RteHtmlSchema,
  tag: string,
  name: string,
): RteAttrRule {
  const element = Object.hasOwn(schema.elements, tag)
    ? schema.elements[tag]
    : undefined;
  const spec =
    element && Object.hasOwn(element.attributes, name)
      ? element.attributes[name]
      : undefined;
  if (!spec) throw new TypeError(`Esquema sem o atributo ${tag}[${name}].`);
  return spec.rule;
}

/** Forma canônica pela regra do esquema (texto, ou inteiro para `int`). */
function byRule(rule: RteAttrRule, value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return normalizeAttribute(rule, String(value));
  }
  return typeof value === 'string' ? normalizeAttribute(rule, value) : null;
}

/** Espaço em branco do HTML colapsado e aparado (sem mexer em NBSP). */
export function cleanText(value: string): string {
  return value.replace(/[ \t\n\f\r]+/g, ' ').replace(/^ | $/g, '');
}

const text: Check = (value) =>
  typeof value === 'string' ? cleanText(value) : INVALID;

function required(rule: RteAttrRule): Check {
  return (value) => byRule(rule, value) ?? INVALID;
}

function optional(rule: RteAttrRule): Check {
  return (value) => (value === null ? null : (byRule(rule, value) ?? INVALID));
}

function integer(rule: RteAttrRule): Check {
  const check = optional(rule);
  return (value) => {
    const out = check(value);
    return typeof out === 'string' ? Number(out) : out;
  };
}

/** Atributos com os padrões onde a entrada falta ou é inválida (leitura). */
function loose(checks: Checks, defaults: Attrs, input: Attrs): Attrs {
  const out: Attrs = {};
  for (const [name, check] of Object.entries(checks)) {
    const value = input[name] === undefined ? INVALID : check(input[name]);
    out[name] = value === INVALID ? defaults[name] : value;
  }
  return out;
}

/** `base` com a entrada do comando; qualquer valor inválido → `null`. */
function strict(checks: Checks, base: Attrs, input: unknown): Attrs | null {
  if (input === null || typeof input !== 'object') return null;
  const given = input as Attrs;
  const out: Attrs = { ...base };
  for (const [name, check] of Object.entries(checks)) {
    if (given[name] === undefined) continue;
    const value = check(given[name]);
    if (value === INVALID) return null;
    out[name] = value;
  }
  return out;
}

export function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

function hasClass(element: Element, token: string): boolean {
  return (element.getAttribute('class') ?? '').split(/\s+/).includes(token);
}

function childrenByTag(element: Element, tag: string): Element[] {
  return Array.from(element.children).filter((child) => tagOf(child) === tag);
}

const isCredit = (element: Element): boolean =>
  tagOf(element) === 'small' && hasClass(element, 'rt-credit');

// Elementos cujo conteúdo não é texto visível.
const NO_TEXT = new Set(['script', 'style', 'template']);

/**
 * Texto de `node` sem os elementos que `skip` aceita (só lê o DOM): `br`
 * vira espaço (não junta palavras) e `script`/`style`/`template` são
 * ignorados.
 */
export function textWithout(
  node: globalThis.Node,
  skip: (e: Element) => boolean = () => false,
): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out += child.nodeValue ?? '';
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const tag = tagOf(element);
    if (tag === 'br') out += ' ';
    else if (!NO_TEXT.has(tag) && !skip(element)) {
      out += textWithout(element, skip);
    }
  }
  return out;
}

/** Filhos significativos: sem comentários e sem texto só de espaço. */
export function meaningfulChildren(element: Element): Element[] | null {
  const out: Element[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 8) continue;
    if (child.nodeType === 3) {
      if (BLANK.test(child.nodeValue ?? '')) continue;
      return null;
    }
    if (child.nodeType === 1) out.push(child as Element);
  }
  return out;
}

/**
 * Mídia da `figure` (03a §4.7): `tag` filho direto ou, para `img`, dentro de
 * um único `a`/`picture` filho direto. Além dela só pode haver um
 * `figcaption` sem mídia; qualquer outro conteúdo devolve `null`, e a
 * leitura genérica preserva tudo (A1: o texto fica).
 */
function mediaOf(figure: Element, tag: 'img' | 'video'): Element | null {
  const children = meaningfulChildren(figure);
  if (!children) return null;
  let media: Element | null = null;
  let captions = 0;
  for (const child of children) {
    const name = tagOf(child);
    if (name === 'figcaption') {
      captions += 1;
      if (captions > 1 || child.querySelector('img, video, iframe')) {
        return null;
      }
      continue;
    }
    if (media) return null;
    if (name === tag) media = child;
    else if (tag === 'img' && (name === 'a' || name === 'picture')) {
      const inner = meaningfulChildren(child);
      const imgs = inner?.filter((e) => tagOf(e) === 'img') ?? [];
      const rest = inner?.filter(
        (e) =>
          tagOf(e) !== 'img' && !(name === 'picture' && tagOf(e) === 'source'),
      );
      if (imgs.length !== 1 || !rest || rest.length > 0) return null;
      media = imgs[0] ?? null;
    } else return null;
  }
  return media;
}

export function figcaptionOf(figure: Element | null): Element | null {
  return figure ? (childrenByTag(figure, 'figcaption')[0] ?? null) : null;
}

/** `figcaption` com `[legenda][ ][<small class="rt-credit">crédito</small>]`. */
export function captionSpec(caption: string, credit = ''): DOMOutputSpec[] {
  if (!caption && !credit) return [];
  const small: DOMOutputSpec[] = credit
    ? [['small', { class: 'rt-credit' }, credit]]
    : [];
  const lead = caption && credit ? `${caption} ` : caption;
  return [['figcaption', {}, ...(lead ? [lead] : []), ...small]];
}

/** Elemento selecionado (`NodeSelection`) do tipo, ou `null`. */
export function selected(props: CommandProps, type: NodeType) {
  const selection = props.tr.selection;
  return selection instanceof NodeSelection && selection.node.type === type
    ? { node: selection.node, pos: selection.from }
    : null;
}

/** Troca os atributos do nó selecionado, mantendo-o selecionado. */
export function update(
  props: CommandProps,
  pos: number,
  attrs: Attrs,
): boolean {
  if (props.dispatch) {
    props.tr.setNodeMarkup(pos, undefined, attrs);
    props.tr.setSelection(NodeSelection.create(props.tr.doc, pos));
  }
  return true;
}

export function nodeAttributes(defaults: Attrs): Attributes {
  // A leitura monta todos os atributos no `getAttrs` das regras; a
  // renderização é do `renderHTML` do nó.
  return Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [
      name,
      { default: value, rendered: false, parseHTML: () => null },
    ]),
  );
}

const IMAGE_DEFAULTS: Attrs = {
  src: null,
  alt: null,
  width: null,
  height: null,
  srcset: null,
  sizes: null,
  align: 'center',
  caption: '',
  credit: '',
};

const VIDEO_DEFAULTS: Attrs = {
  src: null,
  width: null,
  height: null,
  poster: null,
  preload: 'metadata',
  tracks: [],
  caption: '',
};

/**
 * Imagem e vídeo (spec 03b, §4 media e B10): nós atômicos com a figura da
 * 03a §4.7; legenda e crédito são atributos de texto puro. URLs, `srcset` e
 * `sizes` pelas regras do esquema na leitura, nos comandos e na renderização.
 */
export function createMediaExtensions(
  ctx: RteExtensionContext,
): AnyExtension[] {
  const schema = ctx.schema;
  const size = ruleOf(schema, 'img', 'width');
  const imageChecks: Checks = {
    src: required(ruleOf(schema, 'img', 'src')),
    alt: (value) =>
      value === null
        ? null
        : typeof value === 'string'
          ? truncateText(value, ALT_MAX)
          : INVALID,
    width: integer(size),
    height: integer(size),
    srcset: optional(ruleOf(schema, 'img', 'srcset')),
    sizes: optional(ruleOf(schema, 'img', 'sizes')),
    align: (value) =>
      ALIGNS.includes(value as RteImageAlign) ? value : INVALID,
    caption: text,
    credit: text,
  };

  const trackRules = {
    kind: ruleOf(schema, 'track', 'kind'),
    src: ruleOf(schema, 'track', 'src'),
    srclang: ruleOf(schema, 'track', 'srclang'),
  };
  /** Faixas válidas na forma canônica; no máximo um `default` (o primeiro). */
  const tracks: Check = (value) => {
    if (!Array.isArray(value)) return INVALID;
    const out: Required<RteVideoTrack>[] = [];
    let hasDefault = false;
    for (const item of value as unknown[]) {
      if (item === null || typeof item !== 'object') continue;
      const track = item as Attrs;
      // Sem `kind`, o HTML assume `subtitles`.
      const kind =
        track['kind'] === undefined || track['kind'] === null
          ? 'subtitles'
          : byRule(trackRules.kind, track['kind']);
      const src = byRule(trackRules.src, track['src']);
      const srclang = byRule(trackRules.srclang, track['srclang']);
      if (kind === null || src === null || srclang === null) continue;
      const label = track['label'];
      const isDefault: boolean = track['default'] === true && !hasDefault;
      hasDefault ||= isDefault;
      out.push({
        kind: kind as RteVideoTrack['kind'],
        src,
        srclang,
        label: typeof label === 'string' ? truncateText(label, LABEL_MAX) : '',
        default: isDefault,
      });
    }
    return out;
  };
  const videoChecks: Checks = {
    src: required(ruleOf(schema, 'video', 'src')),
    width: integer(size),
    height: integer(size),
    poster: optional(ruleOf(schema, 'video', 'poster')),
    preload: required(ruleOf(schema, 'video', 'preload')),
    tracks,
    caption: text,
  };

  /** Atributos de `img` (e da `figure`, se houver); `false` sem `src` válido. */
  function readImage(img: Element, figure: Element | null): Attrs | false {
    const src = imageChecks['src']?.(img.getAttribute('src'));
    if (src === INVALID) return false;
    const caption = figcaptionOf(figure);
    const credit = caption
      ? Array.from(caption.querySelectorAll('small')).find(isCredit)
      : undefined;
    const align = figure
      ? ALIGNS.find((a) => hasClass(figure, `rt-figure--${a}`))
      : undefined;
    return loose(imageChecks, IMAGE_DEFAULTS, {
      src,
      alt: img.getAttribute('alt'),
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
      srcset: img.getAttribute('srcset'),
      sizes: img.getAttribute('sizes'),
      align,
      caption: caption ? textWithout(caption, isCredit) : undefined,
      credit: credit ? textWithout(credit) : undefined,
    });
  }

  /** Atributos de `video` (`src` ou o 1º `source` válido); senão `false`. */
  function readVideo(video: Element, figure: Element | null): Attrs | false {
    const check = videoChecks['src'] as Check;
    let src = check(video.getAttribute('src'));
    for (const source of childrenByTag(video, 'source')) {
      if (src !== INVALID) break;
      src = check(source.getAttribute('src'));
    }
    if (src === INVALID) return false;
    const caption = figcaptionOf(figure);
    return loose(videoChecks, VIDEO_DEFAULTS, {
      src,
      width: video.getAttribute('width'),
      height: video.getAttribute('height'),
      poster: video.getAttribute('poster'),
      preload: video.getAttribute('preload'),
      tracks: childrenByTag(video, 'track').map((track) => ({
        kind: track.getAttribute('kind'),
        src: track.getAttribute('src'),
        srclang: track.getAttribute('srclang'),
        label: track.getAttribute('label'),
        default: track.hasAttribute('default'),
      })),
      caption: caption ? textWithout(caption) : undefined,
    });
  }

  /** `p` cujo único filho significativo é `img` (lição 18). */
  function onlyImage(p: HTMLElement): Element | null {
    let found: Element | null = null;
    for (const child of Array.from(p.childNodes)) {
      if (child.nodeType === 8) continue;
      if (child.nodeType === 3 && BLANK.test(child.nodeValue ?? '')) continue;
      if (found || child.nodeType !== 1) return null;
      found = child as Element;
    }
    return found && tagOf(found) === 'img' ? found : null;
  }

  const image = Node.create({
    name: 'rtImage',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes: () => nodeAttributes(IMAGE_DEFAULTS),
    parseHTML() {
      return [
        {
          tag: 'figure',
          getAttrs: (figure) => {
            const img = mediaOf(figure, 'img');
            return img ? readImage(img, figure) : false;
          },
        },
        { tag: 'img[src]', getAttrs: (img) => readImage(img, null) },
        {
          tag: 'p',
          // Acima do parágrafo (50): não sobra `<p></p>` (lição 18).
          priority: 60,
          getAttrs: (p) => {
            const img = onlyImage(p);
            return img ? readImage(img, null) : false;
          },
        },
      ];
    },
    renderHTML({ node }) {
      const a = loose(imageChecks, IMAGE_DEFAULTS, node.attrs);
      const img = {
        src: a['src'],
        alt: a['alt'] ?? '',
        width: a['width'] === null ? null : String(a['width']),
        height: a['height'] === null ? null : String(a['height']),
        loading: 'lazy',
        decoding: 'async',
        srcset: a['srcset'],
        sizes: a['sizes'],
      };
      return [
        'figure',
        { class: `rt-figure rt-figure--${String(a['align'])}` },
        ['img', img],
        ...captionSpec(a['caption'] as string, a['credit'] as string),
      ];
    },
    addNodeView() {
      return ({ node, view, getPos }) =>
        new ImageView({
          node,
          view,
          getPos,
          normalize: (attrs) => loose(imageChecks, IMAGE_DEFAULTS, attrs),
          minWidth: ctx.imageMinWidth,
        });
    },
    addCommands() {
      const type = () => this.type;
      const current = (props: CommandProps) => {
        const found = selected(props, type());
        return found
          ? {
              pos: found.pos,
              attrs: loose(imageChecks, IMAGE_DEFAULTS, found.node.attrs),
            }
          : null;
      };
      const patch = (props: CommandProps, input: unknown): boolean => {
        const found = current(props);
        if (!found) return false;
        const attrs = strict(imageChecks, found.attrs, input);
        if (!attrs || attrs['src'] === null) return false;
        return update(props, found.pos, attrs);
      };
      return {
        setImage: (input, options) => (props) => {
          const attrs = strict(imageChecks, IMAGE_DEFAULTS, input);
          if (!attrs || attrs['src'] === null) return false;
          const node = type().create(attrs);
          return replaceEmptyParagraphWith(node, options?.at)(props);
        },
        updateImage: (input) => (props) => patch(props, input),
        setImageAlign: (align) => (props) => patch(props, { align }),
        setImageSize: (input) => (props) => {
          const found = current(props);
          const width: unknown = (input as { width?: unknown } | null)?.width;
          if (!found || typeof width !== 'number') return false;
          const { width: w, height: h } = found.attrs;
          const height =
            typeof w === 'number' && typeof h === 'number'
              ? Math.max(1, Math.round((width * h) / w))
              : h;
          const attrs = strict(imageChecks, found.attrs, { width, height });
          return attrs ? update(props, found.pos, attrs) : false;
        },
      };
    },
  });

  const video = Node.create({
    name: 'rtVideo',
    group: 'block',
    atom: true,
    addAttributes: () => nodeAttributes(VIDEO_DEFAULTS),
    parseHTML() {
      return [
        {
          tag: 'figure',
          getAttrs: (figure) => {
            const element = mediaOf(figure, 'video');
            return element ? readVideo(element, figure) : false;
          },
        },
        { tag: 'video', getAttrs: (element) => readVideo(element, null) },
      ];
    },
    renderHTML({ node }) {
      const a = loose(videoChecks, VIDEO_DEFAULTS, node.attrs);
      const tracks = (a['tracks'] as Required<RteVideoTrack>[]).map(
        (t): DOMOutputSpec => [
          'track',
          {
            kind: t.kind,
            src: t.src,
            srclang: t.srclang,
            label: t.label || null,
            default: t.default ? '' : null,
          },
        ],
      );
      return [
        'figure',
        { class: 'rt-figure rt-figure--video' },
        [
          'video',
          {
            src: a['src'],
            controls: '',
            preload: a['preload'],
            playsinline: '',
            width: a['width'] === null ? null : String(a['width']),
            height: a['height'] === null ? null : String(a['height']),
            poster: a['poster'],
          },
          ...tracks,
        ],
        ...captionSpec(a['caption'] as string),
      ];
    },
    addCommands() {
      const type = () => this.type;
      return {
        setVideo: (input, options) => (props) => {
          const attrs = strict(videoChecks, VIDEO_DEFAULTS, input);
          if (!attrs || attrs['src'] === null) return false;
          const node = type().create(attrs);
          return replaceEmptyParagraphWith(node, options?.at)(props);
        },
        updateVideo: (input) => (props) => {
          const found = selected(props, type());
          if (!found) return false;
          const base = loose(videoChecks, VIDEO_DEFAULTS, found.node.attrs);
          const attrs = strict(videoChecks, base, input);
          if (!attrs || attrs['src'] === null) return false;
          return update(props, found.pos, attrs);
        },
      };
    },
  });

  return [image, video];
}
