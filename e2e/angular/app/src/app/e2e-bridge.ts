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
import type {
  RteEditor,
  RteMediaChange,
  RteMediaSession,
  RteToolbarConfig,
  RteUploadErrorEvent,
  RteUploadStatus,
} from '@cds/rte-angular';
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
  | 'toolbar-nofeat'
  | 'dialogs'
  | 'dialogs-api'
  | 'floating'
  | 'floating-alt'
  | 'media'
  | 'media-alt'
  | 'media-key'
  | 'upload'
  | 'upload-reactive'
  | 'upload-template'
  | 'upload-none';
/** Exibições da rota `render` que os testes leem (`data-testid` igual ao id). */
export type RteE2eRenderId =
  'render-main' | 'render-wide' | 'render-input' | 'render-keep';
export type RteE2eToggle = 'disabled' | 'readonly' | 'hidden' | 'show';
export type RteE2eLang = 'en' | 'pt-BR' | 'es';
/** `[upload]` ao vivo: `http` (nova config com a consulta), `none` (`null`), `other` (outra config). */
export type RteE2eUploadMode = 'http' | 'none' | 'other';

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
  /** `openDialog(kind)` do editor (página `dialogs`). */
  openDialog?(kind: string): boolean;
  /** `[floatingMenus]` ao vivo (página `floating`). */
  setFloatingMenus?(config: unknown): void;
  /** `focusFloatingMenu()` do editor (página `floating`). */
  focusFloatingMenu?(): boolean;
  /** Último `mediaChange` e contagem (página `media`). */
  lastMediaChange?(): RteMediaChange | null;
  mediaChanges?(): number;
  /** `mediaSession()` do editor (página `media`). */
  mediaSession?(): RteMediaSession;
  /** O `RteEditor` com envio (página `upload`). */
  uploadEditor?(): RteEditor;
  /** `uploadError` recebidos, em ordem (página `upload`). */
  uploadErrors?(): readonly RteUploadErrorEvent[];
  /** Troca o `[upload]` do editor (Ruling 14: `query` vai ao *endpoint*). */
  setUpload?(mode: RteE2eUploadMode, query?: string): void;
}

/** O que a página `render` registra para uma exibição. */
export interface RteE2eRenderHandle {
  renderedHtml(): string;
  error(): { code: string; limit: number } | null;
}

/** Um caso de `probeRender` com problema. */
export interface RteE2eProbeResult {
  index: number;
  problems: string[];
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
  /** `openDialog(kind)` do editor `id` (G18); o retorno da API. */
  openDialog(id: RteE2eId, kind: string): boolean;
  /** `[floatingMenus]` ao vivo do editor `id` (N21). */
  setFloatingMenus(id: RteE2eId, config: unknown): void;
  /** `focusFloatingMenu()` do editor `id` (N9, N24). */
  focusFloatingMenu(id: RteE2eId): boolean;
  /** Último `mediaChange` do editor `id` (`null` antes do primeiro). */
  lastMediaChange(id: RteE2eId): RteMediaChange | null;
  /** Quantos `mediaChange` o editor `id` emitiu. */
  mediaChanges(id: RteE2eId): number;
  /** `mediaSession()` do editor `id`. */
  mediaSession(id: RteE2eId): RteMediaSession;
  /** `uploads()` do editor `id` (spec 05c2a, E18). */
  uploads(id: RteE2eId): readonly RteUploadStatus[];
  pendingUploads(id: RteE2eId): number;
  imagesMissingAlt(id: RteE2eId): number;
  /** Último `uploadError` do editor `id` (`null` antes do primeiro). */
  lastUploadError(id: RteE2eId): RteUploadErrorEvent | null;
  uploadErrors(id: RteE2eId): readonly RteUploadErrorEvent[];
  /** `uploadFiles(files)` do editor `id`; os aceitos (E5). */
  uploadFiles(id: RteE2eId, files: File[]): number;
  cancelAllUploads(id: RteE2eId): void;
  /** Troca o `[upload]` do editor `id` (Ruling 14), já aplicado ao voltar (`tick`). */
  setUpload(id: RteE2eId, mode: RteE2eUploadMode, query?: string): void;
  /** Passa a contar as mutações do `rte-floating-menus` do editor `id` (R16). */
  watchFloating(id: RteE2eId): void;
  /** Mutações (`total`) e as de `style` desde o `watchFloating(id)`. */
  floatingMutations(id: RteE2eId): { total: number; style: number };
  /** Voltas de `NgZone.onMicrotaskEmpty` (no build zone, cada uma é um `tick`). */
  zoneTurns(): number;
  /** `applyRteTheme` num elemento qualquer (referência do N12). */
  applyTheme(element: HTMLElement, theme: RteTheme): void;
  /** Detecção de mudanças síncrona (`ApplicationRef.tick`), para medir o render (N15). */
  tick(): void;
  /** Passa a contar as mutações de DOM na barra do editor `id` (N15, R6). */
  watchToolbar(id: RteE2eId): void;
  /** Mutações na barra desde o `watchToolbar(id)`. */
  toolbarMutations(id: RteE2eId): number;
  /** HTML exibido (antes da H6) pela exibição `id` da rota `render`. */
  renderedHtml(id: RteE2eRenderId): string;
  /** `error()` da exibição `id`. */
  renderError(id: RteE2eRenderId): { code: string; limit: number } | null;
  /** Define a entrada de `render-input` e roda a detecção de mudanças. */
  setRenderInput(html: string, mode?: 'sanitize' | 'trusted'): void;
  /** Para cada HTML: exibe em `render-input` e devolve só os casos com código executável no DOM. */
  probeRender(
    htmls: readonly string[],
    mode?: 'sanitize' | 'trusted',
  ): RteE2eProbeResult[];
  readonly readyAt: Partial<Record<RteE2eId, number>>;
  readonly toggledAt: number | null;
}

function mediaOf(bridge: E2eBridge, id: RteE2eId) {
  const h = bridge.handle(id);
  if (!h.lastMediaChange || !h.mediaChanges || !h.mediaSession)
    throw new Error(`rteE2e: editor '${id}' sem mídia.`);
  return {
    last: h.lastMediaChange,
    count: h.mediaChanges,
    session: h.mediaSession,
  };
}

function uploadOf(bridge: E2eBridge, id: RteE2eId) {
  const h = bridge.handle(id);
  if (!h.uploadEditor || !h.uploadErrors)
    throw new Error(`rteE2e: editor '${id}' sem envio.`);
  return { editor: h.uploadEditor(), errors: h.uploadErrors() };
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
  readonly renderInput = signal('');
  readonly renderMode = signal<'sanitize' | 'trusted'>('sanitize');
  readonly readyAt: Partial<Record<RteE2eId, number>> = {};
  toggledAt: number | null = null;

  private readonly handles = new Map<RteE2eId, RteE2eHandle>();
  private readonly renders = new Map<RteE2eRenderId, RteE2eRenderHandle>();

  /** Registra o editor `id` da página até ela ser destruída. */
  register(id: RteE2eId, handle: RteE2eHandle): void {
    this.handles.set(id, handle);
    inject(DestroyRef).onDestroy(() => {
      if (this.handles.get(id) === handle) this.handles.delete(id);
    });
  }

  /** Registra a exibição `id` da rota `render` até ela ser destruída. */
  registerRender(id: RteE2eRenderId, handle: RteE2eRenderHandle): void {
    this.renders.set(id, handle);
    inject(DestroyRef).onDestroy(() => {
      if (this.renders.get(id) === handle) this.renders.delete(id);
    });
  }

  render(id: RteE2eRenderId): RteE2eRenderHandle {
    const handle = this.renders.get(id);
    if (!handle)
      throw new Error(`rteE2e: exibição '${id}' fora da rota atual.`);
    return handle;
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

  openDialog(id: RteE2eId, kind: string): boolean {
    const open = this.handle(id).openDialog;
    if (!open) throw new Error(`rteE2e: editor '${id}' sem openDialog.`);
    return open(kind);
  }

  setFloatingMenus(id: RteE2eId, config: unknown): void {
    const set = this.handle(id).setFloatingMenus;
    if (!set) throw new Error(`rteE2e: editor '${id}' sem [floatingMenus].`);
    set(config);
  }

  focusFloatingMenu(id: RteE2eId): boolean {
    const focus = this.handle(id).focusFloatingMenu;
    if (!focus)
      throw new Error(`rteE2e: editor '${id}' sem focusFloatingMenu.`);
    return focus();
  }

  toggle(name: RteE2eToggle): void {
    this.toggledAt = performance.now();
    this[name].update((v) => !v);
  }
}

const URL_ATTRS = [
  'href',
  'src',
  'poster',
  'action',
  'formaction',
  'xlink:href',
];
const BAD_SCHEME = /^(javascript|data|vbscript):/i;

/** Código executável no DOM exibido: `script`, `on*`, `srcdoc` e URLs `javascript:`/`data:`/`vbscript:`. */
function scanForCode(root: Element): string[] {
  const problems: string[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const tag = el.localName;
    if (tag === 'script') problems.push('<script>');
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) problems.push(`<${tag}> ${name}`);
      else if (name === 'srcdoc') problems.push(`<${tag}> srcdoc`);
      else if (
        URL_ATTRS.includes(name) &&
        // Esquema com espaços e controles ignorados, como o navegador ao resolver a URL.
        // eslint-disable-next-line no-control-regex
        BAD_SCHEME.test(attr.value.replace(/[\u0000-\u0020]/g, ''))
      )
        problems.push(`<${tag}> ${name}=${attr.value.slice(0, 40)}`);
    }
  }
  return problems;
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
    let turns = 0;
    zone.onMicrotaskEmpty.subscribe(() => turns++);
    interface FloatingEntry {
      observer: MutationObserver;
      total: number;
      style: number;
    }
    const watchedFloating = new Map<RteE2eId, FloatingEntry>();
    /** Soma os registros: todos em `total`, os de `style` também em `style`. */
    const count = (
      entry: Omit<FloatingEntry, 'observer'>,
      records: readonly MutationRecord[],
    ): void => {
      for (const record of records) {
        entry.total++;
        if (record.type === 'attributes' && record.attributeName === 'style')
          entry.style++;
      }
    };
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
      openDialog: (id, kind) => run(() => bridge.openDialog(id, kind)),
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
      setFloatingMenus: (id, config) =>
        run(() => bridge.setFloatingMenus(id, config)),
      focusFloatingMenu: (id) => run(() => bridge.focusFloatingMenu(id)),
      watchFloating: (id) => {
        const menus = doc.querySelector(
          `rte-editor[data-testid="${id}"] rte-floating-menus`,
        );
        if (!menus) throw new Error(`rteE2e: editor '${id}' sem menus.`);
        watchedFloating.get(id)?.observer.disconnect();
        const entry: FloatingEntry = {
          observer: new MutationObserver((records) => count(entry, records)),
          total: 0,
          style: 0,
        };
        entry.observer.observe(menus, {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        });
        watchedFloating.set(id, entry);
      },
      floatingMutations: (id) => {
        const entry = watchedFloating.get(id);
        if (!entry) throw new Error(`rteE2e: '${id}' sem watchFloating.`);
        // registros ainda na fila do observador também contam
        count(entry, entry.observer.takeRecords());
        return { total: entry.total, style: entry.style };
      },
      lastMediaChange: (id) => run(() => mediaOf(bridge, id).last()),
      mediaChanges: (id) => run(() => mediaOf(bridge, id).count()),
      mediaSession: (id) => run(() => mediaOf(bridge, id).session()),
      uploads: (id) => run(() => uploadOf(bridge, id).editor.uploads()),
      pendingUploads: (id) =>
        run(() => uploadOf(bridge, id).editor.pendingUploads()),
      imagesMissingAlt: (id) =>
        run(() => uploadOf(bridge, id).editor.imagesMissingAlt()),
      lastUploadError: (id) =>
        run(() => uploadOf(bridge, id).errors.at(-1) ?? null),
      uploadErrors: (id) => run(() => [...uploadOf(bridge, id).errors]),
      uploadFiles: (id, files) =>
        run(() => uploadOf(bridge, id).editor.uploadFiles(files)),
      cancelAllUploads: (id) =>
        run(() => uploadOf(bridge, id).editor.cancelAllUploads()),
      setUpload: (id, mode, query) =>
        run(() => {
          const set = bridge.handle(id).setUpload;
          if (!set) throw new Error(`rteE2e: editor '${id}' sem [upload].`);
          set(mode, query);
          // O `[upload]` só chega ao editor na detecção de mudanças; sem ela,
          // um `uploadFiles` logo em seguida (outro `evaluate`, antes do
          // agendador: visto no WebKit) usa a configuração anterior e a troca
          // (E17) o aborta ou descarta em espera do chunk, sem `uploadError`.
          appRef.tick();
        }),
      renderedHtml: (id) => run(() => bridge.render(id).renderedHtml()),
      renderError: (id) => run(() => bridge.render(id).error()),
      setRenderInput: (html, mode = 'sanitize') =>
        run(() => {
          bridge.renderMode.set(mode);
          bridge.renderInput.set(html);
          appRef.tick();
        }),
      probeRender: (htmls, mode = 'sanitize') =>
        run(() => {
          const results: RteE2eProbeResult[] = [];
          bridge.renderMode.set(mode);
          htmls.forEach((html, index) => {
            bridge.renderInput.set(html);
            appRef.tick();
            const host = doc.querySelector('[data-testid="render-input"]');
            const problems = host ? scanForCode(host) : ['sem render-input'];
            if (problems.length > 0) results.push({ index, problems });
          });
          return results;
        }),
      zoneTurns: () => turns,
      readyAt: bridge.readyAt,
      get toggledAt() {
        return bridge.toggledAt;
      },
    };
  });
}
