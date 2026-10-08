import { describe, expect, it } from 'vitest';
import { resolveOption } from './precedencia.example';

describe('resolveOption (precedência da configuração)', () => {
  it('a entrada vence o provider da rota, a raiz e o padrão', () => {
    expect(resolveOption('full', 'minimal', 'article', 'article')).toBe('full');
  });

  it('sem entrada, vence o provider da rota', () => {
    expect(resolveOption(undefined, 'minimal', 'full', 'article')).toBe(
      'minimal',
    );
  });

  it('sem entrada nem rota, vence a raiz', () => {
    expect(resolveOption(undefined, undefined, 'full', 'article')).toBe('full');
  });

  it('sem nada definido, vale o padrão', () => {
    expect(resolveOption(undefined, undefined, undefined, 'article')).toBe(
      'article',
    );
  });

  it('um valor falso definido ainda vence (false desliga a barra)', () => {
    expect(resolveOption(false, 'minimal', 'full', 'article')).toBe(false);
  });
});
