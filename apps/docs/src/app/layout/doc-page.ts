import { Title } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NAV } from '../../generated/nav';
import { DocHtml } from '../content/doc-html';
import { LiveExample } from '../content/live-example';
import type { PageData, PageExamples } from '../content/page';

/** Repositório (a 07c não muda pacotes); `TODO-AUTOR`: confirmar a organização final. */
const EDIT_BASE = 'https://github.com/GustavoALDev/cds-text-editor/edit/main/';

/** Página de conteúdo: título, sumário, segmentos, anterior/próximo e “editar esta página”. */
@Component({
  selector: 'docs-page',
  imports: [DocHtml, LiveExample, RouterLink],
  templateUrl: './doc-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class DocPage {
  /** Preenchido pelo resolver `page` (binding de dados da rota). */
  readonly page = input<PageData | null>(null);
  /** Componentes dos exemplos vivos da página (resolver `examples`). */
  readonly examples = input<PageExamples>({});
  /** Parâmetros da rota (`slug` ou `entry`), só para localizar a página na navegação. */
  readonly slug = input<string>();
  readonly entry = input<string>();

  private readonly title = inject(Title);

  protected readonly flat = NAV.flatMap((group) => group.items);
  protected readonly index = computed(() => {
    const id = this.slug() ? `guia/${this.slug()}` : `api/${this.entry()}`;
    return this.flat.findIndex((item) => item.path === id);
  });
  protected readonly previous = computed(() => this.flat[this.index() - 1]);
  protected readonly next = computed(() => this.flat[this.index() + 1]);
  protected readonly editUrl = computed(() => {
    const item = this.flat[this.index()];
    if (!item) return null;
    return item.path.startsWith('guia/')
      ? `${EDIT_BASE}apps/docs/content/${item.path}.md`
      : null;
  });
  protected readonly toc = computed(() =>
    (this.page()?.headings ?? []).filter((h) => h.depth <= 3),
  );

  constructor() {
    effect(() => {
      const page = this.page();
      if (page) this.title.setTitle(`${page.title} · cds-text-editor`);
    });
  }
}
