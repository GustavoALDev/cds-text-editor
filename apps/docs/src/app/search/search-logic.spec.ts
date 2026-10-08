import { describe, expect, it } from 'vitest';
import { normalize, search, type SearchEntry } from './search-logic';

const e = (
  page: string,
  anchor: string,
  title: string,
  text: string,
  pageTitle = title,
): SearchEntry => ({ page, pageTitle, anchor, title, text });

const index: SearchEntry[] = [
  e('guia/configuracao', '', 'Configuração', 'como configurar o editor'),
  e(
    'guia/configuracao',
    'providers',
    'Providers',
    'use providerichtext',
    'Configuração',
  ),
  e('guia/instalacao', '', 'Instalação', 'instale com npm; veja configuracao'),
  e('api/rte-core', 'extracttoc', 'extractToc', 'extrai o sumario', 'rte-core'),
  e(
    'api/rte-angular',
    'providerichtext',
    'provideRichText',
    'registra o editor',
    'rte-angular',
  ),
];

describe('search', () => {
  it('normaliza acento e caixa', () => {
    expect(normalize('Configuração À')).toBe('configuracao a');
  });

  it('acha “Configuração” digitando sem acento', () => {
    const r = search(index, 'configuracao');
    expect(r[0]).toBe(index[0]);
    expect(r).toContain(index[2]);
  });

  it('casa por prefixo (prov → provideRichText)', () => {
    const r = search(index, 'prov');
    expect(r.map((x) => x.title)).toContain('provideRichText');
    expect(r.map((x) => x.title)).toContain('Providers');
  });

  it('exige todos os termos', () => {
    expect(search(index, 'instal npm')).toEqual([index[2]]);
    expect(search(index, 'instal inexistente')).toEqual([]);
  });

  it('título pesa mais que página e corpo', () => {
    const r = search(index, 'configuracao');
    // título (10) > página (5, “Providers” em Configuração) > corpo (1, “Instalação”)
    expect(r).toEqual([index[0], index[1], index[2]]);
  });

  it('limita a 20 e devolve [] para consulta vazia ou sem resultado', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      e('p', `a${i}`, `Item ${i}`, 'texto'),
    );
    expect(search(many, 'item')).toHaveLength(20);
    expect(search(index, '   ')).toEqual([]);
    expect(search(index, 'zzzz')).toEqual([]);
  });
});
