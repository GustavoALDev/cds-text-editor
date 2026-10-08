// @vitest-environment node
import { escapeHtmlAttribute } from '@cds/rte-core';
import { createSanitizer } from '@cds/rte-sanitizer';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  RTE_TABLE_SCROLL_CLASS,
  RTE_TABLE_SIZED_CLASS,
  prepareRteHtml,
} from './prepare-html';
import { readFixture } from './testing-support/fixtures';
import {
  isScroller,
  parseTree,
  unwrapScrollers,
  type HtmlNode,
} from './testing-support/html-tree';
import { hostileHtml } from './testing-support/sanitizer-arbitraries';

const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const FC_OPTIONS = {
  numRuns: RUNS,
  ...(process.env['FC_SEED'] ? { seed: Number(process.env['FC_SEED']) } : {}),
};

const TABLE = '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>';
const wrap = (table: string): string =>
  `<div class="rte-table-scroll">${table}</div>`;

describe('prepareRteHtml (H6): casos', () => {
  const base = { fragmentBase: '/blog/post' };

  it('exporta a classe do rolador', () => {
    expect(RTE_TABLE_SCROLL_CLASS).toBe('rte-table-scroll');
  });

  it('exporta a classe da tabela com larguras', () => {
    expect(RTE_TABLE_SIZED_CLASS).toBe('rte-table--sized');
  });

  it.each<[string, string, string]>([
    [
      'todas as colunas com largura',
      '<table><colgroup><col style="width: 480px"><col style="width: 480px"></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
      '<table class="rte-table--sized"><colgroup>',
    ],
    [
      'uma coluna com largura (colspan na 1ª linha)',
      '<table><colgroup><col style="width: 200px"><col><col></colgroup><tbody><tr><th><p>a</p></th><th colspan="2"><p>b</p></th></tr></tbody></table>',
      '<table class="rte-table--sized"><colgroup>',
    ],
    [
      'com caption antes do colgroup',
      '<table><caption>L</caption><colgroup><col style="width: 90px"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      '<table class="rte-table--sized"><caption>',
    ],
    [
      'min-width antes de width no mesmo col',
      '<table><colgroup><col style="min-width: 1px; width: 10px"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table>',
      '<table class="rte-table--sized"><colgroup>',
    ],
  ])(
    'tabela com larguras de coluna ganha a classe (H20): %s',
    (_n, input, head) => {
      const out = prepareRteHtml(input, { fragmentBase: null });
      expect(out.startsWith(`<div class="rte-table-scroll">${head}`)).toBe(
        true,
      );
      expect(out.replace(' class="rte-table--sized"', '')).toBe(wrap(input));
    },
  );

  it.each<[string, string]>([
    ['sem colgroup', TABLE],
    [
      'colgroup sem largura',
      '<table><colgroup><col><col></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    ],
    [
      'width só dentro de outra tabela (a de fora não ganha)',
      '<table><tbody><tr><td><table><colgroup><col style="width: 50px"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table></td></tr></tbody></table>',
    ],
    [
      'só min-width no col (trusted; o esquema não emite)',
      '<table><colgroup><col style="min-width: 9px"></colgroup><tbody><tr><td><p>a</p></td></tr></tbody></table>',
    ],
  ])(
    'sem largura de coluna própria, a tabela não ganha a classe: %s',
    (_n, input) => {
      const out = prepareRteHtml(input, { fragmentBase: null });
      expect(out.startsWith('<div class="rte-table-scroll"><table>')).toBe(
        true,
      );
    },
  );

  it.each<[string, string, string | null, string]>([
    ['sem tabela nem âncora: igual', '<p>x</p>', '/blog/post', '<p>x</p>'],
    ['tabela embrulhada no rolador', TABLE, '/blog/post', wrap(TABLE)],
    [
      'duas tabelas, dois roladores',
      TABLE + '<p>m</p>' + TABLE,
      '/blog/post',
      wrap(TABLE) + '<p>m</p>' + wrap(TABLE),
    ],
    [
      'tabela dentro de célula: cada uma com o seu',
      '<table><tbody><tr><td>' + TABLE + '</td></tr></tbody></table>',
      '/blog/post',
      wrap(
        '<table><tbody><tr><td>' + wrap(TABLE) + '</td></tr></tbody></table>',
      ),
    ],
    [
      'âncora de fragmento ganha o caminho do documento',
      '<p><a href="#rt-a">x</a></p>',
      '/blog/post',
      '<p><a href="/blog/post#rt-a">x</a></p>',
    ],
    [
      'base escapada (&, ", <, >)',
      '<p><a href="#rt-a">x</a></p>',
      '/a?b=1&c="<x>',
      '<p><a href="/a?b=1&amp;c=&quot;&lt;x&gt;#rt-a">x</a></p>',
    ],
    [
      // Ruling 2: a base não passa por string de troca (`$&`, `$1`).
      'base com $& e $1 fica literal',
      '<p><a href="#rt-a">x</a></p>',
      "/a$&b$1$`$'",
      '<p><a href="/a$&amp;b$1$`$\'#rt-a">x</a></p>',
    ],
    [
      'URL absoluta com fragmento intacta',
      '<p><a href="https://x.com/#a">x</a></p>',
      '/blog/post',
      '<p><a href="https://x.com/#a">x</a></p>',
    ],
    [
      'caminho com fragmento intacto',
      '<p><a href="/p#a">x</a></p>',
      '/blog/post',
      '<p><a href="/p#a">x</a></p>',
    ],
    [
      'href depois de outro atributo: reescrito',
      '<p><a target="_blank" href="#x">x</a></p>',
      '/blog/post',
      '<p><a target="_blank" href="/blog/post#x">x</a></p>',
    ],
    [
      'texto com href="#x" e <table> escapado: intacto',
      '<p>href="#x" &lt;table&gt;</p>',
      '/blog/post',
      '<p>href="#x" &lt;table&gt;</p>',
    ],
    [
      'fragmentBase null: só tabelas',
      '<p><a href="#rt-a">x</a></p>' + TABLE,
      null,
      '<p><a href="#rt-a">x</a></p>' + wrap(TABLE),
    ],
    // Review Focus 5 / Ruling 14: a varredura só reconhece a forma canônica
    // que o sanitizador escreve (minúsculas, aspas duplas). Por isso a
    // pré-condição da H6: o HTML `trusted` precisa ter saído de
    // `createSanitizer`; fora dela, estas formas ficam intactas.
    [
      '<TABLE> fora da forma canônica: intacta',
      '<TABLE></TABLE>',
      '/b',
      '<TABLE></TABLE>',
    ],
    [
      'href com aspas simples: intacto',
      "<a href='#x'>x</a>",
      '/b',
      "<a href='#x'>x</a>",
    ],
    [
      'quebra de linha antes do href é \\s: reescrito',
      '<a\nhref="#x">x</a>',
      '/b',
      '<a\nhref="/b#x">x</a>',
    ],
  ])('%s', (_name, input, fragmentBase, expected) => {
    expect(prepareRteHtml(input, { fragmentBase })).toBe(expected);
  });

  it('pré-condição: HTML fora do canônico não é suportado (< cru em atributo vira marcação)', () => {
    // Documenta o limite da H6 (revisão final, 1.2): só a saída de `createSanitizer`
    // escapa `<` em atributos; aqui a varredura casa `<table` dentro do `alt` e a
    // árvore muda (o `img` de dentro do valor vira elemento). `trusted` só para a
    // saída de `createSanitizer`.
    const input = '<img alt="<table><img src=x onerror=alert(1)>">';
    const out = prepareRteHtml(input, { fragmentBase: null });
    expect(out).not.toBe(input);
    const tags = (h: string) => parseTree(h).filter((n) => 'tag' in n).length;
    expect(tags(input)).toBe(1);
    expect(tags(out)).toBeGreaterThan(1);
  });

  it('não depende de estado entre chamadas (regex global)', () => {
    const html = '<p><a href="#a">x</a></p>' + TABLE;
    const first = prepareRteHtml(html, base);
    expect(prepareRteHtml(html, base)).toBe(first);
  });
});

/** `parseTree(h)` com o `href` de fragmento de cada `a` prefixado por `prefix`. */
function withBase(nodes: HtmlNode[], prefix: string): HtmlNode[] {
  return nodes.map((node) => {
    if (!('tag' in node)) return node;
    const attrs = node.attrs.map(([name, value]): [string, string] =>
      node.tag === 'a' && name === 'href' && value.startsWith('#')
        ? [name, prefix + value]
        : [name, value],
    );
    return { tag: node.tag, attrs, children: withBase(node.children, prefix) };
  });
}

/** Toda `table` tem pai `div.rte-table-scroll`, e todo rolador tem só ela. */
function checkScrollers(nodes: HtmlNode[], parentIsScroller = false): number {
  let scrollers = 0;
  for (const node of nodes) {
    if (!('tag' in node)) continue;
    if (node.tag === 'table') expect(parentIsScroller).toBe(true);
    const scroller = isScroller(node);
    if (scroller) {
      scrollers++;
      expect(node.children).toHaveLength(1);
      expect((node.children[0] as { tag?: string }).tag).toBe('table');
    }
    scrollers += checkScrollers(node.children, scroller);
  }
  return scrollers;
}

function countTables(nodes: HtmlNode[]): number {
  let n = 0;
  for (const node of nodes) {
    if (!('tag' in node)) continue;
    if (node.tag === 'table') n++;
    n += countTables(node.children);
  }
  return n;
}

/** `col` do `colgroup` filho direto com `style` de `width` (H20). */
function hasColWidth(table: HtmlNode): boolean {
  if (!('tag' in table)) return false;
  return table.children.some(
    (c) =>
      'tag' in c &&
      c.tag === 'colgroup' &&
      c.children.some(
        (col) =>
          'tag' in col &&
          col.tag === 'col' &&
          col.attrs.some(([n, v]) => n === 'style' && /width:/.test(v)),
      ),
  );
}

/**
 * Tira a classe `rte-table--sized` das tabelas, conferindo que ela está exatamente nas que têm
 * largura de coluna no próprio `colgroup` (H20).
 */
function unsize(nodes: HtmlNode[]): HtmlNode[] {
  return nodes.map((node) => {
    if (!('tag' in node)) return node;
    let attrs = node.attrs;
    if (node.tag === 'table') {
      const sized = attrs.some(
        ([n, v]) => n === 'class' && v === RTE_TABLE_SIZED_CLASS,
      );
      expect(sized).toBe(hasColWidth(node));
      attrs = attrs.filter(
        ([n, v]) => !(n === 'class' && v === RTE_TABLE_SIZED_CLASS),
      );
    }
    return { tag: node.tag, attrs, children: unsize(node.children) };
  });
}

/** R4 sobre `h` (saída do sanitizador) com a base `base`. */
function checkProperty(h: string, base: string | null): void {
  const before = parseTree(h);
  const prepared = parseTree(prepareRteHtml(h, { fragmentBase: base }));
  const expected =
    base === null ? before : withBase(before, escapeHtmlAttribute(base));
  expect(unsize(unwrapScrollers(prepared))).toEqual(expected);
  expect(checkScrollers(prepared)).toBe(countTables(before));
}

// Ruling 2: `$` (com `$&`, `$1`) entra no alfabeto da base.
const fragmentBase: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.constantFrom('"', '<', '>', '&', ' ', '?', '/', '$', '$&', '$1', '#'),
      fc.string({ maxLength: 4 }),
    ),
    { maxLength: 8 },
  )
  .map((parts) => '/' + parts.join(''));

describe('prepareRteHtml (R4): propriedade', () => {
  const sanitize = createSanitizer();

  it('gerador hostil: mesma árvore, fora roladores e hrefs de fragmento', () => {
    fc.assert(
      fc.property(
        hostileHtml,
        fc.option(fragmentBase, { nil: null }),
        (x, base) => checkProperty(sanitize(x), base),
      ),
      FC_OPTIONS,
    );
  }, 120_000);

  it('editor-corpus: mesma árvore, fora roladores e hrefs de fragmento', () => {
    const corpus = JSON.parse(readFixture('editor-corpus.json')) as string[];
    expect(corpus.length).toBeGreaterThan(0);
    const docs = corpus.map((doc) => sanitize(doc));
    // O corpus precisa exercitar as duas transformações.
    expect(docs.some((d) => d.includes('<table'))).toBe(true);
    expect(docs.some((d) => d.includes('href="#'))).toBe(true);
    fc.assert(
      fc.property(fc.option(fragmentBase, { nil: null }), (base) => {
        for (const h of docs) checkProperty(h, base);
      }),
      { ...FC_OPTIONS, numRuns: Math.max(1, Math.ceil(RUNS / 10)) },
    );
  }, 120_000);
});

describe('prepareRteHtml (R14): custo relativo ao sanitizador', () => {
  function bestOf3(run: () => unknown): number {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      run();
      best = Math.min(best, performance.now() - start);
    }
    return best;
  }

  it('≤ 10% do tempo do sanitizador em ~400 kB', () => {
    const fixture = readFixture('all-features.html');
    const doc = fixture.repeat(Math.ceil(400_000 / fixture.length));
    expect(doc.length).toBeGreaterThanOrEqual(400_000);
    const sanitize = createSanitizer();
    const out = sanitize(doc);
    const sanitizeMs = bestOf3(() => sanitize(doc));
    const prepareMs = bestOf3(() =>
      prepareRteHtml(out, { fragmentBase: '/p' }),
    );
    console.info(
      '[R14] node: sanitizador',
      sanitizeMs.toFixed(1),
      'ms; prepareRteHtml',
      prepareMs.toFixed(2),
      'ms',
      `(${doc.length} caracteres; razão ${(prepareMs / sanitizeMs).toFixed(3)})`,
    );
    expect(prepareMs / sanitizeMs).toBeLessThanOrEqual(0.1);
  });
});

describe('prepareRteHtml: tabelas com caption (R9 A1)', () => {
  const base = { fragmentBase: null };
  const median = (xs: number[]): number =>
    [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const time = (html: string): number => {
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      prepareRteHtml(html, base);
      runs.push(performance.now() - start);
    }
    return median(runs);
  };

  it('procura cada </caption> uma vez só, mesmo sem nenhum fechamento (prova sem relógio)', () => {
    // O custo quadrático antigo vinha de uma busca por `</caption>` por tabela, cada uma
    // varrendo até o fim do documento. O cache faz a busca atravessar cada trecho uma vez.
    const spy = vi.spyOn(String.prototype, 'indexOf');
    try {
      for (const html of [
        '<table><caption>'.repeat(5_000),
        '<table><caption>x</caption></table>'.repeat(5_000),
        '<table><caption>'.repeat(2_500) +
          '</caption>' +
          '<table><caption>'.repeat(2_500),
      ]) {
        spy.mockClear();
        prepareRteHtml(html, base);
        const searches = spy.mock.calls.filter(
          ([needle]) => needle === '</caption>',
        ).length;
        // Sem cache seriam ~5 000 buscas; com ele, no máximo uma por `</caption>` + uma final.
        expect(searches).toBeLessThanOrEqual(5_001);
      }
      spy.mockClear();
      prepareRteHtml('<table><caption>'.repeat(5_000), base);
      expect(
        spy.mock.calls.filter(([needle]) => needle === '</caption>').length,
      ).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('custo linear com milhares de tabelas com caption e sem colgroup', () => {
    // Respaldo por relógio, folgado para runners ruidosos: o quadrático dá ~4 na razão e
    // leva dezenas de segundos em 20 mil tabelas sem fechamento.
    const unit = '<table><caption>';
    const small = unit.repeat(10_000);
    const big = unit.repeat(20_000);
    prepareRteHtml(small, base); // aquece
    prepareRteHtml(big, base);
    let best = Infinity;
    for (let i = 0; i < 3 && best > 3.2; i++) {
      best = Math.min(best, time(big) / Math.max(time(small), 1));
    }
    expect(best).toBeLessThanOrEqual(3.2);
    expect(time(big)).toBeLessThan(2_000);
  });

  it('só a tabela com colgroup próprio recebe a classe, não a seguinte', () => {
    const html =
      '<table><caption>x</caption><tbody><tr><td></td></tr></tbody></table>' +
      '<table><colgroup><col style="width:10px"></colgroup><tbody><tr><td></td></tr></tbody></table>';
    const out = prepareRteHtml(html, base);
    const first = out.indexOf('<table');
    const second = out.indexOf('<table', first + 1);
    expect(out.slice(first, first + 20)).toBe('<table><caption>x</c');
    expect(out.slice(second, second + 30)).toContain(RTE_TABLE_SIZED_CLASS);
    expect(out.split(RTE_TABLE_SIZED_CLASS)).toHaveLength(2);
  });

  it('caption seguida de colgroup com largura recebe a classe', () => {
    const out = prepareRteHtml(
      '<table><caption>x</caption><colgroup><col style="width:10px"></colgroup></table>',
      base,
    );
    expect(out).toContain(`<table class="${RTE_TABLE_SIZED_CLASS}">`);
  });
});
