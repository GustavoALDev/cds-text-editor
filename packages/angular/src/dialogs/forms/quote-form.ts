import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  type FieldTree,
} from '@angular/forms/signals';
import type { RteDialogLabels } from '../../labels/types';
import { applyQuote } from '../apply';
import type { RteDialogController, RteDialogRequest } from '../controller';
import { fieldError, focusFirstInvalid } from '../forms';

/** Tamanho máximo de autor e cargo (G15; limite só da interface). */
const QUOTE_MAX = 200;

interface QuoteModel {
  author: string;
  role: string;
}

/** Autor e cargo atuais da citação do pedido (atributos de texto puro). */
function quoteValues(req: RteDialogRequest): QuoteModel {
  const $pos = req.doc.resolve(req.range.from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'rtPullquote') {
      return {
        author: String(node.attrs['author'] ?? ''),
        role: String(node.attrs['role'] ?? ''),
      };
    }
  }
  return { author: '', role: '' };
}

/** Formulário do diálogo de autor da citação (G15), filho do `RteDialogs`. */
@Component({
  selector: 'rte-quote-form',
  templateUrl: './quote-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteQuoteForm {
  readonly request = input.required<RteDialogRequest>();
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly idPrefix = input.required<string>();

  protected readonly ids = computed(() => ({
    author: `${this.idPrefix()}-quote-author`,
    role: `${this.idPrefix()}-quote-role`,
  }));

  private readonly model = signal<QuoteModel>({ author: '', role: '' });
  protected readonly form: FieldTree<QuoteModel> = form(
    this.model,
    (p) => {
      maxLength(p.author, QUOTE_MAX);
      maxLength(p.role, QUOTE_MAX);
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () => focusFirstInvalid([this.form.author, this.form.role]),
      },
    },
  );

  constructor() {
    // Pedido novo: valores atuais no formulário antes do render.
    effect(() => {
      const req = this.request();
      untracked(() => this.form().reset(quoteValues(req)));
    });
  }

  protected error(field: FieldTree<unknown>): string | null {
    return fieldError(field, this.labels());
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'quoteAuthor') return;
    const value = untracked(this.model);
    this.controller().apply((editor) => applyQuote(editor, req, value));
  }
}
