import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import type { RteUploadLabels } from '../labels/types';
import { shortName } from './short-name';
import type { RteUploadStatus } from './types';

interface TrayItem {
  readonly id: string;
  /** Nome inteiro: `title` e nomes acessíveis. */
  readonly name: string;
  /** Nome cortado em 100 caracteres + `…` (E8). */
  readonly shown: string;
  readonly queued: boolean;
  /** `null` = indeterminado (sem `value`). */
  readonly progress: number | null;
}

/**
 * Bandeja de envios (E8, pré-voo 15): fora do editável, depois dele, dentro
 * da moldura. Por envio, o nome (texto), um `<progress>` com nome acessível e
 * o botão de cancelar. Quando o item com o foco sai (cancelado, concluído,
 * com erro ou abortado), o foco vai ao botão seguinte, senão ao anterior,
 * senão ao editável (`focusEditor`, WCAG 2.4.3; Ruling 31), nunca ao `body`.
 * Fica montada depois do primeiro envio (sem itens, não mostra nada): assim
 * ela mesma devolve o foco quando a lista esvazia. Vive no *chunk*
 * `rte-upload` (Ruling 28): o `RteEditor` a carrega num `@defer`.
 */
@Component({
  selector: 'rte-upload-tray',
  templateUrl: './upload-tray.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class RteUploadTray {
  readonly uploads = input.required<readonly RteUploadStatus[]>();
  readonly labels = input.required<RteUploadLabels>();
  /** Pedido de cancelamento do envio `id` (não `cancel`: evento nativo). */
  readonly cancelUpload = output<string>();
  /** Sem outro botão para focar: o foco volta ao editável. */
  readonly focusEditor = output<void>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly doc = inject(DOCUMENT);
  /** Envio cujo botão tem (ou acabou de pedir) o foco. */
  private focused: string | null = null;
  /** Ids mostrados no último render, na ordem. */
  private shown: readonly string[] = [];

  protected readonly items = computed<readonly TrayItem[]>(() =>
    this.uploads().map((u) => ({
      id: u.id,
      name: u.fileName,
      shown: shortName(u.fileName),
      queued: u.state === 'queued',
      progress: u.state === 'queued' ? null : u.progress,
    })),
  );

  constructor() {
    afterRenderEffect({
      write: () => {
        const ids = this.items().map((i) => i.id);
        this.keepFocus(ids);
        this.shown = ids;
      },
    });
  }

  /** `Enter` no botão: cancela uma vez (sem o clique sintetizado). */
  protected onKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    event.preventDefault();
    this.onCancel(id);
  }

  protected onCancel(id: string): void {
    // o foco segue a intenção, mesmo num motor que não foca o botão no clique
    this.focused = id;
    this.cancelUpload.emit(id);
  }

  protected onFocusIn(event: FocusEvent): void {
    const target = event.target;
    this.focused =
      target instanceof HTMLElement
        ? (target.closest<HTMLElement>('button.rte-uploads__cancel')?.dataset[
            'rteUpload'
          ] ?? null)
        : null;
  }

  /** Saída para fora da bandeja; sem destino (remoção do botão), mantém. */
  protected onFocusOut(event: FocusEvent): void {
    const to = event.relatedTarget;
    if (to instanceof Node && !this.host.contains(to)) this.focused = null;
  }

  /**
   * O item focado saiu da lista: se o foco caiu no `body` (o botão foi
   * removido), vai ao botão seguinte que ficou, senão ao anterior, senão ao
   * editável. Foco já em outro lugar fica onde está.
   */
  private keepFocus(ids: readonly string[]): void {
    const gone = this.focused;
    if (gone === null || ids.includes(gone)) return;
    this.focused = null;
    const active = this.doc.activeElement;
    if (active && active !== this.doc.body && active.isConnected) return;
    const i = this.shown.indexOf(gone);
    const kept = (id: string) => ids.includes(id);
    const target =
      this.shown.slice(i + 1).find(kept) ??
      this.shown.slice(0, Math.max(i, 0)).reverse().find(kept);
    if (target === undefined) {
      this.focusEditor.emit();
      return;
    }
    [
      ...this.host.querySelectorAll<HTMLButtonElement>(
        'button.rte-uploads__cancel',
      ),
    ]
      .find((b) => b.dataset['rteUpload'] === target)
      ?.focus();
  }
}
