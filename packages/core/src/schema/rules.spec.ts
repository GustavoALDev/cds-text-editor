import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { matchesRule, normalizeAttribute, serializeTokens } from './rules';
import type { RteAttrRule } from './types';

describe('normalizeAttribute', () => {
  it('enum ignora maiúsculas e devolve o valor da lista', () => {
    const r: RteAttrRule = { kind: 'enum', values: ['left', 'center'] };
    expect(normalizeAttribute(r, 'Center')).toBe('center');
    expect(normalizeAttribute(r, 'middle')).toBeNull();
  });

  it('pattern checa o comprimento antes da regex', () => {
    const r: RteAttrRule = {
      kind: 'pattern',
      pattern: '^[a-z]+$',
      maxLength: 10,
    };
    expect(normalizeAttribute(r, 'abc')).toBe('abc');
    const t = performance.now();
    expect(normalizeAttribute(r, 'a'.repeat(1_000_000))).toBeNull();
    expect(performance.now() - t).toBeLessThan(50);
  });

  it('int canoniza e rejeita fora do formato ou da faixa', () => {
    const r: RteAttrRule = { kind: 'int', min: 1, max: 100 };
    expect(normalizeAttribute(r, '007')).toBe('7');
    for (const v of ['0', '101', '-1', '1.5', '+2', '1e2', '']) {
      expect(normalizeAttribute(r, v)).toBeNull();
    }
  });

  it('bool serializa vazio', () => {
    const r: RteAttrRule = { kind: 'bool' };
    expect(normalizeAttribute(r, 'checked')).toBe('');
    expect(normalizeAttribute(r, '')).toBe('');
  });

  it('text respeita maxLength', () => {
    const r: RteAttrRule = { kind: 'text', maxLength: 5 };
    expect(normalizeAttribute(r, 'abcde')).toBe('abcde');
    expect(normalizeAttribute(r, 'abcdef')).toBeNull();
  });

  it('tokens: ordem canônica, sem repetição, sem diferenciar maiúsculas', () => {
    const r: Extract<RteAttrRule, { kind: 'tokens' }> = {
      kind: 'tokens',
      values: ['nofollow', 'noopener', 'noreferrer'],
      separator: ' ',
      maxLength: 100,
    };
    expect(normalizeAttribute(r, 'NoReferrer  nofollow nofollow')).toBe(
      'nofollow noreferrer',
    );
    expect(normalizeAttribute(r, 'evil')).toBeNull();
    expect(normalizeAttribute(r, '')).toBeNull();
    expect(normalizeAttribute(r, 'x'.repeat(101))).toBeNull();
  });

  it('tokens com separador "; "', () => {
    const r: Extract<RteAttrRule, { kind: 'tokens' }> = {
      kind: 'tokens',
      values: ['encrypted-media', 'fullscreen'],
      separator: '; ',
      maxLength: 100,
    };
    expect(serializeTokens(r, 'fullscreen;encrypted-media')).toBe(
      'encrypted-media; fullscreen',
    );
    expect(normalizeAttribute(r, 'encrypted-media; fullscreen')).toBe(
      'encrypted-media; fullscreen',
    );
  });

  it('matchesRule', () => {
    expect(matchesRule({ kind: 'enum', values: ['a'] }, 'A')).toBe(true);
    expect(matchesRule({ kind: 'enum', values: ['a'] }, 'b')).toBe(false);
  });

  it('propriedade: idempotência', () => {
    const rules: RteAttrRule[] = [
      { kind: 'enum', values: ['left', 'Center'] },
      { kind: 'int', min: 0, max: 5000 },
      {
        kind: 'tokens',
        values: ['nofollow', 'noopener'],
        separator: ' ',
        maxLength: 50,
      },
      {
        kind: 'url',
        schemes: ['https', 'mailto', 'tel'],
        relative: true,
        fragment: true,
        maxLength: 200,
      },
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...rules),
        fc.oneof(fc.string(), fc.webUrl()),
        (r, v) => {
          const once = normalizeAttribute(r, v);
          if (once === null) return;
          expect(normalizeAttribute(r, once)).toBe(once);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
