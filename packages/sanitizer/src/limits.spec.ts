import { getHtmlSchema } from '@cds/rte-core';
import { describe, expect, it } from 'vitest';
import { sanitizeWithSchema } from './engine';
import {
  createSanitizer,
  RteSanitizeError,
  sanitizeRichText,
  type RteSanitizeOptions,
} from './index';
import { readFixture } from './testing/fixtures';
import { cost, timed } from './testing/timed';

/**
 * Captura o erro lançado por `run` (cronometrado). O erro é capturado dentro
 * da execução cronometrada: uma falha do teto de R8 nunca vira "o erro".
 */
function thrown(run: () => unknown): unknown {
  const caught = timed(() => {
    try {
      run();
    } catch (error) {
      return { error };
    }
    return null;
  });
  if (caught === null) throw new Error('não lançou');
  return caught.error;
}

function expectLimitError(
  error: unknown,
  code: RteSanitizeError['code'],
  limit: number,
): void {
  expect(error).toBeInstanceOf(RteSanitizeError);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ name: 'RteSanitizeError', code, limit });
}

describe('S8: maxDepth', () => {
  it('256 aninhados passam; 257 lançam max-depth', () => {
    expect(timed(() => sanitizeRichText('<b>'.repeat(256) + 'x'))).toBe('x');
    expectLimitError(
      thrown(() => sanitizeRichText('<b>'.repeat(257))),
      'max-depth',
      256,
    );
  });

  it('conta elementos dentro de conteúdo descartado', () => {
    expectLimitError(
      thrown(() => sanitizeRichText('<svg>' + '<g>'.repeat(300))),
      'max-depth',
      256,
    );
  });

  it('respeita maxDepth da opção', () => {
    const s = createSanitizer({ maxDepth: 3 });
    expect(s('<b><i><u>x')).toBe(sanitizeRichText('<b><i><u>x'));
    expectLimitError(
      thrown(() => s('<b><i><u><s>')),
      'max-depth',
      3,
    );
  });

  it('aceita até 512 e recusa 513 (teto do parser do Chromium, I1)', () => {
    expect(() => createSanitizer({ maxDepth: 512 })).not.toThrow();
    expect(() => createSanitizer({ maxDepth: 513 })).toThrow(RangeError);
    expect(() => sanitizeRichText('x', { maxDepth: 513 })).toThrow(RangeError);
    const s = createSanitizer({ maxDepth: 512 });
    expect(timed(() => s('<b>'.repeat(512) + 'x'))).toBe('x');
    expectLimitError(
      thrown(() => s('<b>'.repeat(513))),
      'max-depth',
      512,
    );
  });

  it('20 000 aninhados lançam max-depth rápido com o padrão', () => {
    expectLimitError(
      thrown(() => sanitizeRichText('<b>'.repeat(20_000) + 'x')),
      'max-depth',
      256,
    );
  });
});

describe('Review Focus 3: sem recursão nativa (engine interna, sem o teto 512)', () => {
  const schema = getHtmlSchema();

  it('20 000 níveis desembrulhados', () => {
    expect(
      timed(() =>
        sanitizeWithSchema('<b>'.repeat(20_000) + 'x', schema, 20_000),
      ),
    ).toBe('x');
  });

  it('19 999 níveis mantidos e serializados', () => {
    const html = '<span>'.repeat(19_999) + 'x';
    expect(timed(() => sanitizeWithSchema(html, schema, 20_000))).toBe(
      html + '</span>'.repeat(19_999),
    );
  });
});

describe('S8: maxInputLength', () => {
  it('1 000 000 passam; 1 000 001 lançam input-too-long', () => {
    const max = 'a'.repeat(1_000_000);
    expect(timed(() => sanitizeRichText(max))).toBe(max);
    expectLimitError(
      thrown(() => sanitizeRichText(max + 'a')),
      'input-too-long',
      1_000_000,
    );
  });

  it('respeita maxInputLength da opção', () => {
    const s = createSanitizer({ maxInputLength: 5 });
    expect(s('abcde')).toBe('abcde');
    expectLimitError(
      thrown(() => s('abcdef')),
      'input-too-long',
      5,
    );
  });
});

describe('S8: opções e entrada inválidas', () => {
  const invalid: unknown[] = [0, -1, 1.5, NaN, Infinity, '10'];

  for (const name of ['maxDepth', 'maxInputLength'] as const) {
    it.each(invalid)(`${name} %s → RangeError`, (value) => {
      const options = { [name]: value } as RteSanitizeOptions;
      expect(() => createSanitizer(options)).toThrow(RangeError);
      expect(() => createSanitizer(options)).toThrow(
        `${name} ${String(value)} inválido`,
      );
      expect(() => sanitizeRichText('x', options)).toThrow(RangeError);
    });
  }

  it('options null equivale a ausente (padrões)', () => {
    const html = '<p class="x" onclick="y">a<script>b</script></p>';
    const expected = sanitizeRichText(html);
    expect(sanitizeRichText(html, null)).toBe(expected);
    expect(createSanitizer(null)(html)).toBe(expected);
    expectLimitError(
      thrown(() => createSanitizer(null)('<b>'.repeat(257))),
      'max-depth',
      256,
    );
  });

  it.each([null, undefined, 1])('entrada %s → TypeError', (value) => {
    expect(() => sanitizeRichText(value as never)).toThrow(TypeError);
    expect(() => sanitizeRichText(value as never)).toThrow(
      `O HTML a sanitizar precisa ser string (recebido ${typeof value}).`,
    );
    expect(() => createSanitizer()(value as never)).toThrow(TypeError);
  });
});

describe('R8: adversariais de até 1 000 000 unidades terminam em < 2 s', () => {
  /** Sanitiza; um `max-depth` também é um término válido. */
  function run(html: string): string | RteSanitizeError {
    expect(html.length).toBeLessThanOrEqual(1_000_000);
    return timed(() => {
      try {
        return sanitizeRichText(html);
      } catch (error) {
        if (error instanceof RteSanitizeError) return error;
        throw error;
      }
    });
  }

  it('aninhamento no limite, repetido', () => {
    const unit = '<b>'.repeat(255) + '</b>'.repeat(255);
    const html = unit.repeat(Math.floor(1_000_000 / unit.length));
    expect(run(html)).toBe('');
  });

  it('milhares de atributos', () => {
    expect(run('<p ' + 'a="1" '.repeat(166_000) + '>x')).toBe('<p>x</p>');
  });

  it('entidades', () => {
    const html = '&amp;'.repeat(199_999);
    expect(run(html)).toBe(html);
  });

  it('li sem fechamento', () => {
    expect(run('<li>'.repeat(250_000))).toBe('');
  });

  it('a sem fechamento', () => {
    expect(run('<a href="https://e.com/">'.repeat(40_000))).toBe(
      '<a href="https://e.com/"></a>'.repeat(40_000),
    );
  });

  it('href longo', () => {
    expect(
      run('<a href="https://e.com/' + 'a'.repeat(999_000) + '">x</a>'),
    ).toBe('x');
  });

  it('class longa', () => {
    expect(run('<p class="' + 'a '.repeat(499_000) + '">x</p>')).toBe(
      '<p>x</p>',
    );
  });

  it('style longo', () => {
    expect(
      run('<p style="' + 'text-align: left;'.repeat(58_000) + '">x</p>'),
    ).toBe('<p style="text-align: left">x</p>');
  });

  it("'<' repetido", () => {
    expect(run('<'.repeat(1_000_000))).toBe('&lt;'.repeat(1_000_000));
  });

  it("'</' repetido", () => {
    expect(run('</'.repeat(500_000))).toBe('');
  });
});

describe('R8: escala linear, independente da velocidade da máquina', () => {
  /** Sanitiza; um `max-depth` também é um término válido. */
  function sanitize(html: string): void {
    try {
      sanitizeRichText(html);
    } catch (error) {
      if (!(error instanceof RteSanitizeError)) throw error;
    }
  }

  /** Menor de 3 custos de `run`. */
  function best(run: () => void): number {
    let min = Infinity;
    for (let i = 0; i < 3; i++) min = Math.min(min, cost(run));
    return min;
  }

  // Mesma quantidade de entrada nos dois lados: 1 documento de 16n contra 16
  // documentos de n (os dois bem acima do passo de ~16 ms do relógio de CPU no
  // Windows). Linear ≈ 1, quadrático ≈ 16; o teto 8 tolera o ruído de núcleos
  // disputados e de cache.
  it.each([
    ["'<'", '<', 62_500],
    ['<li>', '<li>', 15_625],
  ])('%s: custo(16n) / (16 × custo(n)) < 8', (_, unit, n) => {
    const small = unit.repeat(n);
    const large = unit.repeat(16 * n);
    sanitize(large); // aquece o JIT
    const ratio =
      best(() => sanitize(large)) /
      best(() => {
        for (let i = 0; i < 16; i++) sanitize(small);
      });
    expect(ratio).toBeLessThan(8);
  });
});

describe('Review Focus 4: opções do editor (superconjunto) são ignoradas', () => {
  it('saída igual à das opções só do esquema', () => {
    const fixture = readFixture('all-features.html');
    const extra = createSanitizer({
      features: { tables: false },
      codeLanguages: [],
      placeholder: 'x',
      charLimit: 10,
      slash: {},
    } as RteSanitizeOptions);
    const plain = createSanitizer({ features: { tables: false } });
    expect(extra(fixture)).toBe(plain(fixture));
  });
});
