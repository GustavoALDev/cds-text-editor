import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { RteAttrRule, RteLinkPolicy } from '@cds/rte-core';
import type { RteImageAlign } from '@cds/rte-core/extensions';
import type { RteDialogLabels } from '../labels/types';
import type { RteDialogController, RteDialogRequest } from './controller';
import type { RteMediaRules } from './media-rules';
import { RteImageForm } from './forms/image-form';
import { RteLangForm } from './forms/lang-form';
import { RteLinkForm } from './forms/link-form';
import { RteQuoteForm } from './forms/quote-form';
import { RteTableForm } from './forms/table-form';
import { RteVideoForm } from './forms/video-form';

let nextInstance = 0;

/**
 * Diálogos do editor (G2–G8), carregados por `@defer` no `RteEditor`: um
 * `<dialog>` nativo aberto com `showModal()` para o pedido do controlador,
 * com um componente de formulário (Signal Forms) por tipo, em `./forms/`.
 * Interno: nunca referenciado fora do `imports` do `RteEditor` e do bloco
 * `@defer` (senão o *chunk* some).
 */
@Component({
  selector: 'rte-dialogs',
  templateUrl: './rte-dialogs.html',
  imports: [
    RteLinkForm,
    RteLangForm,
    RteQuoteForm,
    RteTableForm,
    RteImageForm,
    RteVideoForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteDialogs {
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly linkPolicy = input<Partial<RteLinkPolicy> | undefined>(undefined);
  readonly langRule = input<RteAttrRule | null>(null);
  /** Regras das mídias (V4); `null` sem `media`. */
  readonly mediaRules = input<RteMediaRules | null>(null);
  /** Nomes dos provedores de *embed* ativos (dica do diálogo, V5). */
  readonly embedProviders = input<readonly string[]>([]);
  /** Nomes dos alinhamentos de imagem, de `floating` (V14). */
  readonly alignNames =
    input.required<Readonly<Record<RteImageAlign, string>>>();

  protected readonly prefix = `rte-dialog-${++nextInstance}`;
  protected readonly ids = { title: `${this.prefix}-title` };

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Último pedido preparado (o conteúdo fica até o próximo). */
  protected readonly active = signal<RteDialogRequest | null>(null);
  /** Id do pedido mostrado por último com `showModal()`. */
  private shownId = 0;
  private destroyed = false;

  protected readonly title = computed(() => {
    const req = this.active();
    const l = this.labels();
    switch (req?.kind) {
      case 'link':
        return req.mode === 'edit' ? l.linkEditTitle : l.linkInsertTitle;
      case 'lang':
        return req.mode === 'edit' ? l.langEditTitle : l.langTitle;
      case 'quoteAuthor':
        return l.quoteTitle;
      case 'table':
        return l.tableTitle;
      case 'image':
        return req.mode === 'edit' ? l.imageEditTitle : l.imageInsertTitle;
      case 'video':
        return req.mode === 'edit' ? l.videoEditTitle : l.videoInsertTitle;
      default:
        return '';
    }
  });

  constructor() {
    // Destruído (com o editor): fecha sem tratar o `close` como cancelamento
    // (o controlador descarta o pedido sem mover o foco, G5).
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.hide();
    });

    effect((onCleanup) => {
      const controller = this.controller();
      onCleanup(controller.register({ hide: () => this.hide() }));
    });

    // Pedido novo: o conteúdo (o formulário do tipo) passa a ser o dele.
    effect(() => {
      const req = this.controller().request();
      if (!req || req === untracked(this.active)) return;
      untracked(() => this.active.set(req));
    });

    // Depois do render: abre como modal e foca o primeiro campo (G4).
    afterRenderEffect({
      write: () => {
        const req = this.controller().request();
        if (!req || req.id === this.shownId || req !== this.active()) return;
        untracked(() => this.show(req));
      },
    });
  }

  /** `close` do `<dialog>` (Escape ou fechamento externo): cancelamento (G3). */
  protected onClose(): void {
    // Um `close` atrasado (no navegador vem numa tarefa) de um fechamento
    // anterior não cancela o diálogo reaberto nesse meio-tempo.
    if (this.destroyed || this.dialog().nativeElement.open) return;
    const req = untracked(this.controller().request);
    if (req && req.id === this.shownId) this.controller().cancel('cancelled');
  }

  private show(req: RteDialogRequest): void {
    this.shownId = req.id;
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector<HTMLInputElement>(
      '.rte-dialog__field input, .rte-dialog__field select',
    );
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
  }

  private hide(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }
}
