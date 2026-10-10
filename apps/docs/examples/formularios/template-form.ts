// #region component
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule, type ValidationErrors } from '@angular/forms';
import { RteEditor } from '@comodeviaser/rte-angular';
import {
  RteMaxCharsValidator,
  RteMaxWordsValidator,
  RteNoEmptyHeadingsValidator,
  RteRequiredValidator,
  RteSafeLinksValidator,
} from '@comodeviaser/rte-angular/validators';
import { mensagem } from './erros.example';

@Component({
  selector: 'docs-template-form',
  imports: [
    RteEditor,
    FormsModule,
    RteRequiredValidator,
    RteMaxCharsValidator,
    RteMaxWordsValidator,
    RteSafeLinksValidator,
    RteNoEmptyHeadingsValidator,
  ],
  templateUrl: './template-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateForm {
  protected readonly max = 60;
  protected readonly text = signal('<p>Template Forms</p>');

  protected message(errors: ValidationErrors | null): string {
    return mensagem(errors);
  }

  // Um valor vindo do modelo (API, rascunho) pode passar do limite que a digitação respeita.
  protected fillTooLong(): void {
    this.text.set(`<p>${'texto '.repeat(20)}</p>`);
  }

  protected clear(): void {
    this.text.set('');
  }
}
// #endregion
