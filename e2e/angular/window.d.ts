export {};

/** Editores do app de teste (`data-testid` igual ao id). */
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
  | 'floating-alt';

/** Exibições da rota `render` do app de teste. */
export type RteE2eRenderId =
  'render-main' | 'render-wide' | 'render-input' | 'render-keep';

/** `RteToolbarConfig` do `@cds/rte-angular` (sem importar o pacote Angular aqui). */
export type RteE2eToolbarConfig =
  'minimal' | 'article' | 'full' | readonly (readonly string[])[] | false;

export interface RteE2eState {
  valid: boolean;
  touched: boolean;
  dirty: boolean;
  errors: string[];
}

declare global {
  interface Window {
    /** Ponte do app de teste (`e2e/angular/app/src/app/e2e-bridge.ts`). */
    rteE2e: {
      getRteEditor(host: Element): import('@tiptap/core').Editor | null;
      /** `getRteHtml` do editor vivo em `host` (o documento, não o modelo da página). */
      rteHtml(host: Element): string | null;
      value(id: RteE2eId): string;
      setValue(id: RteE2eId, html: string): void;
      state(id: RteE2eId): RteE2eState;
      reset(id: RteE2eId): void;
      toggle(name: 'disabled' | 'readonly' | 'hidden' | 'show'): void;
      setLang(lang: 'en' | 'pt-BR' | 'es'): void;
      setToolbar(id: RteE2eId, config: RteE2eToolbarConfig): void;
      setTheme(
        id: RteE2eId,
        theme: import('@cds/rte-theme').RteTheme | undefined,
      ): void;
      /** `openDialog(kind)` do editor `id` (G18); o retorno da API. */
      openDialog(id: RteE2eId, kind: string): boolean;
      setFloatingMenus(id: RteE2eId, config: unknown): void;
      focusFloatingMenu(id: RteE2eId): boolean;
      watchFloating(id: RteE2eId): void;
      floatingMutations(id: RteE2eId): { total: number; style: number };
      zoneTurns(): number;
      renderedHtml(id: RteE2eRenderId): string;
      renderError(id: RteE2eRenderId): { code: string; limit: number } | null;
      setRenderInput(html: string, mode?: 'sanitize' | 'trusted'): void;
      probeRender(
        htmls: readonly string[],
        mode?: 'sanitize' | 'trusted',
      ): { index: number; problems: string[] }[];
      /** `applyRteTheme` num elemento qualquer (referência do N12). */
      applyTheme(
        element: HTMLElement,
        theme: import('@cds/rte-theme').RteTheme,
      ): void;
      /** Detecção de mudanças síncrona (`ApplicationRef.tick`). */
      tick(): void;
      /** Passa a contar as mutações de DOM na barra do editor `id` (N15). */
      watchToolbar(id: RteE2eId): void;
      toolbarMutations(id: RteE2eId): number;
      readyAt: Partial<Record<RteE2eId, number>>;
      toggledAt: number | null;
    };
    /** `securitypolicyviolation` desde o início da página (`helpers/app.ts`). */
    __violations: { directive: string; blockedURI: string; sample: string }[];
    /** Sentinela de XSS (`helpers/render.ts`): qualquer chamada é execução de código injetado. */
    __xss: () => void;
    __xssCalls: number;
    /** `<style>` acrescentados ao documento desde o início da página. */
    __styleAdds: string[];
    /** Pré-voo da H10 (`helpers/render.ts`, `watchServerNodes`): nós do servidor em `render-main`. */
    __h10?: {
      h2: Element | null;
      iframe: Element | null;
      scroller: Element | null;
      iframes: Set<Element>;
      iframeLoads: number;
    };
    /** L5 (R12): o primeiro `h2` de `render-main` antes da troca de idioma. */
    __renderH2?: Element | null;
    /** L6: marcador que só sobrevive sem recarga, e o primeiro `iframe` antes dos cliques. */
    __renderMarker?: string;
    __renderIframe?: Element | null;
  }
}
