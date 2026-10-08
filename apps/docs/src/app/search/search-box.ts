import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { Router } from '@angular/router';
import { search, type SearchEntry } from './search-logic';

/**
 * Caixa de busca offline (spec 07c, X8): *combobox* ARIA com `listbox`. O índice (`search-index.json`,
 * mesma origem) só é buscado no primeiro foco. Sem JS o campo fica oculto (`hidden`, removido no cliente).
 */
@Component({
  selector: 'docs-search-box',
  templateUrl: './search-box.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { '(document:keydown)': 'onDocumentKey($event)' },
})
export class SearchBox {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly input =
    viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly ready = signal(false);
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly index = signal<readonly SearchEntry[]>([]);
  protected readonly failed = signal(false);

  protected readonly results = computed(() =>
    search(this.index(), this.query()),
  );
  protected readonly expanded = computed(
    () => this.open() && this.results().length > 0,
  );
  protected readonly status = computed(() => {
    if (this.failed()) return 'Busca indisponível.';
    if (!this.open() || !this.query().trim() || this.index().length === 0)
      return '';
    const n = this.results().length;
    return n === 0
      ? 'Nenhum resultado.'
      : n === 1
        ? '1 resultado.'
        : `${n} resultados.`;
  });
  protected readonly activeId = computed(() =>
    this.expanded() && this.active() >= 0 ? this.optionId(this.active()) : null,
  );

  private loading: Promise<void> | null = null;

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }

  protected optionId(i: number): string {
    return `docs-search-option-${i}`;
  }

  /** Busca o índice uma vez (no primeiro foco); em falha permite nova tentativa. */
  protected load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const url = new URL('search-index.json', this.document.baseURI);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.index.set((await res.json()) as SearchEntry[]);
        this.failed.set(false);
      } catch {
        this.loading = null;
        this.failed.set(true);
      }
    })();
    return this.loading;
  }

  protected onFocus(): void {
    void this.load();
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.open.set(true);
    this.active.set(-1);
    void this.load();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (n === 0) return;
        this.open.set(true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = this.active() + step;
        this.active.set(next < 0 ? n - 1 : next >= n ? 0 : next);
        return;
      }
      case 'Enter': {
        if (!this.expanded()) return;
        event.preventDefault();
        this.go(this.results()[Math.max(this.active(), 0)]);
        return;
      }
      case 'Escape': {
        if (this.open()) {
          event.preventDefault();
          this.open.set(false);
          this.active.set(-1);
        } else if (this.query()) {
          this.query.set('');
        }
        return;
      }
    }
  }

  protected onBlur(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  /** O botão do resultado não pode tirar o foco do campo antes do clique. */
  protected hold(event: Event): void {
    event.preventDefault();
  }

  protected go(entry: SearchEntry | undefined): void {
    if (!entry) return;
    this.open.set(false);
    this.active.set(-1);
    this.query.set('');
    this.input().nativeElement.value = '';
    void this.router.navigate(['/', ...entry.page.split('/')], {
      fragment: entry.anchor || undefined,
    });
  }

  protected onDocumentKey(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (isEditable(event.target)) return;
    event.preventDefault();
    this.input().nativeElement.focus();
  }
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    el.isContentEditable ||
    el.closest?.('[contenteditable=""],[contenteditable="true"]') != null
  );
}
