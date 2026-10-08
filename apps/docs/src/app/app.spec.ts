import { describe, expect, it } from 'vitest';
import { internalUrl } from './content/doc-html';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

describe('esqueleto do site', () => {
  it('internalUrl resolve links relativos à base, com âncora', () => {
    const base = 'http://x.test/cds-text-editor/guia/inicio-rapido';
    const root = 'http://x.test/cds-text-editor/';
    expect(internalUrl('guia/configuracao#providers', root)).toBe(
      '/guia/configuracao#providers',
    );
    expect(internalUrl('#secao', root)).toBe('/#secao');
    expect(internalUrl('api/rte-core?x=1', root)).toBe('/api/rte-core?x=1');
    expect(base.startsWith(root)).toBe(true);
  });

  it('internalUrl recusa links de fora do site ou da base', () => {
    const root = 'http://x.test/cds-text-editor/';
    expect(internalUrl('https://outro.test/a', root)).toBeNull();
    expect(internalUrl('/demo/', root)).toBeNull();
    expect(internalUrl('mailto:a@b.c', root)).toBeNull();
  });

  it('a base sem prefixo também funciona', () => {
    expect(internalUrl('guia/x#y', 'http://x.test/')).toBe('/guia/x#y');
  });

  it('as rotas existem e toda rota do servidor é pré-renderizada', () => {
    expect(routes.map((r) => r.path)).toEqual([
      '',
      'guia/:slug',
      'api/:entry',
      '404',
      '**',
    ]);
    expect(serverRoutes.map((r) => r.path)).toEqual([
      'guia/:slug',
      'api/:entry',
      '404',
      '**',
    ]);
  });
});
