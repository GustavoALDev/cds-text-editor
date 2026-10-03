// Marcação de cada recurso (spec 03a, seção 4): uma função por `RteFeatureId`,
// cada uma devolvendo as tags que o recurso usa. A união é feita por
// `mergeElements` em `get-html-schema.ts`.
import type {
  RteAttrRule,
  RteElementSpec,
  RteEmbedProvider,
  RtePaletteColor,
  RteUrlRule,
} from './types';

type Elements = Record<string, RteElementSpec>;

/** Opções já validadas e normalizadas por `getHtmlSchema`. */
export interface FeatureContext {
  idPrefix: string;
  /** Hosts de mídia em minúsculas, sem ponto final; vazio = qualquer host. */
  mediaHosts: string[];
  allowRelativeMedia: boolean;
  /** Domínios bloqueados normalizados (ASCII, minúsculas, sem ponto final). */
  blockedDomains: string[];
  /** Tokens de `rel` garantidos em todo link, em ordem canônica. */
  forceRel: string[];
  /** Provedores ativos, já validados. */
  providers: readonly RteEmbedProvider[];
  /** Hosts dos provedores ativos, normalizados e sem repetição. */
  providerHosts: string[];
  textColors: readonly RtePaletteColor[];
  highlightColors: readonly RtePaletteColor[];
}

/** Valores de `rel` em ordem canônica (seção 4.2). */
export const REL_VALUES = [
  'nofollow',
  'sponsored',
  'ugc',
  'noopener',
  'noreferrer',
];

const URL_MAX = 2048;
const LANG_PATTERN = '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$';
const IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';
const IFRAME_ALLOW = 'encrypted-media; fullscreen; picture-in-picture';
const IFRAME_REFERRER = 'strict-origin-when-cross-origin';

const empty = (): RteElementSpec => ({ attributes: {} });
const int = (min: number, max: number): RteAttrRule => ({
  kind: 'int',
  min,
  max,
});
const oneOf = (...values: string[]): RteAttrRule => ({ kind: 'enum', values });
const bool = (): RteAttrRule => ({ kind: 'bool' });
const textAlign = (): Record<string, RteAttrRule> => ({
  'text-align': oneOf('left', 'center', 'right', 'justify'),
});
/** Valor fixo: obrigatório, e qualquer outro valor vira o padrão. */
const fixed = (value: string) => ({
  rule: oneOf(value),
  required: true,
  default: value,
});

function mediaUrl(ctx: FeatureContext): RteUrlRule {
  const rule: RteUrlRule = {
    kind: 'url',
    schemes: ['https'],
    relative: ctx.allowRelativeMedia,
    fragment: false,
    maxLength: URL_MAX,
  };
  if (ctx.mediaHosts.length > 0) rule.hosts = [...ctx.mediaHosts];
  return rule;
}

export function baseFeature(ctx: FeatureContext): Elements {
  const heading = (): RteElementSpec => ({
    attributes: {
      id: {
        rule: {
          kind: 'pattern',
          pattern: `^${ctx.idPrefix}[a-z0-9]+(?:-[a-z0-9]+)*$`,
          maxLength: 80,
        },
      },
    },
    styles: textAlign(),
  });
  return {
    p: { attributes: {}, styles: textAlign() },
    h2: heading(),
    h3: heading(),
    h4: heading(),
    ul: empty(),
    ol: { attributes: { start: { rule: int(1, 100000) } } },
    li: empty(),
    blockquote: empty(),
    hr: empty(),
    br: empty(),
    strong: empty(),
    em: empty(),
    u: empty(),
    s: empty(),
    code: empty(),
    sup: empty(),
    sub: empty(),
  };
}

export function linksFeature(ctx: FeatureContext): Elements {
  const href: RteUrlRule = {
    kind: 'url',
    schemes: ['https', 'http', 'mailto', 'tel'],
    relative: true,
    fragment: true,
    maxLength: URL_MAX,
  };
  if (ctx.blockedDomains.length > 0)
    href.blockedHosts = [...ctx.blockedDomains];
  const ensureTokens: NonNullable<RteElementSpec['ensureTokens']> = [
    {
      attribute: 'rel',
      tokens: ['noopener', 'noreferrer'],
      when: { attribute: 'target', equals: '_blank' },
    },
  ];
  if (ctx.forceRel.length > 0)
    ensureTokens.push({ attribute: 'rel', tokens: [...ctx.forceRel] });
  return {
    a: {
      attributes: {
        href: { rule: href, required: true },
        target: { rule: oneOf('_blank') },
        rel: {
          rule: {
            kind: 'tokens',
            values: [...REL_VALUES],
            separator: ' ',
            maxLength: 200,
          },
        },
      },
      onInvalid: 'unwrap',
      ensureTokens,
    },
  };
}

function colored(
  colors: readonly RtePaletteColor[],
  property: string,
): RteElementSpec {
  return {
    attributes: {
      'data-rt-color': { rule: oneOf(...colors.map((c) => c.name)) },
    },
    styleFrom: {
      attribute: 'data-rt-color',
      property,
      map: Object.fromEntries(colors.map((c) => [c.name, c.light])),
    },
  };
}

export function colorsFeature(ctx: FeatureContext): Elements {
  return {
    span: colored(ctx.textColors, 'color'),
    mark: colored(ctx.highlightColors, 'background-color'),
  };
}

export function codeFeature(): Elements {
  return {
    pre: empty(),
    code: {
      attributes: {},
      classes: { patterns: ['^language-[a-z0-9][a-z0-9+#-]{0,29}$'] },
    },
  };
}

export function tablesFeature(): Elements {
  const cell = (): RteElementSpec['attributes'] => ({
    colspan: { rule: int(1, 100) },
    rowspan: { rule: int(1, 100) },
  });
  return {
    table: empty(),
    caption: empty(),
    colgroup: empty(),
    col: {
      attributes: {},
      styles: {
        width: {
          kind: 'pattern',
          pattern: '^(?:[1-9]\\d{0,3})px$',
          maxLength: 6,
        },
      },
    },
    thead: empty(),
    tbody: empty(),
    tr: empty(),
    th: {
      attributes: { ...cell(), scope: { rule: oneOf('col', 'row') } },
    },
    td: { attributes: cell() },
  };
}

export function tasksFeature(): Elements {
  return {
    ul: { attributes: {}, classes: { values: ['rt-tasks'] } },
    li: { attributes: {}, classes: { values: ['rt-task'] } },
    label: empty(),
    input: {
      attributes: {
        type: fixed('checkbox'),
        disabled: { rule: bool(), required: true, default: '' },
        checked: { rule: bool() },
      },
    },
  };
}

export function mediaFeature(ctx: FeatureContext): Elements {
  const size = (): RteElementSpec['attributes'] => ({
    width: { rule: int(1, 10000) },
    height: { rule: int(1, 10000) },
  });
  return {
    figure: {
      attributes: {},
      classes: {
        values: [
          'rt-figure',
          'rt-figure--left',
          'rt-figure--center',
          'rt-figure--right',
          'rt-figure--full',
          'rt-figure--video',
        ],
      },
      requireChild: ['img', 'video'],
    },
    img: {
      attributes: {
        src: { rule: mediaUrl(ctx), required: true },
        alt: {
          rule: { kind: 'text', maxLength: 1000 },
          required: true,
          default: '',
        },
        ...size(),
        loading: { rule: oneOf('lazy') },
        decoding: { rule: oneOf('async') },
        srcset: {
          rule: { kind: 'srcset', url: mediaUrl(ctx), maxLength: 8192 },
        },
        sizes: {
          rule: {
            kind: 'pattern',
            pattern: '^[a-zA-Z0-9 ().,:%+/-]{1,256}$',
            maxLength: 256,
          },
        },
      },
      onInvalid: 'remove',
    },
    video: {
      attributes: {
        src: { rule: mediaUrl(ctx), required: true },
        controls: { rule: bool(), required: true, default: '' },
        preload: { rule: oneOf('metadata', 'none') },
        playsinline: { rule: bool() },
        ...size(),
        poster: { rule: mediaUrl(ctx) },
      },
      onInvalid: 'remove',
    },
    track: {
      attributes: {
        kind: { rule: oneOf('captions', 'subtitles') },
        src: { rule: mediaUrl(ctx), required: true },
        srclang: {
          rule: { kind: 'pattern', pattern: LANG_PATTERN, maxLength: 30 },
        },
        label: { rule: { kind: 'text', maxLength: 100 } },
        default: { rule: bool() },
      },
      onInvalid: 'remove',
    },
    figcaption: empty(),
    small: { attributes: {}, classes: { values: ['rt-credit'] } },
  };
}

export function embedsFeature(ctx: FeatureContext): Elements {
  // Sem provedor ativo não há iframe possível (R2).
  if (ctx.providers.length === 0) return {};
  const ids = ctx.providers.map((p) => p.id);
  return {
    figure: {
      attributes: { 'data-rt-provider': { rule: oneOf(...ids) } },
      classes: {
        values: ['rt-embed', ...ids.map((id) => `rt-embed--${id}`)],
      },
      requireChild: ['iframe'],
    },
    iframe: {
      attributes: {
        src: {
          rule: {
            kind: 'url',
            schemes: ['https'],
            relative: false,
            fragment: false,
            hosts: [...ctx.providerHosts],
            // A união é segura: cada padrão começa com ^https://<host literal do
            // próprio provedor>/ (validateEmbedProvider), então fixa o host.
            patterns: ctx.providers.flatMap((p) => [...p.srcPatterns]),
            maxLength: URL_MAX,
          },
          required: true,
        },
        title: { rule: { kind: 'text', maxLength: 300 }, required: true },
        width: { rule: int(1, 10000) },
        height: { rule: int(1, 10000) },
        loading: { rule: oneOf('lazy') },
        referrerpolicy: fixed(IFRAME_REFERRER),
        allow: fixed(IFRAME_ALLOW),
        allowfullscreen: { rule: bool() },
        sandbox: fixed(IFRAME_SANDBOX),
      },
      styles: {
        'aspect-ratio': {
          kind: 'pattern',
          pattern: '^[1-9]\\d{0,3} / [1-9]\\d{0,3}$',
          maxLength: 11,
        },
      },
      onInvalid: 'remove',
    },
    figcaption: empty(),
  };
}

export function newsBlocksFeature(): Elements {
  return {
    figure: {
      attributes: {},
      classes: { values: ['rt-pullquote'] },
      requireChild: ['blockquote'],
    },
    figcaption: empty(),
    cite: empty(),
    aside: {
      attributes: { role: { rule: oneOf('note') } },
      classes: {
        values: [
          'rt-callout',
          'rt-callout--info',
          'rt-callout--success',
          'rt-callout--warning',
          'rt-callout--danger',
          'rt-read-also',
        ],
      },
    },
    p: {
      attributes: {},
      classes: { values: ['rt-callout__title', 'rt-read-also__title'] },
    },
    span: {
      attributes: {
        lang: {
          rule: { kind: 'pattern', pattern: LANG_PATTERN, maxLength: 30 },
        },
        dir: { rule: oneOf('ltr', 'rtl') },
      },
    },
  };
}
