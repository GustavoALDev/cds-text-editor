// Gerador fast-check de URLs com esquema perigoso ofuscado. Só para specs;
// fora do índice público.
import * as fc from 'fast-check';

export const DANGEROUS_SCHEMES = [
  'javascript',
  'data',
  'vbscript',
  'file',
] as const;

const noise = fc.constantFrom(
  '\t',
  '\n',
  '\r',
  ' ',
  '\u0001',
  '\u0000',
  '\u001f',
);

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
