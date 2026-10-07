export {};

declare global {
  interface Window {
    /** Bundle de `helpers/sanitizer-bundle.ts`. */
    RteSanitizerLab: {
      createSanitizer: typeof import('../../packages/sanitizer/src/index').createSanitizer;
      sanitizeRichText: typeof import('../../packages/sanitizer/src/index').sanitizeRichText;
      getHtmlSchema: typeof import('../../packages/core/src/index').getHtmlSchema;
    };
    /** Sentinela de XSS: qualquer chamada é execução de código injetado. */
    __xss: () => void;
    /** Chamadas a `__xss`. */
    __xssCalls: number;
    /** `${effectiveDirective} ${blockedURI}` de cada `securitypolicyviolation`. */
    __violations: string[];
  }
}
