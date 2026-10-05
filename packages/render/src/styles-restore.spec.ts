import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { createSanitizer } from '@cds/rte-sanitizer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RteContent } from './content/rte-content';
import { restoreContentStyles } from './content/restore-styles';
import { provideRteRender } from './provide';
import { renderHost, settle } from './testing-support/render';
import type { RteRenderMode } from './types';

const P_STYLE = 'text-align: center';
const COL_STYLE = 'width: 200px';
const HTML =
  `<p style="${P_STYLE}">a</p>` +
  `<table><colgroup><col style="${COL_STYLE}"></colgroup>` +
  '<tbody><tr><td><p>b</p></td></tr></tbody></table>';
const NEXT =
  '<h2 style="text-align: right">t</h2><p>sem estilo</p><p style="text-align: justify">j</p>';

@Component({
  selector: 'rte-test-host',
  imports: [RteContent],
  template: `<div
    style="color: red"
    [rteContent]="html()"
    [mode]="mode()"
  ></div>`,
})
class Host {
  readonly html = signal(HTML);
  readonly mode = signal<RteRenderMode>('trusted');
}

function el(fixture: ComponentFixture<unknown>): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '.rte-content',
  ) as HTMLElement;
}

interface CssWrite {
  /** Dono da declaração, se já estava no documento na hora da escrita. */
  owner: Element | null;
  target: CSSStyleDeclaration;
  value: string;
}

/**
 * Espião no *setter* de `cssText`. O jsdom também escreve `cssText` ao
 * analisar o atributo `style` (`_attrModified`), mas isso acontece no
 * fragmento ainda desligado do `[innerHTML]`; só a reaplicação da diretiva
 * escreve em elementos já no documento — é o que `owner` separa.
 */
function spyCssText(): CssWrite[] {
  const calls: CssWrite[] = [];
  const proto = CSSStyleDeclaration.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'cssText')!;
  vi.spyOn(proto, 'cssText', 'set').mockImplementation(function (
    this: CSSStyleDeclaration,
    value: string,
  ) {
    const owner =
      [...document.querySelectorAll<HTMLElement>('*')].find(
        (e) => e.style === this,
      ) ?? null;
    calls.push({ owner, target: this, value });
    desc.set!.call(this, value);
  });
  return calls;
}

/** Escritas em elementos do conteúdo já inseridos: `[tag, valor]`. */
function contentWrites(
  fixture: ComponentFixture<unknown>,
  calls: CssWrite[],
): [string, string][] {
  const root = el(fixture);
  return calls
    .filter(
      (c) => c.owner !== null && c.owner !== root && root.contains(c.owner),
    )
    .map((c) => [c.owner!.tagName.toLowerCase(), c.value]);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('restoreContentStyles (H8)', () => {
  it('reaplica por CSSOM o style de cada descendente que o tenha', () => {
    const root = document.createElement('div');
    root.setAttribute('style', 'color: blue');
    const p = document.createElement('p');
    p.setAttribute('style', P_STYLE);
    const plain = document.createElement('p');
    root.append(p, plain);
    const calls = spyCssText();
    expect(restoreContentStyles(root)).toBe(1);
    // Só o `p` com `style`: nem o raiz (do consumidor) nem o sem atributo.
    expect(calls.map((c) => [c.target === p.style, c.value])).toEqual([
      [true, P_STYLE],
    ]);
    expect(p.style.textAlign).toBe('center');
  });

  it('sem elementos com style → 0 escritas', () => {
    const root = document.createElement('div');
    root.append(document.createElement('p'));
    const calls = spyCssText();
    expect(restoreContentStyles(root)).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe('RteContent: estilos por CSSOM depois de cada inserção (H8, R5)', () => {
  it('trusted: p e col reaplicados com os valores do atributo', async () => {
    const calls = spyCssText();
    const fixture = await renderHost(Host);
    await settle(fixture);
    expect(contentWrites(fixture, calls)).toEqual([
      ['p', P_STYLE],
      ['col', COL_STYLE],
    ]);
    // O host do consumidor não é tocado.
    expect(calls.some((c) => c.owner === el(fixture))).toBe(false);
    const p = el(fixture).querySelector('p')!;
    expect(p.style.textAlign).toBe('center');
  });

  it('trocar o HTML reaplica nos novos; nada sem atributo style', async () => {
    const fixture = await renderHost(Host);
    const calls = spyCssText();
    fixture.componentInstance.html.set(NEXT);
    await settle(fixture);
    expect(contentWrites(fixture, calls)).toEqual([
      ['h2', 'text-align: right'],
      ['p', 'text-align: justify'],
    ]);
  });

  it('sanitize: o style que o esquema permite chega e é reaplicado', async () => {
    const sanitize = createSanitizer();
    const input = '<p style="text-align: center">a</p>';
    // O valor do atributo como o sanitizador o deixou (a escrita por CSSOM
    // re-serializa o atributo depois).
    const style = /style="([^"]*)"/.exec(sanitize(input))![1]!;
    expect(style).toContain('text-align');
    const calls = spyCssText();
    const fixture = TestBed.configureTestingModule({
      providers: [provideRteRender({ sanitize })],
    }).createComponent(Host);
    fixture.componentInstance.mode.set('sanitize');
    fixture.componentInstance.html.set(input);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    expect(contentWrites(fixture, calls)).toEqual([['p', style]]);
    expect(el(fixture).querySelector('p')!.style.textAlign).toBe('center');
  });
});

/**
 * O Firefox, sob CSP sem `'unsafe-inline'`, mantém o atributo `style` do HTML
 * inserido mas com valor vazio (`getAttribute('style') === ''`, achado da L2):
 * os valores vêm do HTML preparado, casados pela ordem do documento e pela tag.
 */
describe('restoreContentStyles com o HTML preparado (Firefox sob CSP)', () => {
  /** Simula o Gecko: o atributo `style` existe, mas lê vazio. */
  function blankStyleAttributes(): void {
    const get = Element.prototype.getAttribute;
    vi.spyOn(Element.prototype, 'getAttribute').mockImplementation(function (
      this: Element,
      name: string,
    ) {
      return name === 'style' ? '' : get.call(this, name);
    });
  }

  function build(html: string, styled: string[]): HTMLElement {
    // A árvore exibida, com `style=""` como o Firefox a deixa.
    const root = document.createElement('div');
    for (const tag of styled) {
      const child = document.createElement(tag);
      child.setAttribute('style', '');
      root.append(child);
    }
    void html;
    return root;
  }

  it('usa os valores do HTML, na ordem do documento', () => {
    const html =
      '<!-- <p style="color: red"> --><h2 style="text-align: right">t</h2>' +
      '<p>x</p><p style="text-align: justify">j&amp;</p>' +
      '<table><colgroup><col style="width: 200px"></colgroup></table>';
    const root = build(html, ['h2', 'p', 'col']);
    blankStyleAttributes();
    const calls = spyCssText();
    expect(restoreContentStyles(root, html)).toBe(3);
    expect(calls.map((c) => c.value)).toEqual([
      'text-align: right',
      'text-align: justify',
      'width: 200px',
    ]);
  });

  it('entidades no valor do atributo são decodificadas', () => {
    const html = '<span style="font-family: &quot;A&amp;B&quot;">a</span>';
    const root = build(html, ['span']);
    blankStyleAttributes();
    const calls = spyCssText();
    restoreContentStyles(root, html);
    expect(calls.map((c) => c.value)).toEqual(['font-family: "A&B"']);
  });

  it('tags fora de ordem ou em número diferente → valores do próprio atributo', () => {
    const root = document.createElement('div');
    const p = document.createElement('p');
    p.setAttribute('style', P_STYLE);
    root.append(p);
    const calls = spyCssText();
    // O HTML não corresponde à árvore (h2 em vez de p; dois em vez de um).
    restoreContentStyles(root, '<h2 style="text-align: right">t</h2>');
    restoreContentStyles(
      root,
      '<p style="color: red">a</p><p style="color: blue">b</p>',
    );
    // A 1ª escrita por CSSOM re-serializa o atributo (`…;`).
    expect(calls.map((c) => c.value.replace(/;$/, ''))).toEqual([
      P_STYLE,
      P_STYLE,
    ]);
  });

  it('RteContent: reaplica os valores do HTML com o atributo lido vazio', async () => {
    blankStyleAttributes();
    const calls = spyCssText();
    const fixture = await renderHost(Host);
    await settle(fixture);
    expect(contentWrites(fixture, calls)).toEqual([
      ['p', P_STYLE],
      ['col', COL_STYLE],
    ]);
    expect(el(fixture).querySelector('p')!.style.textAlign).toBe('center');
  });
});
