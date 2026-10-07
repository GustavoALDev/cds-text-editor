import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  NgZone,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { RteSlashMenuState } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import { clipAncestors, readVisibleArea } from '../floating/anchor';
import { touches } from '../floating/place';
import { RteViewportWatch } from '../floating/viewport-watch';
import type { RteSlashMenuLabels } from '../labels/types';
import {
  positionFloating,
  RTE_MENU_MARGIN,
  type RteRect,
} from '../toolbar/position';
import { slashListId, slashOptionId } from './state';
import { RTE_SLASH_MENU, type RteSlashMenuApi } from './types';

/**
 * Lista do menu `/` (spec 05d1, K4, K5), interna: um `popover="manual"` na
 * posição do `/` (abaixo da linha; acima se não couber), que nunca recebe o
 * foco. O teclado é do core (C16); aqui só o clique (`mousedown` sem tirar o
 * foco do editável) e a posição. Passar o ponteiro não muda o ativo.
 */
@Component({
  selector: 'rte-slash-menu',
  templateUrl: './rte-slash-menu.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [{ provide: RTE_SLASH_MENU, useExisting: RteSlashMenu }],
})
export class RteSlashMenu implements RteSlashMenuApi {
  readonly ready = true as const;
  readonly editor = input.required<Editor>();
  readonly state = input.required<RteSlashMenuState>();
  readonly labels = input.required<RteSlashMenuLabels>();
  /** Identificador da instância do editor, para os ids estáveis (K4). */
  readonly instance = input.required<string>();

  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  private shown = false;
  private ancestors: HTMLElement[] | null = null;
  private placed = '';

  private readonly watch = new RteViewportWatch(
    this.document.defaultView,
    this.ngZone,
    () => (this.ancestors = null),
    () => this.apply(),
  );

  constructor() {
    afterRenderEffect({
      mixedReadWrite: () => {
        this.state();
        this.editor();
        untracked(() => this.apply());
      },
    });
    inject(DestroyRef).onDestroy(() => {
      this.watch.stop();
      this.hide();
    });
  }

  protected listId(): string {
    return slashListId(this.instance());
  }

  protected optionId(itemId: string): string {
    return slashOptionId(this.instance(), itemId);
  }

  /** Roda o item sem tirar o foco do editável (K5). */
  protected onMouseDown(event: MouseEvent, index: number): void {
    event.preventDefault();
    const editor = untracked(this.editor);
    if (!editor.isDestroyed) editor.commands.runSlashItem(index);
  }

  private apply(): void {
    const state = untracked(this.state);
    const editor = untracked(this.editor);
    const view = this.document.defaultView;
    if (
      !state.open ||
      !state.range ||
      state.items.length === 0 ||
      editor.isDestroyed ||
      !view
    ) {
      this.hide();
      this.watch.stop();
      return;
    }
    this.watch.start();
    const el = this.list()?.nativeElement;
    if (!el) return;
    const root = view.document.documentElement;
    const viewport = {
      width: root.clientWidth || view.innerWidth,
      height: root.clientHeight || view.innerHeight,
    };
    this.ancestors ??= clipAncestors(editor.view.dom);
    // A lista é `position: fixed` e pode passar da caixa do editável (a linha
    // do `/` costuma ser a última): só a janela e os ancestrais que cortam
    // limitam a área, não o próprio editável.
    const [first, ...rest] = this.ancestors;
    const visible: RteRect | null = first
      ? readVisibleArea(first, rest, viewport)
      : { top: 0, right: viewport.width, bottom: viewport.height, left: 0 };
    const anchor = editor.view.coordsAtPos(state.range.from);
    if (!visible || !touches(anchor, visible)) {
      this.hide();
      return;
    }
    if (!this.shown) {
      el.style.setProperty('left', '0px');
      el.style.setProperty('top', '0px');
      this.placed = '';
      el.showPopover();
      this.shown = true;
    }
    const menu = { width: el.offsetWidth, height: el.offsetHeight };
    const p = positionFloating({
      anchor,
      visible,
      menu,
      viewport,
      prefer: 'below',
    });
    // Alinhada ao `/` (não centrada na âncora, que tem largura zero).
    const left = Math.round(
      Math.max(
        RTE_MENU_MARGIN,
        Math.min(anchor.left, viewport.width - RTE_MENU_MARGIN - menu.width),
      ),
    );
    const top = Math.round(p.top);
    const key = `${left},${top}`;
    if (key !== this.placed) {
      this.placed = key;
      el.style.setProperty('left', `${left}px`);
      el.style.setProperty('top', `${top}px`);
    }
  }

  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    const el = this.list()?.nativeElement;
    if (el?.isConnected) el.hidePopover();
  }
}
