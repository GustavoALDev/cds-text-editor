// Checagem do HTML gerado para o site (spec 07c, X4): o único componente que confia em HTML
// (`doc-html.ts`) só recebe saída que passou por aqui. Falha o build; nunca "limpa" em silêncio.
const FORBIDDEN_TAGS =
  /<\s*\/?\s*(script|style|iframe|object|embed|meta|link|base|form|frame|frameset|applet)\b/i;
// Único comentário aceito: o marcador de exemplo vivo (`directives.mjs`); qualquer outro `<!` falha.
const LIVE_MARKER = /<!--@@live:[\w.-]+@@-->/g;
// Tolerante como o navegador: `<img/src=x>`, `"x"onerror=` colado e `/` como separador valem.
const TAG = /<\/?([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`/]+)))?/g;
const URL_ATTRS = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
]);

const NAMED = {
  colon: ':',
  tab: '\t',
  newline: '\n',
  amp: '&',
  lt: '<',
  gt: '>',
};

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

const snippet = (s) => (s.length > 80 ? `${s.slice(0, 77)}...` : s);

/**
 * Devolve as violações (vazio = ok). `external: false` pula a regra do `rel` (para conferir o
 * HTML cru do Markdown, antes de os links virarem `<a>`).
 */
export function checkHtml(html, { external = true } = {}) {
  const errors = [];
  if (html.split(LIVE_MARKER).join('').includes('<!'))
    errors.push('comentário ou declaração HTML (<!...) não permitido');
  const forbidden = FORBIDDEN_TAGS.exec(html);
  if (forbidden) {
    errors.push(
      `tag proibida <${forbidden[1].toLowerCase()}> em "${snippet(html.slice(forbidden.index, forbidden.index + 60))}"`,
    );
  }
  for (const tag of html.split(LIVE_MARKER).join('').matchAll(TAG)) {
    const name = tag[1].toLowerCase();
    const attrs = new Map();
    for (const a of tag[2].matchAll(ATTR)) {
      attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
    }
    for (const [attr, value] of attrs) {
      if (attr.startsWith('on'))
        errors.push(`atributo de evento "${attr}" em ${snippet(tag[0])}`);
      else if (attr === 'style')
        errors.push(`atributo style (a CSP o bloqueia) em ${snippet(tag[0])}`);
      else if (attr === 'srcdoc')
        errors.push(`atributo srcdoc em ${snippet(tag[0])}`);
      else if (URL_ATTRS.has(attr)) {
        const url = decodeEntities(value)
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000- ]+/g, '')
          .toLowerCase();
        if (/^(javascript|vbscript|data):/.test(url))
          errors.push(
            `${attr} com ${url.slice(0, url.indexOf(':') + 1)} em ${snippet(tag[0])}`,
          );
      }
    }
    if (external && name === 'a' && attrs.has('href')) {
      const href = decodeEntities(attrs.get('href')).trim();
      if (/^(https?:)?\/\//i.test(href)) {
        const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
        if (!rel.includes('noopener') || !rel.includes('noreferrer'))
          errors.push(
            `link externo sem rel="noopener noreferrer": ${snippet(tag[0])}`,
          );
      }
    }
  }
  return errors;
}

/** Lança (pt-BR) citando a página se houver qualquer violação. */
export function assertSafeHtml(html, where, options) {
  const errors = checkHtml(html, options);
  if (errors.length)
    throw new Error(
      `${where}: HTML não permitido (spec 07c, X4):\n  - ${errors.join('\n  - ')}`,
    );
}
