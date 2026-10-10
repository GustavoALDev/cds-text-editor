import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  hidden,
  readonly,
} from '@angular/forms/signals';
import {
  RteEditor,
  type RteDialogKind,
  type RteEditorConfig,
  type RteLabelsInput,
} from '@comodeviaser/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@comodeviaser/rte-angular/i18n';
import { RTE_CODE_LANGUAGES } from '@comodeviaser/rte-core/code-languages';
import { E2eBridge, NO_FORM_STATE, type RteE2eLang } from '../e2e-bridge';
import { ALT_THEME, MAIN_THEME } from './toolbar';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

/**
 * Documento inicial do `dialogs` (N16–N20): um link, um trecho com idioma, a
 * 1ª citação em destaque de `fixtures/content/all-features.html` e um
 * parágrafo final.
 */
export const DIALOGS_FIXTURE =
  '<p>Visite <a href="https://example.com/">o site</a> e diga <span lang="fr">bonjour</span>.</p>' +
  '<figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote><figcaption><cite>Fulana de Tal</cite>, editora</figcaption></figure>' +
  '<p>Fim</p>';

const FEATURES: RteEditorConfig['features'] = {
  colors: true,
  code: true,
  tables: true,
  tasks: true,
  media: true,
  embeds: true,
  newsBlocks: true,
};

/** `dialogs`: todos os recursos e domínio bloqueado, `target` preservado. */
const MAIN_OPTIONS: RteEditorConfig = {
  features: FEATURES,
  codeLanguages: RTE_CODE_LANGUAGES,
  linkPolicy: { blockedDomains: ['evil.example'], target: 'preserve' },
};

/** `dialogs-api`: só `https`, sem relativos, sem `target`. */
const API_OPTIONS: RteEditorConfig = {
  features: FEATURES,
  linkPolicy: { protocols: ['https'], allowRelative: false, target: 'never' },
};

/**
 * N16–N20 (spec 05b2a): diálogos pela barra `full` (`dialogs`, com
 * `[formField]` para conferir o `touched` e os estados da ponte) e pela API
 * `openDialog` num editor sem barra (`dialogs-api`, outro tema e outra
 * política de links).
 */
@Component({
  selector: 'app-dialogs',
  imports: [RteEditor, FormField],
  templateUrl: './dialogs.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogsPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabelsInput => LABELS[this.bridge.lang()];
  protected readonly mainOptions = MAIN_OPTIONS;
  protected readonly apiOptions = API_OPTIONS;
  protected readonly mainTheme = MAIN_THEME;
  protected readonly altTheme = ALT_THEME;
  protected readonly kinds: readonly RteDialogKind[] = [
    'link',
    'lang',
    'quoteAuthor',
    'table',
  ];

  protected readonly model = signal({ body: DIALOGS_FIXTURE });
  protected readonly f = form(this.model, (p) => {
    disabled(p.body, () => this.bridge.disabled());
    readonly(p.body, () => this.bridge.readonly());
    hidden(p.body, () => this.bridge.hidden());
  });

  protected readonly apiValue = signal(DIALOGS_FIXTURE);
  /** Retorno do último `openDialog` de cada botão (`data-result`). */
  protected readonly results = signal<Partial<Record<RteDialogKind, boolean>>>(
    {},
  );

  private readonly main = viewChild.required<RteEditor>('main');
  private readonly api = viewChild.required<RteEditor>('api');

  constructor() {
    this.bridge.register('dialogs', {
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
      reset: () => this.f().reset({ body: DIALOGS_FIXTURE }),
      openDialog: (kind) => this.main().openDialog(kind as RteDialogKind),
    });
    this.bridge.register('dialogs-api', {
      value: () => this.apiValue(),
      setValue: (html) => this.apiValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.apiValue.set(DIALOGS_FIXTURE),
      openDialog: (kind) => this.api().openDialog(kind as RteDialogKind),
    });
  }

  protected open(kind: RteDialogKind): void {
    const result = this.api().openDialog(kind);
    this.results.update((r) => ({ ...r, [kind]: result }));
  }
}
