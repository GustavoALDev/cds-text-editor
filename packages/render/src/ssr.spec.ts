// @vitest-environment node
import { DOCUMENT, ɵgetDOM as getDOM } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ErrorHandler,
  type EnvironmentProviders,
  inject,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  type Provider,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server';
import { createSanitizer } from '@cds/rte-sanitizer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreContentStyles } from './content/restore-styles';
import { RteContent } from './content/rte-content';
import { createTableScrollers } from './content/table-scroller';
import { provideRteRender } from './provide';
import { readFixture } from './testing-support/fixtures';
import { withServerDomAdapter } from './testing-support/server-dom';
import { RteToc } from '@cds/rte-render/toc';

// R8 (H10): a diretiva e o sumário rodam no servidor (Node, domino) sem tocar
// em globais de DOM; o HTML do servidor já traz a H6. "Nada no servidor" da
// H7/H8 (§6.1, Ruling 5): o `style` sai como veio, nenhum rolador marcado, e
// as sondas abaixo provam que nem a reaplicação por CSSOM nem os roladores
// consultaram o *host* — nem com um `ResizeObserver` disponível na janela do
// servidor. H4/H5 também no servidor (nota da revisão da Tarefa 4).

const FIXTURE = readFixture('all-features.html');
const PAGE_URL = '/artigo?x=1&y=2';
const MISSING =
  "[rte-render] modo 'sanitize' sem sanitizador: forneça provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) }) ou use [mode]=\"'trusted'\" com HTML já sanitizado pelo servidor.";
const HREF = 'href="/artigo?x=1&amp;y=2#rt-subtitulo"';

/** Sondas instaladas no `document` do servidor pelo construtor do host. */
const probe = { hostQueries: 0, observers: 0, hasWindow: false };
let restoreProbe: (() => void) | null = null;

class CountingResizeObserver {
  constructor() {
    probe.observers++;
  }
  observe(): void {
    // sem efeito: a sonda só conta construções
  }
  unobserve(): void {
    // sem efeito
  }
  disconnect(): void {
    // sem efeito
  }
}

function installProbe(doc: Document): void {
  // `restoreContentStyles` e os roladores começam por
  // `host.querySelectorAll(…)`; os métodos do domino não são configuráveis,
  // então a sonda sombreia o `querySelectorAll` no protótipo do `article`
  // (próprio e configurável) e conta as chamadas sobre o *host*.
  const proto = Object.getPrototypeOf(doc.createElement('article')) as Element;
  if (Object.getOwnPropertyDescriptor(proto, 'querySelectorAll'))
    throw new Error('o protótipo do article já tem querySelectorAll próprio');
  const original = proto.querySelectorAll;
  Object.defineProperty(proto, 'querySelectorAll', {
    configurable: true,
    writable: true,
    value(this: Element, selector: string) {
      if (this.classList.contains('rte-content')) probe.hostQueries++;
      return original.call(this, selector);
    },
  });
  // `ResizeObserver` falso na janela do servidor: contado (H7 não pode rodar).
  const win = doc.defaultView as (Window & Record<string, unknown>) | null;
  probe.hasWindow = win !== null;
  const previous = win?.['ResizeObserver'];
  if (win) {
    win['ResizeObserver'] = CountingResizeObserver;
  }
  restoreProbe = () => {
    delete (proto as Partial<Element>).querySelectorAll;
    if (win) win['ResizeObserver'] = previous;
  };
}

/** Ordem da tarefa: o artigo antes do sumário. */
@Component({
  selector: 'rte-ssr-host',
  imports: [RteContent, RteToc],
  template: `
    <article #c="rteContent" [rteContent]="fixture"></article>
    <rte-toc [html]="c.renderedHtml()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SsrHost {
  readonly fixture = FIXTURE;
  constructor() {
    installProbe(inject(DOCUMENT));
  }
}

/** Ordem do README (§4): o sumário antes do artigo. */
@Component({
  selector: 'rte-ssr-host',
  imports: [RteContent, RteToc],
  template: `
    <rte-toc [html]="c.renderedHtml()" />
    <article #c="rteContent" [rteContent]="fixture"></article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SsrHostTocFirst extends SsrHost {}

/** O servidor roda no modo do alvo: zoneless (`test`) ou zone.js (`test-zone`). */
const changeDetection = (): (Provider | EnvironmentProviders)[] =>
  'Zone' in globalThis
    ? [provideZoneChangeDetection()]
    : [provideZonelessChangeDetection()];

/** Avisos do pacote (o Angular pode avisar por conta própria). */
const ownWarnings = (): unknown[][] =>
  warn.mock.calls.filter((args: unknown[]) =>
    String(args[0]).startsWith('[rte-render]'),
  );

function render(
  providers: Provider[],
  host: typeof SsrHost = SsrHost,
): Promise<string> {
  return withServerDomAdapter(() =>
    renderApplication(
      (context) =>
        bootstrapApplication(
          host,
          {
            providers: [
              ...changeDetection(),
              provideServerRendering(),
              ...providers,
            ],
          },
          context,
        ),
      {
        document:
          '<!doctype html><html><head></head><body><rte-ssr-host></rte-ssr-host></body></html>',
        url: PAGE_URL,
      },
    ),
  );
}

let warn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  probe.hostQueries = 0;
  probe.observers = 0;
  probe.hasWindow = false;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  restoreProbe?.();
  restoreProbe = null;
  vi.restoreAllMocks();
});

describe('RteContent e RteToc no servidor (R8)', () => {
  it('não há DOM global no ambiente', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it(
    'renderApplication entrega o conteúdo transformado e o sumário',
    { timeout: 30_000 },
    async () => {
      const html = await render([
        provideRteRender({ sanitize: createSanitizer() }),
      ]);

      // Conteúdo (H3, H6).
      expect(html).toContain('class="rte-root rte-content"');
      expect(html).toContain('<div class="rte-table-scroll"><table');
      const scrollers = [
        ...html.matchAll(/<div class="rte-table-scroll"[^>]*>/g),
      ].map(([m]) => m);
      expect(scrollers.length).toBeGreaterThan(0);
      for (const s of scrollers)
        expect(s).toBe('<div class="rte-table-scroll">');
      expect(html).not.toContain('tabindex');
      const article = /<article\b[\s\S]*<\/article>/.exec(html)![0];
      expect(article).toContain(HREF);
      expect(article).toContain('id="rt-subtitulo"');

      // Sumário (H11): mesma base no `href`, rótulo padrão.
      const toc = /<rte-toc\b[\s\S]*?<\/rte-toc>/.exec(html)![0];
      expect(toc).toMatch(/^<rte-toc class="rte-root"/);
      expect(toc).toMatch(
        /<nav class="rte-toc" aria-label="Table of contents">/,
      );
      expect(toc).toContain(HREF);
      expect(toc).toContain('class="rte-toc__link"');
      expect(toc).toContain('Subtítulo');

      // Nada no servidor (H7, H8; Ruling 5): `style` como veio, nenhum rolador
      // marcado, nenhuma consulta ao host e nenhum observador criado.
      expect(html).toContain('<p style="text-align: justify">');
      expect(html).toContain('<col style="width: 200px">');
      expect(html).not.toContain('role="region"');
      expect(html).not.toContain('Scrollable table');
      expect(probe.hasWindow).toBe(true);
      expect(probe.hostQueries).toBe(0);
      expect(probe.observers).toBe(0);

      // Nenhum global de DOM tocado.
      expect(typeof globalThis.document).toBe('undefined');
      expect(typeof globalThis.window).toBe('undefined');
      expect(consoleError).not.toHaveBeenCalled();
      expect(ownWarnings()).toEqual([]);
    },
  );

  it('controle positivo: as sondas enxergam a H7 e a H8 sobre o domino', async () => {
    await withServerDomAdapter(async () => {
      const doc = getDOM().createHtmlDocument();
      installProbe(doc);
      const host = doc.createElement('article');
      host.className = 'rte-root rte-content';
      host.appendChild(doc.createElement('p')).setAttribute('style', 'x: y');
      restoreContentStyles(host);
      expect(probe.hostQueries).toBe(1);
      const win = {
        ResizeObserver: CountingResizeObserver,
      } as unknown as Window & typeof globalThis;
      createTableScrollers(host, win, () => 'r')!.refresh();
      expect(probe.hostQueries).toBe(2);
      expect(probe.observers).toBe(1);
    });
  });

  it(
    'ordem do README (sumário antes do artigo) também sai no servidor',
    { timeout: 30_000 },
    async () => {
      const html = await render(
        [provideRteRender({ sanitize: createSanitizer() })],
        SsrHostTocFirst,
      );
      const toc = /<rte-toc\b[\s\S]*?<\/rte-toc>/.exec(html)![0];
      expect(toc).toContain('<nav class="rte-toc"');
      expect(toc).toContain(HREF);
      expect(html).toContain('<div class="rte-table-scroll"><table');
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it(
    'sem sanitizador em sanitize, a criação lança no servidor e nada é exibido (H4)',
    { timeout: 30_000 },
    async () => {
      const errors: unknown[] = [];
      const html = await render([
        {
          provide: ErrorHandler,
          useValue: { handleError: (e: unknown) => errors.push(e) },
        },
      ]);
      // Angular entrega a exceção ao `ErrorHandler` (o padrão a registra no
      // console) e conclui o render sem o conteúdo; com zone.js, a segunda
      // rodada de detecção relança o mesmo erro (memoizado no `computed`).
      expect(errors.length).toBeGreaterThanOrEqual(1);
      for (const e of errors) expect((e as Error).message).toBe(MISSING);
      expect(html).toMatch(
        /<article class="rte-root rte-content"[^>]*><\/article>/,
      );
      expect(html).not.toContain('<nav');
      expect(html).not.toContain('rt-subtitulo');
      expect(typeof globalThis.document).toBe('undefined');
    },
  );

  it(
    'sem sanitizador, com um ErrorHandler que relança, renderApplication rejeita (H4)',
    { timeout: 30_000 },
    async () => {
      // Relança só a primeira: com zone.js as rodadas seguintes relançariam
      // fora do render (erro não tratado depois do teste).
      const later: unknown[] = [];
      let first = true;
      await expect(
        render([
          {
            provide: ErrorHandler,
            useValue: {
              handleError: (e: unknown) => {
                if (!first) return void later.push(e);
                first = false;
                throw e;
              },
            },
          },
        ]),
      ).rejects.toThrow(MISSING);
      for (const e of later) expect((e as Error).message).toBe(MISSING);
    },
  );

  it(
    'RteSanitizeError: conteúdo vazio, sumário ausente e um aviso (H5)',
    { timeout: 30_000 },
    async () => {
      const error = Object.assign(new Error('m'), {
        name: 'RteSanitizeError',
        code: 'input-too-long',
        limit: 10,
      });
      const html = await render([
        provideRteRender({
          sanitize: () => {
            throw error;
          },
        }),
      ]);
      expect(html).toMatch(
        /<article class="rte-root rte-content"[^>]*><\/article>/,
      );
      expect(html).not.toContain('<nav');
      expect(ownWarnings()).toEqual([
        ['[rte-render] conteúdo não exibido: input-too-long (limite 10).'],
      ]);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
});
