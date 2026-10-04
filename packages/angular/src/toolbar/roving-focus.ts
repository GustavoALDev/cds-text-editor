import {
  computed,
  contentChildren,
  Directive,
  ElementRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';

/** Item com `disabled` nativo não recebe foco (U10); `aria-disabled` recebe (U3). */
export function isFocusableItem(el: HTMLElement): boolean {
  return !el.matches(':disabled');
}

/** Direção pelo atributo `dir` mais próximo (pré-voo 11). */
export function isRtl(el: Element): boolean {
  return el.closest('[dir]')?.getAttribute('dir') === 'rtl';
}

/**
 * Foco itinerante do APG *toolbar* (U3): um só item com `tabindex="0"` — o
 * último focado ou, sem ele (no início ou depois que saiu do conjunto), o
 * primeiro focável; `←`/`→` circulares (invertidos em `dir="rtl"`),
 * `Home`/`End` nas pontas. Os itens são os `[rteRovingItem]` descendentes.
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
  /** @internal */
  readonly items = contentChildren(RteRovingItem, { descendants: true });
  private readonly lastFocused = signal<HTMLElement | null>(null);

  /**
   * Índice do item ativo em `items()`; `-1` sem item focável. O `disabled`
   * nativo é lido do DOM quando o conjunto ou o último focado mudam.
   */
  readonly activeIndex: Signal<number> = computed(() => {
    const elements = this.items().map((item) => item.element);
    const last = this.lastFocused();
    if (last && elements.includes(last) && isFocusableItem(last)) {
      return elements.indexOf(last);
    }
    return elements.findIndex(isFocusableItem);
  });

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
    const elements = this.items().map((item) => item.element);
    const current = elements.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    const forward = isRtl(this.host) ? -1 : 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = step(elements, current, forward);
        break;
      case 'ArrowLeft':
        next = step(elements, current, -forward);
        break;
      case 'Home':
        next = elements.findIndex(isFocusableItem);
        break;
      case 'End':
        next = step(elements, 0, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = elements[next];
    if (!target) return;
    target.focus();
    this.lastFocused.set(target);
  }
}

/** Próximo índice focável a partir de `from`, com volta circular. */
function step(elements: HTMLElement[], from: number, delta: number): number {
  const n = elements.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + delta * k) % n) + n) % n;
    const el = elements[i];
    if (el && isFocusableItem(el)) return i;
  }
  return -1;
}

/** Item do foco itinerante: `tabindex` `0` no ativo, `-1` nos outros. */
@Directive({
  selector: '[rteRovingItem]',
  host: { '[attr.tabindex]': 'tabIndex()' },
})
export class RteRovingItem {
  /** @internal */
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly group = inject(RteRovingFocus);
  protected readonly tabIndex = computed(() =>
    this.group.items()[this.group.activeIndex()] === this ? 0 : -1,
  );
}
