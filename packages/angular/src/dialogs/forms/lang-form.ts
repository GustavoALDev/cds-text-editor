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
  type FieldTree,
} from '@angular/forms/signals';
import type { RteAttrRule } from '@cds/rte-core';
import { applyLang, removeLang } from '../apply';
import type { RteDialogRequest } from '../controller';
import { RteDialogFormBase } from './form-base';
import { focusFirstInvalid, langCodeValidator } from '../form-helpers';
import { RTE_DIALOG_LANGUAGES } from '../types';
import { markAttrs } from './request-attrs';

/** Valor da opção "Outro…" do idioma (nunca casa a regra BCP 47 do esquema). */
const LANG_OTHER = 'other';
/** Idiomas da lista que sugerem a direção `rtl` (G14). */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'he']);

interface LangModel {
  choice: string;
  code: string;
  dir: '' | 'ltr' | 'rtl';
}

/**
 * Valores de abertura do idioma (pré-voo 8): novo → `en` e "Padrão"; editar →
 * o idioma e a direção do trecho, com código fora da lista em "Outro…".
 */
function langValues(req: RteDialogRequest): LangModel {
  const attrs = req.mode === 'edit' ? markAttrs(req, 'rtLang') : null;
  const lang = attrs?.['lang'];
  const dir = attrs?.['dir'];
  const direction = dir === 'ltr' || dir === 'rtl' ? dir : '';
  if (typeof lang !== 'string' || lang === '') {
    return { choice: 'en', code: '', dir: direction };
  }
  return (RTE_DIALOG_LANGUAGES as readonly string[]).includes(lang)
    ? { choice: lang, code: '', dir: direction }
    : { choice: LANG_OTHER, code: lang, dir: direction };
}

/** Formulário do diálogo de idioma (G14), filho do `RteDialogs`. */
@Component({
  selector: 'rte-lang-form',
  templateUrl: './lang-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteLangForm extends RteDialogFormBase {
  readonly langRule = input<RteAttrRule | null>(null);

  protected readonly ids = computed(() => ({
    language: `${this.idPrefix()}-lang-language`,
    code: `${this.idPrefix()}-lang-code`,
    direction: `${this.idPrefix()}-lang-direction`,
  }));
  protected readonly languages = RTE_DIALOG_LANGUAGES;
  protected readonly langOther = LANG_OTHER;

  private readonly model = signal<LangModel>({
    choice: 'en',
    code: '',
    dir: '',
  });
  /** A direção atual veio da sugestão de `ar`/`he` (pré-voo 8). */
  private autoDir = false;
  protected readonly form: FieldTree<LangModel> = form(
    this.model,
    (p) => {
      required(p.code, {
        when: ({ valueOf }) => valueOf(p.choice) === LANG_OTHER,
      });
      // A regra `span[lang]` do esquema (G14), a mesma do `setLang`.
      langCodeValidator(
        p.code,
        () => this.langRule(),
        () => this.model().choice === LANG_OTHER,
      );
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () => focusFirstInvalid([this.form.code]),
      },
    },
  );

  constructor() {
    super();
    // Pedido novo: valores atuais no formulário antes do render.
    effect(() => {
      const req = this.request();
      untracked(() => {
        this.autoDir = false;
        this.form().reset(langValues(req));
      });
    });
  }

  /** Idioma escolhido: `ar`/`he` sugerem `rtl`; os demais desfazem a sugestão. */
  protected onChoice(): void {
    const { choice } = untracked(this.model);
    if (RTL_LANGUAGES.has(choice)) {
      this.autoDir = true;
      this.model.update((m) => ({ ...m, dir: 'rtl' }));
    } else if (this.autoDir) {
      this.autoDir = false;
      this.model.update((m) => ({ ...m, dir: '' }));
    }
  }

  /** Direção escolhida à mão: deixa de ser sugestão. */
  protected onDir(): void {
    this.autoDir = false;
  }

  protected remove(): void {
    const req = untracked(this.request);
    if (req.kind !== 'lang' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeLang(editor, req));
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'lang') return;
    const { choice, code, dir } = untracked(this.model);
    const lang = choice === LANG_OTHER ? code : choice;
    this.controller().apply((editor) =>
      applyLang(editor, req, { lang, dir: dir || null }),
    );
  }
}
