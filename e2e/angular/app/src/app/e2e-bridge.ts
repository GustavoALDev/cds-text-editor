import {
  afterNextRender,
  DestroyRef,
  DOCUMENT,
  inject,
  Injectable,
  NgZone,
  signal,
} from '@angular/core';
import { getRteEditor } from '@cds/rte-angular/testing';
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';

/** Editores que os testes leem (`data-testid` igual ao id). */
export type RteE2eId =
  'signal' | 'reactive' | 'plain' | 'labels' | 'content' | 'perf';
export type RteE2eToggle = 'disabled' | 'readonly' | 'hidden' | 'show';
export type RteE2eLang = 'en' | 'pt-BR' | 'es';

export interface RteE2eState {
  valid: boolean;
  touched: boolean;
  dirty: boolean;
  errors: string[];
}

/** O que cada página registra para um editor. */
export interface RteE2eHandle {
  value(): string;
  setValue(html: string): void;
  state(): RteE2eState;
  reset(): void;
}

/** `window.rteE2e`: só o que os testes leem (spec 05a, §6.2; sem `ng.getComponent`). */
export interface RteE2eApi {
  getRteEditor(host: Element): Editor | null;
  /** `getRteHtml` do editor vivo em `host` (o documento, não o modelo da página). */
  rteHtml(host: Element): string | null;
  value(id: RteE2eId): string;
  setValue(id: RteE2eId, html: string): void;
  state(id: RteE2eId): RteE2eState;
  reset(id: RteE2eId): void;
  toggle(name: RteE2eToggle): void;
  setLang(lang: RteE2eLang): void;
  readonly readyAt: Partial<Record<RteE2eId, number>>;
  readonly toggledAt: number | null;
}

/** Estado sem formulário (`[(value)]`): sempre válido, nunca tocado. */
export const NO_FORM_STATE: RteE2eState = {
  valid: true,
  touched: false,
  dirty: false,
  errors: [],
};

/** Estado compartilhado entre as páginas e a ponte da `window`. */
@Injectable({ providedIn: 'root' })
export class E2eBridge {
  readonly disabled = signal(false);
  readonly readonly = signal(false);
  readonly hidden = signal(false);
  readonly show = signal(true);
  readonly lang = signal<RteE2eLang>('en');
  readonly readyAt: Partial<Record<RteE2eId, number>> = {};
  toggledAt: number | null = null;

  private readonly handles = new Map<RteE2eId, RteE2eHandle>();

  /** Registra o editor `id` da página até ela ser destruída. */
  register(id: RteE2eId, handle: RteE2eHandle): void {
    this.handles.set(id, handle);
    inject(DestroyRef).onDestroy(() => {
      if (this.handles.get(id) === handle) this.handles.delete(id);
    });
  }

  /** Marca o `editorReady` do editor `id` (N8). */
  ready(id: RteE2eId): void {
    this.readyAt[id] = performance.now();
  }

  handle(id: RteE2eId): RteE2eHandle {
    const handle = this.handles.get(id);
    if (!handle) throw new Error(`rteE2e: editor '${id}' fora da rota atual.`);
    return handle;
  }

  toggle(name: RteE2eToggle): void {
    this.toggledAt = performance.now();
    this[name].update((v) => !v);
  }
}

/** Liga `window.rteE2e` depois do primeiro render, só no navegador. */
export function installE2eBridge(): void {
  const bridge = inject(E2eBridge);
  const zone = inject(NgZone);
  const doc = inject(DOCUMENT);
  afterNextRender(() => {
    const win = doc.defaultView as (Window & { rteE2e?: RteE2eApi }) | null;
    if (!win) return;
    // Chamadas do Playwright chegam fora da zona: `zone.run` mantém o build
    // `zone` igual ao zoneless (no zoneless o `NgZone` é um no-op).
    const run = <T>(fn: () => T): T => zone.run(fn);
    win.rteE2e = {
      getRteEditor,
      rteHtml: (host) => {
        const editor = getRteEditor(host);
        return editor ? getRteHtml(editor) : null;
      },
      value: (id) => run(() => bridge.handle(id).value()),
      setValue: (id, html) => run(() => bridge.handle(id).setValue(html)),
      state: (id) => run(() => bridge.handle(id).state()),
      reset: (id) => run(() => bridge.handle(id).reset()),
      toggle: (name) => run(() => bridge.toggle(name)),
      setLang: (lang) => run(() => bridge.lang.set(lang)),
      readyAt: bridge.readyAt,
      get toggledAt() {
        return bridge.toggledAt;
      },
    };
  });
}
