import {
  booleanAttribute,
  computed,
  contentChildren,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  type Signal,
} from '@angular/core';

/** Item com `disabled` nativo não recebe foco (U10); `aria-disabled` recebe (U3). */
export function isFocusableItem(el: HTMLElement): boolean {
  return !el.matches(':disabled');
}

/**
 * Direção pelo atributo `dir` mais próximo (pré-voo 11); `dir="auto"` é
 * resolvido pela direção computada (`getComputedStyle(...).direction`).
 */
export function isRtl(el: Element): boolean {
  const dir = el.closest('[dir]')?.getAttribute('dir')?.toLowerCase();
  if (dir === 'auto') {
    const view = el.ownerDocument.defaultView;
    return view?.getComputedStyle(el).direction === 'rtl';
  }
  return dir === 'rtl';
}

/**
 * Item focável = entrada `disabled` falsa. A fonte é o signal, não o DOM: o
 * `activeIndex` recalcula quando a barra é habilitada depois da criação do
 * editor (U10), e ler `:disabled` no `computed` pegaria o atributo antigo (a
 * ligação de *host* do `tabindex` é avaliada antes da do `disabled`).
 */
function canFocus(item: RteRovingItem): boolean {
  return !item.disabled();
}

// RteRovingItem vem antes: contentChildren(RteRovingItem) vira um predicate
// avaliado ao declarar a classe (sem o linker, TDZ).
/**
 * Item do foco itinerante: `tabindex` `0` no ativo quando o grupo tem parada
 * de `Tab` (`tabStop`), `-1` nos outros (e em todos sem parada). Recebe
 * o `[disabled]` do elemento como entrada (signal) e o repassa ao atributo
 * nativo, para o grupo reagir quando o item é habilitado ou desabilitado.
 */
@Directive({
  selector: '[rteRovingItem]',
  host: {
    '[attr.tabindex]': 'tabIndex()',
    '[attr.disabled]': 'disabled() ? "" : null',
  },
})
export class RteRovingItem {
  readonly disabled = input(false, { transform: booleanAttribute });
  /** @internal */
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly group = inject(RteRovingFocus);
  protected readonly tabIndex = computed(() =>
    this.group.tabStop() &&
    this.group.items()[this.group.activeIndex()] === this
      ? 0
      : -1,
  );
}

/**
 * Foco itinerante do APG *toolbar* (U3): um só item com `tabindex="0"` — o
 * último focado ou, sem ele (no início, depois que saiu do conjunto ou ficou
 * `disabled`), o primeiro focável; `←`/`→` circulares (invertidos em
 * `dir="rtl"`), `Home`/`End` nas pontas. Os itens são os `[rteRovingItem]`
 * descendentes. Com `[rteRovingTabStop]="false"` (menus flutuantes, M11)
 * nenhum item é parada de `Tab`: todos ficam `tabindex="-1"` e o grupo só é
 * alcançado por `focusActive()`.
 */
@Directive({
  selector: '[rteRovingFocus]',
  host: {
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusin($event)',
  },
})
export class RteRovingFocus {
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /**
   * @internal `false`: nenhum item com `tabindex="0"` (pré-voo 2). O nome do
   * campo é o do atributo: o lint proíbe *alias* de entrada.
   */
  readonly rteRovingTabStop = input(true, { transform: booleanAttribute });
  /** @internal O grupo tem parada de `Tab` (`rteRovingTabStop`). */
  readonly tabStop: Signal<boolean> = this.rteRovingTabStop;
  private readonly contentItems = contentChildren(RteRovingItem, {
    descendants: true,
  });
  private readonly viewItems = signal<Signal<readonly RteRovingItem[]> | null>(
    null,
  );
  /**
   * @internal Itens em ordem do DOM: os de `useItems` ou, sem eles, os
   * `[rteRovingItem]` do conteúdo.
   */
  readonly items: Signal<readonly RteRovingItem[]> = computed(
    () => this.viewItems()?.() ?? this.contentItems(),
  );
  private readonly lastFocused = signal<HTMLElement | null>(null);

  /**
   * Índice do item ativo em `items()`; `-1` sem item focável. Recalcula
   * quando mudam o conjunto, o último focado ou o `disabled` de um item.
   */
  readonly activeIndex: Signal<number> = computed(() => {
    const items = this.items();
    const last = this.lastFocused();
    const kept = items.findIndex((item) => item.element === last);
    const keptItem = items[kept];
    if (keptItem && canFocus(keptItem)) return kept;
    return items.findIndex(canFocus);
  });

  /**
   * @internal Fonte dos itens quando a diretiva é `hostDirective` de um
   * componente: a consulta de conteúdo não enxerga a vista do componente, que
   * passa os seus (`viewChildren(RteRovingItem)`).
   */
  useItems(items: Signal<readonly RteRovingItem[]>): void {
    this.viewItems.set(items);
  }

  /** Foca o item ativo; `false` se não há item focável. */
  focusActive(): boolean {
    const item = this.items()[this.activeIndex()];
    if (!item) return false;
    item.element.focus();
    return true;
  }

  protected onFocusin(event: FocusEvent): void {
    const target = event.target;
    if (this.items().some((item) => item.element === target)) {
      this.lastFocused.set(target as HTMLElement);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const items = this.items();
    const current = items.findIndex((item) => item.element === event.target);
    if (current < 0) return;
    const forward = isRtl(this.host) ? -1 : 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = step(items, current, forward);
        break;
      case 'ArrowLeft':
        next = step(items, current, -forward);
        break;
      case 'Home':
        next = items.findIndex(canFocus);
        break;
      case 'End':
        next = step(items, 0, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = items[next]?.element;
    if (!target) return;
    target.focus();
    this.lastFocused.set(target);
    // A parada de Tab acompanha o foco já no `keydown`: um `Tab` antes do
    // render usaria o `tabindex` antigo (N9). A ligação de host grava os
    // mesmos valores no render seguinte.
    const tabStop = this.tabStop();
    for (const item of items) {
      item.element.setAttribute(
        'tabindex',
        tabStop && item.element === target ? '0' : '-1',
      );
    }
  }
}

/** Próximo índice focável a partir de `from`, com volta circular. */
function step(
  items: readonly RteRovingItem[],
  from: number,
  delta: number,
): number {
  const n = items.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + delta * k) % n) + n) % n;
    const item = items[i];
    if (item && canFocus(item)) return i;
  }
  return -1;
}
