import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { RteSearchState } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import type { RteSearchLabels } from '../labels/types';
import { createSearchAnnouncement, searchPositionText } from './announce';

/**
 * Barra de busca e substituição (spec 05d1, K8–K10), interna: `role="search"`
 * entre a barra de ferramentas e o editável, no *chunk* `rte-search`. Os
 * comandos do core são chamados um por vez, nunca em `chain()` (ruling 16 do
 * ADR 0005). O dono (`RteEditor`) abre e fecha; aqui só se pede o fechamento.
 */
@Component({
  selector: 'rte-search',
  templateUrl: './rte-search.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteSearch {
  readonly editor = input.required<Editor>();
  readonly state = input.required<RteSearchState>();
  readonly labels = input.required<RteSearchLabels>();
  /** `false` com `readonly`: a substituição fica oculta e é recusada. */
  readonly canReplace = input.required<boolean>();
  /** Sobe a cada pedido de foco (`Mod-F`, `openSearch`): foca e seleciona o campo. */
  readonly focusTick = input.required<number>();
  /** Fechar (botão ou `Escape`): o dono limpa a busca e devolve o foco. */
  readonly closeRequest = output<void>();

  protected readonly glyphs = {
    previous: '↑',
    next: '↓',
    caseSensitive: 'Aa',
    wholeWord: 'ab',
    close: '×',
  } as const;
  protected readonly showReplace = signal(false);
  protected composing = false;
  protected readonly count = computed(() =>
    searchPositionText(this.state(), this.labels()),
  );
  protected readonly noMatches = computed(() => this.state().total === 0);
  protected readonly announcement = createSearchAnnouncement({
    state: this.state,
    labels: this.labels,
    view: inject(DOCUMENT).defaultView,
    zone: inject(NgZone),
  });

  private readonly queryInput =
    viewChild.required<ElementRef<HTMLInputElement>>('query');
  private readonly replaceInput =
    viewChild<ElementRef<HTMLInputElement>>('replacement');

  constructor() {
    // O campo mostra a consulta do editor (consulta inicial, carga externa);
    // fora de composição, para não desfazer o que o IME está montando.
    afterRenderEffect({
      write: () => {
        this.state();
        untracked(() => this.syncValue());
      },
    });
    // Pedido de foco: depois de gravar o valor, foca e seleciona o campo.
    afterRenderEffect({
      write: () => {
        this.focusTick();
        untracked(() => {
          const el = this.queryInput().nativeElement;
          this.syncValue();
          el.focus();
          el.select();
        });
      },
    });
  }

  private syncValue(): void {
    const el = this.queryInput().nativeElement;
    const query = this.state().query;
    if (!this.composing && el.value !== query) el.value = query;
  }

  private get live(): Editor | null {
    const editor = untracked(this.editor);
    return editor.isDestroyed ? null : editor;
  }

  protected onQueryInput(event: Event): void {
    if ((event as InputEvent).isComposing || this.composing) return;
    this.runQuery();
  }

  protected onQueryCompositionEnd(): void {
    this.composing = false;
    this.runQuery();
  }

  private runQuery(): void {
    this.live?.commands.setSearchQuery(this.queryInput().nativeElement.value);
  }

  protected toggleCase(): void {
    this.live?.commands.setSearchOptions({
      caseSensitive: !untracked(this.state).caseSensitive,
    });
  }

  protected toggleWord(): void {
    this.live?.commands.setSearchOptions({
      wholeWord: !untracked(this.state).wholeWord,
    });
  }

  protected next(): void {
    if (untracked(this.state).total > 0) this.live?.commands.nextSearchMatch();
  }

  protected previous(): void {
    if (untracked(this.state).total > 0) {
      this.live?.commands.previousSearchMatch();
    }
  }

  protected toggleReplace(): void {
    this.showReplace.update((v) => !v);
  }

  protected replaceOne(): void {
    this.replace(false);
  }

  protected replaceAll(): void {
    this.replace(true);
  }

  private replace(all: boolean): void {
    const editor = this.live;
    if (!editor || !untracked(this.canReplace)) return;
    if (untracked(this.state).total === 0) return;
    const text = this.replaceInput()?.nativeElement.value ?? '';
    const done = all
      ? editor.commands.replaceAllSearchMatches(text)
      : editor.commands.replaceSearchMatch(text);
    if (done) this.announcement.replaceSeq.update((n) => n + 1);
  }

  protected close(): void {
    this.closeRequest.emit();
  }

  /** `Enter` busca o próximo e `Shift+Enter` o anterior (K8); nunca durante IME. */
  protected onQueryKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.isComposing || this.composing) return;
    e.preventDefault();
    if (e.shiftKey) this.previous();
    else this.next();
  }

  /** No campo de substituição, `Enter` substitui o resultado ativo (K8). */
  protected onReplaceKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }
    if (e.isComposing) return;
    e.preventDefault();
    this.replaceOne();
  }

  /** `F3`/`Shift+F3` andam e `Escape` fecha, em toda a barra (K8). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
    if (event.key === 'Escape' && plain && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'F3' && plain) {
      event.preventDefault();
      if (event.shiftKey) this.previous();
      else this.next();
    }
  }
}
