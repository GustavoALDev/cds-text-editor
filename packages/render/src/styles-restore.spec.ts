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
