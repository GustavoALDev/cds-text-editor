import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChildren,
  ViewEncapsulation,
  type Signal,
} from '@angular/core';
import type { RteHtmlSchema } from '@cds/rte-core';
import type { RteCodeLanguage } from '@cds/rte-core/code-languages';
import type { RteContentLabels } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import type { RteDialogKind } from '../dialogs/types';
import type { RteToolbarLabels } from '../labels/types';
import { runToolbarCommand } from './commands';
import { RTE_ICONS, type RteIconName } from './icons';
import {
  RTE_TOOLBAR_ITEMS,
  type RteToolbarItemId,
  type RteToolbarItemKind,
} from './items';
import { RteMenu, RteMenuTrigger } from './menu';
import { isRtl, RteRovingFocus, RteRovingItem } from './roving-focus';
import {
  ariaKeyShortcuts,
  detectPlatform,
  RTE_TOOLBAR_SHORTCUTS,
  shortcutTitle,
  type RtePlatform,
  type RteShortcutTarget,
} from './shortcuts';
import type { RteItemState, RteToolbarState } from './state';
import {
  readTableMenuState,
  RTE_TABLE_OPS,
  type RteTableOp,
  type RteTableOpState,
} from './table-guard';

/** Item de um menu da barra (U6, U13). */
interface RteMenuEntry {
  readonly key: string;
  /** Valor passado a `runToolbarCommand` (`null` = "Cor padrão"). */
  readonly value: string | null;
  readonly label: string;
  readonly role: 'menuitemradio' | 'menuitem';
  readonly icon: RteIconName | null;
  /** Amostra: nome da paleta e qual paleta. */
  readonly color: string | null;
  readonly palette: 'text' | 'highlight' | null;
  readonly shortcut: RteShortcutTarget | null;
}

type RteMenuId =
  | 'blockType'
  | 'textColor'
  | 'highlight'
  | 'align'
  | 'codeLanguage'
  | 'table'
  | 'callout';

type TableMenuState = Readonly<Record<RteTableOp, RteTableOpState>>;

/** Pedido de diálogo da barra: o tipo e o elemento que o pediu (devolve o foco). */
export interface RteToolbarDialogRequest {
  readonly kind: RteDialogKind;
  readonly origin: HTMLElement;
}

/** Entrada do menu de tabela que abre o diálogo em vez de rodar um comando. */
const TABLE_CUSTOM = 'insertTableCustom';

const ALIGNS = [
  ['left', 'alignLeft'],
  ['center', 'alignCenter'],
  ['right', 'alignRight'],
  ['justify', 'alignJustify'],
] as const;

const ALIGN_ICONS: Readonly<Record<string, RteIconName>> =
  Object.fromEntries(ALIGNS);

const CALLOUT_VARIANTS = ['info', 'success', 'warning', 'danger'] as const;

function entry(
  value: string | null,
  label: string,
  more: Partial<RteMenuEntry> = {},
): RteMenuEntry {
  return {
    key: value ?? '\0default',
    value,
    label,
    role: 'menuitemradio',
    icon: null,
    color: null,
    palette: null,
    shortcut: null,
    ...more,
  };
}

/** Operação de tabela que decide o estado da entrada ('Inserir tabela…' = `insertTable`). */
function tableOpOf(e: RteMenuEntry): RteTableOp {
  return (e.value === TABLE_CUSTOM ? 'insertTable' : e.value) as RteTableOp;
}

/**
 * Barra de ferramentas do `rte-editor` (spec 05b1, U2–U14), interna: grupos
 * de botões com foco itinerante (APG *toolbar*), menus em `popover` nativo e
 * estado lido uma vez por transação (U5). O estado vem do `RteEditor`, o
 * mesmo dos menus flutuantes (M15). Sem editor ou não interativo, todos
 * os botões ficam `disabled` nativos (U10).
 */
@Component({
  selector: 'rte-toolbar',
  templateUrl: './rte-toolbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RteRovingItem, RteMenu, RteMenuTrigger],
  hostDirectives: [RteRovingFocus],
  host: {
    class: 'rte-toolbar',
    role: 'toolbar',
    'aria-orientation': 'horizontal',
    '[attr.aria-label]': 'labels().toolbar',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class RteToolbar {
  readonly editor = input<Editor | null>(null);
  /** Versão da ponte (sobe 1 por transação). */
  readonly version = input.required<Signal<number>>();
  readonly groups = input.required<readonly (readonly RteToolbarItemId[])[]>();
  /** Estado dos itens, criado no `RteEditor` e compartilhado (M15). */
  readonly state = input.required<RteToolbarState>();
  readonly interactive = input(false);
  /** O item `search` fica ativo também com `readonly` (K7); padrão: segue `interactive`. */
  readonly searchable = input<boolean | undefined>(undefined);
  readonly labels = input.required<RteToolbarLabels>();
  readonly calloutTitles = input.required<RteContentLabels['calloutTitles']>();
  readonly palette = input.required<RteHtmlSchema['palette']>();
  readonly codeLanguages = input<readonly RteCodeLanguage[]>([]);

  /** `Escape` num item: o dono devolve o foco ao editável (U3). */
  readonly escape = output<void>();
  /** `Tab` saiu de um menu: o dono leva o foco ao editável (U6). */
  readonly tabOut = output<void>();
  /** Item de diálogo ou 'Inserir tabela…': o dono abre o diálogo (G11). */
  readonly dialog = output<RteToolbarDialogRequest>();
  /** Item `search`: o dono abre a barra de busca (K7). */
  readonly searchRequest = output<void>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly roving = inject(RteRovingFocus, { self: true });
  private readonly rovingItems = viewChildren(RteRovingItem);
  private readonly menus = viewChildren(RteMenu);

  /** Notação do atalho; lida no navegador depois do primeiro render (U11). */
  protected readonly platform = signal<RtePlatform>('other');
  /** Direção do host (ícone do alinhamento sem atributo); relida ao focar. */
  private readonly rtl = signal(false);

  /** Itens dos menus; mudam só com rótulos, paleta ou linguagens. */
  protected readonly entries: Signal<
    Readonly<Record<RteMenuId, readonly RteMenuEntry[]>>
  > = computed(() => {
    const l = this.labels();
    const palette = this.palette();
    const titles = this.calloutTitles();
    const colors = (
      list: RteHtmlSchema['palette']['text'],
      kind: 'text' | 'highlight',
    ) => [
      ...list.map((c) =>
        entry(c.name, l.colorNames[c.name] ?? c.name, {
          color: c.name,
          palette: kind,
        }),
      ),
      entry(null, l.defaultColor, { palette: kind }),
    ];
    return {
      blockType: [
        entry('paragraph', l.paragraph, { shortcut: 'paragraph' }),
        ...([2, 3, 4] as const).map((n) =>
          entry(`heading${n}`, l.heading(n), { shortcut: `heading${n}` }),
        ),
      ],
      textColor: colors(palette.text, 'text'),
      highlight: colors(palette.highlight, 'highlight'),
      align: ALIGNS.map(([value, name]) =>
        entry(value, l[name], { icon: name, shortcut: name }),
      ),
      codeLanguage: [
        entry('plain', l.plainText),
        ...this.codeLanguages().map((c) => entry(c.id, c.name)),
      ],
      table: RTE_TABLE_OPS.flatMap((op) => [
        entry(op, l[op], { role: 'menuitem' }),
        ...(op === 'insertTable'
          ? [entry(TABLE_CUSTOM, l.insertTableCustom, { role: 'menuitem' })]
          : []),
      ]),
      callout: [
        ...CALLOUT_VARIANTS.map((v) => entry(v, titles[v])),
        entry('remove', l.removeCallout, { role: 'menuitem' }),
      ],
    };
  });

  /** Estado do menu de tabela por instância de menu (ensaios só aberto, U14). */
  private readonly tableStates = new WeakMap<
    RteMenu,
    Signal<TableMenuState | null>
  >();

  /** Foco estava na barra (ainda que o item focado tenha saído do DOM). */
  private focusInside = false;

  constructor() {
    this.roving.useItems(this.rovingItems);

    afterNextRender(() => {
      this.platform.set(detectPlatform(this.document.defaultView?.navigator));
      this.rtl.set(isRtl(this.host));
    });

    // desabilitado ou somente leitura: nenhum menu fica aberto (U10)
    effect(() => {
      if (!this.interactive()) untracked(() => this.closeMenus());
    });

    // Troca de grupos com o foco num item que saiu: o foco vai ao item ativo
    // da barra nova, sem sair do host (D11).
    afterRenderEffect(() => {
      this.groups();
      untracked(() => {
        const active = this.document.activeElement;
        if (!this.focusInside || this.host.contains(active)) return;
        if (active && active !== this.document.body) return;
        if (!this.roving.focusActive()) this.focusInside = false;
      });
    });
  }

  /** Foca o item ativo; `false` sem item focável. */
  focusActive(): boolean {
    return this.roving.focusActive();
  }

  /** Fecha o menu aberto sem devolver o foco. */
  closeMenus(): void {
    for (const menu of this.menus()) if (menu.isOpen()) menu.close('none');
  }

  protected kindOf(id: RteToolbarItemId): RteToolbarItemKind {
    return RTE_TOOLBAR_ITEMS[id].kind;
  }

  protected icon(name: RteIconName): readonly string[] {
    return RTE_ICONS[name];
  }

  protected itemIcon(id: RteToolbarItemId, value: string | null): RteIconName {
    if (id === 'align') {
      // sem atributo, o texto segue o início da linha: à direita em `rtl`
      const start = this.rtl() ? 'alignRight' : 'alignLeft';
      return ALIGN_ICONS[value ?? ''] ?? start;
    }
    return id as RteIconName;
  }

  protected label(id: RteToolbarItemId): string {
    return this.labels()[id] as string;
  }

  /**
   * Nome do botão de diálogo: 'Editar …' quando já há link/idioma sob a
   * seleção ou a mídia do item está selecionada.
   */
  protected dialogLabel(id: RteToolbarItemId, active: boolean): string {
    const l = this.labels();
    if (active) {
      switch (id) {
        case 'link':
          return l.editLink;
        case 'lang':
          return l.editLang;
        case 'image':
          return l.editImage;
        case 'video':
          return l.editVideo;
        case 'embed':
          return l.editEmbed;
      }
    }
    return this.label(id);
  }

  /**
   * Todos os textos possíveis do botão `blockType`, empilhados invisíveis na
   * mesma célula: a largura é a do mais longo, então trocar o texto (casca →
   * editor, mover o cursor) não muda o leiaute da barra (R7).
   */
  protected readonly blockTexts = computed(() => {
    const l = this.labels();
    return [l.blockType, l.paragraph, l.heading(2), l.heading(3), l.heading(4)];
  });

  /**
   * Nome acessível do gatilho de menu. No `blockType`, o texto visível (bloco
   * atual) vem primeiro e o propósito depois ("Heading 2, Text style"): o
   * nome contém o rótulo visível (WCAG 2.5.3) e o bloco atual é anunciado sem
   * abrir o menu (U11). Sem bloco único, o texto visível já é o rótulo.
   */
  protected menuButtonName(id: RteToolbarItemId, value: string | null): string {
    const label = this.label(id);
    if (id !== 'blockType') return label;
    const text = this.blockText(value);
    return text === label ? label : `${text}, ${label}`;
  }

  /** Texto do botão `blockType`: bloco atual ou o nome do item (U11). */
  protected blockText(value: string | null): string {
    const l = this.labels();
    if (value === 'paragraph') return l.paragraph;
    const level = /^heading([234])$/.exec(value ?? '')?.[1];
    return level ? l.heading(Number(level) as 2 | 3 | 4) : l.blockType;
  }

  /** Dica: rótulo + atalho da plataforma e, bloqueado pela guarda, o motivo. */
  protected title(
    label: string,
    target: RteShortcutTarget | null,
    limited = false,
  ): string {
    const base = shortcutTitle(label, target, this.platform());
    return limited ? `${base} — ${this.labels().spanLimit}` : base;
  }

  protected keyShortcuts(target: RteShortcutTarget | null): string | null {
    const shortcut = target ? RTE_TOOLBAR_SHORTCUTS[target] : undefined;
    return shortcut ? ariaKeyShortcuts(shortcut, this.platform()) : null;
  }

  /** `aria-disabled` só quando a barra está ativa e o item não se aplica. */
  protected ariaDisabled(enabled: boolean, id?: RteToolbarItemId): 'true' | null {
    return this.live(id) && !enabled ? 'true' : null;
  }

  /** Botão utilizável: `interactive`, ou `searchable` no item `search` (K7). */
  protected live(id?: RteToolbarItemId): boolean {
    return id === 'search'
      ? (this.searchable() ?? this.interactive())
      : this.interactive();
  }

  protected tableState(menu: RteMenu): TableMenuState | null {
    let state = this.tableStates.get(menu);
    if (!state) {
      state = computed(() => {
        if (!menu.isOpen()) return null;
        this.version()();
        const editor = this.editor();
        return editor && !editor.isDestroyed
          ? readTableMenuState(editor)
          : null;
      });
      this.tableStates.set(menu, state);
    }
    return state();
  }

  protected menuEntries(id: RteToolbarItemId): readonly RteMenuEntry[] {
    return this.entries()[id as RteMenuId] ?? [];
  }

  /** Operação de tabela bloqueada pela guarda de `colspan`/`rowspan`. */
  protected spanLimited(
    table: TableMenuState | null,
    e: RteMenuEntry,
  ): boolean {
    return table?.[tableOpOf(e)]?.spanLimited ?? false;
  }

  /** Item de menu aplicável (a tabela consulta os ensaios). */
  protected entryEnabled(
    id: RteToolbarItemId,
    e: RteMenuEntry,
    item: RteItemState,
    table: TableMenuState | null,
  ): boolean {
    if (!item.enabled) return false;
    if (id === 'table') return table?.[tableOpOf(e)]?.enabled ?? false;
    if (id === 'callout' && e.value === 'remove') return item.value !== null;
    return true;
  }

  protected checked(e: RteMenuEntry, item: RteItemState): boolean {
    return e.role === 'menuitemradio' && item.value === e.value;
  }

  private canRun(): Editor | null {
    const editor = this.editor();
    return editor &&
      !editor.isDestroyed &&
      this.interactive() &&
      editor.isEditable
      ? editor
      : null;
  }

  /**
   * O habilitado é lido do estado atual, não do render: o clique (ou o
   * `Enter`) pode chegar antes da renderização que segue uma transação ou a
   * abertura do menu (N11).
   */
  protected run(id: RteToolbarItemId): void {
    if (id === 'search') {
      if (this.live(id) && this.state().item(id)().enabled)
        this.searchRequest.emit();
      return;
    }
    const editor = this.canRun();
    if (!editor || !this.state().item(id)().enabled) return;
    runToolbarCommand(editor, id, null);
  }

  /** Botão de diálogo: pede ao dono que abra o diálogo do item (G11). */
  protected openFromItem(id: RteToolbarItemId, origin: HTMLElement): void {
    if (!this.canRun() || !this.state().item(id)().enabled) return;
    this.dialog.emit({ kind: id as RteDialogKind, origin });
  }

  protected choose(
    menu: RteMenu,
    id: RteToolbarItemId,
    e: RteMenuEntry,
    trigger: HTMLElement,
  ): void {
    const editor = this.canRun();
    if (!editor) return;
    const table = id === 'table' ? this.tableState(menu) : null;
    if (!this.entryEnabled(id, e, this.state().item(id)(), table)) return;
    if (id === 'table' && e.value === TABLE_CUSTOM) {
      menu.close('trigger');
      this.dialog.emit({ kind: 'table', origin: trigger });
      return;
    }
    menu.close('none');
    runToolbarCommand(editor, id, e.value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const target = event.target as Element | null;
    if (!target || target.closest('.rte-menu')) return;
    event.preventDefault();
    this.escape.emit();
  }

  protected onFocusIn(): void {
    this.focusInside = true;
    this.rtl.set(isRtl(this.host));
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node) {
      this.focusInside = this.host.contains(next);
      return;
    }
    // sem destino: saiu de verdade, a não ser que o foco esteja de novo na
    // barra (item que saiu do DOM e foco devolvido ao item ativo, ou
    // `blur()` + `focus()` no mesmo turno). Decidido na fase `read` do
    // próximo render, depois do `afterRenderEffect` que devolve o foco (no
    // zone.js uma microtarefa rodaria ainda durante a detecção, com o item no
    // DOM: o Chromium dispara `focusout` na remoção). Mesmo critério do
    // `RteEditor` (D11).
    afterNextRender(
      {
        read: () => {
          const doc = this.document;
          const active = doc.activeElement;
          this.focusInside =
            doc.hasFocus() &&
            active !== null &&
            active !== doc.body &&
            this.host.contains(active);
        },
      },
      { injector: this.injector },
    );
  }
}
