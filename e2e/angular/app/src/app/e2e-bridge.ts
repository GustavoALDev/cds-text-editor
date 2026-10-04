import {
  afterNextRender,
  ApplicationRef,
  DestroyRef,
  DOCUMENT,
  inject,
  Injectable,
  NgZone,
  signal,
} from '@angular/core';
import type { RteToolbarConfig } from '@cds/rte-angular';
import { getRteEditor } from '@cds/rte-angular/testing';
import { getRteHtml } from '@cds/rte-core/extensions';
import { applyRteTheme, type RteTheme } from '@cds/rte-theme';
import type { Editor } from '@tiptap/core';

/** Editores que os testes leem (`data-testid` igual ao id). */
export type RteE2eId =
  | 'signal'
  | 'reactive'
  | 'plain'
  | 'labels'
  | 'content'
  | 'perf'
  | 'toolbar'
  | 'toolbar-alt'
  | 'toolbar-scroll'
  | 'toolbar-nofeat';
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
  /** `[toolbar]` ao vivo (páginas `toolbar` e `perf`). */
  setToolbar?(config: RteToolbarConfig): void;
  /** `[theme]` ao vivo (página `toolbar`). */
  setTheme?(theme: RteTheme | undefined): void;
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
  setToolbar(id: RteE2eId, config: RteToolbarConfig): void;
  setTheme(id: RteE2eId, theme: RteTheme | undefined): void;
  /** `applyRteTheme` num elemento qualquer (referência do N12). */
  applyTheme(element: HTMLElement, theme: RteTheme): void;
  /** Detecção de mudanças síncrona (`ApplicationRef.tick`), para medir o render (N15). */
  tick(): void;
  /** Passa a contar as mutações de DOM na barra do editor `id` (N15, R6). */
  watchToolbar(id: RteE2eId): void;
  /** Mutações na barra desde o `watchToolbar(id)`. */
  toolbarMutations(id: RteE2eId): number;
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

  setToolbar(id: RteE2eId, config: RteToolbarConfig): void {
    const set = this.handle(id).setToolbar;
    if (!set) throw new Error(`rteE2e: editor '${id}' sem [toolbar] ao vivo.`);
    set(config);
  }

  setTheme(id: RteE2eId, theme: RteTheme | undefined): void {
    const set = this.handle(id).setTheme;
    if (!set) throw new Error(`rteE2e: editor '${id}' sem [theme] ao vivo.`);
    set(theme);
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
  const appRef = inject(ApplicationRef);
  afterNextRender(() => {
    const win = doc.defaultView as (Window & { rteE2e?: RteE2eApi }) | null;
    if (!win) return;
    // Chamadas do Playwright chegam fora da zona: `zone.run` mantém o build
    // `zone` igual ao zoneless (no zoneless o `NgZone` é um no-op).
    const run = <T>(fn: () => T): T => zone.run(fn);
    const watched = new Map<
      RteE2eId,
      { observer: MutationObserver; count: number }
    >();
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
      setToolbar: (id, config) => run(() => bridge.setToolbar(id, config)),
      setTheme: (id, theme) => run(() => bridge.setTheme(id, theme)),
      tick: () => run(() => appRef.tick()),
      applyTheme: (element, theme) => {
        applyRteTheme(element, theme);
      },
      watchToolbar: (id) => {
        const toolbar = doc.querySelector(
          `rte-editor[data-testid="${id}"] .rte-toolbar`,
        );
        if (!toolbar) throw new Error(`rteE2e: editor '${id}' sem barra.`);
        watched.get(id)?.observer.disconnect();
        const entry = {
          observer: new MutationObserver((records) => {
            entry.count += records.length;
          }),
          count: 0,
        };
        entry.observer.observe(toolbar, {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        });
        watched.set(id, entry);
      },
      toolbarMutations: (id) => {
        const entry = watched.get(id);
        if (!entry) throw new Error(`rteE2e: barra '${id}' sem watchToolbar.`);
        // registros ainda na fila do observador também contam
        entry.count += entry.observer.takeRecords().length;
        return entry.count;
      },
      readyAt: bridge.readyAt,
      get toggledAt() {
        return bridge.toggledAt;
      },
    };
  });
}
