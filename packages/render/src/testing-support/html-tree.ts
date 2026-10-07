// Árvore mínima do HTML lida pelo htmlparser2, para comparar a saída de
// `prepareRteHtml` com a entrada (spec 06, R4). Só teste; fora do build.
import { Parser } from 'htmlparser2';

export type HtmlNode =
  | { tag: string; attrs: [string, string][]; children: HtmlNode[] }
  | { text: string };

type HtmlElement = Extract<HtmlNode, { tag: string }>;

/** Lê `html` com o `Parser` do htmlparser2, sem decodificar entidades. */
export function parseTree(html: string): HtmlNode[] {
  const root: HtmlElement = { tag: '#root', attrs: [], children: [] };
  const stack: HtmlElement[] = [root];
  const top = (): HtmlElement => stack[stack.length - 1] ?? root;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const el: HtmlElement = {
          tag: name,
          attrs: Object.entries(attribs),
          children: [],
        };
        top().children.push(el);
        stack.push(el);
      },
      onclosetag() {
        stack.pop();
      },
      ontext(text) {
        const children = top().children;
        const last = children[children.length - 1];
        // O parser pode entregar um texto em pedaços: junta os vizinhos.
        if (last && 'text' in last) last.text += text;
        else children.push({ text });
      },
    },
    { decodeEntities: false },
  );
  parser.write(html);
  parser.end();
  return root.children;
}

/** Troca cada `div.rte-table-scroll` pelos filhos (recursivamente). */
export function unwrapScrollers(nodes: HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const node of nodes) {
    if (!('tag' in node)) {
      const last = out[out.length - 1];
      if (last && 'text' in last) last.text += node.text;
      else out.push({ text: node.text });
      continue;
    }
    const children = unwrapScrollers(node.children);
    if (isScroller(node)) out.push(...children);
    else out.push({ tag: node.tag, attrs: node.attrs, children });
  }
  return out;
}

/** `div` cujo único atributo é `class="rte-table-scroll"`. */
export function isScroller(node: HtmlNode): boolean {
  return (
    'tag' in node &&
    node.tag === 'div' &&
    node.attrs.length === 1 &&
    node.attrs[0]?.[0] === 'class' &&
    node.attrs[0][1] === 'rte-table-scroll'
  );
}
