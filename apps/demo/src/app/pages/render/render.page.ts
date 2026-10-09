import { PlatformLocation } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import { provideRteRender, RteContent } from '@cds/rte-render';
import { RTE_RENDER_LABELS_PT_BR } from '@cds/rte-render/i18n';
import { RteToc } from '@cds/rte-render/toc';
import { createSanitizer } from '@cds/rte-sanitizer';
import { RENDER_OPTIONS } from './render-options';

/** Sanitizador da exibição: as mesmas opções do editor. */
export const RENDER_SANITIZE = createSanitizer(RENDER_OPTIONS);

/** Texto inicial do editor, com títulos para o sumário. */
export const RENDER_SAMPLE =
  '<h2 id="rt-introducao">Introdução</h2><p>Edite aqui: o artigo ao lado mostra o mesmo HTML sem carregar o editor.</p>' +
  '<h2 id="rt-detalhes">Detalhes</h2><p>Um <a href="https://example.com">link</a> e <strong>negrito</strong>.</p>' +
  '<h3 id="rt-subsecao">Subseção</h3><p>Mais um parágrafo.</p>';

/**
 * HTML bruto de exemplo, com marcação perigosa que a exibição remove. A imagem usa o caminho
 * absoluto sob a base do site (`/` no desenvolvimento, `/cds-text-editor/demo/` no Pages).
 */
export const unsafeSample = (base = '/'): string =>
  '<h2>Colado de fora</h2><p>Texto seguro.</p><script>alert(1)</script>' +
  `<img src="${base}exemplo.png" onerror="alert(2)" alt="Exemplo"><p onclick="alert(3)">Parágrafo.</p>`;

export const RENDER_UNSAFE_SAMPLE = unsafeSample();

/** Página "Exibição": o HTML do editor exibido por `[rteContent]` com sumário. */
@Component({
  selector: 'demo-render-page',
  imports: [RteEditor, RteContent, RteToc],
  providers: [provideRteRender({ sanitize: RENDER_SANITIZE })],
  templateUrl: './render.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderPage {
  protected readonly editorLabels = RTE_LABELS_PT_BR;
  protected readonly tocLabels = RTE_RENDER_LABELS_PT_BR;
  protected readonly options = RENDER_OPTIONS;
  protected readonly html = signal(RENDER_SAMPLE);
  protected readonly raw = signal(
    unsafeSample(inject(PlatformLocation).getBaseHrefFromDOM() || '/'),
  );
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/render/README.md';

  protected setRaw(event: Event): void {
    this.raw.set((event.target as HTMLTextAreaElement).value);
  }
}
