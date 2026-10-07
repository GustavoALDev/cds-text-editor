// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from '../../../src/schema/get-html-schema';
import { normalizeForCompare } from './compare';

const S = getHtmlSchema();
const norm = (html: string) => normalizeForCompare(html, S, document);

describe('testing/compare: normalizeForCompare', () => {
  it('retira o id dos títulos', () => {
    expect(norm('<h2 id="rt-a">A</h2>')).toBe('<h2>A</h2>');
  });

  it('canonicaliza a forma do style', () => {
    expect(norm('<p style="text-align:center;">x</p>')).toBe(
      '<p style="text-align: center">x</p>',
    );
  });

  // Chromium e WebKit reescrevem o `style` ao adotar o elemento em outro
  // documento (`getHTML()` do Tiptap): o atributo vai para o fim, com `;`.
  it('a posição do style entre os atributos não importa', () => {
    expect(
      norm(
        '<iframe src="https://a/" width="1" loading="lazy" style="aspect-ratio: 16 / 9;"></iframe>',
      ),
    ).toBe(
      norm(
        '<iframe src="https://a/" width="1" style="aspect-ratio: 16 / 9" loading="lazy"></iframe>',
      ),
    );
  });
});
