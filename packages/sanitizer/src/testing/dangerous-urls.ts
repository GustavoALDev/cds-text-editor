// Gerador fast-check de URLs perigosas para as propriedades (spec 04, §6.2):
// o mesmo algoritmo de `packages/core/src/schema/testing/dangerous-urls.ts`,
// sobre o fixture compartilhado `fixtures/content/dangerous-urls.json`, unido
// aos exemplos concretos dele. Fora do build.
import * as fc from 'fast-check';
import { readFixture } from './fixtures';

interface DangerousUrlsFixture {
  schemes: string[];
  noise: string[];
  examples: string[];
}

const FIXTURE = JSON.parse(
  readFixture('dangerous-urls.json'),
) as DangerousUrlsFixture;

const noise = fc.constantFrom(...FIXTURE.noise);

/** Esquema perigoso em capitalização aleatória, com TAB/LF/espaço/C0 inseridos, seguido de lixo. */
const obfuscatedScheme: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...FIXTURE.schemes),
    fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
    fc.array(fc.tuple(fc.nat(12), noise), { maxLength: 6 }),
    fc.string(),
    fc.array(noise, { maxLength: 3 }),
  )
  .map(([scheme, caps, inserts, rest, lead]) => {
    let chars = [...scheme].map((c, i) => (caps[i] ? c.toUpperCase() : c));
    for (const [pos, ch] of inserts) {
      const at = Math.min(pos, chars.length);
      chars = [...chars.slice(0, at), ch, ...chars.slice(at)];
    }
    return `${lead.join('')}${chars.join('')}:${rest}`;
  });

/**
 * URL perigosa: esquema ofuscado gerado ou um dos exemplos concretos (inclusive
 * ofuscações por entidade, que só viram esquema depois da leitura do HTML).
 */
export const dangerousUrl: fc.Arbitrary<string> = fc.oneof(
  obfuscatedScheme,
  fc.constantFrom(...FIXTURE.examples),
);
