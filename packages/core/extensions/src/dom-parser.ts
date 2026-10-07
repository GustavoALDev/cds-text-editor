import { DOMParser, Fragment, Slice } from '@tiptap/pm/model';
import type {
  Node as ProseMirrorNode,
  ParseOptions,
  Schema,
} from '@tiptap/pm/model';

/**
 * Tira o espaço ASCII inicial do 1º texto de cada bloco de texto (fora de
 * código). Sem `preserveWhitespace`, o ProseMirror já colapsa e tira esse
 * espaço, menos quando o bloco nasce depois de um nó de bloco que dividiu o
 * pai (`<p>a <img> b</p>` → `<p> b</p>`): a saída deixaria de ser ponto fixo
 * da releitura. O mesmo vale para texto solto logo depois de um bloco.
 * `skipFirst`: o 1º nó de uma fatia aberta continua um texto existente e
 * fica como está.
 */
function trimFragment(fragment: Fragment, skipFirst: boolean): Fragment {
  let changed = false;
  let first = skipFirst;
  const nodes: ProseMirrorNode[] = [];
  let prev: ProseMirrorNode | null = null;
  fragment.forEach((node) => {
    let next = node;
    const after = prev;
    const open = first;
    prev = node;
    first = false;
    if (node.isText && after && !after.isInline) {
      // Fatia de colagem: o texto solto depois do bloco ainda vai ganhar o
      // parágrafo (`normalizeSiblings` do prosemirror-view).
      const text = (node.text ?? '').replace(/^ +/, '');
      if (text !== node.text) {
        changed = true;
        if (text !== '') nodes.push(node.type.schema.text(text, node.marks));
        return;
      }
    } else if (node.isTextblock && !node.type.spec.code) {
      if (!open) next = trimTextblock(node);
    } else if (!node.isLeaf) {
      const content = trimFragment(node.content, open);
      if (content !== node.content) next = node.copy(content);
    }
    if (next !== node) changed = true;
    nodes.push(next);
  });
  return changed ? Fragment.fromArray(nodes) : fragment;
}

function trimTextblock(node: ProseMirrorNode): ProseMirrorNode {
  const head = node.firstChild;
  if (!head?.isText || !head.text?.startsWith(' ')) return node;
  const text = head.text.replace(/^ +/, '');
  const rest = node.content.cut(head.nodeSize);
  const content =
    text === ''
      ? rest
      : Fragment.from(head.type.schema.text(text, head.marks)).append(rest);
  return node.copy(content);
}

/** `DOMParser` do esquema com a normalização de `trimFragment`. */
class RteDOMParser extends DOMParser {
  override parse(dom: Node, options: ParseOptions = {}): ProseMirrorNode {
    const doc = super.parse(dom, options);
    if (options.preserveWhitespace) return doc;
    const content = trimFragment(doc.content, false);
    return content === doc.content ? doc : doc.copy(content);
  }

  override parseSlice(dom: Node, options: ParseOptions = {}): Slice {
    const slice = super.parseSlice(dom, options);
    if (options.preserveWhitespace) return slice;
    const content = trimFragment(slice.content, slice.openStart > 0);
    return content === slice.content
      ? slice
      : new Slice(content, slice.openStart, slice.openEnd);
  }
}

/**
 * Instala o parser em `schema.cached.domParser`, o cache de
 * `DOMParser.fromSchema` (API pública do ProseMirror): o conteúdo inicial,
 * `setContent`, `insertContent` e a colagem passam por ele. O corte de
 * `trimFragment` só roda sem `preserveWhitespace`: vale para o conteúdo
 * inicial, `setContent` e a colagem, mas **não** para `insertContent`, que o
 * Tiptap chama com `preserveWhitespace: 'full'` (o espaço inicial do HTML
 * inserido fica como veio).
 */
export function installDomParser(schema: Schema): void {
  const current = DOMParser.fromSchema(schema);
  if (current instanceof RteDOMParser) return;
  schema.cached['domParser'] = new RteDOMParser(schema, current.rules);
}
