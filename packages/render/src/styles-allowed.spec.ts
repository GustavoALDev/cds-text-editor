import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { createSanitizer } from '@cds/rte-sanitizer';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RteContent } from './content/rte-content';
import { allowedStyle, restoreContentStyles } from './content/restore-styles';
import { blankStyleAttributes, spyCssText } from './testing-support/css-text';
import { readFixture } from './testing-support/fixtures';
import { renderHost, settle } from './testing-support/render';
import { hostileHtml } from './testing-support/sanitizer-arbitraries';

const RUNS = Number(process.env['FC_RUNS'] ?? 100);
const FC_OPTIONS = {
  numRuns: RUNS,
  ...(process.env['FC_SEED'] ? { seed: Number(process.env['FC_SEED']) } : {}),
};

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

/** O HTML analisado pelo *parser* do documento (só teste). */
function parse(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

/** Cada `style` da árvore, com a *tag*, lido do atributo. */
function stylesOf(root: Element): [string, string][] {
  return [...root.querySelectorAll('[style]')].map((e) => [
    e.tagName.toLowerCase(),
    e.getAttribute('style') ?? '',
  ]);
}

type Branch = 'html' | 'attribute';

/**
 * Restaura `html` por um dos ramos da Ruling 30 e devolve os valores escritos
 * em `cssText`. No ramo `html` o atributo lê vazio (como no Gecko sob CSP),
 * então os valores só podem vir do HTML casado.
 */
function restore(html: string, branch: Branch): string[] {
  const root = parse(html);
  const styled = root.querySelectorAll('[style]').length;
  if (branch === 'html') blankStyleAttributes();
  const calls = spyCssText();
  expect(
    branch === 'html'
      ? restoreContentStyles(root, html)
      : restoreContentStyles(root),
  ).toBe(styled);
  // Uma escrita por elemento com `style`.
  expect(calls).toHaveLength(styled);
  return calls.map((c) => c.value);
}

const CASES: [string, string, string[]][] = [
  [
    'só text-align no p',
    '<p style="text-align: center; position: fixed; background-image: url(x)">a</p>',
    ['text-align: center'],
  ],
  [
    'só color no span',
    '<span data-rt-color="red" style="color: #b3261e; display: none">a</span>',
    ['color: #b3261e'],
  ],
  [
    '!important descarta',
    '<p style="text-align: center !important">a</p>',
    [''],
  ],
  [
    'comentário descarta tudo',
    '<table><colgroup><col style="width: 10px/*"></colgroup></table>',
    [''],
  ],
  [
    'barra invertida descarta tudo',
    '<p style="text-align: cen\\74 er">a</p>',
    [''],
  ],
  ['tag fora da lista (div)', '<div style="color: red">a</div>', ['']],
  ['tag fora da lista (table)', '<table style="width: 1px"></table>', ['']],
  [
    'nome sem caixa, a última vence, valor vazio ignorado',
    '<h2 style="text-align: left; TEXT-ALIGN : right ; text-align:">t</h2>',
    ['text-align: right'],
  ],
  [
    'iframe e mark',
    '<iframe style="aspect-ratio: 16 / 9; border: 9px solid red"></iframe>' +
      '<mark style="background-color: #ffe08a; color: red">m</mark>',
    ['aspect-ratio: 16 / 9', 'background-color: #ffe08a'],
  ],
];

describe('allowedStyle (Ruling 23)', () => {
  it.each(['html', 'attribute'] as const)(
    'ramo %s: só as propriedades da lista da tag',
    (branch) => {
      for (const [name, html, expected] of CASES) {
        expect(restore(html, branch), name).toEqual(expected);
        vi.restoreAllMocks();
      }
    },
  );

  it('função pura: sem declaração válida → vazio', () => {
    expect(allowedStyle('p', '')).toBe('');
    expect(allowedStyle('p', 'text-align')).toBe('');
    expect(allowedStyle('p', ';;')).toBe('');
    expect(allowedStyle('__proto__', 'color: red')).toBe('');
    expect(allowedStyle('col', 'width: 10px */')).toBe('');
    expect(allowedStyle('span', 'color: red!important')).toBe('');
  });

  it('cobre a saída do sanitizador: gerador hostil sem perda', () => {
    const sanitize = createSanitizer();
    fc.assert(
      fc.property(hostileHtml, (x) => {
        for (const [tag, style] of stylesOf(parse(sanitize(x)))) {
          expect(allowedStyle(tag, style), `${tag} ${style}`).toBe(style);
        }
      }),
      FC_OPTIONS,
    );
  }, 120_000);

  it('cobre o fixture all-features.html sem perda', () => {
    const styles = stylesOf(parse(readFixture('all-features.html')));
    expect(styles.length).toBeGreaterThan(0);
    for (const [tag, style] of styles) {
      expect(allowedStyle(tag, style), `${tag} ${style}`).toBe(style);
    }
  });
});

@Component({
  selector: 'rte-test-host',
  imports: [RteContent],
  template: `<div [rteContent]="html()" mode="trusted"></div>`,
})
class Host {
  readonly html = signal(
    '<p style="text-align: center; position: fixed">a</p>' +
      '<table style="width: 1px"><tbody><tr><td>b</td></tr></tbody></table>',
  );
}

function content(fixture: ComponentFixture<unknown>): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '.rte-content',
  ) as HTMLElement;
}

describe('RteContent trusted: estilos fora da lista retirados (Ruling 23)', () => {
  it('position some do p e o style da table é zerado; text-align fica', async () => {
    const fixture = await renderHost(Host);
    await settle(fixture);
    const p = content(fixture).querySelector('p')!;
    expect(p.style.position).toBe('');
    expect(p.style.textAlign).toBe('center');
    expect(content(fixture).querySelector('table')!.style.width).toBe('');
  });
});
