// Percurso da árvore crua para a sanitizada (spec 04, S3, S5, S6 e S7).
// Iterativo: cada quadro da pilha é uma lista de nós crus em processamento.
import {
  type RteElementSpec,
  type RteHtmlSchema,
  getElementSpec,
  hasRequiredChild,
  sanitizeAttributes,
} from '@cds/rte-core';
import {
  HEADING_TAGS,
  P_CLOSING_TAGS,
  REQUIRED_PARENT,
  TABLE_CONTENT,
} from './parser-model';
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

/** Elemento montado por um quadro, com a regra que o define. */
interface Built {
  element: HtmlElement;
  spec: RteElementSpec;
  /** Onde o elemento entra quando o quadro termina. */
  target: HtmlNode[];
}

interface Frame {
  nodes: readonly HtmlNode[];
  index: number;
  /** Lista de saída dos nós deste quadro. */
  out: HtmlNode[];
  ctx: Context;
  /** `null` quando o quadro desembrulha. */
  built: Built | null;
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
 * S3c, regras de entrada sobre o contexto de saída. `remove` descarta com o
 * conteúdo; `unwrap` desembrulha; `null` mantém.
 */
function structuralAction(
  tag: string,
  ctx: Context,
): 'remove' | 'unwrap' | null {
  // N5: nas partes de tabela, só os filhos do modelo de conteúdo.
  const allowed =
    ctx.parent === null ? undefined : TABLE_CONTENT.get(ctx.parent);
  if (allowed && !allowed.has(tag)) return 'remove';
  // N1: `a` dentro de `a`.
  if (tag === 'a' && ctx.inA) return 'unwrap';
  // N2: tag que fecha um `p` aberto.
  if (ctx.inP && P_CLOSING_TAGS.has(tag)) return 'unwrap';
  // N3: parte que exige um pai que ela não tem.
  const parents = REQUIRED_PARENT.get(tag);
  if (parents && (ctx.parent === null || !parents.has(ctx.parent))) {
    return 'unwrap';
  }
  // N4: título direto em título.
  if (
    HEADING_TAGS.has(tag) &&
    ctx.parent !== null &&
    HEADING_TAGS.has(ctx.parent)
  ) {
    return 'unwrap';
  }
  return null;
}

/** N6: o navegador ignora a quebra logo depois de `<pre>`. */
function trimPreStart(children: HtmlNode[]): void {
  const first = children[0];
  if (typeof first !== 'string') return;
  const trimmed = first.replace(/^[\r\n]+/, '');
  if (trimmed === '') children.shift();
  else children[0] = trimmed;
}

/** N7: cada sequência de `tr` direto em `table` ganha um `tbody`. */
function wrapTableRows(children: HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  let body: HtmlElement | null = null;
  for (const child of children) {
    if (typeof child !== 'string' && child.tag === 'tr') {
      if (!body) {
        body = { tag: 'tbody', attributes: [], children: [] };
        out.push(body);
      }
      body.children.push(child);
    } else {
      body = null;
      out.push(child);
    }
  }
  return out;
}

/** Regras de saída de um elemento montado; `false` se ele sai (S6). */
function finish({ element, spec }: Built): boolean {
  if (element.tag === 'pre') trimPreStart(element.children);
  if (element.tag === 'table') {
    element.children = wrapTableRows(element.children);
  }
  const childTags = new Set<string>();
  for (const child of element.children) {
    if (typeof child !== 'string') childTags.add(child.tag);
  }
  return hasRequiredChild(spec, childTags);
}

/**
 * S7: da segunda ocorrência em diante, o `id` sai e o elemento fica.
 * Pré-ordem iterativa.
 */
export function dedupeIds(nodes: HtmlNode[]): void {
  const seen = new Set<string>();
  const stack: HtmlNode[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push(nodes[i] as HtmlNode);
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (typeof node === 'string') continue;
    const index = node.attributes.findIndex(([name]) => name === 'id');
    if (index !== -1) {
      const id = (node.attributes[index] as [string, string])[1];
      if (seen.has(id)) node.attributes.splice(index, 1);
      else seen.add(id);
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i] as HtmlNode);
    }
  }
}

/**
 * Sanitiza a árvore crua pelo esquema. Elemento fora do esquema é
 * desembrulhado (S3a); `sanitizeAttributes` decide entre manter, remover com
 * o conteúdo e desembrulhar (S5); as normalizações de S3c ajustam a árvore à
 * releitura do navegador (I1); o `iframe` sai sempre vazio (S2); `requireChild`
 * é avaliado em pós-ordem (S6) e o `id` repetido sai (S7). Nada da entrada
 * chega à saída sem passar pelos interpretadores do core (R1).
 */
export function sanitizeTree(
  nodes: readonly HtmlNode[],
  schema: RteHtmlSchema,
): HtmlNode[] {
  const result: HtmlNode[] = [];
  const stack: Frame[] = [
    { nodes, index: 0, out: result, ctx: ROOT, built: null },
  ];
  const unwrap = (frame: Frame, node: HtmlElement): void => {
    stack.push({
      nodes: node.children,
      index: 0,
      out: frame.out,
      ctx: frame.ctx,
      built: null,
    });
  };

  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const node = frame.nodes[frame.index++];
    if (node === undefined) {
      stack.pop();
      const { built } = frame;
      if (built && finish(built)) append(built.target, built.element);
      continue;
    }
    if (typeof node === 'string') {
      // N5: texto nas partes de tabela sai.
      if (frame.ctx.parent === null || !TABLE_CONTENT.has(frame.ctx.parent)) {
        append(frame.out, node);
      }
      continue;
    }

    const spec = getElementSpec(schema, node.tag);
    if (!spec) {
      unwrap(frame, node);
      continue;
    }
    const sanitized = sanitizeAttributes(spec, node.attributes);
    // Só o elemento que iria para a saída passa por S3c. Nos dois casos,
    // `remove` descarta com o conteúdo e `unwrap` desembrulha.
    const action =
      sanitized.action === 'keep'
        ? structuralAction(node.tag, frame.ctx)
        : sanitized.action;
    if (action === 'unwrap') unwrap(frame, node);
    if (action !== null || sanitized.action !== 'keep') continue;

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
      built: { element, spec, target: frame.out },
    });
  }

  dedupeIds(result);
  return result;
}
