import { describe, expect, it } from 'vitest';
import { resumo } from './exemplo-minimo';

describe('exemplo-minimo', () => {
  it('resume o HTML em texto', () => {
    expect(resumo('<p>Olá, <b>mundo</b>!</p>')).toBe('Olá, mundo!');
  });
});
