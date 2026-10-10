import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import type { RteImageAlign } from '@comodeviaser/rte-core/extensions';
import type { RteDialogLabels } from '../labels/types';
import type { RteDialogUploads } from '../upload/dialog-port';
import type { RteDialogController, RteDialogRequest } from './controller';
import { RteEmbedForm } from './forms/embed-form';
import { RteImageForm } from './forms/image-form';
import { RteVideoForm } from './forms/video-form';
import type { RteMediaRules } from './media-rules';

/**
 * Formulários de imagem, vídeo e *embed* (05c2a E2), num `@defer` próprio
 * dentro do `<dialog>` do `RteDialogs` (*chunk* `rte-media-forms`): link,
 * idioma, citação e tabela não pagam pela mídia. Entradas todas opcionais: o
 * bloco só de pré-carga do `RteEditor` (`@defer (when false; prefetch on
 * idle)`) o declara sem entradas e nunca renderiza. Interno: referenciado só
 * nos `imports`/`@defer` do `RteDialogs` e do `RteEditor` (senão o *chunk*
 * some).
 */
@Component({
  selector: 'rte-media-forms',
  templateUrl: './rte-media-forms.html',
  imports: [RteImageForm, RteVideoForm, RteEmbedForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteMediaForms {
  readonly request = input<RteDialogRequest | null>(null);
  readonly controller = input<RteDialogController | null>(null);
  readonly labels = input<RteDialogLabels | null>(null);
  readonly idPrefix = input('');
  /** Regras das mídias (V4); `null` sem `media`. */
  readonly mediaRules = input<RteMediaRules | null>(null);
  /** Nomes dos provedores de *embed* ativos (dica do diálogo, V5). */
  readonly embedProviders = input<readonly string[]>([]);
  /** Nomes dos alinhamentos de imagem, de `floating` (V14). */
  readonly alignNames = input<Readonly<Record<RteImageAlign, string>> | null>(
    null,
  );
  /** Porta do envio (05c2a E14); `null` sem adaptador. */
  readonly uploads = input<RteDialogUploads | null>(null);

  /**
   * Primeiro render feito: o `RteDialogs` só chama `showModal()` de um pedido
   * de mídia depois dele (o formulário existe, E2).
   */
  readonly ready = output<void>();

  constructor() {
    afterNextRender(() => this.ready.emit());
  }
}
