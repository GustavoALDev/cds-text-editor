// Gerador fast-check de URLs com esquema perigoso ofuscado. Só para specs;
// fora do índice público. Os esquemas e o ruído vêm de
// `fixtures/content/dangerous-urls.json`, compartilhado com o sanitizador.
import * as fc from 'fast-check';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface DangerousUrlsFixture {
  schemes: string[];
  noise: string[];
  examples: string[];
}

// Sobe a partir do `cwd` até achar o fixture: `__dirname` e `import.meta.url`
// não valem sob o builder do angular nem no jsdom (os specs são empacotados).
function readFixture(): DangerousUrlsFixture {
  const rel = join('fixtures', 'content', 'dangerous-urls.json');
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const file = join(dir, rel);
    if (existsSync(file)) {
      return JSON.parse(
        readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'),
      ) as DangerousUrlsFixture;
    }
    if (dirname(dir) === dir) throw new Error(`fixture não encontrado: ${rel}`);
  }
}

const FIXTURE = readFixture();

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
