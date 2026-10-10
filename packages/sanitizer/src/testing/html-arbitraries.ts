// Geradores fast-check de HTML para as propriedades do sanitizador (spec 04,
// §6.2): `hostileHtml` mistura marcação do esquema com marcação perigosa e
// malformada; `validHtml` só produz HTML canônico pelas regras N1–N7 (para o
// diferencial `s(x) === x`). Fora do build.
import {
  escapeHtmlAttribute,
  escapeHtmlText,
  getElementSpec,
  getHtmlSchema,
  RTE_HIGHLIGHT_COLORS,
  RTE_TEXT_COLORS,
  type RteAttrRule,
} from '@comodeviaser/rte-core';
import * as fc from 'fast-check';
import { dangerousUrl } from './dangerous-urls';

const DEFAULT_SCHEMA = getHtmlSchema();

/** S3b: elementos de texto cru, estrangeiros ou invisíveis (conteúdo descartado). */
const DISCARDED_TAGS = [
  'script',
  'style',
  'template',
  'noscript',
  'noembed',
  'noframes',
  'textarea',
  'title',
  'xmp',
  'plaintext',
  'object',
  'embed',
  'svg',
  'math',
  'head',
];

/** Elementos perigosos ou que o parser HTML trata de forma especial. */
const HOSTILE_TAGS = [
  'base',
  'form',
  'meta',
  'link',
  'div',
  'h1',
  'select',
  'button',
  'image',
  'body',
  'html',
  'listing',
  'mglyph',
  'malignmark',
];

const SCHEMA_TAGS = Object.keys(DEFAULT_SCHEMA.elements);

const TAGS = [...new Set([...SCHEMA_TAGS, ...DISCARDED_TAGS, ...HOSTILE_TAGS])];

const SCHEMA_ATTRIBUTES = Object.values(DEFAULT_SCHEMA.elements).flatMap(
  (spec) => Object.keys(spec.attributes),
);

const ATTRIBUTES = [
  ...new Set([
    ...SCHEMA_ATTRIBUTES,
    'class',
    'style',
    'id',
    'name',
    'onclick',
    'onerror',
    'srcdoc',
    'formaction',
    'xlink:href',
    '__proto__',
    'constructor',
  ]),
];

/** URLs aceitas por alguma regra de URL do esquema padrão. */
const VALID_URLS = [
  'https://example.com/',
  'https://example.com/a.jpg',
  '/img/b.png',
  '#rt-intro',
  'mailto:fulana@example.com',
  'tel:+5511999999999',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  'https://player.vimeo.com/video/76979871',
  'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
];

/** Exemplos aceitos pelas regras `pattern` do esquema padrão, por atributo. */
const PATTERN_VALUES: Readonly<Record<string, readonly string[]>> = {
  id: ['rt-intro', 'rt-titulo-2'],
  lang: ['en', 'pt-BR'],
  srclang: ['en', 'pt-BR'],
  sizes: ['(max-width: 600px) 100vw, 600px'],
};

/** `style` aceitos por algum elemento do esquema padrão. */
const VALID_STYLES = [
  'text-align: center',
  'text-align: justify',
  'color: #1d4ed8',
  'background-color: #fff3a3',
  'width: 200px',
  'aspect-ratio: 16 / 9',
];

/** Valores que a regra aceita (ou um texto qualquer, quando a regra aceita quase tudo). */
function validValues(name: string, rule: RteAttrRule): readonly string[] {
  switch (rule.kind) {
    case 'enum':
      return rule.values;
    case 'tokens':
      return [...rule.values, rule.values.join(rule.separator)];
    case 'int':
      return ['1', '2', '640'];
    case 'bool':
      return [''];
    case 'text':
      return ['', 'Foto', 'YouTube'];
    case 'url':
      return VALID_URLS;
    case 'srcset':
      return [
        'https://example.com/a-600.jpg 600w, https://example.com/a-1200.jpg 1200w',
      ];
    case 'pattern':
      return PATTERN_VALUES[name] ?? ['rt-intro'];
  }
}

/** Atributos de `tag` no esquema padrão (mais `class` e `style`), com valores aceitos. */
function ownAttributes(
  tag: string,
): [name: string, values: readonly string[]][] {
  const spec = getElementSpec(DEFAULT_SCHEMA, tag);
  if (spec === undefined) return [];
  const own: [string, readonly string[]][] = Object.entries(
    spec.attributes,
  ).map(([name, attr]) => [name, validValues(name, attr.rule)]);
  const classes = spec.classes?.values ?? [];
  if (classes.length > 0) {
    own.push(['class', [...classes, classes.slice(0, 2).join(' ')]]);
  }
  if (spec.classes?.patterns) own.push(['class', ['language-js']]);
  if (spec.styles || spec.styleFrom) own.push(['style', VALID_STYLES]);
  return own;
}

/** Cargas perigosas de `style`. */
const STYLE_PAYLOADS = [
  'background: url(javascript:alert(1))',
  'background-image: url("https://evil.test/x.png")',
  'width: expression(alert(1))',
  'color: red; background: \\75 rl(javascript:alert(1))',
  'text-align: center !important',
  'background-image: image-set("javascript:alert(1)" 1x)',
  '@import "https://evil.test/x.css"; color: red',
  'text-align: center; behavior: url(x.htc)',
  'color: #1d4ed8; /* */ background: url(x)',
];

/** Sinal de Kelvin (U+212A): `toLowerCase()` o leva a `k`. */
const KELVIN_SIGN = String.fromCharCode(0x212a);

/**
 * Caixa aleatória; com `kelvin`, todo `k` vira o sinal de Kelvin (U+212A),
 * que o `htmlparser2` lê como `k` ao passar os nomes para minúsculas.
 */
function randomCase(names: readonly string[]): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...names),
      fc.array(fc.boolean(), { minLength: 32, maxLength: 32 }),
      fc.boolean(),
    )
    .map(([name, caps, kelvin]) => {
      const cased = [...name]
        .map((c, i) => (caps[i] ? c.toUpperCase() : c))
        .join('');
      return kelvin ? cased.replace(/k/gi, KELVIN_SIGN) : cased;
    });
}

const tagName = randomCase(TAGS);

/** Valor hostil: aceito por alguma regra, URL perigosa, carga de `style` ou texto qualquer. */
const hostileValue: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...VALID_URLS, ...VALID_STYLES, 'rt-intro', '_blank', ''),
  dangerousUrl,
  fc.constantFrom(...STYLE_PAYLOADS),
  fc.string(),
);

/** Valor entre aspas duplas, simples ou sem aspas (às vezes cru, quebrando a marcação). */
function quoted(value: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(value, fc.constantFrom('double', 'double-raw', 'single', 'none'))
    .map(([v, quote]) => {
      switch (quote) {
        case 'double':
          return `="${escapeHtmlAttribute(v)}"`;
        case 'double-raw':
          return `="${v}"`;
        case 'single':
          return `='${v.replace(/'/g, '&#39;')}'`;
        default:
          return `=${v}`;
      }
    });
}

function attribute(
  name: fc.Arbitrary<string>,
  value: fc.Arbitrary<string>,
): fc.Arbitrary<string> {
  return fc
    .tuple(name, fc.option(quoted(value), { freq: 5 }))
    .map(([n, v]) => ` ${n}${v ?? ''}`);
}

/** Atributo qualquer da lista, com valor hostil. */
const anyAttribute = attribute(randomCase(ATTRIBUTES), hostileValue);

/**
 * Abertura de `tag`: os atributos vêm, na maior parte, do próprio elemento no
 * esquema (com valor aceito ou hostil), para que elementos com atributo
 * obrigatório (`a`, `img`, `iframe`…) sobrevivam e exercitem as regras.
 */
function openTagFor(tag: string): fc.Arbitrary<string> {
  const own = ownAttributes(tag).map(([name, values]) =>
    attribute(
      randomCase([name]),
      fc.oneof(
        { arbitrary: fc.constantFrom(...values), weight: 3 },
        { arbitrary: hostileValue, weight: 1 },
      ),
    ),
  );
  const attr =
    own.length === 0
      ? anyAttribute
      : fc.oneof(
          { arbitrary: fc.oneof(...own), weight: 3 },
          { arbitrary: anyAttribute, weight: 1 },
        );
  return fc
    .tuple(randomCase([tag]), fc.array(attr, { maxLength: 5 }), fc.boolean())
    .map(
      ([name, attrs, selfClosing]) =>
        `<${name}${attrs.join('')}${selfClosing ? '/' : ''}>`,
    );
}

/**
 * Aberturas com peso maior para as tags do esquema: as de S3b sem fechamento
 * descartam todo o resto do documento e, frequentes, esvaziariam a saída.
 */
const openTag: fc.Arbitrary<string> = fc.oneof(
  {
    arbitrary: fc.oneof(...SCHEMA_TAGS.map(openTagFor)),
    weight: 6,
  },
  { arbitrary: fc.oneof(...HOSTILE_TAGS.map(openTagFor)), weight: 2 },
  { arbitrary: fc.oneof(...DISCARDED_TAGS.map(openTagFor)), weight: 1 },
);

const closeTag: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: tagName.map((tag) => `</${tag}>`), weight: 4 },
  { arbitrary: fc.constant('</'), weight: 1 },
  { arbitrary: tagName.map((tag) => `</${tag}`), weight: 1 },
);

const text: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.constantFrom(
    '<',
    '&',
    '&lt;',
    '&amp;lt;',
    '&#x3c;script&#x3e;',
    '&nbsp;',
    '\r\n',
    '\0',
  ),
);

const special: fc.Arbitrary<string> = fc.oneof(
  fc.string().map((s) => `<!--${s}-->`),
  fc.constantFrom('<!-->', '--!>', '<!doctype html>', '<?x?>'),
  fc.string().map((s) => `<![CDATA[${s}]]>`),
);

// --- HTML válido e canônico -------------------------------------------------

/** Links canônicos (a forma que o `isAllowedUrl` devolve). */
const LINKS = [
  'https://example.com/',
  'https://example.com/materia?id=1#topo',
  'http://example.org/a/b',
  '/sobre',
  '#rt-intro',
  'mailto:fulana@example.com',
  'tel:+5511999999999',
];

const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

const INLINE_MARKS = ['strong', 'em', 'u', 's', 'code', 'sup', 'sub'];

const DEPTH = { maxDepth: 4, depthIdentifier: 'valid-html' } as const;

const escapedText = fc.string({ unit: 'binary' }).map(escapeHtmlText);

const join = (parts: string[]): string => parts.join('');

/** Envolve o conteúdo `child` em cada elemento em linha do esquema (sem `a`). */
function inlineWrappers(child: fc.Arbitrary<string>): fc.Arbitrary<string>[] {
  const content = fc.array(child, { maxLength: 3 }).map(join);
  return [
    fc
      .tuple(fc.constantFrom(...INLINE_MARKS), content)
      .map(([tag, c]) => `<${tag}>${c}</${tag}>`),
    fc
      .tuple(fc.constantFrom(...RTE_TEXT_COLORS), content)
      .map(
        ([color, c]) =>
          `<span data-rt-color="${color.name}" style="color: ${color.light}">${c}</span>`,
      ),
    fc
      .tuple(fc.constantFrom(...RTE_HIGHLIGHT_COLORS), content)
      .map(
        ([color, c]) =>
          `<mark data-rt-color="${color.name}" style="background-color: ${color.light}">${c}</mark>`,
      ),
    fc
      .tuple(fc.constantFrom('en', 'es', 'pt-BR'), content)
      .map(([lang, c]) => `<span lang="${lang}">${c}</span>`),
  ];
}

const tree = fc.letrec<{
  inline: string;
  linkInline: string;
  block: string;
}>((tie) => {
  const inlines = fc.array(tie('inline'), { maxLength: 4 }).map(join);
  const blocks = fc
    .array(tie('block'), { minLength: 1, maxLength: 2 })
    .map(join);
  const paragraph = fc
    .tuple(fc.option(fc.constantFrom(...ALIGNMENTS)), inlines)
    .map(([align, c]) =>
      align === null
        ? `<p>${c}</p>`
        : `<p style="text-align: ${align}">${c}</p>`,
    );
  const listItems = fc
    .array(
      blocks.map((c) => `<li>${c}</li>`),
      { minLength: 1, maxLength: 3 },
    )
    .map(join);
  const cell = fc
    .tuple(fc.option(fc.integer({ min: 2, max: 4 })), inlines)
    .map(
      ([colspan, c]) =>
        `<td${colspan === null ? '' : ` colspan="${colspan}"`}><p>${c}</p></td>`,
    );
  const row = fc
    .array(cell, { minLength: 1, maxLength: 2 })
    .map((cells) => `<tr>${join(cells)}</tr>`);
  return {
    // Fora do `a`: tudo que é em linha, inclusive o link.
    inline: fc.oneof(
      DEPTH,
      escapedText,
      fc.constant('<br>'),
      ...inlineWrappers(tie('inline')),
      fc
        .tuple(
          fc.constantFrom(...LINKS),
          fc.array(tie('linkInline'), { maxLength: 3 }).map(join),
        )
        .map(([href, c]) => `<a href="${href}">${c}</a>`),
    ),
    // Dentro do `a`: sem `a` aninhado (S3c o desembrulharia).
    linkInline: fc.oneof(
      DEPTH,
      escapedText,
      fc.constant('<br>'),
      ...inlineWrappers(tie('linkInline')),
    ),
    block: fc.oneof(
      DEPTH,
      paragraph,
      fc.constant('<hr>'),
      fc
        .tuple(fc.constantFrom('h2', 'h3', 'h4'), inlines)
        .map(([tag, c]) => `<${tag}>${c}</${tag}>`),
      listItems.map((c) => `<ul>${c}</ul>`),
      fc
        .tuple(fc.option(fc.integer({ min: 2, max: 99 })), listItems)
        .map(([start, c]) =>
          start === null ? `<ol>${c}</ol>` : `<ol start="${start}">${c}</ol>`,
        ),
      blocks.map((c) => `<blockquote>${c}</blockquote>`),
      escapedText.map(
        (c) => `<pre><code class="language-js">${c}</code></pre>`,
      ),
      fc
        .array(row, { minLength: 1, maxLength: 2 })
        .map((rows) => `<table><tbody>${join(rows)}</tbody></table>`),
      fc
        .tuple(fc.string(), fc.option(inlines))
        .map(
          ([alt, caption]) =>
            `<figure class="rt-figure rt-figure--center"><img src="https://example.com/a.jpg" alt="${escapeHtmlAttribute(alt)}" loading="lazy" decoding="async">${
              caption === null ? '' : `<figcaption>${caption}</figcaption>`
            }</figure>`,
        ),
      blocks.map(
        (c) =>
          `<aside class="rt-callout rt-callout--info" role="note">${c}</aside>`,
      ),
    ),
  };
});

/** HTML válido e canônico (N1–N7): o sanitizador o devolve byte a byte. */
export const validHtml: fc.Arbitrary<string> = fc
  .array(tree.block, { maxLength: 5 })
  .map(join);

// --- HTML hostil ------------------------------------------------------------

/** Trechos canônicos de recursos fora da gramática de `validHtml`. */
const RICH_FRAGMENTS = [
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="560" height="315" style="aspect-ratio: 16 / 9" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe><figcaption>Vídeo</figcaption></figure>',
  '<figure class="rt-figure rt-figure--video"><video src="https://example.com/v.mp4" controls="" preload="metadata" poster="https://example.com/v.jpg"><track kind="captions" src="https://example.com/v.pt.vtt" srclang="pt-BR" label="Português" default=""></video></figure>',
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">Feita</label></li></ul>',
  '<table><colgroup><col style="width: 200px"><col></colgroup><tbody><tr><th colspan="2" scope="col"><p>Nome</p></th></tr></tbody></table>',
  '<h2 id="rt-intro">Introdução</h2><p><a href="#rt-intro" target="_blank" rel="noopener noreferrer">topo</a></p>',
  '<figure class="rt-pullquote"><blockquote><p>Frase.</p></blockquote><figcaption><cite>Fulana</cite></figcaption></figure>',
];

/**
 * Estrutura válida do esquema (blocos de `validHtml` e trechos ricos), para
 * que os tokens hostis em volta a desmontem: sem ela, elementos que dependem
 * de contexto (`li`, `figure` com mídia, `iframe`, células) quase não saem.
 */
const fragment: fc.Arbitrary<string> = fc.oneof(
  tree.block,
  fc.constantFrom(...RICH_FRAGMENTS),
);

const token: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: openTag, weight: 4 },
  { arbitrary: closeTag, weight: 3 },
  { arbitrary: text, weight: 3 },
  { arbitrary: special, weight: 1 },
  { arbitrary: fragment, weight: 1 },
);

/** HTML hostil: até 40 tokens de marcação válida, perigosa e malformada. */
export const hostileHtml: fc.Arbitrary<string> = fc
  .array(token, { maxLength: 40 })
  .map((t) => t.join(''));
