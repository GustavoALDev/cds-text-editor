import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página "Início" (esqueleto da tarefa 1 da spec 07b; o conteúdo vem das tarefas seguintes). */
@Component({
  selector: 'demo-inicio-page',
  templateUrl: './inicio.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioPage {}
