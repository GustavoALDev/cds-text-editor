// #region component
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { RteEditor } from '@cds/rte-angular';
import { RteValidators } from '@cds/rte-angular/validators';
import { mensagem } from './erros.example';

@Component({
  selector: 'docs-reactive-form',
  imports: [RteEditor, ReactiveFormsModule],
  templateUrl: './reactive-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReactiveForm {
  protected readonly max = 60;

  // RteValidators mede o texto que a pessoa vê, não a string HTML.
  protected readonly control = new FormControl('<p>Reactive Forms</p>', {
    nonNullable: true,
    validators: [
      RteValidators.required,
      RteValidators.maxChars(this.max),
      RteValidators.maxWords(50),
      RteValidators.safeLinks(),
      RteValidators.noEmptyHeadings(),
    ],
  });

  protected readonly error = toSignal(
    this.control.statusChanges.pipe(map(() => mensagem(this.control.errors))),
    { initialValue: mensagem(this.control.errors) },
  );

  protected fillTooLong(): void {
    this.control.setValue(`<p>${'texto '.repeat(20)}</p>`);
  }

  protected clear(): void {
    this.control.setValue('');
  }
}
// #endregion
