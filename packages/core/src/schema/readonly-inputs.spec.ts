import { describe, expect, expectTypeOf, it } from 'vitest';
import { normalizeHref, type RteLinkPolicy } from '../links';
import { formatSrcset } from './srcset';
import { getHtmlSchema } from './get-html-schema';
import type {
  RteEmbedProvider,
  RteHtmlSchemaOptions,
  RteSchemaLinkPolicy,
} from './types';

// AP4 (09c): listas de ENTRADA aceitam `readonly T[]` (alargar não quebra quem chama).
describe('entradas de lista aceitam readonly', () => {
  it('RteSchemaLinkPolicy é o tipo nomeado de RteHtmlSchemaOptions.linkPolicy', () => {
    expectTypeOf<
      RteHtmlSchemaOptions['linkPolicy']
    >().toEqualTypeOf<RteSchemaLinkPolicy | undefined>();
    const policy = {
      protocols: ['https'],
      forceRel: ['nofollow'],
      blockedDomains: ['evil.example'],
    } as const satisfies RteSchemaLinkPolicy;
    const schema = getHtmlSchema({ linkPolicy: policy });
    expect(schema.elements['a']).toBeDefined();
    expectTypeOf<RteSchemaLinkPolicy['protocols']>().toEqualTypeOf<
      readonly string[] | undefined
    >();
  });

  it('RteEmbedProvider.hosts e srcPatterns são readonly', () => {
    expectTypeOf<RteEmbedProvider['hosts']>().toEqualTypeOf<
      readonly string[]
    >();
    expectTypeOf<RteEmbedProvider['srcPatterns']>().toEqualTypeOf<
      readonly string[]
    >();
  });

  it('formatSrcset e a política de links aceitam listas readonly', () => {
    const candidates = [{ url: 'a.png', descriptor: '1x' }] as const;
    expect(formatSrcset(candidates)).toBe('a.png 1x');
    expectTypeOf<RteLinkPolicy['forceRel']>().toEqualTypeOf<
      readonly string[]
    >();
    expect(
      normalizeHref('https://x.example', {
        forceRel: ['nofollow'] as const,
        protocols: ['https'] as const,
      }),
    ).toBeTruthy();
  });
});
