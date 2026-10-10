// Serialização canônica da árvore sanitizada (spec 04, S13), com os mesmos
// escapes do `getRteHtml`. Sem recursão: pilha explícita de nós e fechamentos.
import { escapeHtmlAttribute, escapeHtmlText } from '@comodeviaser/rte-core';
import { VOID_TAGS } from './parser-model';
import type { HtmlNode } from './tree';

/** Fechamento pendente de um elemento já aberto na saída. */
interface CloseTag {
  close: string;
}

/**
 * Serializa os nós: texto escapa `& nbsp < >`; atributos escapam
 * `& nbsp " < >`, sempre entre aspas duplas; *void* sai sem fechamento.
 */
export function serializeNodes(nodes: readonly HtmlNode[]): string {
  const parts: string[] = [];
  const stack: (HtmlNode | CloseTag)[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push(nodes[i] as HtmlNode);

  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    if (typeof item === 'string') {
      parts.push(escapeHtmlText(item));
      continue;
    }
    if ('close' in item) {
      parts.push(`</${item.close}>`);
      continue;
    }
    let open = `<${item.tag}`;
    for (const [name, value] of item.attributes) {
      open += ` ${name}="${escapeHtmlAttribute(value)}"`;
    }
    parts.push(`${open}>`);
    if (VOID_TAGS.has(item.tag)) continue;
    stack.push({ close: item.tag });
    for (let i = item.children.length - 1; i >= 0; i--) {
      stack.push(item.children[i] as HtmlNode);
    }
  }
  return parts.join('');
}
