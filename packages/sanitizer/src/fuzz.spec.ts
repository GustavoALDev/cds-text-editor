// Propriedades de fuzz da revisão R9: custo linear, comprimento, URL e atributos.
// Semente e execuções por ambiente (`FC_SEED`, `FC_RUNS`), como no tema.
import {
  getHtmlSchema,
  isAllowedUrl,
  type RteElementSpec,
  type RteHtmlSchema,
  type RteUrlRule,
} from '@cds/rte-core';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createSanitizer, RteSanitizeError } from './index';
import type { RteSanitizeOptions } from './index';
import { dangerousUrl } from './testing/dangerous-urls';
import { hostileHtml } from './testing/html-arbitraries';

const SEED = Number(process.env['FC_SEED'] ?? 20261008);
const RUNS = Number(process.env['FC_RUNS'] ?? 2000);
/** Cada execução de custo mede ~10 vezes um documento grande: poucas amostras bastam. */
const PERF_RUNS = Math.min(RUNS, 8);

vi.setConfig({ testTimeout: 300_000 });

// ---- (1) custo linear -------------------------------------------------------

/**
 * Custo de parede (ms). O relógio de CPU do processo tem passo de ~16 ms no Windows e zera
 * documentos de dezenas de ms; aqui o tamanho é grande e a mediana/segunda medida absorvem o ruído.
 */
function wall(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

/** Mediana de `reps` custos (ms) de `run`. */
function median(run: () => unknown, reps = 5): number {
  const xs: number[] = [];
  for (let i = 0; i < reps; i++) xs.push(wall(run));
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

/** Piso do denominador (ms): abaixo disto o relógio só mede ruído. */
const FLOOR_MS = 4;
/** Linear ≈ 2, quadrático ≈ 4: o limite fica no meio, folgado para runners ruidosos. */
const MAX_RATIO = 3.2;

/**
 * Tamanho da entrada de N: ~250 mil unidades (2N fica bem abaixo do `maxInputLength` de 1 000 000).
 * Acima de ~400 mil com saída de vários MB o custo salta (alocação e GC de strings grandes, não
 * algoritmo): `&` cru, 400 mil -> 800 mil, mede ~3x, enquanto 100 mil -> 200 mil -> 400 mil mede ~1,9x.
 */
const TARGET_LENGTH = 250_000;

/**
 * Razão custo(2N) / custo(N) pela mediana; linear ≈ 2, quadrático ≈ 4. Até 3 medidas, fica com
 * a menor (o ruído de GC e de núcleos disputados só infla; uma regressão quadrática infla todas).
 */
function doublingRatio(
  run: (html: string) => unknown,
  gen: (n: number) => string,
): number {
  const n = Math.max(1, Math.floor((TARGET_LENGTH * 100) / gen(100).length));
  const small = gen(n);
  const large = gen(2 * n);
  run(large); // aquece o JIT
  const measure = (): number =>
    median(() => run(large)) /
    Math.max(
      median(() => run(small)),
      FLOOR_MS,
    );
  // Até 3 medidas: o ruído (GC, núcleos disputados) só infla; uma regressão quadrática infla todas.
  let best = measure();
  for (let i = 0; i < 2 && best > MAX_RATIO; i++)
    best = Math.min(best, measure());
  return best;
}

const UNWRAP_UNITS = [
  ['<a href="https://a.example/">', '</a>'],
  ['<p><h2>', '</h2></p>'],
  ['<li>', '</li>'],
  ['<td>', '</td>'],
  ['<tr><td>', '</td></tr>'],
  ['<h2><h3>', '</h3></h2>'],
  ['<span><div>', '</div></span>'],
] as const;

const ATTR_POOL = [
  'class',
  'style',
  'id',
  'title',
  'data-x',
  'onclick',
  'href',
  'rel',
  'target',
  'lang',
] as const;

const WORST_CASES: Record<
  string,
  fc.Arbitrary<(n: number) => string> // n = repetições; o tamanho cresce linearmente
> = {
  'aninhamento perto de maxDepth': fc
    .integer({ min: 200, max: 250 })
    .map(
      (d) => (n) =>
        ('<b>'.repeat(d) + 'x' + '</b>'.repeat(d)).repeat(Math.ceil(n / d)),
    ),
  'milhares de atributos': fc
    .tuple(
      fc.uniqueArray(fc.constantFrom(...ATTR_POOL), { minLength: 1 }),
      fc.boolean(),
    )
    .map(([names, unique]) => (n) => {
      let attrs = '';
      for (let i = 0; i < n; i++) {
        const name = names[i % names.length]!;
        attrs += ` ${unique ? `${name}-${i}` : name}="v${i}"`;
      }
      return `<p${attrs}>x</p>`;
    }),
  'desembrulhos em cadeia': fc
    .tuple(fc.constantFrom(...UNWRAP_UNITS), fc.integer({ min: 50, max: 200 }))
    .map(
      ([[open, close], d]) =>
        (n) =>
          (open.repeat(d) + 'x' + close.repeat(d)).repeat(Math.ceil(n / d)),
    ),
  'muitas tabelas com caption': fc
    .constantFrom(
      '<table><caption></caption></table>',
      '<table><caption>c</caption><tbody><tr><td>x</td></tr></tbody></table>',
      '<table><caption><b>c</b></caption><colgroup><col style="width:10px"></colgroup><tbody><tr><td>x</td></tr></tbody></table>',
    )
    .map((unit) => (n) => unit.repeat(n)),
  'URLs de 2048': fc
    .constantFrom(
      (u: string) => `<a href="${u}">x</a>`,
      (u: string) => `<img src="${u}" alt="a">`,
      (u: string) => `<img srcset="${u} 1x, ${u} 2x" src="${u}">`,
    )
    .map((wrap) => (n) => {
      const url = 'https://h.example/' + 'a%20&amp;b/'.repeat(190);
      return wrap(url.slice(0, 2048)).repeat(n);
    }),
  '& e NBSP': fc
    .constantFrom('&', ' ', '&nbsp;', '&amp;', '&#160;', '&lt;&gt;')
    .map((unit) => (n) => `<p>${unit.repeat(n)}</p>`),
};

describe('fuzz (1): custo linear de s(x)', () => {
  const sanitize = createSanitizer();
  const run = (html: string): void => {
    try {
      sanitize(html);
    } catch (error) {
      if (!(error instanceof RteSanitizeError)) throw error;
    }
  };
  for (const [name, arbitrary] of Object.entries(WORST_CASES)) {
    it(`${name}: custo(2N)/custo(N) ≤ 3,2`, () => {
      fc.assert(
        fc.property(arbitrary, (gen) => {
          const ratio = doublingRatio(run, gen);
          expect(ratio).toBeLessThanOrEqual(MAX_RATIO);
        }),
        { seed: SEED, numRuns: PERF_RUNS },
      );
    });
  }
});

// ---- (2) comprimento --------------------------------------------------------

describe('fuzz (2): comprimento da saída e maxInputLength', () => {
  it(`s(s(x)) com o mesmo limite lança input-too-long exatamente quando a saída passa dele (${RUNS} casos)`, () => {
    fc.assert(
      fc.property(
        hostileHtml,
        fc.boolean(),
        fc.integer({ min: 0, max: 40 }),
        (html, amp, extra) => {
          const x = (amp ? '&'.repeat(extra) : '') + html;
          const limit = Math.max(1, x.length);
          const s = createSanitizer({ maxInputLength: limit });
          let out: string;
          try {
            out = s(x);
          } catch (error) {
            // só max-depth é aceitável: a entrada cabe no limite
            expect(error).toBeInstanceOf(RteSanitizeError);
            expect((error as RteSanitizeError).code).toBe('max-depth');
            return;
          }
          if (out.length <= limit) {
            expect(s(out)).toBe(out);
          } else {
            expect(() => s(out)).toThrow(RteSanitizeError);
            try {
              s(out);
            } catch (error) {
              expect((error as RteSanitizeError).code).toBe('input-too-long');
            }
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

// ---- (5) URL ----------------------------------------------------------------

const BASE = 'https://base.example/';
const LINK_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];

/** Candidatas: URLs perigosas, gerais e bem formadas com hosts de interesse. */
const urlCandidate: fc.Arbitrary<string> = fc.oneof(
  dangerousUrl,
  fc.webUrl({ validSchemes: ['http', 'https'] }),
  fc.constantFrom(
    '/ok/path?q=1',
    '/\\evil.example/x',
    '//evil.example/x',
    '/%5Cevil.example/x',
    'https://cdn.example.com/a.png',
    'https://sub.cdn.example.com/a.png',
    'https://cdn.example.com.evil.example/a.png',
    'https://bad.example/x',
    'https://x.bad.example/x',
    'https://user:pw@cdn.example.com/a.png',
    'mailto:a@b.example',
    'tel:+5511999999999',
    '#frag',
    'HTTPS://CDN.EXAMPLE.COM/A.png',
    'https://cdn.example.com:8443/a.png',
    'https://cdn.example.com./a.png',
  ),
  fc.string(),
);

/** O ponto final do FQDN (`host.`) é o mesmo host, como na regra do esquema. */
const hostIn = (hostname: string, list: readonly string[]): boolean => {
  const host = hostname.replace(/\.$/, '');
  return list.some((e) =>
    e.startsWith('*.') ? host.endsWith(e.slice(1)) : host === e,
  );
};

function rulesOf(schema: RteHtmlSchema): Record<string, RteUrlRule> {
  const pick = (tag: string, attr: string): RteUrlRule => {
    const rule = schema.elements[tag]!.attributes[attr]!.rule;
    if (rule.kind !== 'url') throw new Error(`${tag}.${attr} não é url`);
    return rule;
  };
  return {
    'a.href': pick('a', 'href'),
    'img.src': pick('img', 'src'),
  };
}

describe('fuzz (5): URL aceita respeita protocolo, host e relativo', () => {
  const configs: RteSanitizeOptions[] = [
    {},
    {
      mediaHosts: ['cdn.example.com', '*.cdn.example.com'],
      allowRelativeMedia: false,
      linkPolicy: { blockedDomains: ['bad.example'] },
    },
  ];
  for (const options of configs) {
    const label = JSON.stringify(options);
    const schema = getHtmlSchema(options);
    const rules = rulesOf(schema);

    it(`isAllowedUrl: a forma devolvida resolve para um protocolo da lista e host permitido (${label})`, () => {
      fc.assert(
        fc.property(urlCandidate, (raw) => {
          for (const [where, rule] of Object.entries(rules)) {
            const out = isAllowedUrl(rule, raw);
            if (out === null) continue;
            const url = new URL(out, BASE);
            const allowed = rule.schemes.map((s) => `${s.toLowerCase()}:`);
            const relative = out.startsWith('/') || out.startsWith('#');
            if (relative) {
              // relativo: continua no host da página (nunca vira outro host)
              expect(url.host, `${where} ${raw}`).toBe('base.example');
              expect(rule.relative || out.startsWith('#')).toBe(true);
              continue;
            }
            expect(allowed, `${where} ${raw}`).toContain(url.protocol);
            expect(LINK_PROTOCOLS).toContain(url.protocol);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
              if (rule.hosts)
                expect(
                  hostIn(url.hostname, rule.hosts),
                  `${where} ${raw}`,
                ).toBe(true);
              if (rule.blockedHosts)
                expect(
                  hostIn(url.hostname, rule.blockedHosts),
                  `${where} ${raw}`,
                ).toBe(false);
            }
          }
        }),
        { seed: SEED, numRuns: RUNS },
      );
    });

    it(`sanitizador: href/src/poster/srcset da saída respeitam a mesma regra (${label})`, () => {
      const sanitize = createSanitizer(options);
      const esc = (u: string): string =>
        u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      fc.assert(
        fc.property(urlCandidate, (raw) => {
          const u = esc(raw);
          const out = sanitize(
            `<p><a href="${u}">a</a><img src="${u}" alt="i">` +
              `<img srcset="${u} 1x" src="${u}"><video src="${u}" poster="${u}" controls></video></p>`,
          );
          const urls = [
            ...out.matchAll(/\s(?:href|src|poster)="([^"]*)"/g),
          ].map((m) => m[1]!.replace(/&amp;/g, '&'));
          for (const found of urls) {
            const url = new URL(found, BASE);
            if (found.startsWith('/') || found.startsWith('#')) {
              expect(url.host, `${raw} -> ${found}`).toBe('base.example');
              continue;
            }
            expect([...LINK_PROTOCOLS], `${raw} -> ${found}`).toContain(
              url.protocol,
            );
            if (options.linkPolicy?.blockedDomains) {
              expect(
                hostIn(url.hostname, options.linkPolicy.blockedDomains),
                `${raw} -> ${found}`,
              ).toBe(false);
            }
          }
        }),
        { seed: SEED, numRuns: RUNS },
      );
    });
  }
});

// ---- (6) atributos ----------------------------------------------------------

const TAG = /<[^>]*>/g;
const TAG_SHAPE =
  /^<\/?([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*(?:="[^"<>]*")?)*)\s*\/?>$/;
const ATTR_NAME = /\s+([a-z][a-z0-9-]*)(?:="([^"<>]*)")?/g;

/** Nomes aceitos num elemento: os de `attributes` mais `class` e `style` quando o esquema os prevê. */
function allowedAttributes(spec: RteElementSpec): string[] {
  const names = Object.keys(spec.attributes);
  if (spec.classes) names.push('class');
  if (spec.styles || spec.styleFrom) names.push('style');
  return names;
}

describe('fuzz (6): atributos da saída', () => {
  const configs: RteSanitizeOptions[] = [{}, { idPrefix: 'doc-' }];
  for (const options of configs) {
    const label = JSON.stringify(options);
    const schema = getHtmlSchema(options);
    const idPattern = new RegExp(
      `^${options.idPrefix ?? 'rt-'}[a-z0-9]+(?:-[a-z0-9]+)*$`,
    );
    const sanitize = createSanitizer(options);

    it(`só atributos do esquema, sem " ou < crus, id válido e único (${label}, ${RUNS} casos)`, () => {
      fc.assert(
        fc.property(hostileHtml, (html) => {
          const out = sanitize(html);
          // texto fora das tags nunca tem `<` cru
          expect(out.replace(TAG, ''), out).not.toContain('<');
          const ids = new Set<string>();
          for (const [piece] of out.matchAll(TAG)) {
            const shape = TAG_SHAPE.exec(piece);
            expect(shape, `forma da tag: ${piece}`).not.toBeNull();
            const tag = shape![1]!;
            const spec = schema.elements[tag];
            expect(spec, `elemento fora do esquema: ${tag}`).toBeDefined();
            for (const [, name, value] of shape![2]!.matchAll(ATTR_NAME)) {
              expect(
                allowedAttributes(spec!),
                `atributo ${name} em <${tag}>`,
              ).toContain(name);
              if (name === 'id') {
                expect(value ?? '', piece).toMatch(idPattern);
                expect(ids.has(value!), `id repetido ${value}`).toBe(false);
                ids.add(value!);
              }
            }
          }
        }),
        { seed: SEED, numRuns: RUNS },
      );
    });
  }
});
