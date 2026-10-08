import { describe, expect, it } from 'vitest';
import {
  prepararParaGravar,
  sanitizeSemAsOpcoes,
} from './sanitizar-na-gravacao';

describe('sanitizar na gravação', () => {
  it('remove script e atributos on*', () => {
    const saida = prepararParaGravar(
      '<p onclick="x()">oi<script>alert(1)</script></p>',
    );
    expect(saida).toBe('<p>oi</p>');
  });

  it('mantém as classes rt- do esquema', () => {
    const html =
      '<aside class="rt-callout rt-callout--info" role="note"><p>a</p></aside>';
    expect(prepararParaGravar(html)).toContain('rt-callout--info');
  });

  it('descarta classes que não são do esquema', () => {
    expect(prepararParaGravar('<p class="evil">a</p>')).toBe('<p>a</p>');
  });

  it('remove o link javascript: e fica o texto', () => {
    expect(
      prepararParaGravar('<p><a href="javascript:alert(1)">x</a></p>'),
    ).toBe('<p>x</p>');
  });

  it('é idempotente', () => {
    const uma = prepararParaGravar('<p>a <b>b</b> <script>1</script></p>');
    expect(prepararParaGravar(uma)).toBe(uma);
  });

  it('recusa corpo que não é texto', () => {
    expect(() => prepararParaGravar({ html: '<p>a</p>' })).toThrow(TypeError);
  });

  it('opções diferentes das do editor mudam o resultado (por isso a regra)', () => {
    const imagem = '<p><img src="https://outro.example/a.png" alt="a"></p>';
    expect(prepararParaGravar(imagem)).not.toContain('<img');
    expect(sanitizeSemAsOpcoes(imagem)).toContain('<img');
  });
});
