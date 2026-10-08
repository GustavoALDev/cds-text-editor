import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página "Arquivos" (esqueleto da tarefa 1 da spec 07b; o conteúdo vem das tarefas seguintes). */
@Component({
  selector: 'demo-files-page',
  templateUrl: './files.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesPage {}
