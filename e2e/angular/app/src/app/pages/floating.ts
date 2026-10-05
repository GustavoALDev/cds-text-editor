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
  type RteEditorConfig,
  type RteFloatingMenusConfig,
  type RteLabelsInput,
} from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import { RTE_CODE_LANGUAGES } from '@cds/rte-core/code-languages';
import { E2eBridge, NO_FORM_STATE, type RteE2eLang } from '../e2e-bridge';
import { ALT_THEME, MAIN_THEME } from './toolbar';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

/**
 * Documento inicial do `floating` (N21, N24): um parágrafo com link, outro
 * sem marcas, uma imagem, uma tabela 2 × 2 comum, uma tabela de uma linha com
 * `colgroup` largo (R12) e um parágrafo final.
 */
export const FLOATING_FIXTURE =
  '<p>Primeiro parágrafo com <a href="https://example.com/">um link</a> no meio.</p>' +
  '<p>Segundo parágrafo.</p>' +
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="Imagem de teste"></figure>' +
  '<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>' +
  '<table><colgroup><col style="width: 560px"><col style="width: 160px"></colgroup><tbody><tr><td><p>Larga</p></td><td><p>Estreita</p></td></tr></tbody></table>' +
  '<p>Fim</p>';

const OPTIONS: RteEditorConfig = {
  features: {
    colors: true,
    code: true,
    tables: true,
    tasks: true,
    media: true,
    embeds: true,
    newsBlocks: true,
  },
  codeLanguages: RTE_CODE_LANGUAGES,
};

/**
 * N21, N24 (spec 05b2b): menus flutuantes no editor `floating` (barra `full`,
 * dentro de um contêiner de 480 px com rolagem, `[formField]`, `floatingMenus`
 * ao vivo) e no `floating-alt` (sem barra, sem o menu de tabela, outro tema).
 */
@Component({
  selector: 'app-floating',
  imports: [RteEditor, FormField],
  templateUrl: './floating.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatingPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabelsInput => LABELS[this.bridge.lang()];
  protected readonly options = OPTIONS;
  protected readonly mainTheme = MAIN_THEME;
  protected readonly altTheme = ALT_THEME;
  protected readonly altMenus: RteFloatingMenusConfig = { table: false };
  protected readonly floatingMenus = signal<RteFloatingMenusConfig | undefined>(
    undefined,
  );

  protected readonly model = signal({ body: FLOATING_FIXTURE });
  protected readonly f = form(this.model, (p) => {
    disabled(p.body, () => this.bridge.disabled());
    readonly(p.body, () => this.bridge.readonly());
    hidden(p.body, () => this.bridge.hidden());
  });
  protected readonly altValue = signal(FLOATING_FIXTURE);

  private readonly main = viewChild.required<RteEditor>('main');

  constructor() {
    this.bridge.register('floating', {
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
      reset: () => this.f().reset({ body: FLOATING_FIXTURE }),
      setFloatingMenus: (config) =>
        this.floatingMenus.set(config as RteFloatingMenusConfig | undefined),
      focusFloatingMenu: () => this.main().focusFloatingMenu(),
      openDialog: (kind) => this.main().openDialog(kind as 'link'),
    });
    this.bridge.register('floating-alt', {
      value: () => this.altValue(),
      setValue: (html) => this.altValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.altValue.set(FLOATING_FIXTURE),
    });
  }
}
