import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { form, FormField } from '@angular/forms/signals';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import {
  formatRteError,
  isRteValidationError,
  RteValidators,
  rteMaxChars,
  rteRequired,
} from '@cds/rte-angular/validators';
import { MaxCharsDirective } from './max-chars.directive';

/** Limite curto para o erro ser fácil de provocar (texto colado acima dele fica inválido). */
export const FORMS_MAX_CHARS = 60;

/** Página "Formulários": Signal Forms, Reactive Forms, Template Forms e `[(value)]`. */
@Component({
  selector: 'demo-forms-page',
  imports: [
    RteEditor,
    FormField,
    ReactiveFormsModule,
    FormsModule,
    MaxCharsDirective,
  ],
  templateUrl: './forms.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsPage {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly max = FORMS_MAX_CHARS;
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/angular/README.md#1-signal-forms-caminho-principal';

  // 1. Signal Forms
  readonly model = signal({ body: '<p>Signal Forms</p>' });
  readonly signalForm = form(this.model, (p) => {
    rteRequired(p.body);
    rteMaxChars(p.body, FORMS_MAX_CHARS);
  });
  protected readonly signalErrors = computed(() =>
    this.signalForm
      .body()
      .errors()
      .filter(isRteValidationError)
      .map((e) => formatRteError(e, this.labels))
      .filter((m) => m !== ''),
  );

  // 2. Reactive Forms
  readonly control = new FormControl('<p>Reactive Forms</p>', {
    nonNullable: true,
    validators: [
      RteValidators.required,
      RteValidators.maxChars(FORMS_MAX_CHARS),
    ],
  });

  // 3. Template Forms
  readonly templateValue = signal('<p>Template Forms</p>');

  // 4. [(value)] sem formulário
  readonly plainValue = signal('<p>Sem formulário</p>');

  /**
   * Põe, por código, um texto acima do limite nos três formulários. O editor barra a digitação
   * além do limite (`maxLength`), mas um valor vindo do modelo entra: a validação o reprova.
   */
  protected fillTooLong(): void {
    const html = `<p>${'x'.repeat(FORMS_MAX_CHARS + 20)}</p>`;
    this.model.set({ body: html });
    this.control.setValue(html);
    this.templateValue.set(html);
  }

  protected reactiveErrors(): string {
    return formatRteError(this.control.errors, this.labels);
  }

  protected templateErrors(errors: unknown): string {
    return formatRteError(
      errors as Record<string, unknown> | null,
      this.labels,
    );
  }
}
