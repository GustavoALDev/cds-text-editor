import type { LanguageFn } from 'highlight.js';
import type { RteCodeLanguage } from './index';

const ID_PATTERN = /^[a-z0-9][a-z0-9+#-]{0,29}$/;

/**
 * Valida e devolve uma cópia congelada da linguagem. Lança `TypeError` para
 * `id` ou alias fora do padrão, alias repetido ou igual ao `id`, `name` vazio
 * ou `load` que não seja função.
 */
export function defineCodeLanguage(language: RteCodeLanguage): RteCodeLanguage {
  const { id, name, load } = language;
  const aliases = language.aliases ?? [];
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new TypeError(`Código de linguagem inválido: ${String(id)}`);
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`Linguagem "${id}" sem nome`);
  }
  if (typeof load !== 'function') {
    throw new TypeError(`Linguagem "${id}" sem função load`);
  }
  if (!Array.isArray(aliases)) {
    throw new TypeError(`Aliases da linguagem "${id}" devem ser uma lista`);
  }
  const seen = new Set<string>([id]);
  for (const alias of aliases) {
    if (typeof alias !== 'string' || !ID_PATTERN.test(alias)) {
      throw new TypeError(
        `Alias inválido na linguagem "${id}": ${String(alias)}`,
      );
    }
    if (seen.has(alias)) {
      throw new TypeError(`Alias repetido na linguagem "${id}": ${alias}`);
    }
    seen.add(alias);
  }
  return Object.freeze({
    id,
    name,
    aliases: Object.freeze([...aliases]),
    load,
  });
}

const lang = (
  id: string,
  name: string,
  aliases: readonly string[],
  load: () => Promise<LanguageFn>,
): RteCodeLanguage => defineCodeLanguage({ id, name, aliases, load });

/**
 * Catálogo padrão (spec 03b, §6). Cada `load()` importa uma única gramática do
 * `highlight.js`; nenhuma é importada no topo do módulo.
 */
export const RTE_CODE_LANGUAGES: readonly RteCodeLanguage[] = Object.freeze([
  lang('bash', 'Bash', ['sh'], () =>
    import('highlight.js/lib/languages/bash').then((m) => m.default),
  ),
  lang('c', 'C', [], () =>
    import('highlight.js/lib/languages/c').then((m) => m.default),
  ),
  lang('cpp', 'C++', ['c++'], () =>
    import('highlight.js/lib/languages/cpp').then((m) => m.default),
  ),
  lang('csharp', 'C#', ['cs'], () =>
    import('highlight.js/lib/languages/csharp').then((m) => m.default),
  ),
  lang('css', 'CSS', [], () =>
    import('highlight.js/lib/languages/css').then((m) => m.default),
  ),
  lang('diff', 'Diff', [], () =>
    import('highlight.js/lib/languages/diff').then((m) => m.default),
  ),
  lang('go', 'Go', ['golang'], () =>
    import('highlight.js/lib/languages/go').then((m) => m.default),
  ),
  lang('graphql', 'GraphQL', [], () =>
    import('highlight.js/lib/languages/graphql').then((m) => m.default),
  ),
  lang('html', 'HTML', ['xml', 'xhtml'], () =>
    import('highlight.js/lib/languages/xml').then((m) => m.default),
  ),
  lang('java', 'Java', [], () =>
    import('highlight.js/lib/languages/java').then((m) => m.default),
  ),
  lang('javascript', 'JavaScript', ['js', 'jsx', 'mjs'], () =>
    import('highlight.js/lib/languages/javascript').then((m) => m.default),
  ),
  lang('json', 'JSON', [], () =>
    import('highlight.js/lib/languages/json').then((m) => m.default),
  ),
  lang('kotlin', 'Kotlin', ['kt'], () =>
    import('highlight.js/lib/languages/kotlin').then((m) => m.default),
  ),
  lang('markdown', 'Markdown', ['md'], () =>
    import('highlight.js/lib/languages/markdown').then((m) => m.default),
  ),
  lang('php', 'PHP', [], () =>
    import('highlight.js/lib/languages/php').then((m) => m.default),
  ),
  lang('python', 'Python', ['py'], () =>
    import('highlight.js/lib/languages/python').then((m) => m.default),
  ),
  lang('ruby', 'Ruby', ['rb'], () =>
    import('highlight.js/lib/languages/ruby').then((m) => m.default),
  ),
  lang('rust', 'Rust', ['rs'], () =>
    import('highlight.js/lib/languages/rust').then((m) => m.default),
  ),
  lang('scss', 'SCSS', [], () =>
    import('highlight.js/lib/languages/scss').then((m) => m.default),
  ),
  lang('shell', 'Shell', [], () =>
    import('highlight.js/lib/languages/shell').then((m) => m.default),
  ),
  lang('sql', 'SQL', [], () =>
    import('highlight.js/lib/languages/sql').then((m) => m.default),
  ),
  lang('swift', 'Swift', [], () =>
    import('highlight.js/lib/languages/swift').then((m) => m.default),
  ),
  lang('typescript', 'TypeScript', ['ts', 'tsx'], () =>
    import('highlight.js/lib/languages/typescript').then((m) => m.default),
  ),
  lang('yaml', 'YAML', ['yml'], () =>
    import('highlight.js/lib/languages/yaml').then((m) => m.default),
  ),
]);
