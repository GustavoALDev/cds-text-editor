import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página "Formulários" (esqueleto da tarefa 1 da spec 07b; o conteúdo vem das tarefas seguintes). */
@Component({
  selector: 'demo-forms-page',
  templateUrl: './forms.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsPage {}
