import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RteEditor } from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';

/** Limite de caracteres do exemplo (mede o texto, não o HTML). */
export const EDITOR_MAX_CHARS = 2000;

/** Página "Editor": o editor completo, com tudo que vem ligado por padrão. */
@Component({
  selector: 'demo-editor-page',
  imports: [RteEditor],
  templateUrl: './editor.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly maxChars = EDITOR_MAX_CHARS;
  protected readonly html = signal(
    '<h2 id="rt-ola-editor">Olá, editor</h2><p>Digite <strong>/</strong> numa linha vazia para o menu de comandos, ' +
      'use <code>Ctrl</code>+<code>F</code> para buscar e selecione um trecho para ver o menu flutuante.</p>',
  );
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md#uso';
}
