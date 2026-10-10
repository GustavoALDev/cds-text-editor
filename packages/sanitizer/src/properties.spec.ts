// Propriedades do sanitizador (spec 04, §6.2): idempotência (R3), saída
// canônica pelo `validateHtml` (R4) e saída inerte pelo `findUnsafe` (R5), com
// ≥ 10 000 casos de HTML hostil cada, mais o diferencial sobre HTML válido.
import { getHtmlSchema, isAllowedUrl, type RteHtmlSchema } from '@comodeviaser/rte-core';
import { validateHtml } from '@comodeviaser/rte-core/html';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  createSanitizer,
  sanitizeRichText,
  type RteSanitizeOptions,
} from './index';
import { dangerousUrl } from './testing/dangerous-urls';
import { hostileHtml, validHtml } from './testing/html-arbitraries';
import { findUnsafe } from './testing/safety';

const SEED = Number(process.env['FC_SEED'] ?? 20261003);
const RUNS = Number(process.env['FC_RUNS'] ?? 10_000);

vi.setConfig({ testTimeout: 300_000 });

const CONFIGS: readonly RteSanitizeOptions[] = [
  {},
  { features: { tables: false, media: false } },
  { embedProviders: [] },
  {
    linkPolicy: { forceRel: ['nofollow'], blockedDomains: ['example.com'] },
  },
  { features: { colors: false, newsBlocks: false, tasks: false, code: false } },
  { idPrefix: 'doc-' },
];

interface Setup {
  options: RteSanitizeOptions;
  sanitize: (html: string) => string;
  schema: RteHtmlSchema;
}

/** Sanitizadores e esquemas criados uma vez por configuração. */
const SETUPS: readonly Setup[] = CONFIGS.map((options) => ({
  options,
  sanitize: createSanitizer(options),
  schema: getHtmlSchema(options),
}));

const hostileCase = fc.tuple(hostileHtml, fc.constantFrom(...SETUPS));

/** Rótulo da configuração no relatório do contraexemplo. */
function label(setup: Setup): string {
  return JSON.stringify(setup.options);
}

describe('propriedades (§6.2)', () => {
  it(`R3: s(s(x)) === s(x) (${RUNS} casos)`, () => {
    fc.assert(
      fc.property(hostileCase, ([html, setup]) => {
        const once = setup.sanitize(html);
        expect(setup.sanitize(once), label(setup)).toBe(once);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it(`R4: validateHtml(s(x), S, canonical) → [] (${RUNS} casos)`, () => {
    fc.assert(
      fc.property(hostileCase, ([html, setup]) => {
        const out = setup.sanitize(html);
        expect(
          validateHtml(out, setup.schema, { mode: 'canonical' }),
          `${label(setup)}\n${out}`,
        ).toEqual([]);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it(`R5: findUnsafe(s(x), S) → [] (${RUNS} casos)`, () => {
    fc.assert(
      fc.property(hostileCase, ([html, setup]) => {
        const out = setup.sanitize(html);
        expect(
          findUnsafe(out, setup.schema),
          `${label(setup)}\n${out}`,
        ).toEqual([]);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('diferencial: HTML válido e canônico sai igual', () => {
    const schema = getHtmlSchema();
    fc.assert(
      fc.property(validHtml, (html) => {
        // O gerador precisa produzir HTML canônico, senão a propriedade passaria calada.
        expect(validateHtml(html, schema), html).toEqual([]);
        expect(sanitizeRichText(html)).toBe(html);
      }),
      { seed: SEED, numRuns: Math.max(2000, RUNS / 5) },
    );
  });

  it('dangerousUrl: 1000 amostras, todas recusadas pela regra do href', () => {
    const rule = getHtmlSchema().elements['a']!.attributes['href']!.rule;
    if (rule.kind !== 'url') throw new Error('regra do href não é url');
    const samples = fc.sample(dangerousUrl, { numRuns: 1000, seed: SEED });
    expect(samples).toHaveLength(1000);
    for (const url of samples) {
      expect(isAllowedUrl(rule, url), JSON.stringify(url)).toBeNull();
    }
  });
});
