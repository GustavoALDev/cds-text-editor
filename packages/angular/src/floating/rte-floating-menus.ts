import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  untracked,
  viewChildren,
  ViewEncapsulation,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import type { RteLinkPolicy } from '@cds/rte-core';
import type { Editor } from '@tiptap/core';
import { NodeSelection, type Transaction } from '@tiptap/pm/state';
import type { RteDialogKind } from '../dialogs/types';
import type { RteFloatingMenuLabels, RteToolbarLabels } from '../labels/types';
import { RTE_ICONS, type RteIconName } from '../toolbar/icons';
import type { RteToolbarItemId } from '../toolbar/items';
import { RteMenu } from '../toolbar/menu';
import { RteRovingFocus, RteRovingItem } from '../toolbar/roving-focus';
import {
  detectPlatform,
  shortcutTitle,
  type RtePlatform,
  type RteShortcutTarget,
} from '../toolbar/shortcuts';
import type { RteToolbarState } from '../toolbar/state';
import { clipAncestors } from './anchor';
import { bindFloatingListeners } from './listeners';
import { placeFloatingMenu, RTE_FLOATING_MEASURING } from './place';
import type { RteFloatingMenuKind } from './types';
import {
  mapFloatingIdentity,
  readFloatingContext,
  readFloatingKind,
  sameFloatingIdentity,
  type RteFloatingContext,
  type RteFloatingIdentity,
} from './visibility';
import { RteViewportWatch } from './viewport-watch';

const TEXT_MARKS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;
const TABLE_OPS = [
  'addRowAfter',
  'addColumnAfter',
  'deleteRow',
  'deleteColumn',
] as const;
const IMAGE_ALIGNS = [
  ['left', 'imageAlignLeft', 'alignLeft'],
  ['center', 'imageAlignCenter', 'alignCenter'],
  ['right', 'imageAlignRight', 'alignRight'],
  ['full', 'imageAlignFull', 'imageAlignFull'],
] as const;

function sameContext(
  a: RteFloatingContext | null,
  b: RteFloatingContext | null,
): boolean {
  return sameFloatingIdentity(a?.identity ?? null, b?.identity ?? null);
}

/**
 * Menus flutuantes do `rte-editor` (spec 05b2b, M2), internos: um
 * `popover="manual"` por tipo ligado, mostrado conforme a seleção e os sinais
 * de interação (M4, M5), posicionado por CSSOM junto à âncora (M7–M10) sem
 * nunca tirar o foco do editável (M11). Ouvintes fora da zona; só escritas de
 * *signal* que mudam entram nela (M20).
 */
@Component({
  selector: 'rte-floating-menus',
  templateUrl: './rte-floating-menus.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RteRovingFocus, RteRovingItem, NgTemplateOutlet],
})
export class RteFloatingMenus {
  readonly editor = input.required<Editor>();
  readonly version = input.required<Signal<number>>();
  readonly state = input.required<RteToolbarState>();
  readonly kinds = input.required<readonly RteFloatingMenuKind[]>();
  /** Editor interativo e não `hidden`. */
  readonly enabled = input(false);
  /** Pedido de diálogo deste editor ou de outro do documento (G6). */
  readonly blocked = input(false);
  /** O editável tem o foco (`isFocused`). */
  readonly focused = input(false);
  readonly labels = input.required<RteFloatingMenuLabels>();
  readonly toolbarLabels = input.required<RteToolbarLabels>();
  readonly linkPolicy = input<Partial<RteLinkPolicy> | undefined>(undefined);
  /** Item que abre diálogo (Tarefa 6): o dono pede com origem no editável. */
  readonly dialog = output<RteDialogKind>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  private readonly elements = viewChildren('floating', { read: ElementRef });
  private readonly rovings = viewChildren('floating', { read: RteRovingFocus });
  private readonly menus = viewChildren(RteMenu);

  protected readonly textMarks = TEXT_MARKS;
  protected readonly tableOps = TABLE_OPS;
  protected readonly imageAligns = IMAGE_ALIGNS;
  protected readonly platform = signal<RtePlatform>('other');

  private readonly focusInMenu = signal(false);
  private readonly dragging = signal(false);
  private readonly composing = signal(false);
  private readonly dismissed = signal<RteFloatingIdentity | null>(null);
  private readonly clipped = signal(false);

  private readonly context = computed(
    () => {
      this.version()();
      const editor = this.editor();
      return editor.isDestroyed
        ? null
        : readFloatingContext(editor, this.kinds());
    },
    { equal: sameContext },
  );

  /** Tipo calculado sem o recorte da área visível (pré-voo 8). */
  private readonly candidate = computed(() =>
    readFloatingKind(this.context(), {
      enabled: this.enabled(),
      focus: this.focusInMenu()
        ? 'menu'
        : this.focused()
          ? 'editable'
          : 'other',
      dragging: this.dragging(),
      composing: this.composing(),
      dialog: this.blocked(),
      dismissed: this.dismissed(),
    }),
  );

  /** Tipo visível (`null` = nenhum). */
  readonly visibleKind: Signal<RteFloatingMenuKind | null> = computed(() =>
    this.clipped() ? null : this.candidate(),
  );

  /** Alinhamento da imagem selecionada (`aria-pressed` do menu de imagem). */
  protected readonly imageAlign = computed(() => {
    this.version()();
    const { selection } = this.editor().state;
    return selection instanceof NodeSelection &&
      selection.node.type.name === 'rtImage'
      ? String(selection.node.attrs['align'] ?? '')
      : null;
  });

  private shown: HTMLElement | null = null;
  private ancestors: HTMLElement[] | null = null;
  private readonly placed = new WeakMap<HTMLElement, string>();
  /** Dentro de `apply`/efeito: escritas de signal diretas, sem `ngZone.run`. */
  private applying = false;
  private dirty = false;
  private placing = false;
  private again = false;

  private readonly watch = new RteViewportWatch(
    this.document.defaultView,
    this.ngZone,
    () => (this.ancestors = null),
    () => {
      this.dirty = false;
      this.run(() => this.apply());
      // zone.js: uma volta da zona leva as escritas à detecção de mudanças
      if (this.dirty) this.ngZone.run(() => undefined);
    },
  );

  constructor() {
    afterNextRender(() => {
      this.platform.set(detectPlatform(this.document.defaultView?.navigator));
    });

    effect((onCleanup) => {
      const editor = this.editor();
      untracked(() =>
        onCleanup(
          bindFloatingListeners({
            editor,
            host: this.host,
            document: this.document,
            ngZone: this.ngZone,
            sink: {
              focusInMenu: (v) => this.write(this.focusInMenu, v),
              dragging: (v) => this.write(this.dragging, v),
              composing: (v) => this.write(this.composing, v),
              transaction: (tr) => this.remapDismissed(editor, tr),
            },
          }),
        ),
      );
    });

    // Tipo desligado ao vivo com o foco dentro (pré-voo 11): efeitos de
    // componente rodam antes do refresh do template, com o elemento no DOM.
    effect(() => {
      const kinds = this.kinds();
      untracked(() => this.releaseFocus(kinds));
    });

    // Mostrar, medir e escrever num só passo (pré-voo 9).
    afterRenderEffect({
      mixedReadWrite: () => {
        this.candidate();
        this.version()();
        this.kinds();
        this.elements();
        untracked(() => this.run(() => this.apply()));
      },
    });

    inject(DestroyRef).onDestroy(() => {
      this.watch.stop();
      this.shown = null;
    });
  }

  /** Foca o item ativo do menu visível; `false` sem menu visível. */
  focusActive(): boolean {
    const kind = untracked(this.visibleKind);
    if (!kind) return false;
    const index = untracked(this.kinds).indexOf(kind);
    return untracked(this.rovings)[index]?.focusActive() ?? false;
  }

  /** Oculta o menu visível até a identidade mudar (M6); `false` sem menu. */
  dismiss(): boolean {
    const ctx = untracked(this.context);
    if (!untracked(this.visibleKind) || !ctx) return false;
    this.write(this.dismissed, ctx.identity);
    return true;
  }

  /**
   * Foco num `.rte-floating` deste host cujo tipo não está em `kinds` vai ao
   * editável (M11, pré-voo 11), antes de o elemento sair do DOM. O
   * `RteEditor` chama com `[]` quando todos os menus vão sair.
   */
  releaseFocus(kinds: readonly RteFloatingMenuKind[]): void {
    const active = this.document.activeElement;
    const menu = active?.closest<HTMLElement>('.rte-floating');
    const kind = menu?.getAttribute('data-rte-kind');
    if (!menu || !this.host.contains(menu) || !kind) return;
    if (kinds.includes(kind as RteFloatingMenuKind)) return;
    this.run(() => this.focusEditable());
  }

  protected menuLabel(kind: RteFloatingMenuKind): string {
    return this.labels()[`${kind}Menu`];
  }

  protected icon(name: RteIconName): readonly string[] {
    return RTE_ICONS[name];
  }

  protected title(label: string, target: RteShortcutTarget | null): string {
    return shortcutTitle(label, target, this.platform());
  }

  protected markLabel(id: RteToolbarItemId): string {
    return this.toolbarLabels()[id as (typeof TEXT_MARKS)[number]];
  }

  /** Identidade dispensada mapeada; anulada quando o contexto muda (M6). */
  private remapDismissed(editor: Editor, tr: Transaction): void {
    const id = untracked(this.dismissed);
    if (!id) return;
    let next = tr.docChanged ? mapFloatingIdentity(id, tr.mapping) : id;
    const ctx = readFloatingContext(editor, untracked(this.kinds));
    if (next && !sameFloatingIdentity(ctx?.identity ?? null, next)) next = null;
    this.write(this.dismissed, next);
  }

  /**
   * Escreve só se mudou. Dentro de `apply`/efeito, direto (o render seguinte
   * o lê); de um ouvinte fora da zona, por `ngZone.run` (M20).
   */
  private write<T>(sig: WritableSignal<T>, value: T): void {
    const current = untracked(sig);
    if (
      Object.is(current, value) ||
      (typeof value === 'object' &&
        sameFloatingIdentity(
          current as RteFloatingIdentity | null,
          value as RteFloatingIdentity | null,
        ))
    ) {
      return;
    }
    if (this.applying) {
      sig.set(value);
      this.dirty = true;
      return;
    }
    this.ngZone.run(() => sig.set(value));
  }

  private run(fn: () => void): void {
    const was = this.applying;
    this.applying = true;
    try {
      fn();
    } finally {
      this.applying = was;
    }
  }

  /**
   * Mostra, posiciona ou oculta conforme o candidato e a área visível. Mover
   * o foco ao ocultar dispara eventos síncronos; uma reentrada só marca
   * `again`, e o passo roda mais uma vez no fim.
   */
  private apply(): void {
    if (this.placing) {
      this.again = true;
      return;
    }
    this.placing = true;
    try {
      this.again = false;
      this.applyOnce();
      if (this.again) {
        this.again = false;
        this.applyOnce();
      }
    } finally {
      this.placing = false;
    }
  }

  private applyOnce(): void {
    const kind = untracked(this.candidate);
    const editor = untracked(this.editor);
    if (!kind || editor.isDestroyed) {
      this.hide();
      this.write(this.clipped, false);
      this.watch.stop();
      return;
    }
    this.watch.start();
    const ctx = untracked(this.context);
    const el = this.elementOf(kind);
    const view = this.document.defaultView;
    if (!ctx || !el || !view) {
      this.hide();
      this.write(this.clipped, false);
      return;
    }
    const result = placeFloatingMenu({
      editor,
      ctx,
      el,
      view,
      ancestors: () => (this.ancestors ??= clipAncestors(editor.view.dom)),
      placed: this.placed,
      show: () => {
        if (this.shown === el) return;
        this.hide();
        el.classList.add(RTE_FLOATING_MEASURING);
        el.showPopover();
        this.shown = el;
      },
    });
    if (result === 'clipped') this.hide();
    this.write(this.clipped, result === 'clipped');
  }

  /**
   * Oculta o menu mostrado: fecha antes o submenu e, com o foco dentro, leva
   * o foco ao editável (M11). Depende da ordem das fases: em `disabled`/
   * `hidden` o `afterRenderEffect` de fase `write` do `RteEditor` já tirou o
   * foco do host (U18) antes desta fase `mixedReadWrite`, então aqui não há o
   * que mover e o `touch` sai uma vez.
   */
  private hide(): void {
    const el = this.shown;
    if (!el) return;
    this.shown = null;
    this.ancestors = null;
    for (const menu of untracked(this.menus)) {
      if (menu.isOpen()) menu.close('none');
    }
    if (el.contains(this.document.activeElement)) this.focusEditable();
    el.classList.remove(RTE_FLOATING_MEASURING);
    if (el.isConnected) el.hidePopover();
  }

  /** Foca o editável; em `readonly` o `view.focus()` não foca (não editável). */
  private focusEditable(): void {
    const editor = untracked(this.editor);
    if (editor.isDestroyed) return;
    const { view } = editor;
    if (view.editable) view.focus();
    else view.dom.focus({ preventScroll: true });
  }

  private elementOf(kind: RteFloatingMenuKind): HTMLElement | null {
    const index = untracked(this.kinds).indexOf(kind);
    const ref = untracked(this.elements)[index] as
      ElementRef<HTMLElement> | undefined;
    return ref?.nativeElement ?? null;
  }
}
