import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { RteEditor, type RteUploadAdapter } from '@comodeviaser/rte-angular';

const FIGURE = (src: string, alt: string) =>
  `<figure class="rt-figure rt-figure--center"><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></figure>`;

/** Documento inicial: duas imagens, para remover uma e salvar (N40). */
const INITIAL = `<p>Salvar</p>${FIGURE('/e2e.png', 'Primeira')}${FIGURE('/e2e.png?b', 'Segunda')}`;

/** O que o teste lê e comanda (sem passar pela ponte `rteE2e`). */
interface DraftSaveProbe {
  /** Endereços entregues ao `onMediaRemoved`, uma lista por chamada. */
  removed: string[][];
  /** Libera o envio lento em curso. */
  release(): void;
}

declare global {
  interface Window {
    __draftSave?: DraftSaveProbe;
  }
}

/** N40 (spec 05c2b): `warnOnUnsaved`, `markSaved(html)` e `onMediaRemoved`. */
@Component({
  selector: 'app-draft-save',
  imports: [RteEditor],
  templateUrl: './draft-save.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftSavePage {
  protected readonly value = signal(INITIAL);
  protected readonly editor = viewChild.required(RteEditor);

  private gate: (() => void) | null = null;
  private readonly probe: DraftSaveProbe = {
    removed: [],
    release: () => this.gate?.(),
  };

  protected readonly upload = {
    adapter: {
      // Envio lento: só termina quando o teste libera.
      uploadImage: () =>
        new Promise<{ url: string }>((resolve) => {
          this.gate = () => resolve({ url: '/e2e.png?uploaded' });
        }),
      onMediaRemoved: (urls: readonly string[]) => {
        this.probe.removed.push([...urls]);
      },
    } satisfies RteUploadAdapter,
  };

  constructor() {
    // Só no navegador: a página é pré-renderizada.
    afterNextRender(() => {
      window.__draftSave = this.probe;
    });
  }

  protected save(): void {
    this.editor().markSaved(this.value());
  }

  protected send(): void {
    this.editor().uploadFiles([
      new File(['x'], 'lento.png', { type: 'image/png' }),
    ]);
  }
}
