import { RTE_STYLE_PROPERTIES } from '@cds/rte-core';

/** Comentários e o texto cru de elementos *raw text*: não são *tags* da árvore. */
const COMMENT = /<!--[\s\S]*?-->/g;
const RAW_TEXT =
  /(<(script|style|xmp|iframe|noembed|noframes|noscript|textarea|title)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi;
/** *Tag* de abertura ou de fechamento na forma serializada (valores entre aspas duplas). */
const TAG =
  /<(\/?)([a-zA-Z][^\s/>]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>/g;
/** Um par `nome="valor"` (ou só `nome`) de uma *tag*, na ordem. */
const ATTR = /\s+([^\s"'>/=]+)(?:\s*=\s*"([^"]*)")?/g;
/** Elementos vazios: não abrem nível na pilha. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const NAMED: Record<string, string> = {
  amp: '&',
  quot: '"',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: '\u00a0',
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

/** Impressão de um elemento com `style`: a *tag* e a *tag* do pai (`''` = a raiz). */
interface StyledTag {
  tag: string;
  parent: string;
  style: string;
}

/** O valor do primeiro atributo chamado exatamente `style` (como o *parser*), ou `null`. */
function styleAttribute(attrs: string): string | null {
  for (const [, name, value] of attrs.matchAll(ATTR)) {
    if (name!.toLowerCase() === 'style') return decodeAttribute(value ?? '');
  }
  return null;
}

/** Cada *tag* com `style` do HTML, na ordem do documento, com a *tag* do pai. */
function stylesFromHtml(html: string): StyledTag[] {
  const out: StyledTag[] = [];
  const open: string[] = [];
  const body = html.replace(COMMENT, '').replace(RAW_TEXT, '$1$3');
  for (const [, closing, rawName, attrs, selfClosing] of body.matchAll(TAG)) {
    const tag = rawName!.toLowerCase();
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at >= 0) open.length = at;
      continue;
    }
    const style = styleAttribute(attrs ?? '');
    if (style !== null) out.push({ tag, parent: open.at(-1) ?? '', style });
    if (!VOID.has(tag) && !selfClosing) open.push(tag);
  }
  return out;
}

/** A mesma impressão, lida do DOM. */
function sameShape(el: Element, root: Element, expected: StyledTag): boolean {
  const parent = el.parentElement;
  return (
    el.tagName.toLowerCase() === expected.tag &&
    (parent === root ? '' : (parent?.tagName.toLowerCase() ?? '')) ===
      expected.parent
  );
}

/** Tira espaços ASCII das pontas (os do CSS; não os de Unicode). */
function trimAscii(s: string): string {
  return s.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
}

/** Minúsculas só ASCII (sem depender de *locale*). */
function lowerAscii(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * O texto de `style` reduzido às propriedades que o esquema emite para `tag`
 * (`RTE_STYLE_PROPERTIES`, Ruling 23), na ordem da lista, `prop: valor`
 * unidos por `; ` (`''` se nada sobra). Barra invertida ou comentário
 * descartam tudo (como `sanitizeStyle`); declaração com `!` (`!important`,
 * que venceria o `!important` da paleta no `content.css`) ou valor vazio é
 * descartada; a última declaração de uma propriedade vale. Não valida
 * valores: nenhuma das propriedades aceita imagem e o CSSOM recusa valor
 * inválido (nem cores pela paleta: o servidor pode ter paletas próprias).
 */
export function allowedStyle(tag: string, text: string): string {
  const allowed = Object.hasOwn(RTE_STYLE_PROPERTIES, tag)
    ? RTE_STYLE_PROPERTIES[tag]!
    : [];
  if (
    allowed.length === 0 ||
    text.includes('\\') ||
    text.includes('/*') ||
    text.includes('*/')
  ) {
    return '';
  }
  const found = new Map<string, string>();
  for (const decl of text.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const name = lowerAscii(trimAscii(decl.slice(0, colon)));
    const value = trimAscii(decl.slice(colon + 1));
    if (!allowed.includes(name) || value === '' || value.includes('!')) {
      continue;
    }
    found.set(name, value);
  }
  return allowed
    .filter((name) => found.has(name))
    .map((name) => `${name}: ${found.get(name)!}`)
    .join('; ');
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
 * ordem do documento e por uma impressão de cada um (a *tag* e a *tag* do
 * pai). Se o número ou qualquer impressão divergir (ou sem `html`), vale o
 * próprio atributo (`getAttribute`) para **todos** os elementos de `root`.
 *
 * O caminho pelo HTML supõe HTML estável sob nova análise (a saída do
 * sanitizador é: serialização canônica, sem reordenação do *parser*). Fora
 * disso o resultado é o *fallback*, nunca um estilo trocado de elemento:
 * reordenação do *parser* (*foster parenting*, fechamentos implícitos) muda
 * a impressão; atributos com aspas simples ou sem aspas, `<template>`,
 * `<plaintext>` e referências nomeadas além de `&amp;`, `&quot;`, `&lt;`,
 * `&gt;`, `&apos;` e `&nbsp;` não são lidos como o *parser* os leria e, quando
 * isso muda a contagem ou a impressão, também caem no *fallback* (no pior
 * caso o valor reaplicado é o do próprio atributo). Nos dois ramos o texto
 * passa por `allowedStyle` (Ruling 23): só as propriedades do esquema para a
 * *tag*, uma escrita de `cssText` por elemento. O próprio `root` (do
 * consumidor) não é tocado. Só no navegador. Devolve quantos reaplicou.
 */
export function restoreContentStyles(root: Element, html?: string): number {
  const elements = [...root.querySelectorAll('[style]')];
  const fromHtml = html === undefined ? [] : stylesFromHtml(html);
  const matches =
    fromHtml.length === elements.length &&
    elements.every((el, i) => sameShape(el, root, fromHtml[i]!));
  let count = 0;
  elements.forEach((el, i) => {
    const style = (el as Partial<ElementCSSInlineStyle>).style;
    if (!style) return;
    const raw = matches ? fromHtml[i]!.style : (el.getAttribute('style') ?? '');
    // Uma escrita por elemento, já filtrada (Ruling 23): sem nada permitido
    // fica `style=""` (em `trusted`, o CSS fora da lista sai também sem CSP).
    style.cssText = allowedStyle(el.tagName.toLowerCase(), raw);
    count++;
  });
  return count;
}
