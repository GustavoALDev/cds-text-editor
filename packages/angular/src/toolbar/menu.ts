import {
  computed,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { positionMenu } from './position';
import { isFocusableItem, isRtl } from './roving-focus';

let nextMenuId = 0;

const ITEM_SELECTOR = '[role^="menuitem"]';

/**
 * Menu do APG *menu button* (U6) num `popover="auto"` nativo, descendente do
 * host (U7). A posição é calculada por `positionMenu` sobre os retângulos do
 * gatilho e do menu e aplicada por CSSOM (`style.setProperty`, aceito pela
 * CSP); reposiciona em `scroll` (captura) e `resize` só enquanto aberto.
 * `Enter`/`Espaço` ficam com a ativação nativa do `<button>` do item; quem
 * trata o clique do item fecha o menu.
 */
@Directive({
  selector: '[rteMenu]',
  exportAs: 'rteMenu',
  host: {
    popover: 'auto',
    role: 'menu',
    class: 'rte-menu',
    '[id]': 'id',
    '(keydown)': 'onKeydown($event)',
    '(toggle)': 'onToggle($event)',
    '(focusin)': 'onFocusin()',
    '(focusout)': 'onFocusout($event)',
  },
})
export class RteMenu {
  private readonly element =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);

  /** `id` único por instância (`aria-controls` do gatilho). */
  readonly id = `rte-menu-${++nextMenuId}`;
  private readonly open$ = signal(false);
  readonly isOpen = this.open$.asReadonly();
  /** `Tab` saiu do menu: o dono leva o foco adiante (U6). */
  readonly tabOut = output<'forward' | 'backward'>();

  /** @internal Gatilho do último `open`, fixado por `RteMenuTrigger`. */
  trigger: HTMLElement | null = null;
  private focusInside = false;
  private listening = false;
  private readonly reposition = (event: Event): void => {
    const target = event.target;
    // rolagem interna do próprio menu (max-height) não move o menu
    if (target instanceof Node && this.element.contains(target)) return;
    const view = this.document.defaultView;
    if (!view || this.frame !== null) return;
    // uma medição por quadro (scroll/resize disparam várias vezes por quadro);
    // não serve à detecção de mudanças: só grava a posição por CSSOM
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.place();
    });
  };
  private frame: number | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      const wasOpen = this.open$();
      // destruído: o `toggle` do fechamento não devolve o foco ao gatilho
      this.focusInside = false;
      this.trigger = null;
      this.teardown();
      if (wasOpen) this.element.hidePopover();
    });
  }

  /** Abre (`showPopover()`), posiciona e foca o primeiro ou o último item. */
  open(focus: 'first' | 'last'): void {
    if (!this.open$()) {
      this.element.showPopover();
      this.open$.set(true);
      this.listen();
    }
    this.place();
    const items = this.items();
    (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
  }

  /** Fecha; `'trigger'` devolve o foco ao gatilho. */
  close(focusTo: 'trigger' | 'none'): void {
    // fechamento explícito: o foco é decidido aqui, não no `toggle`
    this.focusInside = false;
    if (this.open$()) {
      this.teardown();
      this.element.hidePopover();
    }
    if (focusTo === 'trigger') this.trigger?.focus();
  }

  private items(): HTMLElement[] {
    return [
      ...this.element.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
    ].filter(isFocusableItem);
  }

  private listen(): void {
    const view = this.document.defaultView;
    if (!view || this.listening) return;
    view.addEventListener('scroll', this.reposition, true);
    view.addEventListener('resize', this.reposition);
    this.listening = true;
  }

  private teardown(): void {
    this.open$.set(false);
    const view = this.document.defaultView;
    if (view && this.frame !== null) view.cancelAnimationFrame(this.frame);
    this.frame = null;
    if (!view || !this.listening) return;
    view.removeEventListener('scroll', this.reposition, true);
    view.removeEventListener('resize', this.reposition);
    this.listening = false;
  }

  private place(): void {
    const trigger = this.trigger;
    const view = this.document.defaultView;
    if (!trigger || !view) return;
    const el = this.element;
    const root = this.document.documentElement;
    // altura natural pelo scrollHeight (+ bordas): não depende do max-height
    // atual e não zera a rolagem interna
    const height = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    const p = positionMenu({
      trigger: trigger.getBoundingClientRect(),
      menu: { width: el.offsetWidth, height },
      viewport: {
        width: root.clientWidth || view.innerWidth,
        height: root.clientHeight || view.innerHeight,
      },
      rtl: isRtl(trigger),
    });
    el.style.setProperty('left', `${p.left}px`);
    el.style.setProperty('top', `${p.top}px`);
    el.style.setProperty('max-height', `${p.maxHeight}px`);
  }

  protected onFocusin(): void {
    this.focusInside = true;
  }

  protected onFocusout(event: FocusEvent): void {
    const next = event.relatedTarget;
    // sem relatedTarget (foco ao body, ou o motor escondeu o item focado)
    // mantém a marca: o `toggle` decide pelo activeElement
    if (next instanceof Node) this.focusInside = this.element.contains(next);
  }

  protected onToggle(event: Event): void {
    if ((event as ToggleEvent).newState !== 'closed') return;
    this.teardown();
    const wasInside = this.focusInside;
    this.focusInside = false;
    if (!wasInside) return;
    const active = this.document.activeElement;
    if (
      !active ||
      active === this.document.body ||
      this.element.contains(active)
    ) {
      this.trigger?.focus();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const items = this.items();
    const current = items.indexOf(event.target as HTMLElement);
    const n = items.length;
    let next = -1;
    switch (event.key) {
      case 'ArrowDown':
        next = n ? (current + 1) % n : -1;
        break;
      case 'ArrowUp':
        // sem item focado (current -1) vai ao último
        next = n ? (current <= 0 ? n - 1 : current - 1) : -1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      case 'Escape':
        this.consume(event);
        this.close('trigger');
        return;
      case 'Tab':
        this.consume(event);
        if (event.shiftKey) {
          this.close('trigger');
        } else {
          this.close('none');
          this.tabOut.emit('forward');
        }
        return;
      default:
        if (event.key.length !== 1 || event.key === ' ') return;
        next = matchFirstLetter(items, current, event.key);
        if (next < 0) {
          this.consume(event);
          return;
        }
    }
    this.consume(event);
    items[next]?.focus();
  }

  private consume(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
}

/** Próximo item (circular, depois de `current`) que começa por `key`. */
function matchFirstLetter(
  items: HTMLElement[],
  current: number,
  key: string,
): number {
  const wanted = key.toLocaleLowerCase();
  const n = items.length;
  for (let k = 1; k <= n; k++) {
    const i = (current + k + n) % n;
    const text = (items[i]?.textContent ?? '').trim().toLocaleLowerCase();
    if (text.startsWith(wanted)) return i;
  }
  return -1;
}

/**
 * Botão que abre um `RteMenu` (U6): `Enter`/`Espaço`/`↓` abrem no primeiro
 * item, `↑` no último; o clique alterna. Gatilho `disabled` ou
 * `aria-disabled="true"` não abre. O estado aberto é lido no `pointerdown`:
 * o *light dismiss* do navegador fecha o menu no `pointerup`, antes do
 * `click`, e sem isso o clique no próprio gatilho reabriria o menu. O valor
 * só vale para o `click` de ponteiro seguinte (`detail > 0`); `pointercancel`
 * e qualquer `click` o descartam, então um `click` sem ponteiro (programático,
 * tecnologia assistiva) depois de um `pointerdown` sem `click` usa o estado
 * atual. Zerar no `pointerup` não serve: o `click` vem depois dele.
 */
@Directive({
  selector: '[rteMenuTrigger]',
  host: {
    'aria-haspopup': 'menu',
    '[attr.aria-expanded]': 'expanded()',
    '[attr.aria-controls]': 'menu().id',
    '(keydown)': 'onKeydown($event)',
    '(pointerdown)': 'onPointerdown()',
    '(pointercancel)': 'onPointercancel()',
    '(click)': 'onClick($event)',
  },
})
export class RteMenuTrigger {
  readonly menu = input.required<RteMenu>({ alias: 'rteMenuTrigger' });
  private readonly element =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly expanded = computed(() => String(this.menu().isOpen()));
  private openAtPointerDown: boolean | null = null;

  private blocked(): boolean {
    return (
      this.element.matches(':disabled') ||
      this.element.getAttribute('aria-disabled') === 'true'
    );
  }

  private open(focus: 'first' | 'last'): void {
    const menu = this.menu();
    menu.trigger = this.element;
    menu.open(focus);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }
    let focus: 'first' | 'last';
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        focus = 'first';
        break;
      case 'ArrowUp':
        focus = 'last';
        break;
      default:
        return;
    }
    // sem o clique sintético do Enter/Espaço
    event.preventDefault();
    if (!this.blocked()) this.open(focus);
  }

  protected onPointerdown(): void {
    this.openAtPointerDown = this.menu().isOpen();
  }

  protected onPointercancel(): void {
    this.openAtPointerDown = null;
  }

  protected onClick(event: MouseEvent): void {
    const atPointerDown = event.detail > 0 ? this.openAtPointerDown : null;
    this.openAtPointerDown = null;
    const wasOpen = atPointerDown ?? this.menu().isOpen();
    if (wasOpen) {
      this.menu().close('trigger');
      return;
    }
    if (!this.blocked()) this.open('first');
  }
}
