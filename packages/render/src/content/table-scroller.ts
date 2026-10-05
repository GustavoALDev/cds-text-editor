/** Seletor do rolador que `prepareRteHtml` põe em volta de cada `table` (H6). */
const SCROLLER = 'div.rte-table-scroll';

/** Observador dos roladores de tabela de uma instância da diretiva (H7). */
export interface RteTableScrollers {
  /** Passa a observar os roladores atuais (depois de cada inserção). */
  refresh(): void;
  /** Reescreve o `aria-label` dos roladores marcados (troca de rótulo). */
  relabel(): void;
  /** Desconecta; nada mais é escrito. */
  destroy(): void;
}

function mark(scroller: HTMLElement, label: string): void {
  if (scroller.getAttribute('tabindex') !== '0')
    scroller.setAttribute('tabindex', '0');
  if (scroller.getAttribute('role') !== 'region')
    scroller.setAttribute('role', 'region');
  if (scroller.getAttribute('aria-label') !== label)
    scroller.setAttribute('aria-label', label);
}

/**
 * `Home`/`End` no rolador marcado e focado levam ao início/fim da rolagem horizontal: os
 * motores só usam essas teclas na vertical (sem tratá-las, `End` rola a página). Em `rtl` o
 * fim tem `scrollLeft` negativo.
 */
function scrollToEdge(
  scroller: HTMLElement,
  key: 'Home' | 'End',
  win: Window,
): void {
  if (key === 'Home') {
    scroller.scrollLeft = 0;
    return;
  }
  const max = scroller.scrollWidth - scroller.clientWidth;
  const rtl = win.getComputedStyle(scroller).direction === 'rtl';
  scroller.scrollLeft = rtl ? -max : max;
}

function unmark(scroller: HTMLElement): void {
  for (const name of ['tabindex', 'role', 'aria-label']) {
    if (scroller.hasAttribute(name)) scroller.removeAttribute(name);
  }
}

/**
 * Torna focável (WCAG 2.1.1) só o rolador cuja tabela transborda (H7, pré-voo
 * 8): um `ResizeObserver` observa cada `div.rte-table-scroll` **e** a sua
 * `table` (a tabela muda de largura sem o rolador mudar). Transborda ⇔
 * `scrollWidth > clientWidth` → `tabindex="0"`, `role="region"` e
 * `aria-label`; senão os três saem. Nada é escrito em *signal* (H18): quem
 * chama cria isto fora da zona Angular. Sem `ResizeObserver` → `null` (fica o
 * rolador nativo).
 */
export function createTableScrollers(
  root: Element,
  win: Window & typeof globalThis,
  label: () => string,
): RteTableScrollers | null {
  const Observer = win.ResizeObserver;
  if (typeof Observer !== 'function') return null;

  // Elemento observado → rolador; só os da inserção atual.
  const owners = new Map<Element, HTMLElement>();
  let scrollers: HTMLElement[] = [];
  let destroyed = false;

  const observer = new Observer((entries) => {
    if (destroyed) return;
    const due = new Set<HTMLElement>();
    for (const entry of entries) {
      const scroller = owners.get(entry.target);
      if (scroller) due.add(scroller);
    }
    for (const scroller of due) {
      if (scroller.scrollWidth > scroller.clientWidth) mark(scroller, label());
      else unmark(scroller);
    }
  });

  // Um ouvinte por instância, no *host* (criado fora da zona Angular, como o observador).
  const onKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      (event.key !== 'Home' && event.key !== 'End') ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !scrollers.includes(target) ||
      target.getAttribute('role') !== 'region'
    )
      return;
    event.preventDefault();
    scrollToEdge(target, event.key, win);
  };
  root.addEventListener('keydown', onKeydown as EventListener);

  return {
    refresh() {
      if (destroyed) return;
      observer.disconnect();
      owners.clear();
      scrollers = [...root.querySelectorAll<HTMLElement>(SCROLLER)];
      for (const scroller of scrollers) {
        owners.set(scroller, scroller);
        observer.observe(scroller);
        const table = scroller.querySelector('table');
        if (table) {
          owners.set(table, scroller);
          observer.observe(table);
        }
      }
    },
    relabel() {
      if (destroyed) return;
      const text = label();
      for (const scroller of scrollers) {
        if (
          scroller.getAttribute('role') === 'region' &&
          scroller.getAttribute('aria-label') !== text
        ) {
          scroller.setAttribute('aria-label', text);
        }
      }
    },
    destroy() {
      destroyed = true;
      root.removeEventListener('keydown', onKeydown as EventListener);
      observer.disconnect();
      owners.clear();
      scrollers = [];
    },
  };
}
