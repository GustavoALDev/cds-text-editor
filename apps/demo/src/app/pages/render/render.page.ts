import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página "Exibição" (esqueleto da tarefa 1 da spec 07b; o conteúdo vem das tarefas seguintes). */
@Component({
  selector: 'demo-render-page',
  templateUrl: './render.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenderPage {}
