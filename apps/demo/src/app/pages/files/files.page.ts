import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import {
  RteEditor,
  type RteMediaChange,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import { httpUploadAdapter } from '@cds/rte-angular/upload';
import { loadDemoConfig, type UploadMode } from '../../upload/demo-config';
import { createSimulatedAdapter } from '../../upload/simulated-adapter';

const REASONS: Record<RteUploadErrorEvent['reason'], string> = {
  type: 'tipo de arquivo não aceito',
  size: 'arquivo grande demais',
  count: 'arquivos demais de uma vez',
  network: 'falha de rede',
  server: 'o servidor recusou ou falhou',
  response: 'resposta do servidor inválida',
  unavailable: 'o editor não estava disponível',
};

/** Texto anunciado quando um envio falha (o nome do arquivo entra só como texto). */
export function describeUploadError(event: RteUploadErrorEvent): string {
  return `Falha ao enviar ${event.fileName}: ${REASONS[event.reason]}.`;
}

/** Página "Arquivos": envio simulado (padrão) ou real, conforme `demo-config.json`. */
@Component({
  selector: 'demo-files-page',
  imports: [RteEditor],
  templateUrl: './files.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesPage {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/angular/README.md';
  protected readonly html = signal(
    '<p>Insira uma imagem para testar o envio.</p>',
  );
  protected readonly slow = signal(false);
  protected readonly fail = signal(false);
  protected readonly status = signal('');
  /** Vale o padrão no prerender; no navegador o `demo-config.json` troca o modo. */
  protected readonly mode = signal<UploadMode>('simulated');
  /** Token do servidor local desta execução (vem do `demo-config.json`, não do bundle). */
  private authToken = '';
  /** Trocar o modo recria o editor (a configuração de envio é lida por referência). */
  protected readonly modes = computed(() => [this.mode()]);

  private readonly editor = viewChild(RteEditor);

  private readonly simulatedConfig: RteUploadConfig = {
    adapter: createSimulatedAdapter({
      slow: () => this.slow(),
      fail: () => this.fail(),
    }),
  };
  private readonly serverConfig: RteUploadConfig = {
    adapter: httpUploadAdapter({
      endpoint: '/upload',
      withCredentials: true,
      headers: async () => {
        const response = await fetch('/csrf', { credentials: 'include' });
        const { token } = (await response.json()) as { token: string };
        return {
          Authorization: `Bearer ${this.authToken}`,
          'X-CSRF-Token': token,
        };
      },
    }),
  };
  protected readonly uploadConfig = computed(() =>
    this.mode() === 'server' ? this.serverConfig : this.simulatedConfig,
  );

  constructor() {
    afterNextRender(() => {
      void loadDemoConfig().then((config) => {
        this.authToken = config.authToken ?? '';
        this.mode.set(config.upload);
      });
    });
  }

  protected onError(event: RteUploadErrorEvent): void {
    this.status.set(describeUploadError(event));
  }

  protected onMedia(change: RteMediaChange): void {
    if (change.added.length) {
      this.status.set(`Imagem inserida: ${change.added.at(-1)}`);
    }
  }

  protected cancelAll(): void {
    this.editor()?.cancelAllUploads();
    this.status.set('Envios cancelados.');
  }
}
