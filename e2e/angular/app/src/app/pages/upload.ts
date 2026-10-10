import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
  type Signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  NgModel,
  ReactiveFormsModule,
  type ValidationErrors,
} from '@angular/forms';
import {
  disabled,
  form,
  FormField,
  hidden,
  readonly,
} from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import {
  RteEditor,
  type RteEditorConfig,
  type RteLabels,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@comodeviaser/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@comodeviaser/rte-angular/i18n';
import {
  formatRteError,
  rteImagesHaveAlt,
  RteImagesHaveAltValidator,
  rteUploadsFinished,
  RteUploadsFinishedValidator,
} from '@comodeviaser/rte-angular/validators';
import {
  E2eBridge,
  NO_FORM_STATE,
  type RteE2eHandle,
  type RteE2eLang,
  type RteE2eUploadMode,
} from '../e2e-bridge';
import { uploadConfig } from './upload-config';

const LABELS: Record<RteE2eLang, RteLabels> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

const OPTIONS: RteEditorConfig = {
  features: { media: true },
  allowRelativeMedia: true,
};

/** Editores da página que trocam `[upload]` pela ponte. */
type Live = 'upload' | 'upload-reactive' | 'upload-template';
type PageId = Live | 'upload-none';

/** Uma entrada por erro do `control.errors` (cada uma formatável sozinha). */
function splitErrors(errors: ValidationErrors | null): ValidationErrors[] {
  return Object.entries(errors ?? {}).map(([k, v]) => ({ [k]: v }));
}

/**
 * N34–N38 (spec 05c2a, E25): editores com o envio do provider da rota em
 * Signal Forms (`upload`, barra `full`), Reactive Forms (`upload-reactive`) e
 * `ngModel` (`upload-template`), e o `upload-none` (`[upload]="null"`). Os
 * três formulários têm `rteUploadsFinished` + `rteImagesHaveAlt` (Tarefa 11,
 * N37): funções no Signal Forms, diretivas no Reactive e no `ngModel`; a
 * página mostra as mensagens de cada um por `formatRteError`.
 */
@Component({
  selector: 'app-upload',
  imports: [
    RteEditor,
    FormField,
    ReactiveFormsModule,
    FormsModule,
    RteUploadsFinishedValidator,
    RteImagesHaveAltValidator,
  ],
  templateUrl: './upload.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabels => LABELS[this.bridge.lang()];
  protected readonly options = OPTIONS;
  private readonly preview =
    inject(ActivatedRoute).snapshot.data['preview'] === true;

  protected readonly model = signal({ body: '<p>Upload here</p>' });
  /** O editor do Signal Forms para os validadores (ausente antes da vista). */
  private readonly mainRef = viewChild<RteEditor>('main');
  protected readonly f = form(this.model, (p) => {
    rteUploadsFinished(p.body, () => this.mainRef());
    rteImagesHaveAlt(p.body, () => this.mainRef());
    disabled(p.body, () => this.bridge.disabled());
    readonly(p.body, () => this.bridge.readonly());
    hidden(p.body, () => this.bridge.hidden());
  });
  protected readonly group = new FormGroup({
    body: new FormControl('<p>Reactive</p>', { nonNullable: true }),
  });
  protected templateValue = '<p>Template</p>';
  protected readonly noneValue = signal('<p>No upload</p>');

  /** `[upload]` de cada editor (`undefined` = o do provider da rota). */
  protected readonly configs = signal<
    Record<Live, RteUploadConfig | null | undefined>
  >({
    upload: undefined,
    'upload-reactive': undefined,
    'upload-template': undefined,
  });

  private readonly errors: Record<PageId, RteUploadErrorEvent[]> = {
    upload: [],
    'upload-reactive': [],
    'upload-template': [],
    'upload-none': [],
  };

  private readonly main = viewChild.required<RteEditor>('main');
  private readonly reactive = viewChild.required<RteEditor>('reactive');
  private readonly template = viewChild.required<RteEditor>('template');
  private readonly none = viewChild.required<RteEditor>('none');
  private readonly templateModel = viewChild(NgModel);
  private readonly editors: Record<PageId, Signal<RteEditor>> = {
    upload: this.main,
    'upload-reactive': this.reactive,
    'upload-template': this.template,
    'upload-none': this.none,
  };

  constructor() {
    const body = this.group.controls.body;
    this.bridge.register('upload', {
      value: () => this.model().body,
      setValue: (html) => this.model.update((m) => ({ ...m, body: html })),
      state: () => {
        const field = this.f.body();
        return {
          valid: field.valid(),
          touched: field.touched(),
          dirty: field.dirty(),
          errors: field.errors().map((e) => e.kind),
        };
      },
      reset: () => this.f().reset({ body: '' }),
      ...this.uploadHandle('upload'),
    });
    this.bridge.register('upload-reactive', {
      value: () => body.value,
      setValue: (html) => body.setValue(html),
      state: () => ({
        valid: body.valid,
        touched: body.touched,
        dirty: body.dirty,
        errors: Object.keys(body.errors ?? {}),
      }),
      reset: () => body.reset(''),
      ...this.uploadHandle('upload-reactive'),
    });
    this.bridge.register('upload-template', {
      value: () => this.templateValue,
      setValue: (html) => (this.templateValue = html),
      state: () => {
        const control = this.templateModel()?.control;
        if (!control) return NO_FORM_STATE;
        return {
          valid: control.valid,
          touched: control.touched,
          dirty: control.dirty,
          errors: Object.keys(control.errors ?? {}),
        };
      },
      reset: () => (this.templateValue = ''),
      ...this.uploadHandle('upload-template'),
    });
    this.bridge.register('upload-none', {
      value: () => this.noneValue(),
      setValue: (html) => this.noneValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.noneValue.set(''),
      uploadEditor: () => this.editors['upload-none'](),
      uploadErrors: () => this.errors['upload-none'],
    });
  }

  /** Mensagens dos erros do formulário `id` nos rótulos do idioma atual. */
  protected messages(id: Live): string[] {
    const labels = this.labels();
    const errors: readonly unknown[] =
      id === 'upload'
        ? this.f.body().errors()
        : splitErrors(
            id === 'upload-reactive'
              ? this.group.controls.body.errors
              : (this.templateModel()?.control.errors ?? null),
          );
    return errors.map((e) => formatRteError(e as ValidationErrors, labels));
  }

  protected onError(id: PageId, e: RteUploadErrorEvent): void {
    this.errors[id].push(e);
  }

  /** Envio do editor `id` pela ponte (`setUpload`: Ruling 14). */
  private uploadHandle(
    id: Live,
  ): Pick<RteE2eHandle, 'uploadEditor' | 'uploadErrors' | 'setUpload'> {
    return {
      uploadEditor: () => this.editors[id](),
      uploadErrors: () => this.errors[id],
      setUpload: (mode: RteE2eUploadMode, query?: string) => {
        const next =
          mode === 'none'
            ? null
            : mode === 'http'
              ? uploadConfig(this.preview, query)
              : { ...uploadConfig(this.preview, query), maxFilesPerAction: 5 };
        this.configs.update((c) => ({ ...c, [id]: next }));
      },
    };
  }
}
