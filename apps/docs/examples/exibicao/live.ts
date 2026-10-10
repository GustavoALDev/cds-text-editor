import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { RteEditor } from '@comodeviaser/rte-angular';
import { provideRteRender, RteContent } from '@comodeviaser/rte-render';
import { RteToc } from '@comodeviaser/rte-render/toc';
import { createSanitizer } from '@comodeviaser/rte-sanitizer';
import { editorOptions } from './display';

/**
 * Exemplo vivo da Exibição: o editor alimenta `[rteContent]` e o `rte-toc`. O texto inicial já
 * traz os ids `rt-<slug>` (o que o editor serializaria); ao editar um título, o id muda junto.
 */
@Component({
  selector: 'docs-display-live',
  imports: [RteEditor, RteContent, RteToc],
  providers: [provideRteRender({ sanitize: createSanitizer(editorOptions) })],
  templateUrl: './live.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class DisplayLive {
  protected readonly options = editorOptions;
  protected readonly html = signal(
    '<h2 id="rt-primeiros-passos">Primeiros passos</h2><p>Instale o pacote.</p>' +
      '<h2 id="rt-configuracao">Configuração</h2><p>Escolha os recursos.</p>' +
      '<h3 id="rt-barra">Barra</h3><p>Presets prontos.</p>',
  );
}
