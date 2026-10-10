import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { RteEditor, type RteUploadConfig } from '@comodeviaser/rte-angular';

/** O que o teste lê e comanda na re-hospedagem (N41). */
interface PasteExternalProbe {
  /** Endereços entregues ao `registerExternal`. */
  registered: string[];
  /** Libera o `registerExternal` em curso (a mais antiga primeiro). */
  release(): void;
}

declare global {
  interface Window {
    __pasteExternal?: PasteExternalProbe;
  }
}

/** N41 (spec 05c2b): colagem externa (URL → *embed*; imagem re-hospedada). */
@Component({
  selector: 'app-paste-external',
  imports: [RteEditor],
  templateUrl: './paste-external.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasteExternalPage {
  protected readonly value = signal('<p></p><p>Texto</p>');

  private readonly gates: (() => void)[] = [];
  private readonly probe: PasteExternalProbe = {
    registered: [],
    release: () => this.gates.shift()?.(),
  };

  protected readonly upload: RteUploadConfig = {
    rehostExternal: true,
    adapter: {
      uploadImage: () => Promise.reject(new Error('sem envio de arquivos')),
      // Só termina quando o teste libera; devolve uma imagem própria.
      registerExternal: (url) =>
        new Promise<{ url: string }>((resolve) => {
          this.probe.registered.push(url);
          this.gates.push(() => resolve({ url: '/e2e.png?rehosted' }));
        }),
    },
  };

  constructor() {
    // Só no navegador: a página é pré-renderizada.
    afterNextRender(() => {
      window.__pasteExternal = this.probe;
    });
  }
}
