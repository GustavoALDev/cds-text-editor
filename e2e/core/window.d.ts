export {};

declare global {
  interface Window {
    RteCore: typeof import('../../packages/core/src/index') &
      typeof import('../../packages/core/src/embeds/index');
    /** Bundle de `helpers/editor-bundle.ts`. */
    RteEditorLab: {
      Editor: typeof import('@tiptap/core').Editor;
      createEditorExtensions: typeof import('../../packages/core/extensions/src/index').createEditorExtensions;
      getRteHtml: typeof import('../../packages/core/extensions/src/index').getRteHtml;
      RTE_CODE_LANGUAGES: typeof import('../../packages/core/code-languages/src/index').RTE_CODE_LANGUAGES;
      validateHtml: typeof import('../../packages/core/html/src/index').validateHtml;
      getHtmlSchema: typeof import('../../packages/core/src/index').getHtmlSchema;
      normalizeForCompare: typeof import('../../packages/core/extensions/src/testing/compare').normalizeForCompare;
    };
    /** Editor montado por `helpers/editor-page.ts`. */
    editor: import('@tiptap/core').Editor;
  }
}
