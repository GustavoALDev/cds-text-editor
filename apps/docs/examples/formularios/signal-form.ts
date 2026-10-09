// #region signal
import { Component, computed, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import {
  formatRteError,
  isRteValidationError,
  rteMaxChars,
  rteNoEmptyHeadings,
  rteRequired,
  rteSafeLinks,
} from '@cds/rte-angular/validators';

@Component({
  selector: 'docs-signal-form',
  imports: [RteEditor, FormField],
  template: `
    <rte-editor [formField]="post.body" ariaLabel="Texto do artigo" />
    <p aria-live="polite">{{ messages().join(' ') }}</p>
  `,
})
export class SignalForm {
  protected readonly model = signal({ body: '', views: 0 });

  protected readonly post = form(this.model, (path) => {
    rteRequired(path.body);
    rteMaxChars(path.body, 5000); // o limite também barra a digitação no editor
    rteSafeLinks(path.body);
    rteNoEmptyHeadings(path.body);
    // @ts-expect-error os validadores de texto só aceitam campos string: `views` é number
    rteMaxChars(path.views, 10);
  });

  protected readonly messages = computed(() =>
    this.post
      .body()
      .errors()
      .filter(isRteValidationError)
      .map((error) => formatRteError(error, RTE_LABELS_PT_BR)),
  );
}
// #endregion
