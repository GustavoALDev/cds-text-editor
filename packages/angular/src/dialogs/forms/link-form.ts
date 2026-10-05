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
  required,
  validate,
  type FieldTree,
} from '@angular/forms/signals';
import { normalizeHref, type RteLinkPolicy } from '@cds/rte-core';
import type { RteDialogLabels } from '../../labels/types';
import { applyLink, linkTargetPreserved, removeLink } from '../apply';
import type { RteDialogController, RteDialogRequest } from '../controller';
import { fieldError, focusFirstInvalid } from '../forms';
import { markAttrs } from './request-attrs';

interface LinkModel {
  url: string;
  text: string;
  newTab: boolean;
}

/** Valores de abertura do link: no modo editar, `href` e `target` da marca. */
function linkValues(req: RteDialogRequest): LinkModel {
  const attrs = req.mode === 'edit' ? markAttrs(req, 'link') : null;
  const href = attrs?.['href'];
  return {
    url: typeof href === 'string' ? href : '',
    text: '',
    newTab: attrs?.['target'] === '_blank',
  };
}

/** Formulário do diálogo de link (G9), filho do `RteDialogs`. */
@Component({
  selector: 'rte-link-form',
  templateUrl: './link-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteLinkForm {
  readonly request = input.required<RteDialogRequest>();
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly idPrefix = input.required<string>();
  readonly linkPolicy = input<Partial<RteLinkPolicy> | undefined>(undefined);

  protected readonly ids = computed(() => ({
    url: `${this.idPrefix()}-link-url`,
    text: `${this.idPrefix()}-link-text`,
    newTab: `${this.idPrefix()}-link-new-tab`,
  }));

  /** "Abrir em nova aba" só quando a política preserva o `target` (G9). */
  protected readonly newTabShown = computed(() =>
    linkTargetPreserved(this.linkPolicy()),
  );

  private readonly model = signal<LinkModel>({
    url: '',
    text: '',
    newTab: false,
  });
  protected readonly form: FieldTree<LinkModel> = form(
    this.model,
    (p) => {
      required(p.url);
      // A mesma política que criou o editor (G9): o que ela recusa não passa.
      validate(p.url, ({ value }) => {
        const url = value();
        return url !== '' && normalizeHref(url, this.linkPolicy()) === null
          ? { kind: 'rteLinkUrl' }
          : undefined;
      });
      required(p.text, { when: () => this.request().mode === 'insert' });
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () => focusFirstInvalid([this.form.url, this.form.text]),
      },
    },
  );

  constructor() {
    // Pedido novo: valores atuais no formulário antes do render.
    effect(() => {
      const req = this.request();
      untracked(() => this.form().reset(linkValues(req)));
    });
  }

  protected error(field: FieldTree<unknown>): string | null {
    return fieldError(field, this.labels());
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }

  protected remove(): void {
    const req = untracked(this.request);
    if (req.kind !== 'link' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeLink(editor, req));
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'link') return;
    const value = untracked(this.model);
    const policy = untracked(this.linkPolicy);
    this.controller().apply((editor) => applyLink(editor, req, value, policy));
  }
}
