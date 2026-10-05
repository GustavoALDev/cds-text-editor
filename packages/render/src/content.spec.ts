import { Location, PlatformLocation } from '@angular/common';
import { Component, signal, type Provider } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { createSanitizer } from '@cds/rte-sanitizer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RteContent } from './content/rte-content';
import {
  isRteSanitizeError,
  missingSanitizerError,
  renderContent,
} from './content/render-content';
import { RTE_RENDER_LABELS_EN } from './labels';
import { prepareRteHtml } from './prepare-html';
import { provideRteRender } from './provide';
import { renderHost } from './testing-support/render';
import type { RteRenderLabels, RteRenderMode } from './types';

const MISSING = 'provideRteRender({ sanitize: createSanitizer(';
const TABLE = '<table><tbody><tr><td><p>a</p></td></tr></tbody></table>';
const sanitize = createSanitizer();

const sanitizeError = (): Error =>
  Object.assign(new Error('m'), {
    name: 'RteSanitizeError',
    code: 'max-depth',
    limit: 256,
  });

@Component({
  selector: 'rte-test-host',
  imports: [RteContent],
  template: `<div
    #c="rteContent"
    [rteContent]="html()"
    [mode]="mode()"
    [labels]="labels()"
  ></div>`,
})
class Host {
  readonly html = signal<string | null | undefined>('');
  readonly mode = signal<RteRenderMode>('sanitize');
  readonly labels = signal<Partial<RteRenderLabels> | undefined>(undefined);
}

function el(fixture: ComponentFixture<unknown>): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '.rte-content',
  ) as HTMLElement;
}

function dir(fixture: ComponentFixture<unknown>): RteContent {
  return fixture.debugElement.children[0]!.injector.get(RteContent);
}

/** `PlatformLocation` e `Location` falsos (Review Focus 1 e 2). */
function fakeLocation() {
  const platform = { pathname: '/p', search: '?q=1', hash: '' };
  const state: { listener: (() => void) | null } = { listener: null };
  const unregister = vi.fn();
  const location = {
    onUrlChange(fn: () => void) {
      state.listener = fn;
      return unregister;
    },
  };
  const providers: Provider[] = [
    { provide: PlatformLocation, useValue: platform },
    { provide: Location, useValue: location },
  ];
  return { platform, state, unregister, providers };
}

let warn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  // H18: nenhum NG0100/NG0101 nos dois alvos (test e test-zone).
  const ng = consoleError.mock.calls.filter((args: unknown[]) =>
    /NG010[01]/.test(String(args[0])),
  );
  expect(ng).toEqual([]);
  warn.mockRestore();
  consoleError.mockRestore();
});

describe('renderContent (H4, H5)', () => {
  it('null/undefined = vazio; trusted devolve o HTML', () => {
    expect(renderContent(null, 'trusted', undefined).html).toBe('');
    expect(renderContent(undefined, 'sanitize', sanitize).html).toBe('');
    expect(renderContent('<p onclick="x">a</p>', 'trusted', undefined)).toEqual(
      { html: '<p onclick="x">a</p>', error: null },
    );
  });

  it('sanitize sem função lança com a instrução de configuração', () => {
    expect(() => renderContent('<p>a</p>', 'sanitize', undefined)).toThrow(
      MISSING,
    );
    expect(missingSanitizerError().message).toBe(
      "[rte-render] modo 'sanitize' sem sanitizador: forneça provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) }) ou use [mode]=\"'trusted'\" com HTML já sanitizado pelo servidor.",
    );
  });

  it('isRteSanitizeError reconhece pela forma, não por instanceof', () => {
    expect(isRteSanitizeError(sanitizeError())).toBe(true);
    expect(
      isRteSanitizeError({
        name: 'RteSanitizeError',
        code: 'input-too-long',
        limit: 1,
        message: 'm',
      }),
    ).toBe(true);
    for (const e of [
      null,
      'RteSanitizeError',
      new TypeError('x'),
      Object.assign(new Error('m'), {
        name: 'RteSanitizeError',
        code: 'x',
        limit: 1,
      }),
      Object.assign(new Error('m'), {
        name: 'RteSanitizeError',
        code: 'max-depth',
      }),
      Object.assign(new Error('m'), {
        name: 'Other',
        code: 'max-depth',
        limit: 1,
      }),
    ]) {
      expect(isRteSanitizeError(e)).toBe(false);
    }
  });

  it('RteSanitizeError → vazio, erro e um aviso com code e limite', () => {
    const error = sanitizeError();
    const result = renderContent('<p>a</p>', 'sanitize', () => {
      throw error;
    });
    expect(result).toEqual({ html: '', error });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      '[rte-render] conteúdo não exibido: max-depth (limite 256).',
    );
  });

  it('outra exceção propaga', () => {
    expect(() =>
      renderContent('<p>a</p>', 'sanitize', () => {
        throw new TypeError('t');
      }),
    ).toThrow(TypeError);
  });
});

describe('RteContent: modos (R2)', () => {
  it('sanitize exibe exatamente sanitize(html)', async () => {
    const fixture = await renderHost(Host, [provideRteRender({ sanitize })]);
    fixture.componentInstance.html.set(
      '<p onclick="x">a</p><script>x</script>',
    );
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p>a</p>');
    expect(dir(fixture).renderedHtml()).toBe('<p>a</p>');
    expect(dir(fixture).error()).toBeNull();
  });

  it('trusted exibe como recebido', async () => {
    const fixture = await renderHost(Host, [provideRteRender({ sanitize })]);
    fixture.componentInstance.mode.set('trusted');
    fixture.componentInstance.html.set('<p data-x="1">a</p>');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p data-x="1">a</p>');
    expect(dir(fixture).renderedHtml()).toBe('<p data-x="1">a</p>');
  });

  it('null e undefined = vazio', async () => {
    const fixture = await renderHost(Host, [provideRteRender({ sanitize })]);
    fixture.componentInstance.html.set('<p>a</p>');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p>a</p>');
    for (const value of [null, undefined]) {
      fixture.componentInstance.html.set(value);
      await fixture.whenStable();
      expect(el(fixture).innerHTML).toBe('');
      expect(dir(fixture).renderedHtml()).toBe('');
    }
  });

  it('trocar html e modo ao vivo re-renderiza', async () => {
    const fixture = await renderHost(Host, [provideRteRender({ sanitize })]);
    const host = fixture.componentInstance;
    host.html.set('<p data-x="1">a</p>');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p>a</p>');
    host.mode.set('trusted');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p data-x="1">a</p>');
    host.html.set('<p data-x="2">b</p>');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p data-x="2">b</p>');
    host.mode.set('sanitize');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p>b</p>');
  });

  it('cada host usa o sanitizador do seu provider de componente', async () => {
    @Component({
      selector: 'rte-test-a',
      imports: [RteContent],
      providers: [provideRteRender({ sanitize: () => '<p>A</p>' })],
      template: `<div [rteContent]="'x'"></div>`,
    })
    class HostA {}
    @Component({
      selector: 'rte-test-b',
      imports: [RteContent],
      providers: [provideRteRender({ sanitize: () => '<p>B</p>' })],
      template: `<div [rteContent]="'x'"></div>`,
    })
    class HostB {}
    @Component({
      selector: 'rte-test-ab',
      imports: [HostA, HostB],
      template: `<rte-test-a /><rte-test-b />`,
    })
    class HostAB {}
    const fixture = await renderHost(HostAB);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('rte-test-a .rte-content')!.innerHTML).toBe(
      '<p>A</p>',
    );
    expect(root.querySelector('rte-test-b .rte-content')!.innerHTML).toBe(
      '<p>B</p>',
    );
  });

  it('sanitize sem provider lança na criação, com a instrução', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    expect(() => fixture.detectChanges()).toThrow(MISSING);
  });

  it('trusted sem provider funciona; trocar para sanitize lança', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.mode.set('trusted');
    fixture.componentInstance.html.set('<p data-x="1">a</p>');
    fixture.detectChanges();
    expect(el(fixture).innerHTML).toBe('<p data-x="1">a</p>');
    fixture.componentInstance.mode.set('sanitize');
    expect(() => fixture.detectChanges()).toThrow(MISSING);
  });
});

describe('RteContent: erro do sanitizador (R2, H5)', () => {
  it('RteSanitizeError → vazio, error() preenchido, um aviso; HTML válido limpa', async () => {
    const error = sanitizeError();
    const fixture = await renderHost(Host, [
      provideRteRender({
        sanitize: (html) => {
          if (html.includes('fundo')) throw error;
          return sanitize(html);
        },
      }),
    ]);
    const host = fixture.componentInstance;
    host.html.set('<p>fundo</p>');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('');
    expect(dir(fixture).renderedHtml()).toBe('');
    expect(dir(fixture).error()).toMatchObject({
      code: 'max-depth',
      limit: 256,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('max-depth');
    expect(String(warn.mock.calls[0]![0])).toContain('256');
    host.html.set('<p>ok</p>');
    await fixture.whenStable();
    expect(dir(fixture).error()).toBeNull();
    expect(el(fixture).innerHTML).toBe('<p>ok</p>');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('outra exceção do sanitizador propaga', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRteRender({
          sanitize: () => {
            throw new TypeError('quebrou');
          },
        }),
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.html.set('<p>a</p>');
    expect(() => fixture.detectChanges()).toThrow(TypeError);
  });
});

describe('RteContent: porta única de HTML (R3, H6, H9)', () => {
  const INPUTS = [
    '<p onclick="x">a</p><script>alert(1)</script>',
    TABLE,
    '<p><a href="#rt-a">x</a></p><img src=x onerror="alert(1)">',
    `<h2 id="rt-a">t</h2>${TABLE}<p><a href="#rt-a" onclick="y">ir</a></p>`,
  ];

  it('sanitize: todo argumento do bypass é prepareRteHtml(sanitize(entrada))', async () => {
    const loc = fakeLocation();
    TestBed.configureTestingModule({
      providers: [provideRteRender({ sanitize }), ...loc.providers],
    });
    const bypass = vi.spyOn(
      TestBed.inject(DomSanitizer),
      'bypassSecurityTrustHtml',
    );
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const expected = [''];
    for (const input of INPUTS) {
      fixture.componentInstance.html.set(input);
      await fixture.whenStable();
      expected.push(
        prepareRteHtml(sanitize(input), { fragmentBase: '/p?q=1' }),
      );
    }
    const args = bypass.mock.calls.map((call) => call[0]);
    expect(args).toEqual(expected);
    for (const arg of args) {
      expect(arg).not.toContain('onclick');
      expect(arg).not.toContain('onerror');
      expect(arg).not.toContain('<script');
    }
    expect(args[2]).toBe(`<div class="rte-table-scroll">${TABLE}</div>`);
    expect(args[3]).toContain('href="/p?q=1#rt-a"');
    expect(el(fixture).innerHTML).toContain('href="/p?q=1#rt-a"');
    expect(
      el(fixture).querySelector('.rte-table-scroll > table'),
    ).not.toBeNull();
  });

  it('fragmentLinks: keep mantém href="#x"', async () => {
    const loc = fakeLocation();
    const fixture = await renderHost(Host, [
      provideRteRender({ sanitize, fragmentLinks: 'keep' }),
      ...loc.providers,
    ]);
    fixture.componentInstance.html.set('<p><a href="#rt-a">x</a></p>');
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toBe('<p><a href="#rt-a">x</a></p>');
    expect(loc.state.listener).toBeNull();
  });

  it('a base acompanha a URL; só o hash não re-insere; destroy desregistra', async () => {
    const loc = fakeLocation();
    TestBed.configureTestingModule({
      providers: [provideRteRender({ sanitize }), ...loc.providers],
    });
    const bypass = vi.spyOn(
      TestBed.inject(DomSanitizer),
      'bypassSecurityTrustHtml',
    );
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.html.set('<p><a href="#rt-a">x</a></p>');
    fixture.autoDetectChanges();
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toContain('href="/p?q=1#rt-a"');
    expect(loc.state.listener).toBeTypeOf('function');

    loc.platform.pathname = '/b';
    loc.state.listener!();
    await fixture.whenStable();
    expect(el(fixture).innerHTML).toContain('href="/b?q=1#rt-a"');

    const calls = bypass.mock.calls.length;
    loc.platform.hash = '#rt-a';
    loc.state.listener!();
    await fixture.whenStable();
    expect(bypass.mock.calls.length).toBe(calls);

    expect(loc.unregister).not.toHaveBeenCalled();
    fixture.destroy();
    expect(loc.unregister).toHaveBeenCalledTimes(1);
  });
});

describe('RteContent: host (H3)', () => {
  it('o host ganha rte-root rte-content e exportAs rteContent', async () => {
    const fixture = await renderHost(Host, [provideRteRender({ sanitize })]);
    const host = (fixture.nativeElement as HTMLElement).firstElementChild!;
    expect(host.className).toBe('rte-root rte-content');
  });

  it('Review Focus 4: classes e atributos do consumidor ficam; o conteúdo substitui o do template', async () => {
    @Component({
      selector: 'rte-test-article',
      imports: [RteContent],
      template: `<article class="post" data-x="1" [rteContent]="h">
        texto do template
      </article>`,
    })
    class ArticleHost {
      readonly h = '<p>conteúdo</p>';
    }
    const fixture = await renderHost(ArticleHost, [
      provideRteRender({ sanitize }),
    ]);
    const article = (fixture.nativeElement as HTMLElement).querySelector(
      'article',
    )!;
    // A ordem é a do Angular (classes estáticas do host da diretiva primeiro);
    // o que importa é que nenhuma se perde.
    expect([...article.classList].sort()).toEqual([
      'post',
      'rte-content',
      'rte-root',
    ]);
    expect(article.getAttribute('data-x')).toBe('1');
    expect(article.textContent).toBe('conteúdo');
  });

  it('effectiveLabels: entrada parcial vence o provider e troca ao vivo', async () => {
    const fixture = await renderHost(Host, [
      provideRteRender({ sanitize, labels: { toc: 'P' } }),
    ]);
    const labels = (): RteRenderLabels =>
      (
        dir(fixture) as unknown as {
          effectiveLabels: () => RteRenderLabels;
        }
      ).effectiveLabels();
    expect(labels()).toEqual({ ...RTE_RENDER_LABELS_EN, toc: 'P' });
    fixture.componentInstance.labels.set({ tableScroller: 'T' });
    await fixture.whenStable();
    expect(labels()).toEqual({ toc: 'P', tableScroller: 'T' });
  });
});
