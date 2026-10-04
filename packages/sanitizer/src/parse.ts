// Leitura do HTML para a árvore crua (spec 04, S1, S3b e S8). Orientada a
// eventos, sem recursão: a pilha de elementos abertos é um array.
import { Parser } from 'htmlparser2';
import { RteSanitizeError } from './errors';
import { DISCARD_CONTENT_TAGS } from './parser-model';
import type { HtmlElement, HtmlNode } from './tree';

/** Acrescenta texto, fundindo com o texto anterior. */
function appendText(list: HtmlNode[], text: string): void {
  const last = list.length - 1;
  const previous = list[last];
  if (typeof previous === 'string') list[last] = previous + text;
  else list.push(text);
}

/**
 * Monta a árvore crua com o `Parser` do `htmlparser2` (`decodeEntities`; o
 * resto no padrão HTML). Os atributos vêm de `onattribute`, todos e na ordem
 * (o objeto do `onopentag` perde `__proto__` e os repetidos). Comentário,
 * *doctype*, PI e CDATA não têm callback e somem. O conteúdo de
 * `DISCARD_CONTENT_TAGS` e os filhos de `iframe` não são montados, mas contam
 * para a profundidade. Lança `RteSanitizeError('max-depth')` quando um
 * elemento abriria acima de `maxDepth`. Um fechamento que não é o do elemento
 * aberto mais interno é ignorado (tag inacabada no fim da entrada).
 */
export function parseHtml(html: string, maxDepth: number): HtmlNode[] {
  const root: HtmlNode[] = [];
  /** Elementos montados ainda abertos. */
  const open: HtmlElement[] = [];
  /** Tags abertas (montadas ou não); o tamanho é a profundidade de S8. */
  const names: string[] = [];
  /**
   * Tag cujo nome já veio (`onopentagname`) e a abertura (`onopentag`) ainda
   * não: só fica pendente quando a entrada acaba no meio da tag.
   */
  let pending: string | null = null;
  /** Elementos abertos dentro de conteúdo descartado, contando a raiz dele. */
  let discarded = 0;
  /** `plaintext` nunca fecha no navegador: descarta tudo até o fim. */
  let plaintext = false;
  let attributes: [string, string][] = [];

  const children = (): HtmlNode[] => open[open.length - 1]?.children ?? root;

  const parser = new Parser(
    {
      onopentagname(tag) {
        pending = tag;
        attributes = [];
      },
      onattribute(name, value) {
        attributes.push([name, value]);
      },
      onopentag(tag) {
        pending = null;
        if (names.length + 1 > maxDepth) {
          throw new RteSanitizeError('max-depth', maxDepth);
        }
        names.push(tag);
        const attrs = attributes;
        // Um `<form>` aninhado não emite abertura, mas emite os atributos:
        // eles não podem cair num elemento já montado.
        attributes = [];
        if (plaintext || discarded > 0) {
          discarded++;
          return;
        }
        if (DISCARD_CONTENT_TAGS.has(tag)) {
          if (tag === 'plaintext') plaintext = true;
          discarded = 1;
          return;
        }
        const element: HtmlElement = { tag, attributes: attrs, children: [] };
        children().push(element);
        // O `iframe` entra sem filhos: ele é a raiz do descarte.
        if (tag === 'iframe') discarded = 1;
        else open.push(element);
      },
      onclosetag(tag) {
        // No fim da entrada, o `htmlparser2` fecha também a tag inacabada,
        // que nunca chegou ao `onopentag`; e nenhum fechamento pode tirar da
        // pilha um elemento que não é o mais interno.
        if (pending !== null) {
          const unfinished = pending;
          pending = null;
          if (tag === unfinished) return;
        }
        if (names[names.length - 1] !== tag) return;
        names.pop();
        if (discarded > 0) discarded--;
        else open.pop();
      },
      ontext(text) {
        if (!plaintext && discarded === 0) appendText(children(), text);
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return root;
}
