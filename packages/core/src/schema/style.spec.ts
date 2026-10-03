import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyStyleFrom, sanitizeStyle } from './style';
import type { RteAttrRule } from './types';

const styles: Record<string, RteAttrRule> = {
  'text-align': {
    kind: 'enum',
    values: ['left', 'center', 'right', 'justify'],
  },
};
const withWidth: Record<string, RteAttrRule> = {
  ...styles,
  width: { kind: 'pattern', pattern: '^(?:[1-9]\\d{0,3})px$', maxLength: 6 },
};

describe('sanitizeStyle', () => {
  it('devolve a forma canônica', () => {
    expect(sanitizeStyle(styles, 'text-align: center')).toBe(
      'text-align: center',
    );
    expect(sanitizeStyle(styles, 'TEXT-ALIGN:Center;')).toBe(
      'text-align: center',
    );
  });

  it('descarta propriedade fora do esquema e a última declaração vale', () => {
    expect(sanitizeStyle(styles, 'color: red; text-align: right')).toBe(
      'text-align: right',
    );
    expect(sanitizeStyle(styles, 'text-align: left; text-align: right')).toBe(
      'text-align: right',
    );
  });

  it('descarta só a declaração inválida', () => {
    expect(sanitizeStyle(styles, 'text-align: center !important')).toBe('');
    expect(sanitizeStyle(styles, 'text-align: url(x)')).toBe('');
    expect(
      sanitizeStyle(withWidth, 'width: 10px !important; text-align: left'),
    ).toBe('text-align: left');
    expect(sanitizeStyle(withWidth, 'width: url(x); text-align: left')).toBe(
      'text-align: left',
    );
  });

  it('descarta o estilo inteiro com barra invertida, comentário ou expression', () => {
    expect(sanitizeStyle(styles, 'text-align: left; \\61 ')).toBe('');
    expect(sanitizeStyle(styles, 'text-align: left /* x */')).toBe('');
    expect(sanitizeStyle(styles, 'text-align: left */')).toBe('');
    expect(sanitizeStyle(styles, 'text-align: expression(alert(1))')).toBe('');
    expect(
      sanitizeStyle(styles, 'text-align: left; color: EXPRESSION(1)'),
    ).toBe('');
  });

  it('valida valores por padrão e segue a ordem das chaves do esquema', () => {
    expect(sanitizeStyle(withWidth, 'width: 120px')).toBe('width: 120px');
    expect(sanitizeStyle(withWidth, 'width: 0px')).toBe('');
    expect(sanitizeStyle(withWidth, 'width: 10000px')).toBe('');
    expect(sanitizeStyle(withWidth, 'width: 5px; text-align: left')).toBe(
      'text-align: left; width: 5px',
    );
  });

  it('colapsa espaços ASCII internos do valor', () => {
    const s: Record<string, RteAttrRule> = {
      'aspect-ratio': {
        kind: 'pattern',
        pattern: '^[1-9]\\d{0,3} / [1-9]\\d{0,3}$',
        maxLength: 12,
      },
    };
    expect(sanitizeStyle(s, 'aspect-ratio:  16 \t/\n 9 ')).toBe(
      'aspect-ratio: 16 / 9',
    );
  });

  it('não confunde propriedades herdadas do protótipo', () => {
    expect(sanitizeStyle(styles, 'constructor: left; __proto__: left')).toBe(
      '',
    );
  });

  it('é idempotente (R8)', () => {
    const once = (x: string) => sanitizeStyle(withWidth, x);
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (x) => {
        expect(once(once(x))).toBe(once(x));
      }),
    );
    const decl = fc.oneof(
      fc.constantFrom(
        'text-align: center',
        'TEXT-ALIGN:Right',
        'width: 120px',
        'width: 0px',
        'color: red',
        'text-align: left !important',
        'width: url(x)',
        ' ',
        '',
      ),
      fc.string({ unit: 'binary' }),
    );
    fc.assert(
      fc.property(fc.array(decl), (ds) => {
        const x = ds.join(';');
        expect(once(once(x))).toBe(once(x));
      }),
    );
  });
});

describe('applyStyleFrom', () => {
  const spec = {
    attribute: 'data-rt-color',
    property: 'color',
    map: { red: '#b3261e' },
  };
  it('regenera o estilo a partir do nome da paleta', () => {
    expect(applyStyleFrom(spec, 'red')).toBe('color: #b3261e');
  });
  it('devolve null para nome fora da paleta', () => {
    expect(applyStyleFrom(spec, 'blue')).toBeNull();
    expect(applyStyleFrom(spec, 'constructor')).toBeNull();
    expect(applyStyleFrom(spec, '__proto__')).toBeNull();
  });
});
