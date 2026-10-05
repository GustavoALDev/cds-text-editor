import type { ComponentFixture } from '@angular/core/testing';
import { settle } from './render';

type DialogProto = Record<string, unknown>;

/**
 * Calço mínimo de `<dialog>` para o jsdom (que tem `HTMLDialogElement` sem
 * `show`/`showModal`/`close`): abre e fecha pelo atributo `open`; `close`
 * despacha `close` de forma síncrona (no navegador o evento vem numa tarefa).
 * Não implementa inércia, *top layer*, ciclo de `Tab` nem devolução de foco
 * (ficam no navegador, N18). Supre também `Range.getClientRects`/
 * `getBoundingClientRect` (vazios), que o foco com rolagem do ProseMirror lê
 * ao devolver o foco ao editável. Só acrescenta o que falta; devolve a função
 * que restaura os protótipos.
 */
export function installDialogShim(): () => void {
  const proto = HTMLDialogElement.prototype as unknown as DialogProto;
  const added: string[] = [];
  const values = new WeakMap<HTMLDialogElement, string>();

  function define(name: string, descriptor: PropertyDescriptor): void {
    if (name in proto) return;
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });
    added.push(name);
  }

  define('open', {
    get(this: HTMLDialogElement) {
      return this.hasAttribute('open');
    },
    set(this: HTMLDialogElement, value: boolean) {
      this.toggleAttribute('open', !!value);
    },
  });
  define('returnValue', {
    get(this: HTMLDialogElement) {
      return values.get(this) ?? '';
    },
    set(this: HTMLDialogElement, value: string) {
      values.set(this, String(value));
    },
  });
  define('show', {
    writable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  define('showModal', {
    writable: true,
    value(this: HTMLDialogElement) {
      if (!this.isConnected) {
        throw new DOMException('dialog fora do documento', 'InvalidStateError');
      }
      this.setAttribute('open', '');
    },
  });
  define('close', {
    writable: true,
    value(this: HTMLDialogElement, returnValue?: string) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      if (returnValue !== undefined) values.set(this, String(returnValue));
      this.dispatchEvent(new Event('close'));
    },
  });

  const range = Range.prototype as unknown as DialogProto;
  const rangeAdded: string[] = [];
  const rect = () => ({
    ...{ x: 0, y: 0, width: 0, height: 0 },
    ...{ top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) },
  });
  for (const [name, value] of [
    ['getClientRects', () => Object.assign([], { item: () => null })],
    ['getBoundingClientRect', rect],
  ] as const) {
    if (typeof range[name] === 'function') continue;
    Object.defineProperty(range, name, {
      configurable: true,
      writable: true,
      value,
    });
    rangeAdded.push(name);
  }

  return () => {
    for (const name of added) delete proto[name];
    for (const name of rangeAdded) delete range[name];
  };
}

/** `Escape` num modal: `cancel` cancelável e, sem `preventDefault`, `close()`. */
export function escapeDialog(dialog: HTMLDialogElement): void {
  const event = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(event);
  if (!event.defaultPrevented) dialog.close();
}

/**
 * Espera o `.rte-dialog[open]` dentro da fixture (o *chunk* do `@defer` chega
 * por `import()`): até 20 rodadas de `settle` + uma tarefa.
 */
export async function waitForDialog(
  fixture: ComponentFixture<unknown>,
): Promise<HTMLDialogElement> {
  const root = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 20; i++) {
    await settle(fixture);
    const dialog = root.querySelector<HTMLDialogElement>('.rte-dialog[open]');
    if (dialog) return dialog;
    await new Promise((resolve) => setTimeout(resolve));
  }
  throw new Error('waitForDialog: nenhum .rte-dialog[open]');
}
