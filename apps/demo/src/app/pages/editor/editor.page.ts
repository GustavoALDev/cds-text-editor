import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página "Editor" (esqueleto da tarefa 1 da spec 07b; o conteúdo vem das tarefas seguintes). */
@Component({
  selector: 'demo-editor-page',
  templateUrl: './editor.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage {}
