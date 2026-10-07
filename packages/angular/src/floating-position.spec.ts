// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clipAncestors,
  intersectRect,
  readFloatingAnchor,
  readVisibleArea,
  unionRect,
} from './floating/anchor';
import type { RteFloatingContext } from './floating/visibility';
import {
  createTestEditor,
  destroyTestEditors,
} from './testing-support/editors';
import { fakeCoords, installGeometry } from './testing-support/geometry';
import {
  positionFloating,
  RTE_FLOATING_GAP,
  type RteRect,
} from './toolbar/position';

const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const SEED = process.env['FC_SEED'];

const viewport = { width: 1000, height: 800 };
const area: RteRect = { top: 0, right: 1000, bottom: 800, left: 0 };
const menu = { width: 200, height: 40 };
const rect = (
  top: number,
  bottom: number,
  left = 450,
  right = 550,
): RteRect => ({ top, bottom, left, right });
const place = (
  anchor: RteRect,
  extra: Partial<Parameters<typeof positionFloating>[0]> = {},
) =>
  positionFloating({
    anchor,
    visible: area,
    menu,
    viewport,
    prefer: 'above',
    ...extra,
  });

afterEach(() => destroyTestEditors());

describe('positionFloating (M9)', () => {
  it('gap de 8', () => {
    expect(RTE_FLOATING_GAP).toBe(8);
  });
  it('acima, centrado', () => {
    expect(place(rect(400, 420))).toEqual({
      left: 400,
      top: 352,
      placement: 'above',
    });
  });
  it('sem espaço acima, vira para baixo', () => {
    expect(place(rect(30, 50))).toEqual({
      left: 400,
      top: 58,
      placement: 'below',
    });
  });
  it('âncora mais alta que a área: overlay', () => {
    expect(place(rect(10, 790))).toEqual({
      left: 400,
      top: 18,
      placement: 'overlay',
    });
  });
  it('encostada à esquerda e à direita', () => {
    expect(place(rect(400, 420, 0, 20)).left).toBe(8);
    expect(place(rect(400, 420, 980, 1000)).left).toBe(792);
  });
  it('menu mais largo que a viewport: prevalece 8', () => {
    const wide = { width: 1200, height: 40 };
    expect(place(rect(400, 420), { menu: wide }).left).toBe(8);
  });
  it('área visível menor: acima sairia da área', () => {
    const r = place(rect(320, 340), {
      visible: { top: 300, right: 1000, bottom: 500, left: 0 },
    });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(348);
  });
  it('prefer below com espaço dos dois lados', () => {
    expect(place(rect(400, 420), { prefer: 'below' })).toEqual({
      left: 400,
      top: 428,
      placement: 'below',
    });
  });
  it('visible.bottom bloqueia abaixo (a viewport não): overlay', () => {
    const r = place(rect(20, 40), {
      visible: { top: 0, right: 1000, bottom: 80, left: 0 },
    });
    expect(r).toEqual({ left: 400, top: 28, placement: 'overlay' });
  });
  it('overlay com âncora acima da área visível: visible.top + 8', () => {
    const r = place(rect(10, 790), {
      visible: { top: 100, right: 1000, bottom: 700, left: 0 },
    });
    expect(r).toEqual({ left: 400, top: 108, placement: 'overlay' });
  });
  it('encaixe exato é aceito (acima e abaixo)', () => {
    // acima: 88 - 8 - 40 = 40 = visible.top
    const above = place(rect(88, 100), {
      visible: { top: 40, right: 1000, bottom: 800, left: 0 },
    });
    expect(above).toEqual({ left: 400, top: 40, placement: 'above' });
    // abaixo: 100 + 8 + 40 = 148 = visible.bottom
    const below = place(rect(80, 100), {
      prefer: 'below',
      visible: { top: 0, right: 1000, bottom: 148, left: 0 },
    });
    expect(below).toEqual({ left: 400, top: 108, placement: 'below' });
    // margem da viewport: 8 + 8 + 40 = 56 acima; abaixo termina em 792
    expect(place(rect(56, 70)).placement).toBe('above');
    expect(place(rect(720, 744), { prefer: 'below' })).toMatchObject({
      top: 752,
      placement: 'below',
    });
  });
  it('prefer below sem espaço abaixo cai para acima', () => {
    expect(place(rect(760, 780), { prefer: 'below' }).placement).toBe('above');
  });

  it('propriedade: limites, não cobre a âncora, respeita a preferência', () => {
    const unit = fc.double({ min: 0, max: 1, noNaN: true });
    const pair = fc.tuple(unit, unit);
    const arb = fc.record({
      vw: fc.integer({ min: 100, max: 2000 }),
      vh: fc.integer({ min: 100, max: 2000 }),
      prefer: fc.constantFrom('above' as const, 'below' as const),
      vx: pair,
      vy: pair,
      ax: pair,
      ay: pair,
      mw: unit,
      mh: unit,
    });
    const span = (max: number, [a, b]: readonly [number, number]) => {
      const p = Math.round(a * max);
      const q = Math.round(b * max);
      return [Math.min(p, q), Math.max(p, q)] as const;
    };
    fc.assert(
      fc.property(arb, (g) => {
        const [vl, vr] = span(g.vw, g.vx);
        const [vt, vb] = span(g.vh, g.vy);
        const [al, ar] = span(g.vw, g.ax);
        const [at, ab] = span(g.vh, g.ay);
        const vis: RteRect = { left: vl, right: vr, top: vt, bottom: vb };
        const anchor: RteRect = { left: al, right: ar, top: at, bottom: ab };
        const m = {
          width: Math.floor(g.mw * (g.vw - 16)),
          height: Math.floor(g.mh * (g.vh - 16)),
        };
        const r = positionFloating({
          anchor,
          visible: vis,
          menu: m,
          viewport: { width: g.vw, height: g.vh },
          prefer: g.prefer,
        });
        expect(r.left).toBeGreaterThanOrEqual(8);
        expect(r.left).toBeLessThanOrEqual(g.vw - 8 - m.width);
        if (r.placement !== 'overlay') {
          expect(r.top).toBeGreaterThanOrEqual(8);
          expect(r.top + m.height).toBeLessThanOrEqual(g.vh - 8);
          const overlaps = r.top < anchor.bottom && r.top + m.height > at;
          expect(overlaps).toBe(false);
          // dentro da área visível (quando a âncora a intersecta)
          if (at < vis.bottom && ab > vis.top) {
            expect(r.top).toBeGreaterThanOrEqual(vis.top);
            expect(r.top + m.height).toBeLessThanOrEqual(vis.bottom);
          }
        }
        const preferredFits =
          g.prefer === 'above'
            ? at - 8 - m.height >= Math.max(8, vis.top)
            : ab + 8 + m.height <= Math.min(g.vh - 8, vis.bottom);
        if (preferredFits) expect(r.placement).toBe(g.prefer);
      }),
      { numRuns: RUNS, ...(SEED ? { seed: Number(SEED) } : {}) },
    );
  });
});

describe('unionRect / intersectRect', () => {
  it('união por mín/máx', () => {
    expect(
      unionRect(
        { top: 100, bottom: 120, left: 300, right: 301 },
        { top: 60, bottom: 80, left: 50, right: 51 },
      ),
    ).toEqual({ top: 60, bottom: 120, left: 50, right: 301 });
  });
  it('interseção vazia é null', () => {
    expect(intersectRect(rect(0, 10), rect(20, 30))).toBeNull();
    expect(intersectRect(rect(0, 20), rect(10, 30))).toEqual(rect(10, 20));
  });
});

describe('área visível', () => {
  it('ancestral com overflow corta; visible é ignorado', () => {
    document.body.innerHTML =
      '<div id="a" style="overflow-x:auto;overflow-y:auto"><div id="b"><div id="e"></div></div></div>';
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    const e = document.getElementById('e') as HTMLElement;
    expect(clipAncestors(e)).toContain(a);
    expect(clipAncestors(e)).not.toContain(b);
    const restore = installGeometry({
      viewport,
      rects: new Map([
        [a, rect(100, 300, 0, 1000)],
        [e, rect(50, 900, 0, 1000)],
      ]),
    });
    try {
      expect(readVisibleArea(e, [a], viewport)).toEqual({
        top: 100,
        bottom: 300,
        left: 0,
        right: 1000,
      });
      expect(readVisibleArea(e, [], viewport)).toEqual({
        top: 50,
        bottom: 800,
        left: 0,
        right: 1000,
      });
    } finally {
      restore();
      document.body.innerHTML = '';
    }
  });
  it.each([
    // [overflow de <html>, overflow de <body>, html entra?, body entra?]
    // (longhands: o jsdom não expande o atalho `overflow`)
    ['overflow-y:scroll', '', false, false],
    ['', 'overflow-x:hidden', false, false],
    ['overflow-x:hidden;overflow-y:hidden', 'overflow-y:auto', false, true],
  ] as const)(
    'html/body propagados à viewport ficam fora (I2): html "%s", body "%s"',
    (htmlStyle, bodyStyle, withHtml, withBody) => {
      const root = document.documentElement;
      const body = document.body;
      root.setAttribute('style', htmlStyle);
      body.setAttribute('style', bodyStyle);
      body.innerHTML =
        '<div id="a" style="overflow-x:auto;overflow-y:auto"><div id="e"></div></div>';
      try {
        const a = document.getElementById('a') as HTMLElement;
        const found = clipAncestors(
          document.getElementById('e') as HTMLElement,
        );
        expect(found).toContain(a);
        expect(found.includes(root)).toBe(withHtml);
        expect(found.includes(body)).toBe(withBody);
      } finally {
        root.removeAttribute('style');
        body.removeAttribute('style');
        body.innerHTML = '';
      }
    },
  );
  it('sem interseção: null', () => {
    const e = document.createElement('div');
    const restore = installGeometry({
      viewport,
      rects: () => rect(900, 950),
    });
    try {
      expect(readVisibleArea(e, [], viewport)).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('readFloatingAnchor (M7)', () => {
  const ctx = (
    kind: RteFloatingContext['kind'],
    from: number,
    to: number,
  ): RteFloatingContext => ({ kind, identity: { kind, from, to } });
  const at = (pos: number): RteRect => ({
    top: pos * 10,
    bottom: pos * 10 + 20,
    left: pos * 5,
    right: pos * 5 + 1,
  });

  it('texto em duas linhas: a união cobre o fim à esquerda do início', () => {
    const editor = createTestEditor('<p>abcdefghijkl</p>');
    const restore = fakeCoords(editor, (pos) =>
      pos === 9
        ? { top: 130, bottom: 150, left: 50, right: 51 }
        : { top: 100, bottom: 120, left: 300, right: 301 },
    );
    try {
      const { doc } = editor.state;
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(doc, 9, 2)),
      );
      expect(readFloatingAnchor(editor, ctx('text', 9, 2))).toEqual({
        top: 100,
        bottom: 150,
        left: 50,
        right: 301,
      });
    } finally {
      restore();
    }
  });

  it('link usa o intervalo da identidade', () => {
    const editor = createTestEditor('<p>abcdefghijkl</p>');
    const restore = fakeCoords(editor, at);
    try {
      expect(readFloatingAnchor(editor, ctx('link', 3, 5))).toEqual({
        top: 30,
        bottom: 70,
        left: 15,
        right: 26,
      });
    } finally {
      restore();
    }
  });

  it('tabela: o retângulo do nodeDOM', () => {
    const editor = createTestEditor(
      '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>',
    );
    const dom = editor.view.nodeDOM(0) as Element;
    expect(dom.nodeType).toBe(1);
    const r = rect(10, 90, 20, 120);
    const restore = installGeometry({
      viewport,
      rects: (el) => (el === dom ? r : null),
    });
    try {
      expect(readFloatingAnchor(editor, ctx('table', 0, 0))).toEqual(r);
    } finally {
      restore();
    }
  });

  it('imagem: o figure (próprio ou ancestral) e nodeDOM nulo', () => {
    const editor = createTestEditor('<p>a</p>');
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    figure.append(img);
    const r = rect(5, 55, 5, 105);
    const restore = installGeometry({
      viewport,
      rects: (el) => (el === figure ? r : null),
    });
    const real = editor.view.nodeDOM.bind(editor.view);
    try {
      editor.view.nodeDOM = () => img;
      expect(readFloatingAnchor(editor, ctx('image', 0, 0))).toEqual(r);
      editor.view.nodeDOM = () => figure;
      expect(readFloatingAnchor(editor, ctx('image', 0, 0))).toEqual(r);
      editor.view.nodeDOM = () => null;
      expect(readFloatingAnchor(editor, ctx('image', 0, 0))).toBeNull();
      expect(readFloatingAnchor(editor, ctx('table', 0, 0))).toBeNull();
    } finally {
      editor.view.nodeDOM = real;
      restore();
    }
  });

  it.each([
    [
      'video',
      '<figure class="rt-figure rt-figure--video"><video src="https://x.com/v.mp4" controls=""></video></figure>',
      'video',
    ],
    [
      'embed',
      '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="560" height="315"></iframe></figure>',
      'iframe',
    ],
  ] as const)(
    '%s: o retângulo do <figure> do nó (V10)',
    (kind, html, inner) => {
      const editor = createTestEditor(`<p>a</p>${html}`);
      const pos = editor.state.doc.child(0).nodeSize;
      const figure = editor.view.dom.querySelector('figure');
      const child = figure?.querySelector(inner);
      expect(figure).not.toBeNull();
      expect(child).not.toBeNull();
      const r = rect(7, 77, 3, 303);
      const restore = installGeometry({
        viewport,
        rects: (el) => (el === figure ? r : null),
      });
      const real = editor.view.nodeDOM.bind(editor.view);
      try {
        expect(readFloatingAnchor(editor, ctx(kind, pos, pos + 1))).toEqual(r);
        // nodeDOM num descendente (vista de nó própria) sobe ao figure
        editor.view.nodeDOM = () => child ?? null;
        expect(readFloatingAnchor(editor, ctx(kind, pos, pos + 1))).toEqual(r);
      } finally {
        editor.view.nodeDOM = real;
        restore();
      }
    },
  );
});
