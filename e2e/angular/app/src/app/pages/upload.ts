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
  ReactiveFormsModule,
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
  type RteLabelsInput,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import {
  E2eBridge,
  NO_FORM_STATE,
  type RteE2eHandle,
  type RteE2eLang,
  type RteE2eUploadMode,
} from '../e2e-bridge';
import { uploadConfig } from './upload-config';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
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

/**
 * N34–N38 (spec 05c2a, E25): editores com o envio do provider da rota em
 * Signal Forms (`upload`, barra `full`), Reactive Forms (`upload-reactive`) e
 * `ngModel` (`upload-template`), e o `upload-none` (`[upload]="null"`). Os
 * validadores `rteUploadsFinished`/`rteImagesHaveAlt` entram na Tarefa 11
 * (Ruling 13).
 */
@Component({
  selector: 'app-upload',
  imports: [RteEditor, FormField, ReactiveFormsModule, FormsModule],
  templateUrl: './upload.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabelsInput => LABELS[this.bridge.lang()];
  protected readonly options = OPTIONS;
  private readonly preview =
    inject(ActivatedRoute).snapshot.data['preview'] === true;

  protected readonly model = signal({ body: '<p>Upload here</p>' });
  protected readonly f = form(this.model, (p) => {
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
      state: () => NO_FORM_STATE,
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
