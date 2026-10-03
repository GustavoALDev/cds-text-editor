import type { LanguageFn } from 'highlight.js';

/** Linguagem de bloco de código carregada sob demanda (spec 03b, §6). */
export interface RteCodeLanguage {
  /** Vira `language-<id>`; casa `^[a-z0-9][a-z0-9+#-]{0,29}$`. */
  readonly id: string;
  /** Rótulo para a UI. */
  readonly name: string;
  readonly aliases: readonly string[];
  /** Gramática do `highlight.js`, por `import()`. */
  load(): Promise<LanguageFn>;
}

export { defineCodeLanguage, RTE_CODE_LANGUAGES } from './catalog';
