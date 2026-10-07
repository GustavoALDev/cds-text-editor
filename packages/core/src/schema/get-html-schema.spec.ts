import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EMBED_PROVIDERS, YOUTUBE_PROVIDER } from '../embeds/providers';
import {
  DEFAULT_ID_PREFIX,
  assertEnsureTokens,
  getHtmlSchema,
  mergeElements,
} from './get-html-schema';
import { assertIdPrefix } from './id-prefix';
import { RTE_HIGHLIGHT_COLORS, RTE_TEXT_COLORS } from './palette';
import { normalizeAttribute } from './rules';
import { dangerousUrl } from './testing/dangerous-urls';
import type {
  RteAttrRule,
  RteElementSpec,
  RteEmbedProvider,
  RteHtmlSchema,
  RteUrlRule,
} from './types';
import { isAllowedUrl } from './url';

const ALL_FEATURES = [
  'base',
  'links',
  'colors',
  'code',
  'tables',
  'tasks',
  'media',
  'embeds',
  'newsBlocks',
];

/** Todas as regras do esquema (atributos e estilos), com o caminho para a mensagem. */
function allRules(s: RteHtmlSchema): [string, RteAttrRule][] {
  const out: [string, RteAttrRule][] = [];
  for (const [tag, el] of Object.entries(s.elements)) {
    for (const [name, spec] of Object.entries(el.attributes)) {
      out.push([`${tag}[${name}]`, spec.rule]);
    }
    for (const [prop, rule] of Object.entries(el.styles ?? {})) {
      out.push([`${tag} style ${prop}`, rule]);
    }
  }
  return out;
}

function isDeepFrozen(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return true;
  if (!Object.isFrozen(v)) return false;
  return Object.values(v).every(isDeepFrozen);
}

describe('assertIdPrefix', () => {
  it.each(['rt-', 'a', 'x-', 'a'.repeat(16), 'news-2-'])('aceita %j', (p) => {
    expect(() => assertIdPrefix(p)).not.toThrow();
  });

  it.each(['X', '1a', 'a'.repeat(17), '', '-a', 'a_b', 'á'])(
    'recusa %j com RangeError',
    (p) => {
      expect(() => assertIdPrefix(p)).toThrow(RangeError);
    },
  );
});

describe('getHtmlSchema: padrão', () => {
  const s = getHtmlSchema();

  it('tem os 9 recursos, prefixo rt- e versão 1', () => {
    expect(s.version).toBe(1);
    expect(s.features).toEqual(ALL_FEATURES);
    expect(s.idPrefix).toBe('rt-');
    expect(DEFAULT_ID_PREFIX).toBe('rt-');
  });

  it('id dos títulos: padrão com prefixo, opcional', () => {
    for (const tag of ['h2', 'h3', 'h4']) {
      const id = s.elements[tag]?.attributes['id'];
      expect(id?.rule).toEqual({
        kind: 'pattern',
        pattern: '^rt-[a-z0-9]+(?:-[a-z0-9]+)*$',
        maxLength: 80,
      });
      expect(id?.required).toBeUndefined();
    }
    expect(s.elements['h1']).toBeUndefined();
    expect(s.elements['h5']).toBeUndefined();
  });

  it('base: blocos, marcas, alinhamento e ol[start]', () => {
    for (const tag of [
      'p',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'br',
      'strong',
      'em',
      'u',
      's',
      'code',
      'sup',
      'sub',
    ]) {
      expect(s.elements[tag], tag).toBeDefined();
    }
    const align = {
      kind: 'enum',
      values: ['left', 'center', 'right', 'justify'],
    };
    for (const tag of ['p', 'h2', 'h3', 'h4']) {
      expect(s.elements[tag]?.styles).toEqual({ 'text-align': align });
    }
    expect(s.elements['ol']?.attributes['start']?.rule).toEqual({
      kind: 'int',
      min: 1,
      max: 100000,
    });
  });

  it('links: a[href] obrigatório, target só _blank, rel em ordem canônica', () => {
    const a = s.elements['a'];
    expect(a?.onInvalid).toBe('unwrap');
    expect(a?.attributes['href']).toEqual({
      rule: {
        kind: 'url',
        schemes: ['https', 'http', 'mailto', 'tel'],
        relative: true,
        fragment: true,
        maxLength: 2048,
      },
      required: true,
    });
    expect(a?.attributes['target']?.rule).toEqual({
      kind: 'enum',
      values: ['_blank'],
    });
    expect(a?.attributes['rel']?.rule).toMatchObject({
      kind: 'tokens',
      values: ['nofollow', 'sponsored', 'ugc', 'noopener', 'noreferrer'],
      separator: ' ',
    });
    expect(a?.ensureTokens).toEqual([
      {
        attribute: 'rel',
        tokens: ['noopener', 'noreferrer'],
        when: { attribute: 'target', equals: '_blank' },
      },
    ]);
  });

  it('colors: span e mark regeneram o style da paleta (light)', () => {
    const textMap = Object.fromEntries(
      RTE_TEXT_COLORS.map((c) => [c.name, c.light]),
    );
    const hlMap = Object.fromEntries(
      RTE_HIGHLIGHT_COLORS.map((c) => [c.name, c.light]),
    );
    expect(s.elements['span']?.styleFrom).toEqual({
      attribute: 'data-rt-color',
      property: 'color',
      map: textMap,
    });
    expect(s.elements['mark']?.styleFrom).toEqual({
      attribute: 'data-rt-color',
      property: 'background-color',
      map: hlMap,
    });
    expect(s.elements['span']?.attributes['data-rt-color']?.rule).toEqual({
      kind: 'enum',
      values: RTE_TEXT_COLORS.map((c) => c.name),
    });
    expect(s.palette.text).toEqual(RTE_TEXT_COLORS);
    expect(s.palette.highlight).toEqual(RTE_HIGHLIGHT_COLORS);
  });

  it('code: classe language-<id>', () => {
    expect(s.elements['pre']).toBeDefined();
    expect(s.elements['code']?.classes).toEqual({
      patterns: ['^language-[a-z0-9][a-z0-9+#-]{0,29}$'],
    });
  });

  it('tables: col[style width], th/td colspan/rowspan, th[scope]', () => {
    expect(s.elements['col']?.styles).toEqual({
      width: {
        kind: 'pattern',
        pattern: '^(?:[1-9]\\d{0,3})px$',
        maxLength: 6,
      },
    });
    const span = { kind: 'int', min: 1, max: 100 };
    for (const tag of ['th', 'td']) {
      expect(s.elements[tag]?.attributes['colspan']?.rule).toEqual(span);
      expect(s.elements[tag]?.attributes['rowspan']?.rule).toEqual(span);
    }
    expect(s.elements['th']?.attributes['scope']?.rule).toEqual({
      kind: 'enum',
      values: ['col', 'row'],
    });
    expect(s.elements['td']?.attributes['scope']).toBeUndefined();
  });

  it('tasks: ul.rt-tasks > li.rt-task > label > input', () => {
    expect(s.elements['ul']?.classes?.values).toEqual(['rt-tasks']);
    expect(s.elements['li']?.classes?.values).toEqual(['rt-task']);
    expect(s.elements['label']?.attributes).toEqual({});
    const input = s.elements['input']?.attributes ?? {};
    expect(Object.keys(input).sort()).toEqual(['checked', 'disabled', 'type']);
    expect(input['type']).toEqual({
      rule: { kind: 'enum', values: ['checkbox'] },
      required: true,
      default: 'checkbox',
    });
    expect(input['disabled']).toEqual({
      rule: { kind: 'bool' },
      required: true,
      default: '',
    });
    expect(input['checked']).toEqual({ rule: { kind: 'bool' } });
  });

  it('media: img, video, track removidos quando inválidos; figure exige filho', () => {
    for (const tag of ['img', 'video', 'iframe', 'track']) {
      expect(s.elements[tag]?.onInvalid, tag).toBe('remove');
    }
    expect(s.elements['figure']?.requireChild).toEqual([
      'img',
      'video',
      'iframe',
      'blockquote',
    ]);
    const img = s.elements['img']?.attributes ?? {};
    expect(img['alt']).toEqual({
      rule: { kind: 'text', maxLength: 1000 },
      required: true,
      default: '',
    });
    expect(img['src']?.required).toBe(true);
    expect(img['sizes']?.rule).toEqual({
      kind: 'pattern',
      pattern: '^[a-zA-Z0-9 ().,:%+/-]{1,256}$',
      maxLength: 256,
    });
    expect(img['loading']?.rule).toEqual({ kind: 'enum', values: ['lazy'] });
    expect(img['decoding']?.rule).toEqual({ kind: 'enum', values: ['async'] });
    const video = s.elements['video']?.attributes ?? {};
    expect(Object.keys(video).sort()).toEqual(
      [
        'controls',
        'height',
        'playsinline',
        'poster',
        'preload',
        'src',
        'width',
      ].sort(),
    );
    expect(video['controls']).toEqual({
      rule: { kind: 'bool' },
      required: true,
      default: '',
    });
    expect(video['preload']?.rule).toEqual({
      kind: 'enum',
      values: ['metadata', 'none'],
    });
    const track = s.elements['track']?.attributes ?? {};
    expect(track['kind']?.rule).toEqual({
      kind: 'enum',
      values: ['captions', 'subtitles'],
    });
    expect(track['label']?.rule).toEqual({ kind: 'text', maxLength: 100 });
    expect(s.elements['figure']?.classes?.values).toEqual(
      expect.arrayContaining([
        'rt-figure',
        'rt-figure--left',
        'rt-figure--center',
        'rt-figure--right',
        'rt-figure--full',
        'rt-figure--video',
      ]),
    );
    expect(s.elements['small']?.classes?.values).toEqual(['rt-credit']);
  });

  it('media: URL https ou relativa à raiz, sem fragmento', () => {
    expect(s.elements['img']?.attributes['src']?.rule).toEqual({
      kind: 'url',
      schemes: ['https'],
      relative: true,
      fragment: false,
      maxLength: 2048,
    });
  });

  it('embeds: iframe com hosts e padrões dos provedores padrão', () => {
    const iframe = s.elements['iframe'];
    const src = iframe?.attributes['src']?.rule as RteUrlRule;
    expect(src.schemes).toEqual(['https']);
    expect(src.relative).toBe(false);
    expect(src.hosts).toEqual([
      'www.youtube-nocookie.com',
      'player.vimeo.com',
      'open.spotify.com',
    ]);
    expect(src.patterns).toEqual(
      DEFAULT_EMBED_PROVIDERS.flatMap((p) => p.srcPatterns),
    );
    expect(iframe?.attributes['title']?.required).toBe(true);
    expect(Object.keys(iframe?.styles ?? {})).toEqual(['aspect-ratio']);
    expect(iframe?.styles?.['aspect-ratio']).toEqual({
      kind: 'pattern',
      pattern: '^[1-9]\\d{0,3} / [1-9]\\d{0,3}$',
      maxLength: 11,
    });
    expect(iframe?.attributes['sandbox']).toEqual({
      rule: {
        kind: 'enum',
        values: [
          'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox',
        ],
      },
      required: true,
      default:
        'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox',
    });
    expect(iframe?.attributes['referrerpolicy']?.default).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(iframe?.attributes['allow']?.default).toBe(
      'encrypted-media; fullscreen; picture-in-picture',
    );
    expect(s.elements['figure']?.classes?.values).toEqual(
      expect.arrayContaining([
        'rt-embed',
        'rt-embed--youtube',
        'rt-embed--vimeo',
        'rt-embed--spotify',
      ]),
    );
    expect(s.elements['figure']?.attributes['data-rt-provider']?.rule).toEqual({
      kind: 'enum',
      values: ['youtube', 'vimeo', 'spotify'],
    });
  });

  it('embeds: src montado pelo provedor é aceito; outro host não', () => {
    const src = s.elements['iframe']?.attributes['src']?.rule as RteUrlRule;
    expect(
      isAllowedUrl(
        src,
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5',
      ),
    ).not.toBeNull();
    expect(isAllowedUrl(src, 'https://evil.com/embed/dQw4w9WgXcQ')).toBeNull();
  });

  it('newsBlocks: aside, cite, span[lang|dir], títulos das caixas', () => {
    expect(s.elements['aside']?.attributes['role']?.rule).toEqual({
      kind: 'enum',
      values: ['note'],
    });
    expect(s.elements['aside']?.classes?.values).toEqual([
      'rt-callout',
      'rt-callout--info',
      'rt-callout--success',
      'rt-callout--warning',
      'rt-callout--danger',
      'rt-read-also',
    ]);
    expect(s.elements['cite']).toBeDefined();
    expect(s.elements['p']?.classes?.values).toEqual([
      'rt-callout__title',
      'rt-read-also__title',
    ]);
    expect(s.elements['figure']?.classes?.values).toContain('rt-pullquote');
    expect(s.elements['span']?.attributes['lang']?.rule).toEqual({
      kind: 'pattern',
      pattern: '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$',
      maxLength: 30,
    });
    expect(s.elements['span']?.attributes['dir']?.rule).toEqual({
      kind: 'enum',
      values: ['ltr', 'rtl'],
    });
  });

  it('byFeature lista as tags de cada recurso', () => {
    expect(s.byFeature.tables).toEqual([
      'table',
      'caption',
      'colgroup',
      'col',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ]);
    expect(s.byFeature.embeds).toEqual(['figure', 'iframe', 'figcaption']);
    expect(s.byFeature.links).toEqual(['a']);
    const tags = new Set(Object.values(s.byFeature).flat());
    expect([...tags].sort()).toEqual(Object.keys(s.elements).sort());
  });

  it('é congelado em profundidade e sobrevive a JSON', () => {
    expect(isDeepFrozen(s)).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toStrictEqual(s);
  });

  it('toda regex compila e é ancorada; toda regra de texto tem maxLength', () => {
    const patterns: [string, string][] = [];
    for (const [path, rule] of allRules(s)) {
      if (rule.kind === 'pattern') patterns.push([path, rule.pattern]);
      const url =
        rule.kind === 'url' ? rule : rule.kind === 'srcset' ? rule.url : null;
      for (const p of url?.patterns ?? []) patterns.push([path, p]);
      if (['pattern', 'text', 'url', 'srcset', 'tokens'].includes(rule.kind)) {
        const max = (rule as { maxLength?: unknown }).maxLength;
        expect(Number.isInteger(max) && (max as number) > 0, path).toBe(true);
      }
      if (rule.kind === 'srcset') {
        expect(Number.isInteger(rule.url.maxLength), path).toBe(true);
      }
    }
    for (const [tag, el] of Object.entries(s.elements)) {
      for (const p of el.classes?.patterns ?? [])
        patterns.push([`${tag}.class`, p]);
    }
    expect(patterns.length).toBeGreaterThan(5);
    for (const [path, p] of patterns) {
      expect(p.startsWith('^') && p.endsWith('$'), `${path}: ${p}`).toBe(true);
      expect(() => new RegExp(p), path).not.toThrow();
    }
  });

  it('R3: nenhuma regra url/srcset aceita esquema perigoso ofuscado', () => {
    const rules = allRules(s).filter(
      ([, r]) => r.kind === 'url' || r.kind === 'srcset',
    );
    expect(rules.length).toBeGreaterThanOrEqual(6);
    fc.assert(
      fc.property(dangerousUrl, (u) => {
        for (const [, r] of rules) {
          if (r.kind === 'srcset') {
            if (normalizeAttribute(r, `${u} 1x`) !== null) return false;
            if (isAllowedUrl(r.url, u) !== null) return false;
          } else if (normalizeAttribute(r, u) !== null) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('getHtmlSchema: opções', () => {
  it('idPrefix muda o padrão do id', () => {
    const s = getHtmlSchema({ idPrefix: 'x-' });
    expect(s.idPrefix).toBe('x-');
    const rule = s.elements['h3']?.attributes['id']?.rule;
    expect(rule?.kind === 'pattern' && rule.pattern.startsWith('^x-')).toBe(
      true,
    );
  });

  it.each(['X', '1a', 'a'.repeat(17)])('idPrefix %j lança RangeError', (p) => {
    expect(() => getHtmlSchema({ idPrefix: p })).toThrow(RangeError);
  });

  it('tables: false retira as tags de tabela', () => {
    const s = getHtmlSchema({ features: { tables: false } });
    for (const tag of [
      'table',
      'caption',
      'colgroup',
      'col',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ]) {
      expect(s.elements[tag], tag).toBeUndefined();
    }
    expect(s.features).not.toContain('tables');
    expect(s.byFeature.tables).toBeUndefined();
  });

  it('newsBlocks: false retira aside, cite e lang/dir do span', () => {
    const s = getHtmlSchema({ features: { newsBlocks: false } });
    expect(s.elements['aside']).toBeUndefined();
    expect(s.elements['cite']).toBeUndefined();
    expect(Object.keys(s.elements['span']?.attributes ?? {})).toEqual([
      'data-rt-color',
    ]);
    expect(s.elements['p']?.classes).toBeUndefined();
    expect(s.elements['figure']?.requireChild).toEqual([
      'img',
      'video',
      'iframe',
    ]);
  });

  it('colors e newsBlocks desligados: sem span e sem mark', () => {
    const s = getHtmlSchema({ features: { colors: false, newsBlocks: false } });
    expect(s.elements['span']).toBeUndefined();
    expect(s.elements['mark']).toBeUndefined();
  });

  it('tasks: false tira as classes de ul/li, label e input', () => {
    const s = getHtmlSchema({ features: { tasks: false } });
    expect(s.elements['ul']?.classes).toBeUndefined();
    expect(s.elements['li']?.classes).toBeUndefined();
    expect(s.elements['label']).toBeUndefined();
    expect(s.elements['input']).toBeUndefined();
  });

  it('code: false mantém o code inline sem classes e tira o pre', () => {
    const s = getHtmlSchema({ features: { code: false } });
    expect(s.elements['pre']).toBeUndefined();
    expect(s.elements['code']).toEqual({ attributes: {} });
  });

  it('media, embeds e newsBlocks desligados: sem figure/figcaption', () => {
    const s = getHtmlSchema({
      features: { media: false, embeds: false, newsBlocks: false },
    });
    expect(s.elements['figure']).toBeUndefined();
    expect(s.elements['figcaption']).toBeUndefined();
    expect(s.elements['img']).toBeUndefined();
    expect(s.elements['iframe']).toBeUndefined();
  });

  it('search e slashCommands não mudam o HTML', () => {
    const a = getHtmlSchema();
    const b = getHtmlSchema({
      features: { search: false, slashCommands: false },
    });
    expect(b).toStrictEqual(a);
  });

  it('embedProviders: [] tira o iframe e a parte de embeds da figure', () => {
    const s = getHtmlSchema({ embedProviders: [] });
    expect(s.elements['iframe']).toBeUndefined();
    expect(s.elements['figure']?.classes?.values).not.toContain('rt-embed');
    expect(
      s.elements['figure']?.attributes['data-rt-provider'],
    ).toBeUndefined();
    expect(s.elements['figure']?.requireChild).toEqual([
      'img',
      'video',
      'blockquote',
    ]);
  });

  it('só os provedores ativos entram no iframe', () => {
    const s = getHtmlSchema({ embedProviders: [YOUTUBE_PROVIDER] });
    const src = s.elements['iframe']?.attributes['src']?.rule as RteUrlRule;
    expect(src.hosts).toEqual(['www.youtube-nocookie.com']);
    expect(src.patterns).toEqual(YOUTUBE_PROVIDER.srcPatterns);
    expect(isAllowedUrl(src, 'https://player.vimeo.com/video/123')).toBeNull();
  });

  it('provedor do consumidor: hosts normalizados; provedor inseguro lança', () => {
    const custom: RteEmbedProvider = {
      id: 'acme-video',
      name: 'Acme',
      hosts: ['Player.ACME.com'],
      srcPatterns: ['^https://player\\.acme\\.com/v/\\d+$'],
      match: () => false,
      toEmbed: () => null,
    };
    const s = getHtmlSchema({ embedProviders: [custom] });
    const src = s.elements['iframe']?.attributes['src']?.rule as RteUrlRule;
    expect(src.hosts).toEqual(['player.acme.com']);
    expect(s.elements['figure']?.classes?.values).toContain(
      'rt-embed--acme-video',
    );
    expect(() =>
      getHtmlSchema({ embedProviders: [{ ...custom, hosts: ['localhost'] }] }),
    ).toThrow(TypeError);
    expect(() =>
      getHtmlSchema({
        embedProviders: [{ ...custom, srcPatterns: ['https://x'] }],
      }),
    ).toThrow(TypeError);
  });

  it('provedor com id inválido ou repetido lança', () => {
    expect(() =>
      getHtmlSchema({
        embedProviders: [{ ...YOUTUBE_PROVIDER, id: 'Bad Id' }],
      }),
    ).toThrow(TypeError);
    expect(() =>
      getHtmlSchema({ embedProviders: [YOUTUBE_PROVIDER, YOUTUBE_PROVIDER] }),
    ).toThrow(TypeError);
  });

  it('linkPolicy: forceRel e blockedDomains', () => {
    const s = getHtmlSchema({
      linkPolicy: {
        forceRel: ['nofollow', 'ugc'],
        blockedDomains: ['evil.com'],
      },
    });
    const a = s.elements['a'];
    expect(a?.ensureTokens).toContainEqual({
      attribute: 'rel',
      tokens: ['nofollow', 'ugc'],
    });
    expect(a?.ensureTokens).toContainEqual({
      attribute: 'rel',
      tokens: ['noopener', 'noreferrer'],
      when: { attribute: 'target', equals: '_blank' },
    });
    const href = a?.attributes['href']?.rule as RteUrlRule;
    expect(href.blockedHosts).toEqual(['evil.com']);
    expect(a?.onInvalid).toBe('unwrap');
    expect(isAllowedUrl(href, 'https://sub.evil.com/x')).toBeNull();
    expect(isAllowedUrl(href, 'https://notevil.com/x')).not.toBeNull();
  });

  it('linkPolicy: forceRel é canonizado; token desconhecido lança', () => {
    const s = getHtmlSchema({
      linkPolicy: { forceRel: ['UGC', 'nofollow', 'ugc'] },
    });
    expect(s.elements['a']?.ensureTokens).toContainEqual({
      attribute: 'rel',
      tokens: ['nofollow', 'ugc'],
    });
    expect(() =>
      getHtmlSchema({ linkPolicy: { forceRel: ['external'] } }),
    ).toThrow(TypeError);
  });

  it('linkPolicy: domínio bloqueado normalizado (minúsculas, sem ponto final, punycode)', () => {
    const s = getHtmlSchema({
      linkPolicy: { blockedDomains: ['Evil.COM.', 'пример.рф'] },
    });
    const href = s.elements['a']?.attributes['href']?.rule as RteUrlRule;
    expect(href.blockedHosts).toEqual(['evil.com', 'xn--e1afmkfd.xn--p1ai']);
    expect(isAllowedUrl(href, 'https://пример.рф/')).toBeNull();
  });

  it('linkPolicy: curinga em blockedDomains lança; domínio bloqueia apex e subdomínios', () => {
    expect(() =>
      getHtmlSchema({ linkPolicy: { blockedDomains: ['*.evil.com'] } }),
    ).toThrow(TypeError);
    const s = getHtmlSchema({ linkPolicy: { blockedDomains: ['evil.com'] } });
    const href = s.elements['a']?.attributes['href']?.rule as RteUrlRule;
    expect(isAllowedUrl(href, 'https://evil.com/')).toBeNull();
    expect(isAllowedUrl(href, 'https://a.evil.com/')).toBeNull();
  });

  it('mediaHosts restringe img, video, poster, track e srcset', () => {
    const s = getHtmlSchema({ mediaHosts: ['CDN.site.com.'] });
    const rules: RteUrlRule[] = [
      s.elements['img']?.attributes['src']?.rule,
      s.elements['video']?.attributes['src']?.rule,
      s.elements['video']?.attributes['poster']?.rule,
      s.elements['track']?.attributes['src']?.rule,
    ] as RteUrlRule[];
    const srcset = s.elements['img']?.attributes['srcset']?.rule;
    if (srcset?.kind !== 'srcset') throw new Error('srcset ausente');
    rules.push(srcset.url);
    for (const r of rules) {
      expect(r.hosts).toEqual(['cdn.site.com']);
      expect(r.relative).toBe(true);
    }
    expect(
      isAllowedUrl(rules[0] as RteUrlRule, 'https://other.com/a.png'),
    ).toBeNull();
    expect(isAllowedUrl(rules[0] as RteUrlRule, '/a.png')).toBe('/a.png');
  });

  it('allowRelativeMedia: false proíbe caminho relativo na mídia', () => {
    const s = getHtmlSchema({ allowRelativeMedia: false });
    const srcset = s.elements['img']?.attributes['srcset']?.rule;
    if (srcset?.kind !== 'srcset') throw new Error('srcset ausente');
    for (const r of [
      s.elements['img']?.attributes['src']?.rule,
      s.elements['video']?.attributes['src']?.rule,
      s.elements['video']?.attributes['poster']?.rule,
      s.elements['track']?.attributes['src']?.rule,
      srcset.url,
    ] as RteUrlRule[]) {
      expect(r.relative).toBe(false);
      expect(r.hosts).toBeUndefined();
    }
  });

  it('não altera as opções nem os provedores passados', () => {
    const hosts = ['cdn.site.com'];
    const s = getHtmlSchema({ mediaHosts: hosts });
    expect(Object.isFrozen(hosts)).toBe(false);
    expect(isDeepFrozen(s)).toBe(true);
  });
});

describe('assertEnsureTokens', () => {
  const rel: RteElementSpec['attributes'][string] = {
    rule: {
      kind: 'tokens',
      values: ['nofollow', 'noopener', 'noreferrer'],
      separator: ' ',
      maxLength: 200,
    },
  };
  const spec = (
    attributes: RteElementSpec['attributes'],
    tokens: string[] = ['noopener'],
  ): Record<string, RteElementSpec> => ({
    a: { attributes, ensureTokens: [{ attribute: 'rel', tokens }] },
  });

  it('aceita o esquema padrão e o com forceRel', () => {
    expect(() =>
      getHtmlSchema({
        linkPolicy: { forceRel: ['nofollow', 'sponsored', 'ugc'] },
      }),
    ).not.toThrow();
    expect(() => assertEnsureTokens(spec({ rel }))).not.toThrow();
  });

  it('recusa alvo sem regra tokens (o token sumiria em silêncio)', () => {
    expect(() => assertEnsureTokens(spec({}))).toThrow(
      'Esquema: ensureTokens de <a> aponta para "rel", que não tem regra tokens.',
    );
    expect(() =>
      assertEnsureTokens(
        spec({ rel: { rule: { kind: 'text', maxLength: 200 } } }),
      ),
    ).toThrow(/não tem regra tokens/);
  });

  it('recusa token fora de values', () => {
    expect(() => assertEnsureTokens(spec({ rel }, ['ugc']))).toThrow(
      'Esquema: ensureTokens de <a> garante "ugc", fora dos valores de "rel".',
    );
  });

  it('recusa quando os tokens podem não caber no maxLength', () => {
    const short = { rule: { ...rel.rule, maxLength: 30 } } as typeof rel;
    expect(() =>
      assertEnsureTokens(spec({ rel: short }, ['noopener', 'noreferrer'])),
    ).toThrow(
      'Esquema: ensureTokens de <a> pode passar do maxLength de "rel".',
    );
  });
});

describe('mergeElements', () => {
  const url1: RteUrlRule = {
    kind: 'url',
    schemes: ['https'],
    relative: false,
    fragment: false,
    maxLength: 2048,
  };
  const url2: RteUrlRule = { ...url1, relative: true };

  it('lança quando o mesmo atributo tem regras diferentes', () => {
    expect(() =>
      mergeElements(
        { a: { attributes: { href: { rule: url1 } } } },
        { a: { attributes: { href: { rule: url2 } } } },
      ),
    ).toThrow(Error);
  });

  it('lança quando o mesmo estilo tem regras diferentes', () => {
    expect(() =>
      mergeElements(
        {
          p: {
            attributes: {},
            styles: { color: { kind: 'enum', values: ['red'] } },
          },
        },
        {
          p: {
            attributes: {},
            styles: { color: { kind: 'enum', values: ['blue'] } },
          },
        },
      ),
    ).toThrow(Error);
  });

  it('aceita a mesma regra e soma atributos e classes distintos', () => {
    const merged = mergeElements(
      {
        a: { attributes: { href: { rule: url1 } }, classes: { values: ['x'] } },
        p: { attributes: {} },
      },
      {
        a: {
          attributes: {
            href: { rule: { ...url1 } },
            title: { rule: { kind: 'text', maxLength: 10 } },
          },
          classes: { values: ['y', 'x'], patterns: ['^z$'] },
        },
        hr: { attributes: {} },
      },
    );
    expect(Object.keys(merged).sort()).toEqual(['a', 'hr', 'p']);
    expect(Object.keys(merged['a']?.attributes ?? {})).toEqual([
      'href',
      'title',
    ]);
    expect(merged['a']?.classes).toEqual({
      values: ['x', 'y'],
      patterns: ['^z$'],
    });
  });

  it('une requireChild e ensureTokens', () => {
    const merged = mergeElements(
      { figure: { attributes: {}, requireChild: ['img'] } },
      { figure: { attributes: {}, requireChild: ['iframe', 'img'] } },
    );
    expect(merged['figure']?.requireChild).toEqual(['img', 'iframe']);
  });

  it('lança quando onInvalid ou styleFrom divergem', () => {
    expect(() =>
      mergeElements(
        { img: { attributes: {}, onInvalid: 'remove' } },
        { img: { attributes: {}, onInvalid: 'unwrap' } },
      ),
    ).toThrow(Error);
    expect(() =>
      mergeElements(
        {
          span: {
            attributes: {},
            styleFrom: { attribute: 'a', property: 'color', map: {} },
          },
        },
        {
          span: {
            attributes: {},
            styleFrom: { attribute: 'b', property: 'color', map: {} },
          },
        },
      ),
    ).toThrow(Error);
  });

  it('não altera as entradas', () => {
    const a = { p: { attributes: {}, classes: { values: ['x'] } } };
    const b = { p: { attributes: {}, classes: { values: ['y'] } } };
    mergeElements(a, b);
    expect(a.p.classes.values).toEqual(['x']);
  });
});

describe('provedores de embed: mesmo validador do toEmbed', () => {
  const provider = (over: Partial<RteEmbedProvider>): RteEmbedProvider => ({
    id: 'acme',
    name: 'Acme',
    hosts: ['embed.example.com'],
    srcPatterns: [String.raw`^https://embed\.example\.com/v/\d+$`],
    match: () => false,
    toEmbed: () => null,
    ...over,
  });

  it('IP em qualquer forma lança', () => {
    for (const host of ['*.0.1', '127.1', '0x7f.0.0.1', '127.0.0.1', '[::1]'])
      expect(
        () =>
          getHtmlSchema({
            embedProviders: [
              provider({
                hosts: [host],
                srcPatterns: [String.raw`^https://[0-9a-f.:\[\]]+/x$`],
              }),
            ],
          }),
        host,
      ).toThrow(TypeError);
  });

  it('host IDN entra em punycode e o iframe aceita a URL', () => {
    const s = getHtmlSchema({
      embedProviders: [
        provider({
          hosts: ['пример.рф'],
          srcPatterns: [String.raw`^https://xn--e1afmkfd\.xn--p1ai/v/\d+$`],
        }),
      ],
    });
    const src = s.elements['iframe']?.attributes['src']?.rule as RteUrlRule;
    expect(src.hosts).toEqual(['xn--e1afmkfd.xn--p1ai']);
    expect(isAllowedUrl(src, 'https://пример.рф/v/1')).toBe(
      'https://xn--e1afmkfd.xn--p1ai/v/1',
    );
  });

  it('id inválido lança', () => {
    expect(() =>
      getHtmlSchema({ embedProviders: [provider({ id: 'x" a="' })] }),
    ).toThrow(TypeError);
  });

  it('padrão frouxo de um provedor não aceita o host de outro (A + B)', () => {
    const a = provider({
      id: 'a',
      hosts: ['a.example.com'],
      srcPatterns: [String.raw`^https://[a-z.]+/embed/[0-9]+$`],
    });
    const b = provider({
      id: 'b',
      hosts: ['b.example.com'],
      srcPatterns: [String.raw`^https://b\.example\.com/v/[0-9]+$`],
    });
    expect(() => getHtmlSchema({ embedProviders: [a, b] })).toThrow(TypeError);
  });

  it('quantificador logo depois da / do prefixo lança', () => {
    for (const pat of [
      String.raw`^https://embed\.example\.com/?.*$`,
      String.raw`^https://embed\.example\.com/{0}v/\d+$`,
      String.raw`^https://embed\.example\.com/*v/\d+$`,
      String.raw`^https://embed\.example\.com/+v/\d+$`,
    ])
      expect(
        () =>
          getHtmlSchema({ embedProviders: [provider({ srcPatterns: [pat] })] }),
        pat,
      ).toThrow(TypeError);
    for (const pat of [
      String.raw`^https://embed\.example\.com/\?id=\d+$`,
      String.raw`^https://embed\.example\.com/(?:v|e)/\d+$`,
    ])
      expect(() =>
        getHtmlSchema({ embedProviders: [provider({ srcPatterns: [pat] })] }),
      ).not.toThrow();
  });

  it('bypass A + B: ^https://a\\.com/?.*$ não aceita a.com.x.net', () => {
    const a = provider({
      id: 'a',
      hosts: ['a.com'],
      srcPatterns: [String.raw`^https://a\.com/?.*$`],
    });
    const b = provider({
      id: 'b',
      hosts: ['*.x.net', 'b.x.net'],
      srcPatterns: [String.raw`^https://b\.x\.net/v/[0-9]+$`],
    });
    expect(() => getHtmlSchema({ embedProviders: [a, b] })).toThrow(TypeError);
  });

  it('padrões padrão continuam válidos', () => {
    expect(() =>
      getHtmlSchema({ embedProviders: [...DEFAULT_EMBED_PROVIDERS] }),
    ).not.toThrow();
  });
});

describe('hosts de configuração: caracteres de URL', () => {
  it('recusa / : @ ? # \\ % e espaço antes de interpretar (inclusive não ASCII)', () => {
    for (const host of [
      'ü@evil.com',
      'evil.com/ü',
      'ü.com:80',
      'ü.com?x',
      'ü.com#x',
      'ü.com\\x',
      'ü%41.com',
      'ü .com',
      'a.com/x',
    ]) {
      expect(() => getHtmlSchema({ mediaHosts: [host] }), host).toThrow(
        TypeError,
      );
      expect(
        () => getHtmlSchema({ linkPolicy: { blockedDomains: [host] } }),
        host,
      ).toThrow(TypeError);
    }
  });

  it('IDN legítimo continua aceito', () => {
    const s = getHtmlSchema({ mediaHosts: ['пример.рф'] });
    const src = s.elements['img']?.attributes['src']?.rule as RteUrlRule;
    expect(src.hosts).toEqual(['xn--e1afmkfd.xn--p1ai']);
  });
});
