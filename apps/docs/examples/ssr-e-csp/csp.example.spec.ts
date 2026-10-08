import { describe, expect, it } from 'vitest';
import { CSP_RECOMENDADA, TRUSTED_TYPES } from './csp';

describe('CSP recomendada', () => {
  const diretivas = CSP_RECOMENDADA.split('; ');
  const valor = (nome: string) =>
    diretivas.find((d) => d.startsWith(`${nome} `)) ?? '';

  it('não libera script nem estilo inline', () => {
    expect(CSP_RECOMENDADA).not.toContain('unsafe-inline');
    expect(CSP_RECOMENDADA).not.toContain('unsafe-eval');
    expect(valor('script-src')).toBe("script-src 'self'");
    expect(valor('style-src')).toBe("style-src 'self'");
  });

  it('fecha object-src e base-uri', () => {
    expect(valor('object-src')).toBe("object-src 'none'");
    expect(valor('base-uri')).toBe("base-uri 'self'");
  });

  it('limita frames aos provedores de embed, sem curinga', () => {
    expect(valor('frame-src')).toContain('youtube-nocookie.com');
    expect(valor('frame-src')).not.toContain('*');
  });

  it('o complemento de Trusted Types aceita só as políticas do Angular', () => {
    expect(TRUSTED_TYPES).toContain(
      'trusted-types angular angular#unsafe-bypass',
    );
  });
});
