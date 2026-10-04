/**
 * Calço mínimo da API de *popover* para o jsdom (que não a implementa):
 * `showPopover`/`hidePopover`/`togglePopover` despacham `toggle` (síncrono,
 * diferente do navegador, onde o evento vem numa tarefa) com `newState`/
 * `oldState`; abrir um `popover="auto"` fecha os outros `auto` abertos que não
 * o contêm, como o navegador. Não move o foco nem faz *light dismiss*: o teste
 * simula o *light dismiss* com `hidePopover()`. Devolve a função que restaura
 * o protótipo (no-op quando o ambiente já tinha a API).
 */
export function installPopoverShim(): () => void {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto['showPopover'] === 'function') return () => undefined;

  const open = new Set<HTMLElement>();

  function dispatch(el: HTMLElement, oldState: string, newState: string) {
    const event = new Event('toggle');
    Object.assign(event, { oldState, newState });
    el.dispatchEvent(event);
  }

  function hide(this: HTMLElement): void {
    if (!open.delete(this)) return;
    dispatch(this, 'open', 'closed');
  }

  function show(this: HTMLElement): void {
    if (open.has(this)) return;
    if (this.getAttribute('popover') === 'auto') {
      for (const other of [...open]) {
        if (other.getAttribute('popover') === 'auto' && !other.contains(this)) {
          hide.call(other);
        }
      }
    }
    open.add(this);
    dispatch(this, 'closed', 'open');
  }

  function toggle(this: HTMLElement, force?: boolean): boolean {
    const next = force ?? !open.has(this);
    if (next) show.call(this);
    else hide.call(this);
    return next;
  }

  proto['showPopover'] = show;
  proto['hidePopover'] = hide;
  proto['togglePopover'] = toggle;
  return () => {
    open.clear();
    delete proto['showPopover'];
    delete proto['hidePopover'];
    delete proto['togglePopover'];
  };
}
