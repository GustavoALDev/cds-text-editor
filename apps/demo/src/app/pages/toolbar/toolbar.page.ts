import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página "Barra" (esqueleto da tarefa 1 da spec 07b; o conteúdo vem das tarefas seguintes). */
@Component({
  selector: 'demo-toolbar-page',
  templateUrl: './toolbar.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarPage {}
