// Gerador fast-check de URLs com esquema perigoso ofuscado. Só para specs;
// fora do índice público. Os esquemas e o ruído vêm de
// `fixtures/content/dangerous-urls.json`, compartilhado com o sanitizador.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as fc from 'fast-check';

interface DangerousUrlsFixture {
  schemes: string[];
  noise: string[];
  examples: string[];
}

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../../fixtures/content/dangerous-urls.json'),
    'utf8',
  ).replace(/\r\n?/g, '\n'),
) as DangerousUrlsFixture;

export const DANGEROUS_SCHEMES: readonly string[] = FIXTURE.schemes;

const noise = fc.constantFrom(...FIXTURE.noise);

/** Esquema perigoso em capitalização aleatória, com TAB/LF/espaço/C0 inseridos, seguido de lixo. */
export const dangerousUrl: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...DANGEROUS_SCHEMES),
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
