import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  NgZone,
  type OnInit,
  type Signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { injectFragmentBase } from '../fragment-base';
import { mergeRenderLabels, RTE_RENDER_LABELS } from '../labels';
import { prepareRteHtml } from '../prepare-html';
import { RTE_RENDER_OPTIONS } from '../provide';
import type {
  RteRenderLabels,
  RteRenderMode,
  RteSanitizeErrorLike,
} from '../types';
import { missingSanitizerError, renderContent } from './render-content';
import { restoreContentStyles } from './restore-styles';
import { createTableScrollers, type RteTableScrollers } from './table-scroller';
import { applyTableSizing } from './table-sizing';

/**
 * Exibe HTML do editor no elemento do consumidor (H3), que ganha
 * `rte-root rte-content`.
 *
 * - `sanitize` (padrão): o HTML passa pelo sanitizador de
 *   `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`; sem
 *   ele, lança (H4). `RteSanitizeError` → conteúdo vazio, `error()` e um
 *   `console.warn` (H5).
 * - `trusted`: o HTML é exibido como veio. Pré-condição: o HTML `trusted`
 *   precisa estar já sanitizado por `createSanitizer` (mesma versão maior do
 *   `@cds/rte-sanitizer`) — as transformações da H6 (`prepareRteHtml`) são
 *   uma varredura de *tags* que só é segura sobre essa saída canônica.
 *
 * Esta é a única porta de HTML do pacote (H9): `bypassSecurityTrustHtml` só
 * recebe `prepareRteHtml(renderedHtml())`, e `renderedHtml()` é a saída do
 * sanitizador (ou o HTML `trusted`).
 *
 * No navegador, depois de cada inserção (inclusive a da hidratação), os
 * `style` do conteúdo são reaplicados por CSSOM (H8) e os roladores de tabela
 * passam a ser observados (H7); nada disso roda no servidor.
 *
 * `<article [rteContent]="post.body" #c="rteContent"></article>`
 */
@Directive({
  selector: '[rteContent]',
  exportAs: 'rteContent',
  host: {
    class: 'rte-root rte-content',
    '[innerHTML]': 'safeHtml()',
  },
})
export class RteContent implements OnInit {
  /** O HTML a exibir; `null`/`undefined` = vazio. */
  readonly rteContent = input<string | null | undefined>();
  /** `sanitize` (padrão) ou `trusted` (H4). */
  readonly mode = input<RteRenderMode>('sanitize');
  /** Rótulos parciais; vencem o `provideRteRender` (H16). */
  readonly labels = input<Partial<RteRenderLabels> | undefined>();

  private readonly options = inject(RTE_RENDER_OPTIONS);
  private readonly providedLabels = inject(RTE_RENDER_LABELS);
  private readonly domSanitizer = inject(DomSanitizer);
  private readonly fragmentBase = injectFragmentBase();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  /** `undefined` = ainda não criado; `null` = sem `ResizeObserver`. */
  private scrollers: RteTableScrollers | null | undefined;

  // Memoizado: sanitiza (e avisa, H5) uma vez por troca de HTML ou modo (H18).
  private readonly result = computed(() =>
    renderContent(this.rteContent(), this.mode(), this.options.sanitize),
  );

  /** HTML exibido (sanitizado ou `trusted`), antes da H6; `''` com erro. */
  readonly renderedHtml: Signal<string> = computed(() => this.result().html);

  /** Último `RteSanitizeError` (H5) ou `null`. */
  readonly error: Signal<RteSanitizeErrorLike | null> = computed(
    () => this.result().error,
  );

  /** O HTML inserido: `renderedHtml()` com as transformações da H6. */
  private readonly preparedHtml: Signal<string> = computed(() =>
    prepareRteHtml(this.renderedHtml(), { fragmentBase: this.fragmentBase() }),
  );

  /** @internal */
  protected readonly safeHtml: Signal<SafeHtml> = computed(() =>
    this.domSanitizer.bypassSecurityTrustHtml(this.preparedHtml()),
  );

  /** @internal */
  protected readonly effectiveLabels: Signal<RteRenderLabels> = computed(() =>
    mergeRenderLabels(this.providedLabels, this.labels()),
  );

  constructor() {
    // Ganchos de render não rodam no servidor (H7, H8).
    afterRenderEffect({
      write: () => {
        this.safeHtml(); // cada inserção
        const host = this.host.nativeElement;
        // Os valores vêm do HTML inserido: o Firefox sob CSP lê o atributo vazio.
        restoreContentStyles(host, this.preparedHtml());
        // Depois dos `col`: a tabela com larguras recebe a dimensão da edição (H20).
        applyTableSizing(host);
        // Criado aqui, e não num `afterNextRender` (que roda depois desta
        // fase), para a 1ª inserção já ser observada (Ruling 7).
        if (this.scrollers === undefined)
          this.scrollers = this.createScrollers(host);
        this.scrollers?.refresh();
      },
    });
    afterRenderEffect({
      write: () => {
        this.effectiveLabels();
        this.scrollers?.relabel();
      },
    });
    inject(DestroyRef).onDestroy(() => this.scrollers?.destroy());
  }

  private createScrollers(host: HTMLElement): RteTableScrollers | null {
    const win = this.document.defaultView;
    if (!win) return null;
    // Fora da zona: o *callback* do observador só escreve atributos (H18).
    return this.ngZone.runOutsideAngular(() =>
      createTableScrollers(
        host,
        win,
        () => this.effectiveLabels().tableScroller,
      ),
    );
  }

  ngOnInit(): void {
    // Falha cedo, já com as entradas lidas (H4, pré-voo 4); o `computed`
    // também lança se o modo virar `sanitize` depois.
    if (
      this.mode() === 'sanitize' &&
      typeof this.options.sanitize !== 'function'
    ) {
      throw missingSanitizerError();
    }
  }
}
