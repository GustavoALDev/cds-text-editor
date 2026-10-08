import { toSignal } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { NAV } from '../generated/nav';
import { SearchBox } from './search/search-box';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SearchBox],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class App {
  protected readonly nav = NAV;
  private readonly router = inject(Router);
  // Com `<base href>`, `href="#conteudo"` iria para a raiz da base (armadilha do X7): o *skip link*
  // aponta para a rota atual com o fragmento, e o `check-links` (X9) confere isso no HTML.
  protected readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url.split(/[?#]/)[0] || '/'),
      startWith(this.router.url.split(/[?#]/)[0] || '/'),
    ),
    { requireSync: true },
  );
}
