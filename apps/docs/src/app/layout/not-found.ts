import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'docs-not-found',
  imports: [RouterLink],
  template: `
    <h1>Página não encontrada</h1>
    <p>
      O endereço não existe nesta documentação.
      <a routerLink="/guia/inicio-rapido">Ir para o início rápido</a>.
    </p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class NotFound {}
