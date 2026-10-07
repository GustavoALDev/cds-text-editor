// Conhecimento do algoritmo de leitura do HTML (WHATWG 13.2), não allowlist:
// o que é aceito vem só do esquema do core (spec 04, R1 e S3).

/** Elementos *void*: sem conteúdo e serializados sem fechamento (S13). */
export const VOID_TAGS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'basefont',
  'bgsound',
  'br',
  'col',
  'embed',
  'frame',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * S3b: elementos descartados com todo o conteúdo (texto cru, espaço de nomes
 * estrangeiro e conteúdo invisível). O `iframe` fica de fora: ele mesmo pode
 * ficar, mas sempre vazio.
 */
export const DISCARD_CONTENT_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'noembed',
  'noframes',
  'textarea',
  'title',
  'xmp',
  'plaintext',
  'object',
  'embed',
  'svg',
  'math',
  'head',
]);

/** Elementos cuja abertura fecha um `p` aberto (WHATWG 13.2.6.4.7). */
export const P_CLOSING_TAGS: ReadonlySet<string> = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'listing',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'plaintext',
  'pre',
  'search',
  'section',
  'summary',
  'table',
  'ul',
  'xmp',
  'dd',
  'dt',
]);

export const HEADING_TAGS: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** Filhos que o parser mantém nas partes de tabela (o resto é *fostered*). */
export const TABLE_CONTENT: ReadonlyMap<string, ReadonlySet<string>> = new Map<
  string,
  ReadonlySet<string>
>([
  ['table', new Set(['caption', 'colgroup', 'thead', 'tbody', 'tr'])],
  ['thead', new Set(['tr'])],
  ['tbody', new Set(['tr'])],
  ['tr', new Set(['th', 'td'])],
  ['colgroup', new Set(['col'])],
]);

/** Pais sem os quais o parser ignora a tag (ou a reestrutura). */
export const REQUIRED_PARENT: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map<string, ReadonlySet<string>>([
  ['caption', new Set(['table'])],
  ['colgroup', new Set(['table'])],
  ['thead', new Set(['table'])],
  ['tbody', new Set(['table'])],
  ['tr', new Set(['table', 'thead', 'tbody'])],
  ['th', new Set(['tr'])],
  ['td', new Set(['tr'])],
  ['col', new Set(['colgroup'])],
  ['li', new Set(['ul', 'ol'])],
]);
