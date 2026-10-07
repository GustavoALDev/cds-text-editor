import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  required,
  validate,
  type FieldTree,
} from '@angular/forms/signals';
import {
  normalizeAttribute,
  normalizeHref,
  type RteAttrRule,
  type RteLinkPolicy,
} from '@cds/rte-core';
import type { RteDialogLabels } from '../labels/types';
import {
  applyLang,
  applyLink,
  applyQuote,
  applyTable,
  linkTargetPreserved,
  removeLang,
  removeLink,
} from './apply';
import type { RteDialogController, RteDialogRequest } from './controller';
import { dialogErrorText, integerInRange } from './forms';
import { RTE_DIALOG_LANGUAGES } from './types';

/** Tamanho máximo de autor e cargo (G15; limite só da interface). */
const QUOTE_MAX = 200;
/** Limites da tabela nova (G16). */
const TABLE_ROWS_MAX = 100;
const TABLE_COLS_MAX = 20;

/** Valor da opção "Outro…" do idioma (nunca casa a regra BCP 47 do esquema). */
const LANG_OTHER = 'other';
/** Idiomas da lista que sugerem a direção `rtl` (G14). */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'he']);

let nextInstance = 0;

interface LinkModel {
  url: string;
  text: string;
  newTab: boolean;
}

interface LangModel {
  choice: string;
  code: string;
  dir: '' | 'ltr' | 'rtl';
}

interface QuoteModel {
  author: string;
  role: string;
}

interface TableModel {
  rows: number | null;
  cols: number | null;
  headerRow: boolean;
  headerColumn: boolean;
}

/** Valores de cada abertura do diálogo de tabela (G16). */
const TABLE_INITIAL: Readonly<TableModel> = Object.freeze({
  rows: 3,
  cols: 3,
  headerRow: true,
  headerColumn: false,
});

/**
 * Diálogos do editor (G2–G8), carregados por `@defer` no `RteEditor`: um
 * `<dialog>` nativo aberto com `showModal()` para o pedido do controlador,
 * com um formulário em Signal Forms por tipo. Interno: nunca referenciado
 * fora do `imports` do `RteEditor` e do bloco `@defer` (senão o *chunk* some).
 */
@Component({
  selector: 'rte-dialogs',
  templateUrl: './rte-dialogs.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteDialogs {
  readonly controller = input.required<RteDialogController>();
  readonly labels = input.required<RteDialogLabels>();
  readonly linkPolicy = input<Partial<RteLinkPolicy> | undefined>(undefined);
  readonly langRule = input<RteAttrRule | null>(null);

  private readonly prefix = `rte-dialog-${++nextInstance}`;
  protected readonly ids = {
    title: `${this.prefix}-title`,
    linkUrl: `${this.prefix}-link-url`,
    linkText: `${this.prefix}-link-text`,
    linkNewTab: `${this.prefix}-link-new-tab`,
    langLanguage: `${this.prefix}-lang-language`,
    langCode: `${this.prefix}-lang-code`,
    langDirection: `${this.prefix}-lang-direction`,
    quoteAuthor: `${this.prefix}-quote-author`,
    quoteRole: `${this.prefix}-quote-role`,
    tableRows: `${this.prefix}-table-rows`,
    tableCols: `${this.prefix}-table-cols`,
    tableHeaderRow: `${this.prefix}-table-header-row`,
    tableHeaderColumn: `${this.prefix}-table-header-column`,
  };

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Último pedido preparado (o conteúdo fica até o próximo). */
  protected readonly active = signal<RteDialogRequest | null>(null);
  /** Id do pedido mostrado por último com `showModal()`. */
  private shownId = 0;
  private destroyed = false;

  protected readonly title = computed(() => {
    const req = this.active();
    const l = this.labels();
    switch (req?.kind) {
      case 'link':
        return req.mode === 'edit' ? l.linkEditTitle : l.linkInsertTitle;
      case 'lang':
        return req.mode === 'edit' ? l.langEditTitle : l.langTitle;
      case 'quoteAuthor':
        return l.quoteTitle;
      case 'table':
        return l.tableTitle;
      default:
        return '';
    }
  });

  protected readonly languages = RTE_DIALOG_LANGUAGES;
  protected readonly langOther = LANG_OTHER;

  /** "Abrir em nova aba" só quando a política preserva o `target` (G9). */
  protected readonly linkNewTabShown = computed(() =>
    linkTargetPreserved(this.linkPolicy()),
  );

  private readonly linkModel = signal<LinkModel>({
    url: '',
    text: '',
    newTab: false,
  });
  protected readonly linkForm: FieldTree<LinkModel> = form(
    this.linkModel,
    (p) => {
      required(p.url);
      // A mesma política que criou o editor (G9): o que ela recusa não passa.
      validate(p.url, ({ value }) => {
        const url = value();
        return url !== '' && normalizeHref(url, this.linkPolicy()) === null
          ? { kind: 'rteLinkUrl' }
          : undefined;
      });
      required(p.text, { when: () => this.active()?.mode === 'insert' });
    },
    {
      submission: {
        action: async () => {
          this.applyLink();
          return undefined;
        },
        onInvalid: () =>
          this.focusFirstInvalid([this.linkForm.url, this.linkForm.text]),
      },
    },
  );

  private readonly langModel = signal<LangModel>({
    choice: 'en',
    code: '',
    dir: '',
  });
  /** A direção atual veio da sugestão de `ar`/`he` (pré-voo 8). */
  private autoDir = false;
  protected readonly langForm: FieldTree<LangModel> = form(
    this.langModel,
    (p) => {
      required(p.code, {
        when: ({ valueOf }) => valueOf(p.choice) === LANG_OTHER,
      });
      // A regra `span[lang]` do esquema (G14), a mesma do `setLang`.
      validate(p.code, ({ value, valueOf }) => {
        const code = value();
        if (valueOf(p.choice) !== LANG_OTHER || code === '') return undefined;
        const rule = this.langRule();
        return rule === null || normalizeAttribute(rule, code) === null
          ? { kind: 'rteLangCode' }
          : undefined;
      });
    },
    {
      submission: {
        action: async () => {
          this.applyLang();
          return undefined;
        },
        onInvalid: () => this.focusFirstInvalid([this.langForm.code]),
      },
    },
  );

  private readonly quoteModel = signal<QuoteModel>({ author: '', role: '' });
  protected readonly quoteForm: FieldTree<QuoteModel> = form(
    this.quoteModel,
    (p) => {
      maxLength(p.author, QUOTE_MAX);
      maxLength(p.role, QUOTE_MAX);
    },
    {
      submission: {
        action: async () => {
          this.applyQuote();
          return undefined;
        },
        onInvalid: () =>
          this.focusFirstInvalid([this.quoteForm.author, this.quoteForm.role]),
      },
    },
  );

  private readonly tableModel = signal<TableModel>({ ...TABLE_INITIAL });
  protected readonly tableForm: FieldTree<TableModel> = form(
    this.tableModel,
    (p) => {
      integerInRange(p.rows, 1, TABLE_ROWS_MAX);
      integerInRange(p.cols, 1, TABLE_COLS_MAX);
    },
    {
      submission: {
        action: async () => {
          this.applyTable();
          return undefined;
        },
        onInvalid: () =>
          this.focusFirstInvalid([this.tableForm.rows, this.tableForm.cols]),
      },
    },
  );

  constructor() {
    // Destruído (com o editor): fecha sem tratar o `close` como cancelamento
    // (o controlador descarta o pedido sem mover o foco, G5).
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.hide();
    });

    effect((onCleanup) => {
      const controller = this.controller();
      onCleanup(controller.register({ hide: () => this.hide() }));
    });

    // Pedido novo: valores atuais no formulário antes do render do conteúdo.
    effect(() => {
      const req = this.controller().request();
      if (!req || req === untracked(this.active)) return;
      untracked(() => {
        this.prepare(req);
        this.active.set(req);
      });
    });

    // Depois do render: abre como modal e foca o primeiro campo (G4).
    afterRenderEffect({
      write: () => {
        const req = this.controller().request();
        if (!req || req.id === this.shownId || req !== this.active()) return;
        untracked(() => this.show(req));
      },
    });
  }

  /** `close` do `<dialog>` (Escape ou fechamento externo): cancelamento (G3). */
  protected onClose(): void {
    // Um `close` atrasado (no navegador vem numa tarefa) de um fechamento
    // anterior não cancela o diálogo reaberto nesse meio-tempo.
    if (this.destroyed || this.dialog().nativeElement.open) return;
    const req = untracked(this.controller().request);
    if (req && req.id === this.shownId) this.controller().cancel('cancelled');
  }

  protected cancel(): void {
    this.controller().cancel('cancelled');
  }

  /** Idioma escolhido: `ar`/`he` sugerem `rtl`; os demais desfazem a sugestão. */
  protected onLangChoice(): void {
    const { choice } = untracked(this.langModel);
    if (RTL_LANGUAGES.has(choice)) {
      this.autoDir = true;
      this.langModel.update((m) => ({ ...m, dir: 'rtl' }));
    } else if (this.autoDir) {
      this.autoDir = false;
      this.langModel.update((m) => ({ ...m, dir: '' }));
    }
  }

  /** Direção escolhida à mão: deixa de ser sugestão. */
  protected onLangDir(): void {
    this.autoDir = false;
  }

  protected removeLink(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'link' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeLink(editor, req));
  }

  protected removeLang(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'lang' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeLang(editor, req));
  }

  /** Erro visível do campo: só depois de tocado (ou de um envio) (G8). */
  protected errorOf<T>(field: FieldTree<T>): string | null {
    const state = field();
    return state.touched() && state.invalid()
      ? dialogErrorText(state.errors(), this.labels())
      : null;
  }

  private prepare(req: RteDialogRequest): void {
    if (req.kind === 'link') {
      this.linkForm().reset(linkValues(req));
    } else if (req.kind === 'lang') {
      this.autoDir = false;
      this.langForm().reset(langValues(req));
    } else if (req.kind === 'quoteAuthor') {
      this.quoteForm().reset(quoteValues(req));
    } else if (req.kind === 'table') {
      this.tableForm().reset({ ...TABLE_INITIAL });
    }
  }

  private show(req: RteDialogRequest): void {
    this.shownId = req.id;
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector<HTMLInputElement>(
      '.rte-dialog__field input, .rte-dialog__field select',
    );
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
  }

  private hide(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) dialog.close();
  }

  /** Foca o primeiro campo inválido, na ordem fixa dos campos (G8). */
  private focusFirstInvalid(fields: readonly FieldTree<unknown>[]): void {
    fields
      .find((f) => f().invalid())?.()
      .focusBoundControl();
  }

  private applyLink(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'link') return;
    const value = untracked(this.linkModel);
    const policy = untracked(this.linkPolicy);
    this.controller().apply((editor) => applyLink(editor, req, value, policy));
  }

  private applyLang(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'lang') return;
    const { choice, code, dir } = untracked(this.langModel);
    const lang = choice === LANG_OTHER ? code : choice;
    this.controller().apply((editor) =>
      applyLang(editor, req, { lang, dir: dir || null }),
    );
  }

  private applyQuote(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'quoteAuthor') return;
    const value = untracked(this.quoteModel);
    this.controller().apply((editor) => applyQuote(editor, req, value));
  }

  private applyTable(): void {
    const req = untracked(this.controller().request);
    if (req?.kind !== 'table') return;
    const { rows, cols, headerRow, headerColumn } = untracked(this.tableModel);
    if (rows === null || cols === null) return;
    this.controller().apply((editor) =>
      applyTable(editor, req, { rows, cols, headerRow, headerColumn }),
    );
  }
}

/** Autor e cargo atuais da citação do pedido (atributos de texto puro). */
function quoteValues(req: RteDialogRequest): QuoteModel {
  const $pos = req.doc.resolve(req.range.from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'rtPullquote') {
      return {
        author: String(node.attrs['author'] ?? ''),
        role: String(node.attrs['role'] ?? ''),
      };
    }
  }
  return { author: '', role: '' };
}

/** Atributos da marca `name` no intervalo do pedido (modo editar), ou `null`. */
function markAttrs(
  req: RteDialogRequest,
  name: string,
): Readonly<Record<string, unknown>> | null {
  let attrs: Readonly<Record<string, unknown>> | null = null;
  req.doc.nodesBetween(req.range.from, req.range.to, (node) => {
    attrs ??= node.marks.find((m) => m.type.name === name)?.attrs ?? null;
    return !attrs;
  });
  return attrs;
}

/** Valores de abertura do link: no modo editar, `href` e `target` da marca. */
function linkValues(req: RteDialogRequest): LinkModel {
  const attrs = req.mode === 'edit' ? markAttrs(req, 'link') : null;
  const href = attrs?.['href'];
  return {
    url: typeof href === 'string' ? href : '',
    text: '',
    newTab: attrs?.['target'] === '_blank',
  };
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
