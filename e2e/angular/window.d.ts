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
  | 'toolbar-nofeat';

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
      /** `applyRteTheme` num elemento qualquer (referência do N12). */
      applyTheme(
        element: HTMLElement,
        theme: import('@cds/rte-theme').RteTheme,
      ): void;
      /** Passa a contar as mutações de DOM na barra do editor `id` (N15). */
      watchToolbar(id: RteE2eId): void;
      toolbarMutations(id: RteE2eId): number;
      readyAt: Partial<Record<RteE2eId, number>>;
      toggledAt: number | null;
    };
    /** `securitypolicyviolation` desde o início da página (`helpers/app.ts`). */
    __violations: { directive: string; blockedURI: string; sample: string }[];
    /** `<style>` acrescentados ao documento desde o início da página. */
    __styleAdds: string[];
  }
}
