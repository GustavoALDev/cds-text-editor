// Percurso da árvore crua para a sanitizada (spec 04, S3 e S5). Iterativo:
// cada quadro da pilha é uma lista de nós crus em processamento.
import {
  type RteHtmlSchema,
  getElementSpec,
  sanitizeAttributes,
} from '@cds/rte-core';
import type { HtmlElement, HtmlNode } from './tree';

/** Contexto de saída de um nó (onde ele vai parar na árvore sanitizada). */
interface Context {
  /** Tag do elemento pai na saída (`null` na raiz). */
  parent: string | null;
  /** Há um `p` entre os ancestrais na saída. */
  inP: boolean;
  /** Há um `a` entre os ancestrais na saída. */
  inA: boolean;
}

interface Frame {
  nodes: readonly HtmlNode[];
  index: number;
  /** Lista de saída dos nós deste quadro. */
  out: HtmlNode[];
  ctx: Context;
  /** Elemento montado por este quadro (`null` quando desembrulha). */
  element: HtmlElement | null;
  /** Onde o `element` entra quando o quadro termina. */
  target: HtmlNode[];
}

const ROOT: Context = { parent: null, inP: false, inA: false };

/** Acrescenta à saída, fundindo textos adjacentes (texto vazio some). */
function append(out: HtmlNode[], node: HtmlNode): void {
  if (typeof node !== 'string') {
    out.push(node);
    return;
  }
  if (node === '') return;
  const last = out.length - 1;
  const previous = out[last];
  if (typeof previous === 'string') out[last] = previous + node;
  else out.push(node);
}

/**
 * Sanitiza a árvore crua pelo esquema. Elemento fora do esquema é
 * desembrulhado (S3a); `sanitizeAttributes` decide entre manter, remover com
 * o conteúdo e desembrulhar (S5); o `iframe` sai sempre vazio (S2). Nada da
 * entrada chega à saída sem passar pelos interpretadores do core (R1).
 */
export function sanitizeTree(
  nodes: readonly HtmlNode[],
  schema: RteHtmlSchema,
): HtmlNode[] {
  const result: HtmlNode[] = [];
  const stack: Frame[] = [
    { nodes, index: 0, out: result, ctx: ROOT, element: null, target: result },
  ];

  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const node = frame.nodes[frame.index++];
    if (node === undefined) {
      stack.pop();
      if (frame.element) append(frame.target, frame.element);
      continue;
    }
    if (typeof node === 'string') {
      append(frame.out, node);
      continue;
    }

    const unwrap = (): void => {
      stack.push({
        nodes: node.children,
        index: 0,
        out: frame.out,
        ctx: frame.ctx,
        element: null,
        target: frame.out,
      });
    };

    const spec = getElementSpec(schema, node.tag);
    if (!spec) {
      unwrap();
      continue;
    }
    const sanitized = sanitizeAttributes(spec, node.attributes);
    if (sanitized.action !== 'keep') {
      // `remove` descarta com o conteúdo; `unwrap` desembrulha.
      if (sanitized.action === 'unwrap') unwrap();
      continue;
    }

    const { tag } = node;
    const element: HtmlElement = {
      tag,
      attributes: sanitized.attributes,
      children: [],
    };
    stack.push({
      nodes: tag === 'iframe' ? [] : node.children,
      index: 0,
      out: element.children,
      ctx: {
        parent: tag,
        inP: frame.ctx.inP || tag === 'p',
        inA: frame.ctx.inA || tag === 'a',
      },
      element,
      target: frame.out,
    });
  }

  return result;
}
