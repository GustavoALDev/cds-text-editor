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
  required,
  type FieldTree,
} from '@angular/forms/signals';
import { applyEmbed, removeMediaAt } from '../apply-media';
import type { RteDialogRequest } from '../controller';
import { focusFirstInvalid, text } from '../form-helpers';
import { embedUrlValidator } from '../media-validate';
import { RteDialogFormBase } from './form-base';

/** Legenda do *embed*: até 300 caracteres, limite da UI (V6). */
const CAPTION_MAX = 300;

interface EmbedModel {
  url: string;
  caption: string;
}

/** Valores de abertura: inserir → vazio; editar → a legenda do nó. */
function embedValues(req: RteDialogRequest): EmbedModel {
  const node = req.mode === 'edit' ? req.doc.nodeAt(req.range.from) : null;
  if (!node || node.type.name !== 'rtEmbed') return { url: '', caption: '' };
  return { url: '', caption: text(node.attrs['caption']) };
}

/**
 * Formulário do diálogo de *embed* (V5), filho do `RteDialogs`. A URL é
 * validada pelo comando do core (`can().setEmbed`, pré-voo 5); no modo
 * editar ela aparece só para leitura (o `src` do nó) e só a legenda muda.
 */
@Component({
  selector: 'rte-embed-form',
  templateUrl: './embed-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteEmbedForm extends RteDialogFormBase {
  /** Nomes dos provedores ativos (dica, V5). */
  readonly providers = input<readonly string[]>([]);

  protected readonly ids = computed(() => {
    const p = this.idPrefix();
    return {
      url: `${p}-embed-url`,
      caption: `${p}-embed-caption`,
    };
  });

  protected readonly editing = computed(() => this.request().mode === 'edit');

  /** `src` do nó no modo editar (o endereço montado pelo core). */
  protected readonly src = computed(() => {
    const req = this.request();
    const node = req.mode === 'edit' ? req.doc.nodeAt(req.range.from) : null;
    return node?.type.name === 'rtEmbed' ? text(node.attrs['src']) : '';
  });

  private readonly model = signal<EmbedModel>({ url: '', caption: '' });
  protected readonly form: FieldTree<EmbedModel> = form(
    this.model,
    (p) => {
      required(p.url, { when: () => !this.editing() });
      embedUrlValidator(p.url, () => this.controller().editor());
      maxLength(p.caption, CAPTION_MAX);
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () => focusFirstInvalid([this.form.url, this.form.caption]),
      },
    },
  );

  constructor() {
    super();
    // Pedido novo: valores atuais no formulário antes do render.
    effect(() => {
      const req = this.request();
      untracked(() => this.form().reset(embedValues(req)));
    });
  }

  protected remove(): void {
    const req = untracked(this.request);
    if (req.kind !== 'embed' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeMediaAt(editor, req));
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'embed') return;
    const value = untracked(this.model);
    this.controller().apply((editor) => applyEmbed(editor, req, value));
  }
}
