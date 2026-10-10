import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { createSanitizer } from '@comodeviaser/rte-sanitizer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RteContent } from './content/rte-content';
import { applyTableSizing } from './content/table-sizing';
import { provideRteRender } from './provide';
import { renderHost, settle } from './testing-support/render';
import type { RteRenderMode } from './types';

// Spec 06 (H20, R6): a tabela com larguras de coluna é dimensionada como na edição (o
// `TableView` do Tiptap): `width` com todas as colunas definidas, `min-width` com algumas.

const ALL =
  '<table><colgroup><col style="width: 480px"><col style="width: 480px"></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>';
const MIXED =
  '<table><colgroup><col style="width: 200px"><col><col></colgroup><tbody><tr><th><p>a</p></th><th colspan="2"><p>b</p></th></tr></tbody></table>';
const NONE =
  '<table><colgroup><col><col></colgroup><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>';

/** Raiz com o HTML como o `prepareRteHtml` deixa e os `style` já reaplicados (CSSOM). */
function root(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

function sized(html: string): string {
  return html.replace('<table>', '<table class="rte-table--sized">');
}

describe('applyTableSizing', () => {
  it('todas as colunas com largura → width = soma, sem min-width', () => {
    const r = root(sized(ALL));
    expect(applyTableSizing(r)).toBe(1);
    const t = r.querySelector('table')!;
    expect(t.style.width).toBe('960px');
    expect(t.style.minWidth).toBe('');
  });

  it('algumas (colspan na 1ª linha) → min-width = soma + 25 × sem largura', () => {
    const r = root(sized(MIXED));
    applyTableSizing(r);
    const t = r.querySelector('table')!;
    expect(t.style.minWidth).toBe('250px');
    expect(t.style.width).toBe('');
  });

  it('só tabelas com a classe; colunas do próprio colgroup', () => {
    const r = root(
      ALL +
        sized(
          '<table><colgroup><col style="width: 100px"></colgroup><tbody><tr><td>' +
            sized(ALL) +
            '</td></tr></tbody></table>',
        ),
    );
    expect(applyTableSizing(r)).toBe(2);
    const [plain, outer, inner] = [...r.querySelectorAll('table')];
    expect(plain!.getAttribute('style')).toBeNull();
    expect(outer!.style.width).toBe('100px');
    expect(inner!.style.width).toBe('960px');
  });

  it('com a classe mas sem largura lida (CSSOM vazio) → nada', () => {
    const r = root(sized(NONE));
    expect(applyTableSizing(r)).toBe(0);
    expect(r.querySelector('table')!.getAttribute('style')).toBeNull();
  });
});

@Component({
  selector: 'rte-test-host',
  imports: [RteContent],
  template: `<div [rteContent]="html()" [mode]="mode()"></div>`,
})
class Host {
  readonly html = signal(ALL);
  readonly mode = signal<RteRenderMode>('trusted');
}

function table(fixture: ComponentFixture<unknown>): HTMLTableElement {
  return (fixture.nativeElement as HTMLElement).querySelector('table')!;
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

describe('RteContent: dimensão da tabela depois de cada inserção', () => {
  it('trusted: classe e width; trocar o HTML redimensiona a nova', async () => {
    const fixture = await renderHost(Host);
    await settle(fixture);
    expect(table(fixture).classList.contains('rte-table--sized')).toBe(true);
    expect(table(fixture).style.width).toBe('960px');
    fixture.componentInstance.html.set(MIXED);
    await settle(fixture);
    expect(table(fixture).style.minWidth).toBe('250px');
    expect(table(fixture).style.width).toBe('');
  });

  it('sanitize: a largura do col passa pelo esquema e dimensiona a tabela', async () => {
    const fixture = await renderHost(Host, [
      provideRteRender({ sanitize: createSanitizer() }),
    ]);
    fixture.componentInstance.mode.set('sanitize');
    await settle(fixture);
    expect(table(fixture).style.width).toBe('960px');
  });

  it('atributo style lido vazio (Firefox sob CSP): vale o valor do HTML', async () => {
    const getAttribute = Element.prototype.getAttribute;
    vi.spyOn(Element.prototype, 'getAttribute').mockImplementation(function (
      this: Element,
      name: string,
    ) {
      return name === 'style' && this.localName === 'col'
        ? ''
        : getAttribute.call(this, name);
    });
    const fixture = await renderHost(Host);
    await settle(fixture);
    expect(table(fixture).style.width).toBe('960px');
  });
});
