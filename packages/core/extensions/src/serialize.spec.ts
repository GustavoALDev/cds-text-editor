import { Node, getSchema } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Heading from '@tiptap/extension-heading';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { RTE_CONTENT_LABELS } from './labels';
import { getRenderDocument, withRenderDocument } from './render-document';
import { getRteHeadings, serializeRteHtml } from './serialize';

type Captured = { doc: Document | undefined; inner: Document | undefined };
const captured: Captured = { doc: undefined, inner: undefined };

function resetCaptured(): void {
  captured.doc = undefined;
  captured.inner = undefined;
}

/** Nó de teste atômico que devolve uma estrutura fixa. */
function leaf(name: string, render: () => DOMOutputSpec) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    renderHTML: render,
  });
}

/** Nó de teste com conteúdo `inline*`. */
function block(name: string, render: () => DOMOutputSpec) {
  return Node.create({
    name,
    group: 'block',
    content: 'inline*',
    renderHTML: render,
  });
}

const TitledDiv = Node.create({
  name: 'titledDiv',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return { title: { default: null, renderHTML: () => ({}) } };
  },
  renderHTML: ({ node }) => ['div', { title: node.attrs['title'] }, 0],
});

const innerSchema = getSchema([Document, Paragraph, Text]);
const innerDoc = innerSchema.nodeFromJSON({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
});

const schema = getSchema([
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [2, 3, 4] }),
  HardBreak,
  HorizontalRule,
  Bold,
  TitledDiv,
  leaf('testImg', () => ['img', { src: 'a', alt: '' }]),
  block('orderedP', () => [
    'p',
    { 'data-b': '1', style: 'text-align: center', 'data-a': '2' },
    0,
  ]),
  block('styledH2', () => [
    'h2',
    { style: 'text-align: center', id: 'evil' },
    0,
  ]),
  leaf('calloutWarning', () => [
    'aside',
    { class: 'rt-callout rt-callout--warning' },
    ['p', { class: 'rt-callout__title' }],
  ]),
  leaf('calloutUnknown', () => [
    'aside',
    { class: 'rt-callout rt-callout--bogus' },
    ['p', { class: 'rt-callout__title' }],
  ]),
  leaf('calloutFilled', () => [
    'aside',
    { class: 'rt-callout rt-callout--danger' },
    ['p', { class: 'rt-callout__title' }, 'Meu título'],
  ]),
  leaf('readAlso', () => [
    'aside',
    { class: 'rt-read-also' },
    ['p', { class: 'rt-read-also__title' }],
  ]),
  leaf('captureDoc', () => {
    captured.doc = getRenderDocument();
    return ['div'];
  }),
  leaf('nested', () => {
    const html = serializeRteHtml(innerDoc);
    captured.inner = getRenderDocument();
    return ['div', { 'data-inner': html }];
  }),
  leaf('throwing', () => {
    throw new Error('falha de renderização');
  }),
  leaf(
    'foreign',
    () => ({ nodeType: 1, outerHTML: '<b>x</b>' }) as unknown as DOMOutputSpec,
  ),
  leaf('foreignNoHtml', () => ({ nodeType: 1 }) as unknown as DOMOutputSpec),
]);

type Json = Record<string, unknown>;
const text = (t: string, marks?: Json[]): Json =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t };
const para = (...content: Json[]): Json => ({ type: 'paragraph', content });
const heading = (level: number, t: string): Json => ({
  type: 'heading',
  attrs: { level },
  content: t ? [text(t)] : [],
});
const docOf = (...content: Json[]) =>
  schema.nodeFromJSON({ type: 'doc', content });

describe('serializeRteHtml: escrita', () => {
  it('escapa texto (&, <, >, U+00A0) sem escapar aspas', () => {
    expect(serializeRteHtml(docOf(para(text('a & < > " \u00a0'))))).toBe(
      '<p>a &amp; &lt; &gt; " &nbsp;</p>',
    );
  });

  it('escapa atributos (&, ", <, >, U+00A0)', () => {
    const doc = docOf({
      type: 'titledDiv',
      attrs: { title: 'a&"<>\u00a0' },
    });
    expect(serializeRteHtml(doc)).toBe(
      '<div title="a&amp;&quot;&lt;&gt;&nbsp;"></div>',
    );
  });

  it('elementos vazios sem fechamento e sem barra', () => {
    const doc = docOf(
      { type: 'horizontalRule' },
      para(text('a'), { type: 'hardBreak' }, text('b')),
      { type: 'testImg' },
    );
    expect(serializeRteHtml(doc)).toBe('<hr><p>a<br>b</p><img src="a" alt="">');
  });

  it('marcas viram elementos', () => {
    expect(serializeRteHtml(docOf(para(text('x', [{ type: 'bold' }]))))).toBe(
      '<p><strong>x</strong></p>',
    );
  });

  it('atributos na ordem em que a renderização os definiu (style inclusive)', () => {
    const doc = docOf({ type: 'orderedP', content: [text('x')] });
    expect(serializeRteHtml(doc)).toBe(
      '<p data-b="1" style="text-align: center" data-a="2">x</p>',
    );
  });

  it('documento vazio vira um parágrafo vazio', () => {
    const empty = schema.topNodeType.createAndFill();
    if (!empty) throw new Error('createAndFill falhou');
    expect(serializeRteHtml(empty)).toBe('<p></p>');
  });

  it('elemento de DOM real é escrito pelo outerHTML', () => {
    expect(serializeRteHtml(docOf({ type: 'foreign' }))).toBe('<b>x</b>');
  });

  it('elemento de DOM real sem outerHTML lança TypeError', () => {
    expect(() => serializeRteHtml(docOf({ type: 'foreignNoHtml' }))).toThrow(
      TypeError,
    );
  });
});

describe('serializeRteHtml: ids de título', () => {
  const doc = docOf(
    heading(2, 'Intro'),
    heading(3, 'Intro'),
    heading(4, ''),
    heading(2, '!!!'),
  );

  it('ids únicos em ordem de documento, com fallback', () => {
    expect(serializeRteHtml(doc)).toBe(
      '<h2 id="rt-intro">Intro</h2><h3 id="rt-intro-2">Intro</h3>' +
        '<h4 id="rt-section"></h4><h2 id="rt-section-2">!!!</h2>',
    );
  });

  it('id é o primeiro atributo e substitui o id da renderização', () => {
    const d = docOf({ type: 'styledH2', content: [text('Intro')] });
    expect(serializeRteHtml(d)).toBe(
      '<h2 id="rt-intro" style="text-align: center">Intro</h2>',
    );
  });

  it('idPrefix muda o prefixo; prefixo inválido lança RangeError', () => {
    expect(
      serializeRteHtml(docOf(heading(2, 'Intro')), { idPrefix: 'doc-' }),
    ).toBe('<h2 id="doc-intro">Intro</h2>');
    expect(() =>
      serializeRteHtml(docOf(heading(2, 'Intro')), { idPrefix: 'X' }),
    ).toThrow(RangeError);
  });

  it('título longo gera id ≤ 80 que casa a regra do esquema', () => {
    const long = 'a'.repeat(100);
    const html = serializeRteHtml(docOf(heading(2, long), heading(2, long)));
    const ids = [...html.matchAll(/id="([^"]*)"/g)].map((m) => m[1] ?? '');
    const rule = getHtmlSchema().elements['h2']?.attributes['id']?.rule;
    if (rule?.kind !== 'pattern') throw new Error('regra inesperada');
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(80);
      expect(new RegExp(rule.pattern).test(id)).toBe(true);
    }
  });

  it('getRteHeadings devolve os mesmos ids, níveis e posições', () => {
    const headings = getRteHeadings(doc);
    const positions: number[] = [];
    doc.forEach((_node, offset) => positions.push(offset));
    expect(headings).toEqual([
      { pos: positions[0], level: 2, text: 'Intro', id: 'rt-intro' },
      { pos: positions[1], level: 3, text: 'Intro', id: 'rt-intro-2' },
      { pos: positions[2], level: 4, text: '', id: 'rt-section' },
      { pos: positions[3], level: 2, text: '!!!', id: 'rt-section-2' },
    ]);
    expect(getRteHeadings(doc, { idPrefix: 'doc-' })[0]?.id).toBe('doc-intro');
  });

  it('getRteHeadings limita o nível a 2–4', () => {
    const s = getSchema([Document, Paragraph, Text, Heading]);
    const d = s.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [text('A')] },
        { type: 'heading', attrs: { level: 6 }, content: [text('B')] },
      ],
    });
    expect(getRteHeadings(d).map((h) => h.level)).toEqual([2, 4]);
  });
});

describe('serializeRteHtml: títulos de caixa', () => {
  it('título de caixa vazio recebe o rótulo da variante (en por padrão)', () => {
    expect(serializeRteHtml(docOf({ type: 'calloutWarning' }))).toBe(
      '<aside class="rt-callout rt-callout--warning">' +
        '<p class="rt-callout__title">Warning</p></aside>',
    );
  });

  it('rótulos por função', () => {
    const html = serializeRteHtml(docOf({ type: 'calloutWarning' }), {
      labels: () => RTE_CONTENT_LABELS['pt-BR'],
    });
    expect(html).toContain('<p class="rt-callout__title">Atenção</p>');
  });

  it('variante desconhecida usa info; título preenchido fica como está', () => {
    expect(serializeRteHtml(docOf({ type: 'calloutUnknown' }))).toContain(
      '>Information</p>',
    );
    expect(serializeRteHtml(docOf({ type: 'calloutFilled' }))).toContain(
      '>Meu título</p>',
    );
  });

  it('título de "Leia também" vazio recebe readAlsoTitle', () => {
    expect(serializeRteHtml(docOf({ type: 'readAlso' }))).toBe(
      '<aside class="rt-read-also">' +
        '<p class="rt-read-also__title">Read also</p></aside>',
    );
  });
});

describe('serializeRteHtml: documento de renderização', () => {
  it('é o de strings durante a chamada e o global depois', () => {
    resetCaptured();
    serializeRteHtml(docOf({ type: 'captureDoc' }));
    const doc = captured.doc;
    expect(doc).toBeDefined();
    expect(doc).not.toBe(globalThis.document);
    expect(doc?.createElement('div').nodeType).toBe(1);
    expect(getRenderDocument()).toBe(globalThis.document);
    expect(getRenderDocument()).toBeUndefined();
  });

  it('renderização que lança: relança e restaura a pilha', () => {
    const outer = { marker: 'outer' } as unknown as Document;
    withRenderDocument(outer, () => {
      expect(() => serializeRteHtml(docOf({ type: 'throwing' }))).toThrow(
        'falha de renderização',
      );
      expect(getRenderDocument()).toBe(outer);
    });
    expect(getRenderDocument()).toBe(globalThis.document);
  });

  it('withRenderDocument devolve o valor e desempilha', () => {
    const d = {} as Document;
    expect(withRenderDocument(d, () => getRenderDocument())).toBe(d);
    expect(getRenderDocument()).toBeUndefined();
  });

  it('serializeRteHtml dentro de outro renderHTML funciona', () => {
    resetCaptured();
    const html = serializeRteHtml(
      docOf({ type: 'nested' }, { type: 'captureDoc' }),
    );
    expect(html).toBe(
      '<div data-inner="&lt;p&gt;x&lt;/p&gt;"></div><div></div>',
    );
    // depois da chamada interna, o documento do topo volta a ser o da externa
    expect(captured.inner).toBeDefined();
    expect(captured.inner).toBe(captured.doc);
  });
});
