import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
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
 * o botão de cancelar; depois de cancelar, o foco vai ao botão seguinte,
 * senão ao anterior, senão ao editável (`focusEditor`, WCAG 2.4.3). Vive no
 * *chunk* `rte-upload` (Ruling 28): o `RteEditor` a carrega num `@defer`.
 */
@Component({
  selector: 'rte-upload-tray',
  templateUrl: './upload-tray.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteUploadTray {
  readonly uploads = input.required<readonly RteUploadStatus[]>();
  readonly labels = input.required<RteUploadLabels>();
  /** Pedido de cancelamento do envio `id` (não `cancel`: evento nativo). */
  readonly cancelUpload = output<string>();
  /** Sem outro botão para focar: o foco volta ao editável. */
  readonly focusEditor = output<void>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly items = computed<readonly TrayItem[]>(() =>
    this.uploads().map((u) => ({
      id: u.id,
      name: u.fileName,
      shown: shortName(u.fileName),
      queued: u.state === 'queued',
      progress: u.state === 'queued' ? null : u.progress,
    })),
  );

  /** `Enter` no botão: cancela uma vez (sem o clique sintetizado). */
  protected onKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    event.preventDefault();
    this.onCancel(id);
  }

  protected onCancel(id: string): void {
    const list = this.uploads();
    const i = list.findIndex((u) => u.id === id);
    if (i < 0) return;
    const next = list[i + 1]?.id ?? list[i - 1]?.id ?? null;
    if (next === null) {
      // a bandeja some com o último envio: o foco vai antes ao editável
      this.focusEditor.emit();
      this.cancelUpload.emit(id);
      return;
    }
    this.cancelUpload.emit(id);
    afterNextRender(
      {
        write: () => {
          const button = [
            ...this.host.querySelectorAll<HTMLButtonElement>(
              'button.rte-uploads__cancel',
            ),
          ].find((b) => b.dataset['rteUpload'] === next);
          button?.focus();
        },
      },
      { injector: this.injector },
    );
  }
}
