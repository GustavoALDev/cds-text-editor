import fc from 'fast-check';

/** Execuções e semente das propriedades (`FC_RUNS`, `FC_SEED`). */
export const FC_RUNS = Number(process.env['FC_RUNS'] ?? 100);
export const FC_SEED = process.env['FC_SEED'];

/** Opções do `fc.assert` com a semente do ambiente, se houver. */
export function fcOptions(numRuns = FC_RUNS): {
  numRuns: number;
  seed?: number;
} {
  return { numRuns, ...(FC_SEED ? { seed: Number(FC_SEED) } : {}) };
}

/** Ofuscações dos endereços gerados (R6): TAB/LF/CR, `\`, espaço, C0, DEL. */
const OBFUSCATION = fc.constantFrom(
  '\t',
  '\n',
  '\r',
  '\\',
  ' ',
  '\u0000',
  '\u0001',
  '\u001f',
  '\u007f',
);

/** Insere ofuscações em posições geradas de `s`. */
function obfuscate(s: string, inserts: readonly [number, string][]): string {
  let out = s;
  for (const [at, ch] of inserts) {
    const i = at % (out.length + 1);
    out = out.slice(0, i) + ch + out.slice(i);
  }
  return out;
}

/**
 * Endereços de mídia gerados (R6): esquemas com maiúsculas, hosts dentro e
 * fora de `mediaHosts`, caminhos, ofuscações; `ext` é a extensão do arquivo.
 */
export function generatedMediaUrl(ext: string): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(
        'https://',
        'HTTPS://',
        'hTtPs://',
        'http://',
        '//',
        '/',
        '',
        'javascript:',
        'JaVaScRiPt:',
        'data:',
        'blob:https://',
        './',
        '../',
      ),
      fc.constantFrom(
        'media.example.test',
        'MEDIA.Example.TEST',
        'x.test',
        'media.example.test.evil.test',
        '',
      ),
      fc.constantFrom(
        `/a.${ext}`,
        `/A%20b.${ext.toUpperCase()}`,
        `/a b.${ext}`,
        '?q=1#f',
        '',
      ),
      fc.array(fc.tuple(fc.nat(), OBFUSCATION), { maxLength: 3 }),
    )
    .map(([scheme, host, path, inserts]) =>
      obfuscate(scheme + host + path, inserts),
    );
}

/** Strings arbitrárias ou endereços gerados (R6). */
export function anyMediaUrl(ext: string): fc.Arbitrary<string> {
  return fc.oneof(fc.string({ maxLength: 40 }), generatedMediaUrl(ext));
}

/** Códigos de idioma gerados (válidos, quase válidos e com ofuscações). */
export const ANY_LANG: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc
    .tuple(
      fc.constantFrom(
        'pt-BR',
        'en',
        'EN-us',
        'zh-Hant-TW',
        'e',
        'en_US',
        'x-private',
        'i-klingon',
        'pt--BR',
        'a'.repeat(31),
        'de-1996',
        '',
      ),
      fc.array(fc.tuple(fc.nat(), OBFUSCATION), { maxLength: 2 }),
    )
    .map(([tag, inserts]) => obfuscate(tag, inserts)),
);
