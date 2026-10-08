import { describe, expect, it } from 'vitest';
import { migrar } from './migrar';

const LEGADO =
  '<p><font color="red">vermelho</font> <b>forte</b></p><div>solto</div><p style="margin:0">com estilo</p>';

describe('migrar HTML legado para o esquema', () => {
  it('devolve HTML sem font, div nem style fora do esquema', () => {
    const { html } = migrar(LEGADO);
    expect(html).not.toContain('<font');
    expect(html).not.toContain('<div');
    expect(html).not.toContain('style=');
    expect(html).toContain('vermelho');
    expect(html).toContain('solto');
  });

  it('conta o que ficou de fora, por tipo', () => {
    const { descartado } = migrar(LEGADO);
    const chaves = Object.keys(descartado);
    expect(chaves.some((c) => c.includes('font'))).toBe(true);
    expect(chaves.some((c) => c.includes('div'))).toBe(true);
    expect(chaves.some((c) => c.includes('style'))).toBe(true);
  });

  it('é idempotente: migrar o resultado não descarta mais nada', () => {
    const uma = migrar(LEGADO);
    const duas = migrar(uma.html);
    expect(duas.html).toBe(uma.html);
    expect(duas.descartado).toEqual({});
  });

  it('HTML que já está no esquema não perde nada', () => {
    const { html, descartado } = migrar('<h2 id="rt-t">T</h2><p>a</p>');
    expect(descartado).toEqual({});
    expect(html).toBe('<h2 id="rt-t">T</h2><p>a</p>');
  });
});
