import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import type { RteDraftLabels } from '../labels/types';

/**
 * Aviso de restauração (S6): `section.rte-draft` com a data do rascunho e os
 * botões "Restaurar" e "Descartar". Nunca mostra o conteúdo. Não rouba o foco;
 * o anúncio é da região `aria-live` do `RteEditor`. Vive no *chunk*
 * `rte-draft`: o `RteEditor` o carrega num `@defer`.
 */
@Component({
  selector: 'rte-draft-prompt',
  templateUrl: './draft-prompt.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rte-draft-host' },
})
export class RteDraftPrompt {
  readonly savedAt = input.required<number>();
  readonly labels = input.required<RteDraftLabels>();
  /** Não `restore`/`discard` nativos: eventos próprios do aviso. */
  readonly restoreDraft = output<void>();
  readonly discardDraft = output<void>();
}
