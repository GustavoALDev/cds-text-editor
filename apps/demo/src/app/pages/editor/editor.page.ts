import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';

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
    '<h2>Olá, editor</h2><p>Digite <strong>/</strong> numa linha vazia para o menu de comandos, ' +
      'use <kbd>Ctrl</kbd>+<kbd>F</kbd> para buscar e selecione um trecho para ver o menu flutuante.</p>',
  );
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/angular/README.md#uso';
}
