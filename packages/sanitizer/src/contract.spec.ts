// Contrato byte a byte com o editor (spec 04, R2 e R4): a saída do editor é
// ponto fixo do sanitizador e o esquema reduzido é respeitado. O corpus é
// gerado pelo teste do core (`editor-corpus.json`) e lido aqui como JSON (R12).
import { getHtmlSchema, type RteFeatureId } from '@cds/rte-core';
import { validateHtml } from '@cds/rte-core/html';
import { describe, expect, it } from 'vitest';
import { createSanitizer, sanitizeRichText } from './index';
import type { RteSanitizeOptions } from './index';
import { readFixture } from './testing/fixtures';

const fixture = readFixture('all-features.html');
const tolerant = JSON.parse(readFixture('tolerant-cases.json')) as {
  name: string;
  input: string;
  expected: string;
}[];
const corpus = JSON.parse(readFixture('editor-corpus.json')) as string[];

describe('R2: a saída do editor é ponto fixo', () => {
  it('all-features.html', () => {
    expect(sanitizeRichText(fixture)).toBe(fixture);
  });

  it.each(tolerant.map((c) => [c.name, c.expected] as const))(
    'tolerant-cases: %s',
    (_name, expected) => {
      expect(sanitizeRichText(expected)).toBe(expected);
    },
  );

  it('editor-corpus.json: 300 documentos, todos ponto fixo', () => {
    expect(corpus).toHaveLength(300);
    corpus.forEach((doc, i) => {
      expect(sanitizeRichText(doc), `documento ${i}`).toBe(doc);
    });
  });
});

const OFF: RteFeatureId[] = [
  'colors',
  'code',
  'tables',
  'tasks',
  'media',
  'embeds',
  'newsBlocks',
];
const VARIANTS: [string, RteSanitizeOptions, RteFeatureId | null][] = [
  ...OFF.map(
    (f) =>
      [`${f} desligado`, { features: { [f]: false } }, f] as [
        string,
        RteSanitizeOptions,
        RteFeatureId,
      ],
  ),
  ['embedProviders []', { embedProviders: [] }, 'embeds'],
];

describe('R2: recursos desligados', () => {
  it.each(VARIANTS)('%s', (_name, opts, feature) => {
    const out = createSanitizer(opts)(fixture);
    const schema = getHtmlSchema(opts);
    if (feature !== null) {
      const exclusive = (getHtmlSchema().byFeature[feature] ?? []).filter(
        (tag) => !Object.hasOwn(schema.elements, tag),
      );
      for (const tag of exclusive) {
        expect(out, `<${tag}>`).not.toMatch(new RegExp(`<${tag}[\\s>]`));
      }
    }
    expect(validateHtml(out, schema)).toEqual([]);
    expect(createSanitizer(opts)(out)).toBe(out);
  });
});

describe('R4: linkPolicy', () => {
  it('rel forçado e domínio bloqueado, com saída válida', () => {
    const opts: RteSanitizeOptions = {
      linkPolicy: { forceRel: ['nofollow'], blockedDomains: ['example.com'] },
    };
    const out = createSanitizer(opts)(fixture);
    expect(validateHtml(out, getHtmlSchema(opts))).toEqual([]);
    expect(out).not.toContain('href="https://example.com/');
    const anchors = out.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) expect(a).toMatch(/rel="[^"]*nofollow/);
  });
});
