// Geradores de documentos JSON do editor (fora do build), compartilhados pelas
// propriedades da serialização (spec 03b, §7.5) e da contagem (spec 03c, R2).
import * as fc from 'fast-check';
import {
  RTE_HIGHLIGHT_COLORS,
  RTE_TEXT_COLORS,
} from '../../../src/schema/palette';
import { dangerousUrl } from '../../../src/schema/testing/dangerous-urls';

export const NBSP = String.fromCharCode(0xa0);
// Espaço ASCII e controles C0/C1 (U+0000–U+0020, U+007F–U+009F): somem antes
// do teste do esquema, como fazem os navegadores ao resolver a URL.
export const isSpaceOrControl = (c: string) => {
  const code = c.charCodeAt(0);
  return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
};

export type Json = Record<string, unknown>;
export type Arb<T> = fc.Arbitrary<T>;

// ---------------------------------------------------------------------------
// Textos

/** Letra de texto: grafema imprimível, NBSP, `<`, `&`, aspas, emoji. */
const textChar = fc
  .oneof(
    fc.constantFrom(NBSP, '<', '>', '&', '"', "'", 'é', '😀', '&amp;'),
    fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
  )
  // espaço/controle ASCII e C1 colapsam ou somem na leitura do HTML
  .filter((c) => ![...c].some(isSpaceOrControl));

/**
 * Texto sem espaço nas pontas e com um espaço só entre palavras: ponto fixo
 * do colapso de espaços da leitura de HTML (que é intencional, A1).
 */
export const text = fc
  .array(fc.string({ unit: textChar, minLength: 1, maxLength: 6 }), {
    minLength: 1,
    maxLength: 3,
  })
  .map((words) => words.join(' '));

/** Texto de código: LF, TAB, CR, CRLF, NUL, não ASCII (pré-processados na escrita). */
const codeText = fc.string({
  unit: fc.oneof(
    fc.constantFrom('\n', '\t', '\r', '\r\n', '\0', NBSP, '<', '&', ' '),
    fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
  ),
  maxLength: 20,
});

/** Texto livre hostil: qualquer unidade de código, inclusive C0 e substitutos. */
export const binary = fc.string({ unit: 'binary', maxLength: 40 });

/** Valores que tentam fechar aspas, injetar estilo ou passar do limite. */
const hostileString = fc.oneof(
  binary,
  fc.constantFrom(
    'x" onclick="alert(1)',
    "x' onmouseover='alert(1)",
    'red; background: url(javascript:alert(1))',
    'red" style="background:url(javascript:x)',
    '<script>alert(1)</script>',
    'a'.repeat(5000),
    'ÿ\u0000\u001f\u007f\u0085',
  ),
);

// ---------------------------------------------------------------------------
// URLs

/** Mídia válida: `https` absoluta ou relativa (padrão `allowRelativeMedia`). */
const validMediaUrl = fc.oneof(
  fc.webUrl({ validSchemes: ['https'] }),
  fc.constantFrom('https://example.com/a.png', '/relativo/a.jpg', '/v.mp4'),
);

/** Link válido: mídia válida, `http`, `mailto:`, `tel:` e fragmento. */
const validLinkUrl = fc.oneof(
  validMediaUrl,
  fc.webUrl({ validSchemes: ['http', 'https'] }),
  fc.constantFrom('mailto:a@example.com', 'tel:+5511999999999', '#secao'),
);

/**
 * Par provedor/`src` canônico (o JSON guarda o `src` do iframe; URL de página
 * só vira embed na leitura do HTML).
 */
const validEmbed = fc.constantFrom(
  ['youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'] as const,
  ['youtube', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'] as const,
  ['vimeo', 'https://player.vimeo.com/video/76979871'] as const,
  [
    'spotify',
    'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
  ] as const,
  [
    'spotify',
    'https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3',
  ] as const,
);

/** URL arbitrária: perigosa ofuscada, `\`, `//`, texto qualquer ou válida. */
const anyUrl = fc.oneof(
  dangerousUrl,
  fc.string(),
  binary,
  fc.string().map((s) => `\\\\${s}`),
  fc.string().map((s) => `//${s}`),
  validLinkUrl,
);

const anyEmbed = fc.oneof(
  fc.tuple(
    fc.oneof(fc.constantFrom('youtube', 'vimeo', 'spotify'), fc.string()),
    anyUrl,
  ),
  validEmbed,
);

const maybe = <T>(arb: Arb<T>) => fc.option(arb, { nil: null });

// ---------------------------------------------------------------------------
// Documentos

/** O que muda entre o gerador válido (b) e o hostil (a). */
export interface Values {
  link: Arb<string>;
  media: Arb<string>;
  embed: Arb<readonly [string, string]>;
  target: Arb<unknown>;
  /** Atributos de texto livre (alt, title, caption, sizes, rótulos). */
  str: Arb<string>;
  textAlign: Arb<unknown>;
  start: Arb<unknown>;
  level: Arb<number>;
  variant: Arb<unknown>;
  textColor: Arb<unknown>;
  highlight: Arb<unknown>;
  lang: Arb<unknown>;
  dir: Arb<unknown>;
  language: Arb<unknown>;
  size: Arb<unknown>;
  ratio: Arb<unknown>;
}

export const VALID: Values = {
  link: validLinkUrl,
  media: validMediaUrl,
  embed: validEmbed,
  // único `target` canônico (outro valor sai sem atributo e junta links)
  target: maybe(fc.constant('_blank')),
  str: text,
  textAlign: maybe(fc.constantFrom('left', 'center', 'right', 'justify')),
  start: fc.integer({ min: 1, max: 10_000 }),
  level: fc.constantFrom(2, 3, 4),
  variant: fc.constantFrom('info', 'success', 'warning', 'danger'),
  textColor: fc.constantFrom(...RTE_TEXT_COLORS.map((c) => c.name)),
  highlight: fc.constantFrom(...RTE_HIGHLIGHT_COLORS.map((c) => c.name)),
  lang: fc.constantFrom('en', 'pt-BR', 'ar', 'zh-Hant'),
  dir: maybe(fc.constantFrom('ltr', 'rtl')),
  language: maybe(fc.constantFrom('javascript', 'python', 'js', 'css')),
  size: maybe(fc.integer({ min: 1, max: 4000 })),
  ratio: maybe(fc.constantFrom('16 / 9', '9 / 16', '4 / 3')),
};

export const HOSTILE: Values = {
  link: anyUrl,
  media: anyUrl,
  embed: anyEmbed,
  target: maybe(fc.oneof(fc.constantFrom('_blank', '_BLANK'), hostileString)),
  str: hostileString,
  textAlign: maybe(
    fc.oneof(fc.constantFrom('left', 'start', 'CENTER'), hostileString),
  ),
  start: fc.oneof(
    fc.integer(),
    fc.double(),
    hostileString,
    fc.constantFrom(0, -1, 1e21, '3"><b>'),
  ),
  level: fc.constantFrom(2, 3, 4),
  variant: fc.oneof(
    fc.constantFrom('info', 'danger', 'note', '__proto__', 'constructor'),
    hostileString,
  ),
  textColor: maybe(
    fc.oneof(fc.constantFrom('red', 'toString', '#ff0000'), hostileString),
  ),
  highlight: maybe(
    fc.oneof(fc.constantFrom('yellow', '__proto__'), hostileString),
  ),
  lang: maybe(fc.oneof(fc.constantFrom('en', 'pt-BR'), hostileString)),
  dir: maybe(fc.oneof(fc.constantFrom('rtl', 'auto'), hostileString)),
  language: maybe(fc.oneof(fc.constantFrom('javascript'), hostileString)),
  size: maybe(fc.oneof(fc.integer(), fc.double(), hostileString)),
  ratio: maybe(fc.oneof(fc.constantFrom('16 / 9'), hostileString)),
};

const SIMPLE_MARKS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
] as const;

export function docArb(v: Values): Arb<Json> {
  const mark = (type: string, attrs?: Json): Json =>
    attrs ? { type, attrs } : { type };

  // `code` exclui toda outra marca: ou só `code`, ou qualquer combinação do resto.
  const marks: Arb<Json[]> = fc.oneof(
    { weight: 1, arbitrary: fc.constant<Json[]>([mark('code')]) },
    {
      weight: 4,
      arbitrary: fc
        .record(
          {
            simple: fc.subarray([...SIMPLE_MARKS]),
            link: fc.option(fc.record({ href: v.link, target: v.target })),
            color: fc.option(v.textColor),
            highlight: fc.option(v.highlight),
            lang: fc.option(fc.record({ lang: v.lang, dir: v.dir })),
          },
          { requiredKeys: ['simple'] },
        )
        .map((m) => [
          ...m.simple.map((t) => mark(t)),
          ...(m.link ? [mark('link', m.link)] : []),
          ...(m.color !== undefined && m.color !== null
            ? [mark('rtTextColor', { color: m.color })]
            : []),
          ...(m.highlight !== undefined && m.highlight !== null
            ? [mark('rtHighlight', { color: m.highlight })]
            : []),
          ...(m.lang ? [mark('rtLang', m.lang)] : []),
        ]),
    },
  );

  const textNode = fc.tuple(text, marks).map(([t, m]) => ({
    type: 'text',
    text: t,
    ...(m.length ? { marks: m } : {}),
  }));
  const inline = (withBreak = true) =>
    fc.array(
      withBreak
        ? fc.oneof(
            { weight: 5, arbitrary: textNode },
            { weight: 1, arbitrary: fc.constant({ type: 'hardBreak' }) },
          )
        : textNode,
      { maxLength: 4 },
    );
  const content = (nodes: Json[]) => (nodes.length ? { content: nodes } : {});

  const paragraph = fc
    .record({ textAlign: v.textAlign, nodes: inline() })
    .map(({ textAlign, nodes }) => ({
      type: 'paragraph',
      attrs: { textAlign },
      ...content(nodes),
    }));
  // Títulos repetidos (sufixo -2) e vazios (fallback `section`).
  const headingText = fc.oneof(
    textNode,
    fc.constantFrom({ type: 'text', text: 'Título' }),
  );
  const heading = fc
    .record({
      level: v.level,
      textAlign: v.textAlign,
      nodes: fc.array(headingText, { maxLength: 2 }),
    })
    .map(({ level, textAlign, nodes }) => ({
      type: 'heading',
      attrs: { level, textAlign },
      ...content(nodes),
    }));

  const size = v.size;
  const image = fc
    .record({
      src: v.media,
      alt: maybe(v.str),
      width: size,
      height: size,
      srcset: maybe(
        fc.oneof(
          v.media,
          v.media.map((u) => `${u} 2x`),
        ),
      ),
      sizes: maybe(v.str),
      align: fc.constantFrom('left', 'center', 'right', 'full'),
      caption: v.str,
      credit: v.str,
    })
    .map((attrs) => ({ type: 'rtImage', attrs }));
  const track = fc.record({
    kind: fc.constantFrom('captions', 'subtitles'),
    src: v.media,
    srclang: fc.constantFrom('pt', 'en', 'pt-BR'),
    label: v.str,
    default: fc.boolean(),
  });
  const video = fc
    .record({
      src: v.media,
      width: size,
      height: size,
      poster: maybe(v.media),
      preload: fc.constantFrom('metadata', 'none'),
      tracks: fc.array(track, { maxLength: 2 }),
      caption: v.str,
    })
    .map((attrs) => ({ type: 'rtVideo', attrs }));
  const embed = fc
    .record({
      target: v.embed,
      title: v.str,
      width: size,
      height: size,
      aspectRatio: v.ratio,
      caption: v.str,
    })
    .map(({ target: [provider, src], ...rest }) => ({
      type: 'rtEmbed',
      attrs: { provider, src, ...rest },
    }));
  const code = fc
    .record({ language: v.language, body: codeText })
    .map(({ language, body }) => ({
      type: 'codeBlock',
      attrs: { language },
      ...content(body ? [{ type: 'text', text: body }] : []),
    }));
  const hr = fc.constant({ type: 'horizontalRule' });

  const task = fc
    .record({ checked: fc.boolean(), nodes: inline() })
    .map(({ checked, nodes }) => ({
      type: 'rtTaskItem',
      attrs: { checked },
      ...content(nodes),
    }));
  const tasks = fc
    .array(task, { minLength: 1, maxLength: 3 })
    .map((items) => ({ type: 'rtTaskList', content: items }));

  const cell = (first: boolean) =>
    fc
      .record({
        header: fc.boolean(),
        colspan: fc.integer({ min: 1, max: 3 }),
        rowspan: fc.integer({ min: 1, max: 3 }),
        scope: maybe(fc.constantFrom('col', 'row')),
        widths: fc.array(fc.integer({ min: 0, max: 9999 }), {
          minLength: 3,
          maxLength: 3,
        }),
        body: fc.array(paragraph, { minLength: 1, maxLength: 2 }),
      })
      .map(({ header, colspan, rowspan, scope, widths, body }) => ({
        type: header ? 'tableHeader' : 'tableCell',
        attrs: {
          colspan,
          rowspan,
          // só a 1ª linha gera o colgroup
          colwidth: first ? widths.slice(0, colspan) : null,
          ...(header ? { scope } : {}),
        },
        content: body,
      }));
  const row = (first: boolean) =>
    fc
      .array(cell(first), { minLength: 1, maxLength: 3 })
      .map((cells) => ({ type: 'tableRow', content: cells }));
  const table = fc
    .tuple(row(true), fc.array(row(false), { maxLength: 2 }))
    .map(([head, rest]) => ({ type: 'table', content: [head, ...rest] }));

  const readAlsoItem = fc
    .array(textNode, { minLength: 1, maxLength: 2 })
    .map((nodes) => ({ type: 'rtReadAlsoItem', content: nodes }));
  const readAlso = fc
    .record({
      title: inline(false),
      items: fc.array(readAlsoItem, { minLength: 1, maxLength: 3 }),
    })
    .map(({ title, items }) => ({
      type: 'rtReadAlso',
      content: [
        { type: 'rtReadAlsoTitle', ...content(title) },
        { type: 'rtReadAlsoList', content: items },
      ],
    }));

  const blocks = (depth: number): Arb<Json> => {
    const leaves: Arb<Json>[] = [
      paragraph,
      heading,
      image,
      video,
      embed,
      code,
      hr,
      tasks,
      readAlso,
    ];
    if (depth === 0) return fc.oneof(...leaves);
    const inner = blocks(depth - 1);
    const lists = list(depth);
    const blockquote = fc
      .array(inner, { minLength: 1, maxLength: 2 })
      .map((content) => ({ type: 'blockquote', content }));
    const callout = fc
      .record({
        variant: v.variant,
        title: inline(false),
        body: fc.array(fc.oneof(paragraph, lists), {
          minLength: 1,
          maxLength: 2,
        }),
      })
      .map(({ variant, title, body }) => ({
        type: 'rtCallout',
        attrs: { variant },
        content: [{ type: 'rtCalloutTitle', ...content(title) }, ...body],
      }));
    const pullquote = fc
      .record({
        author: v.str,
        role: v.str,
        body: fc.array(paragraph, { minLength: 1, maxLength: 2 }),
      })
      .map(({ author, role, body }) => ({
        type: 'rtPullquote',
        attrs: { author, role },
        content: body,
      }));
    return fc.oneof(...leaves, lists, blockquote, table, callout, pullquote);
  };

  // Listas aninhadas até 2 níveis.
  function list(depth: number): Arb<Json> {
    const item: Arb<Json> =
      depth > 0
        ? fc
            .tuple(paragraph, fc.array(list(depth - 1), { maxLength: 1 }))
            .map(([p, nested]) => ({
              type: 'listItem',
              content: [p, ...nested],
            }))
        : paragraph.map((p) => ({ type: 'listItem', content: [p] }));
    return fc
      .record({
        ordered: fc.boolean(),
        start: v.start,
        items: fc.array(item, { minLength: 1, maxLength: 2 }),
      })
      .map(({ ordered, start, items }) =>
        ordered
          ? { type: 'orderedList', attrs: { start }, content: items }
          : { type: 'bulletList', content: items },
      );
  }

  return fc
    .array(blocks(2), { minLength: 1, maxLength: 5 })
    .map((nodes) => ({ type: 'doc', content: nodes }));
}

/** Documento com valores hostis (segurança). */
export const hostileDoc = docArb(HOSTILE);
/** Documento só com valores válidos e textos arbitrários (idempotência). */
export const validDoc = docArb(VALID);
