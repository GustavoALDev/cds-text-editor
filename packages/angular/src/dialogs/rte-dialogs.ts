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
import type { RteAttrRule, RteLinkPolicy } from '@comodeviaser/rte-core';
import type { RteImageAlign } from '@comodeviaser/rte-core/extensions';
import type { RteDialogLabels } from '../labels/types';
import type { RteDialogUploads } from '../upload/dialog-port';
import type { RteDialogController, RteDialogRequest } from './controller';
import { RteDeferFailed } from './defer-failed';
import type { RteMediaRules } from './media-rules';
import { RteLangForm } from './forms/lang-form';
import { RteLinkForm } from './forms/link-form';
import { RteQuoteForm } from './forms/quote-form';
import { RteTableForm } from './forms/table-form';
// Só em `imports`: o `@defer` do template põe a classe no *chunk*
// `rte-media-forms` (05c2a E2).
import { RteMediaForms } from './rte-media-forms';
import { isMediaKind } from './types';

let nextInstance = 0;

/**
 * Diálogos do editor (G2–G8), carregados por `@defer` no `RteEditor`: um
 * `<dialog>` nativo aberto com `showModal()` para o pedido do controlador,
 * com um componente de formulário (Signal Forms) por tipo, em `./forms/`.
 * Os de mídia (imagem, vídeo, *embed*) vêm de um `@defer` próprio
 * (`RteMediaForms`, 05c2a E2): o `showModal()` espera o formulário chegar.
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
    RteMediaForms,
    RteDeferFailed,
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
  /** Porta do envio (05c2a E14); `null` sem adaptador. */
  readonly uploads = input<RteDialogUploads | null>(null);

  protected readonly prefix = `rte-dialog-${++nextInstance}`;
  protected readonly ids = { title: `${this.prefix}-title` };

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Último pedido preparado (o conteúdo fica até o próximo). */
  protected readonly active = signal<RteDialogRequest | null>(null);
  protected readonly isMediaKind = isMediaKind;
  /**
   * O `RteMediaForms` renderizou (E2, Ruling 5). O bloco fica dentro do
   * `@if (active())`, que nunca volta a `null`, e fora do `@switch`: depois
   * de carregado, a instância é sempre a mesma e trocar de tipo só recria o
   * formulário interno, no mesmo ciclo de detecção (antes do `show`).
   */
  protected readonly mediaReady = signal(false);
  /** `@error` do bloco de mídia: descarta o pedido; só a mídia fica recusada. */
  protected readonly onMediaFailed = () => this.controller().failMedia();
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
      case 'embed':
        return req.mode === 'edit' ? l.embedEditTitle : l.embedInsertTitle;
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
        // Pedido de mídia: só depois que o formulário existe (E2).
        if (isMediaKind(req.kind) && !this.mediaReady()) return;
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
