import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Rota sem editor (destino da navegação que destrói os editores). */
@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
