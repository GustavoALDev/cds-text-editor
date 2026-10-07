// Árvore leve própria do sanitizador (spec 04, S1): a crua, montada pelo
// `parseHtml`, e a sanitizada, que é a única fonte da saída (S2).

/** Nó: elemento ou texto (já decodificado, sem escape). */
export type HtmlNode = HtmlElement | string;

export interface HtmlElement {
  /** Nome em minúsculas. */
  tag: string;
  /** Atributos na ordem da entrada (na árvore crua, com repetidos). */
  attributes: [name: string, value: string][];
  children: HtmlNode[];
}
