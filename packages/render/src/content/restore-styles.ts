/** Comentários e o texto cru de elementos *raw text*: não são *tags* da árvore. */
const COMMENT = /<!--[\s\S]*?-->/g;
const RAW_TEXT =
  /(<(script|style|xmp|iframe|noembed|noframes|noscript|textarea|title)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi;
/** *Tag* de abertura na forma serializada (valores entre aspas duplas, sem `"` cru). */
const START_TAG =
  /<([a-zA-Z][^\s/>]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*"[^"]*")?)*)\s*\/?>/g;
const STYLE_ATTR = /\sstyle\s*=\s*"([^"]*)"/i;

const NAMED: Record<string, string> = {
  amp: '&',
  quot: '"',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
};

/** Decodifica as referências de caractere de um valor de atributo serializado. */
function decodeAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|lt|gt|apos|nbsp));/gi,
    (ref, dec?: string, hex?: string, name?: string) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return NAMED[name!.toLowerCase()] ?? ref;
    },
  );
}

/** `[tag, style]` de cada *tag* com `style` do HTML, na ordem do documento. */
function stylesFromHtml(html: string): [string, string][] {
  const out: [string, string][] = [];
  const body = html.replace(COMMENT, '').replace(RAW_TEXT, '$1$3');
  for (const match of body.matchAll(START_TAG)) {
    const style = STYLE_ATTR.exec(match[2] ?? '');
    if (style) out.push([match[1]!.toLowerCase(), decodeAttribute(style[1]!)]);
  }
  return out;
}

/**
 * Reaplica por CSSOM o atributo `style` de cada descendente de `root` que o
 * tenha (H8, pré-voo 9).
 *
 * Sob CSP sem `'unsafe-inline'` o navegador ignora o **atributo** `style`
 * vindo do HTML, mas não a escrita por CSSOM; é a mesma informação que o
 * sanitizador (ou o servidor, em `trusted`) já validou. O Firefox, nesse
 * caso, mantém o atributo com valor **vazio**: por isso os valores vêm de
 * `html` (o HTML preparado que foi inserido), casados com os elementos pela
 * ordem do documento e pela *tag*; se a sequência de *tags* não corresponder
 * (ou sem `html`), vale o próprio atributo (`getAttribute`). O próprio `root`
 * (do consumidor) não é tocado. Só no navegador. Devolve quantos reaplicou.
 */
export function restoreContentStyles(root: Element, html?: string): number {
  const elements = [...root.querySelectorAll('[style]')];
  const fromHtml = html === undefined ? [] : stylesFromHtml(html);
  const matches =
    fromHtml.length === elements.length &&
    elements.every((el, i) => el.tagName.toLowerCase() === fromHtml[i]![0]);
  let count = 0;
  elements.forEach((el, i) => {
    const style = (el as Partial<ElementCSSInlineStyle>).style;
    if (!style) return;
    style.cssText = matches
      ? fromHtml[i]![1]
      : (el.getAttribute('style') ?? '');
    count++;
  });
  return count;
}
