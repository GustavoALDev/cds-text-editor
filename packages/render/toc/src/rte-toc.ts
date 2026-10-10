import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
  type Signal,
} from '@angular/core';
import type { RteHeadingLevel } from '@comodeviaser/rte-core';
import { extractToc, type RteTocEntry } from '@comodeviaser/rte-core/html';
import {
  RTE_RENDER_LABELS,
  ɵinjectFragmentBase as injectFragmentBase,
  ɵmergeRenderLabels as mergeRenderLabels,
  type RteRenderLabels,
} from '@comodeviaser/rte-render';
import { buildTocTree, uniqueTocEntries, type RteTocNode } from './toc-tree';

// Reexportado daqui: só o entry `/toc` importa o `@comodeviaser/rte-core/html` (R1,
// Rulings 3 e 11).
export type { RteTocEntry } from '@comodeviaser/rte-core/html';

/**
 * Sumário a partir dos títulos do HTML, sem DOM (H11): `extractToc` do core,
 * `id` repetido → vale a primeira ocorrência, lista aninhada
 * `nav.rte-toc > ol.rte-toc__list > li.rte-toc__item > a.rte-toc__link`.
 * Sem entradas, nada é renderizado. O `href` usa a mesma base da H6.
 *
 * Fica no entry `@comodeviaser/rte-render/toc` (Ruling 11): no entry `.`, o FESM
 * parcial retinha o componente — e com ele o `htmlparser2` — numa página que
 * só usa `RteContent`.
 *
 * `<rte-toc [html]="c.renderedHtml()" [levels]="[2, 3]" />`
 */
@Component({
  selector: 'rte-toc',
  imports: [NgTemplateOutlet],
  templateUrl: './rte-toc.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rte-root' },
})
export class RteToc {
  /** HTML do qual os títulos são lidos; `null`/`undefined` = vazio. */
  readonly html = input<string | null | undefined>();
  /** Níveis de título incluídos (padrão `[2, 3]`). */
  readonly levels = input<readonly RteHeadingLevel[]>([2, 3]);
  /** Rótulos parciais; vencem o `provideRteRender` (H16). */
  readonly labels = input<Partial<RteRenderLabels> | undefined>();

  private readonly providedLabels = inject(RTE_RENDER_LABELS);
  private readonly fragmentBase = injectFragmentBase();

  /** Entradas exibidas (ids únicos, H11). */
  readonly entries: Signal<readonly RteTocEntry[]> = computed(() =>
    uniqueTocEntries(
      extractToc(this.html() ?? '', { levels: [...this.levels()] }),
    ),
  );

  /** @internal */
  protected readonly tree: Signal<readonly RteTocNode[]> = computed(() =>
    buildTocTree(this.entries()),
  );

  /** @internal */
  protected readonly effectiveLabels: Signal<RteRenderLabels> = computed(() =>
    mergeRenderLabels(this.providedLabels, this.labels()),
  );

  /**
   * `<base>#id`, ou `#id` com `fragmentLinks: 'keep'` (H6, H11).
   *
   * @internal
   */
  protected href(id: string): string {
    return (this.fragmentBase() ?? '') + '#' + id;
  }
}
