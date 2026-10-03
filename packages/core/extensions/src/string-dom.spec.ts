import { describe, expect, it } from 'vitest';
import { createStringDocument, writeHtml } from './string-dom';

describe('createStringDocument', () => {
  it('setAttribute repetido mantém a posição; style.cssText grava literal', () => {
    const doc = createStringDocument();
    const el = doc.createElement('DIV');
    el.setAttribute('a', '1');
    el.style.cssText = 'color: red';
    el.setAttribute('b', '2');
    el.setAttribute('a', '3');
    expect(el.getAttribute('a')).toBe('3');
    expect(el.getAttribute('style')).toBe('color: red');
    expect(el.getAttribute('zz')).toBeNull();
    expect(writeHtml(el)).toBe('<div a="3" style="color: red" b="2"></div>');
  });

  it('fragmento: appendChild move os filhos; insertBefore respeita a referência', () => {
    const doc = createStringDocument();
    const frag = doc.createDocumentFragment();
    frag.appendChild(doc.createTextNode('b'));
    const p = doc.createElement('p');
    const tail = doc.createTextNode('c');
    p.appendChild(tail);
    p.insertBefore(frag, tail);
    p.insertBefore(doc.createTextNode('a'), p.childNodes[0] ?? null);
    p.insertBefore(doc.createTextNode('d'), null);
    expect(frag.childNodes).toHaveLength(0);
    expect(p.textContent).toBe('abcd');
    expect(writeHtml(p)).toBe('<p>abcd</p>');
  });

  it('mover um nó o tira do pai anterior', () => {
    const doc = createStringDocument();
    const a = doc.createElement('a');
    const b = doc.createElement('b');
    const t = doc.createTextNode('x');
    a.appendChild(t);
    b.appendChild(t);
    expect(writeHtml(a)).toBe('<a></a>');
    expect(writeHtml(b)).toBe('<b>x</b>');
  });

  it('textContent como setter troca os filhos', () => {
    const doc = createStringDocument();
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    p.textContent = '<x>';
    expect(writeHtml(p)).toBe('<p>&lt;x&gt;</p>');
  });

  it('elementos de outro namespace sempre fecham; atributos com namespace', () => {
    const doc = createStringDocument();
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#a');
    svg.appendChild(use);
    expect(writeHtml(svg)).toBe('<svg><use xlink:href="#a"></use></svg>');
  });

  it('nomes inválidos de elemento ou atributo lançam', () => {
    const doc = createStringDocument();
    expect(() => doc.createElement('a b')).toThrow();
    expect(() => doc.createElement('')).toThrow();
    const el = doc.createElement('p');
    expect(() => el.setAttribute('x"><script', '1')).toThrow();
    expect(() => el.setAttribute('a b', '1')).toThrow();
    expect(() => el.setAttribute('', '1')).toThrow();
  });

  it('elemento vazio ignora filhos na escrita', () => {
    const doc = createStringDocument();
    const br = doc.createElement('br');
    br.appendChild(doc.createTextNode('x'));
    expect(writeHtml(br)).toBe('<br>');
  });
});
