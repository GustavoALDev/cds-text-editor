// #region component
import { Component, computed, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { RteEditor } from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';
import {
  formatRteError,
  isRteValidationError,
  rteMaxChars,
} from '@comodeviaser/rte-angular/validators';
import { DisplayExample } from './display-example';

@Component({
  selector: 'docs-form-example',
  imports: [RteEditor, FormField, DisplayExample],
  templateUrl: './form-example.html',
})
export class FormExample {
  protected readonly model = signal({
    body: '<p>Olá, <strong>mundo</strong>!</p>',
  });

  // O limite mede o texto que a pessoa vê, não a string HTML.
  protected readonly post = form(this.model, (path) => {
    rteMaxChars(path.body, 60);
  });

  protected readonly errors = computed(() =>
    this.post
      .body()
      .errors()
      .filter(isRteValidationError)
      .map((error) => formatRteError(error, RTE_LABELS_PT_BR)),
  );

  // O editor barra a digitação no limite; um valor vindo de fora (API, rascunho) pode passar dele.
  protected fillTooLong(): void {
    this.model.set({ body: `<p>${'texto '.repeat(20)}</p>` });
  }
}
// #endregion
