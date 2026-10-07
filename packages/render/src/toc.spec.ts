import { Location, PlatformLocation } from '@angular/common';
import { Component, signal, type Provider } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import type { RteTocEntry } from '@cds/rte-core/html';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideRteRender } from './provide';
import { renderHost } from './testing-support/render';
import { RteToc } from '@cds/rte-render/toc';
import {
  buildTocTree,
  uniqueTocEntries,
  type RteTocNode,
} from '../toc/src/toc-tree';
import type { RteRenderLabels } from './types';

// R7 (H11): árvore do sumário, ids repetidos, `levels`, vazio, `href` com a
// base e rótulo (H16).

const e = (id: string, level: number): RteTocEntry => ({
  id,
  text: id,
  level,
});

/** Forma compacta da árvore: `id(filhos…)`. */
function shape(nodes: readonly RteTocNode[]): string {
  return nodes
    .map(
      (n) => n.entry.id + (n.children.length ? `(${shape(n.children)})` : ''),
    )
    .join(' ');
}

describe('buildTocTree (H11)', () => {
  it.each<[string, RteTocEntry[], string]>([
    [
      'h2·h3·h3·h2 → duas raízes, duas filhas na 1ª',
      [e('a', 2), e('b', 3), e('c', 3), e('d', 2)],
      'a(b c) d',
    ],
    ['h2·h4 (salta) → h4 filho do h2', [e('a', 2), e('b', 4)], 'a(b)'],
    [
      'h2·h4·h3 → h3 irmão do h4 sob o h2',
      [e('a', 2), e('b', 4), e('c', 3)],
      'a(b c)',
    ],
    ['h3 antes de qualquer h2 → raiz', [e('a', 3), e('b', 2)], 'a b'],
    [
      'h2·h3·h4·h2·h3',
      [e('a', 2), e('b', 3), e('c', 4), e('d', 2), e('f', 3)],
      'a(b(c)) d(f)',
    ],
    ['vazio', [], ''],
  ])('%s', (_, entries, expected) => {
    expect(shape(buildTocTree(entries))).toBe(expected);
  });

  it('cada nó guarda a própria entrada', () => {
    const entries = [e('a', 2), e('b', 3)];
    const [root] = buildTocTree(entries);
    expect(root!.entry).toBe(entries[0]);
    expect(root!.children[0]!.entry).toBe(entries[1]);
  });
});

describe('uniqueTocEntries (H11)', () => {
  it('id repetido: a primeira ocorrência vence', () => {
    const first = { id: 'rt-a', text: 'Primeiro', level: 2 };
    const second = { id: 'rt-a', text: 'Segundo', level: 3 };
    expect(uniqueTocEntries([first, e('rt-b', 2), second])).toEqual([
      first,
      e('rt-b', 2),
    ]);
  });
});

@Component({
  selector: 'rte-test-toc-host',
  imports: [RteToc],
  template: `<rte-toc
    [html]="html()"
    [levels]="levels()"
    [labels]="labels()"
  />`,
})
class Host {
  readonly html = signal<string | null | undefined>('');
  readonly levels = signal<readonly number[]>([2, 3]);
  readonly labels = signal<Partial<RteRenderLabels> | undefined>(undefined);
}

@Component({
  selector: 'rte-test-toc-default-host',
  imports: [RteToc],
  template: `<rte-toc [html]="html" />`,
})
class DefaultHost {
  readonly html =
    '<h2 id="rt-a">A</h2><h3 id="rt-b">B</h3><h4 id="rt-c">C</h4>';
}

/** `PlatformLocation`/`Location` falsos: caminho do documento `/p`. */
function fakeLocation(): Provider[] {
  return [
    { provide: PlatformLocation, useValue: { pathname: '/p', search: '' } },
    { provide: Location, useValue: { onUrlChange: () => () => undefined } },
  ];
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    'rte-toc',
  ) as HTMLElement;
}

function links(fixture: ComponentFixture<unknown>): string[] {
  return [...host(fixture).querySelectorAll('a')].map(
    (a) => `${a.getAttribute('href')} ${a.textContent}`,
  );
}

async function render(
  html: string,
  providers: Provider[] = fakeLocation(),
): Promise<ComponentFixture<Host>> {
  const fixture = await renderHost(Host, providers);
  fixture.componentInstance.html.set(html);
  await fixture.whenStable();
  return fixture;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('RteToc (R7)', () => {
  it('DOM exato: nav.rte-toc > ol.rte-toc__list > li.rte-toc__item > a.rte-toc__link', async () => {
    const fixture = await render(
      '<h2 id="rt-a">A</h2><h3 id="rt-b">B</h3><h3 id="rt-c">C</h3><h2 id="rt-d">D</h2>',
    );
    const el = host(fixture);
    expect(el.classList.contains('rte-root')).toBe(true);
    expect(el.children).toHaveLength(1);
    const nav = el.children[0] as HTMLElement;
    expect(nav.tagName).toBe('NAV');
    expect(nav.className).toBe('rte-toc');
    expect(nav.children).toHaveLength(1);
    const ol = nav.children[0] as HTMLElement;
    expect(ol.tagName).toBe('OL');
    expect(ol.className).toBe('rte-toc__list');
    const items = [...ol.children] as HTMLElement[];
    expect(items.map((li) => `${li.tagName}.${li.className}`)).toEqual([
      'LI.rte-toc__item',
      'LI.rte-toc__item',
    ]);
    const [first, second] = items;
    expect([...first!.children].map((c) => c.tagName)).toEqual(['A', 'OL']);
    const a = first!.children[0] as HTMLAnchorElement;
    expect(a.className).toBe('rte-toc__link');
    expect(a.textContent).toBe('A');
    const sub = first!.children[1] as HTMLElement;
    expect(sub.className).toBe('rte-toc__list');
    expect(
      [...sub.children].map(
        (li) =>
          `${li.className}>${[...li.children].map((c) => `${c.tagName}.${c.className}`).join(',')}`,
      ),
    ).toEqual([
      'rte-toc__item>A.rte-toc__link',
      'rte-toc__item>A.rte-toc__link',
    ]);
    expect([...second!.children].map((c) => c.tagName)).toEqual(['A']);
    expect(links(fixture)).toEqual([
      '/p#rt-a A',
      '/p#rt-b B',
      '/p#rt-c C',
      '/p#rt-d D',
    ]);
  });

  it('nível que salta (h4 sem h3) fica sob o h2 com levels [2, 3, 4]', async () => {
    const fixture = await render('<h2 id="rt-a">A</h2><h4 id="rt-b">B</h4>');
    fixture.componentInstance.levels.set([2, 3, 4]);
    await fixture.whenStable();
    expect(
      host(fixture).querySelectorAll('li.rte-toc__item > ol.rte-toc__list a'),
    ).toHaveLength(1);
    expect(links(fixture)).toEqual(['/p#rt-a A', '/p#rt-b B']);
  });

  it('h3 antes de qualquer h2 é raiz', async () => {
    const fixture = await render('<h3 id="rt-a">A</h3><h2 id="rt-b">B</h2>');
    const ol = host(fixture).querySelector('nav > ol') as HTMLElement;
    expect(ol.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(ol.querySelectorAll('ol')).toHaveLength(0);
  });

  it('título vazio é ignorado', async () => {
    const fixture = await render('<h3 id="rt-x"></h3><h2 id="rt-a">A</h2>');
    expect(links(fixture)).toEqual(['/p#rt-a A']);
    expect(
      fixture.debugElement.children[0]!.injector.get(RteToc).entries(),
    ).toEqual([{ id: 'rt-a', text: 'A', level: 2 }]);
  });

  it('id repetido: só a primeira ocorrência', async () => {
    const fixture = await render(
      '<h2 id="rt-a">Um</h2><h2 id="rt-b">B</h2><h3 id="rt-a">Dois</h3>',
    );
    expect(links(fixture)).toEqual(['/p#rt-a Um', '/p#rt-b B']);
  });

  it('levels [2] → só h2; [2, 3, 4] → h4 incluído', async () => {
    const html = '<h2 id="rt-a">A</h2><h3 id="rt-b">B</h3><h4 id="rt-c">C</h4>';
    const fixture = await render(html);
    expect(links(fixture)).toEqual(['/p#rt-a A', '/p#rt-b B']);
    fixture.componentInstance.levels.set([2]);
    await fixture.whenStable();
    expect(links(fixture)).toEqual(['/p#rt-a A']);
    fixture.componentInstance.levels.set([2, 3, 4]);
    await fixture.whenStable();
    expect(links(fixture)).toEqual(['/p#rt-a A', '/p#rt-b B', '/p#rt-c C']);
  });

  it('levels padrão é [2, 3]', async () => {
    const fixture = await renderHost(DefaultHost, fakeLocation());
    expect(links(fixture)).toEqual(['/p#rt-a A', '/p#rt-b B']);
  });

  it('HTML sem títulos (ou nulo) → nada renderizado, nem o nav', async () => {
    const fixture = await render('<p>sem títulos</p>');
    expect(host(fixture).children).toHaveLength(0);
    expect(host(fixture).textContent).toBe('');
    fixture.componentInstance.html.set('<h2 id="rt-a">A</h2>');
    await fixture.whenStable();
    expect(host(fixture).querySelectorAll('nav')).toHaveLength(1);
    for (const value of [null, undefined, '']) {
      fixture.componentInstance.html.set(value);
      await fixture.whenStable();
      expect(host(fixture).children).toHaveLength(0);
    }
  });

  it('texto com entidades é exibido como texto (nenhum elemento criado)', async () => {
    const fixture = await render('<h2 id="rt-a">A &amp; &lt;b&gt;</h2>');
    const a = host(fixture).querySelector('a') as HTMLAnchorElement;
    expect(a.textContent).toBe('A & <b>');
    expect(a.children).toHaveLength(0);
    expect(host(fixture).querySelector('b')).toBeNull();
  });

  it('href com a base do documento', async () => {
    const fixture = await render('<h2 id="rt-a">A</h2>');
    expect(links(fixture)).toEqual(['/p#rt-a A']);
  });

  it("fragmentLinks: 'keep' mantém #id", async () => {
    const fixture = await render('<h2 id="rt-a">A</h2>', [
      provideRteRender({ fragmentLinks: 'keep' }),
    ]);
    expect(links(fixture)).toEqual(['#rt-a A']);
  });

  it('href acompanha a navegação (Location.onUrlChange)', async () => {
    const platform = { pathname: '/p', search: '' };
    let listener: (() => void) | null = null;
    const fixture = await render('<h2 id="rt-a">A</h2>', [
      { provide: PlatformLocation, useValue: platform },
      {
        provide: Location,
        useValue: {
          onUrlChange: (fn: () => void) => {
            listener = fn;
            return () => undefined;
          },
        },
      },
    ]);
    platform.pathname = '/q';
    platform.search = '?x=1';
    listener!();
    await fixture.whenStable();
    expect(links(fixture)).toEqual(['/q?x=1#rt-a A']);
  });

  it('pathname com barras iniciais repetidas não vira link protocolo-relativo', async () => {
    const fixture = await render('<h2 id="rt-a">A</h2>', [
      {
        provide: PlatformLocation,
        useValue: { pathname: '//evil.example/x', search: '' },
      },
      { provide: Location, useValue: { onUrlChange: () => () => undefined } },
    ]);
    expect(links(fixture)).toEqual(['/evil.example/x#rt-a A']);
  });

  it('nav com aria-label Table of contents (padrão)', async () => {
    const fixture = await render('<h2 id="rt-a">A</h2>');
    expect(host(fixture).querySelector('nav')!.getAttribute('aria-label')).toBe(
      'Table of contents',
    );
  });

  it('labels de entrada vence o provider e troca ao vivo', async () => {
    const fixture = await render('<h2 id="rt-a">A</h2>', [
      ...fakeLocation(),
      provideRteRender({ labels: { toc: 'Do provider' } }),
    ]);
    const nav = (): HTMLElement => host(fixture).querySelector('nav')!;
    expect(nav().getAttribute('aria-label')).toBe('Do provider');
    fixture.componentInstance.labels.set({ toc: 'Da entrada' });
    await fixture.whenStable();
    expect(nav().getAttribute('aria-label')).toBe('Da entrada');
    fixture.componentInstance.labels.set({ toc: 'Outro' });
    await fixture.whenStable();
    expect(nav().getAttribute('aria-label')).toBe('Outro');
    fixture.componentInstance.labels.set(undefined);
    await fixture.whenStable();
    expect(nav().getAttribute('aria-label')).toBe('Do provider');
  });

  it('funciona sem provideRteRender (não exige sanitizador)', async () => {
    const fixture = await render('<h2 id="rt-a">A</h2>');
    expect(links(fixture)).toEqual(['/p#rt-a A']);
  });
});
