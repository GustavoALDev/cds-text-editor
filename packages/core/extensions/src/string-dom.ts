// Documento de strings (spec 03b, B7 e §5): implementa só a superfície que o
// `DOMSerializer` do prosemirror-model 1.25 usa (`renderSpec`,
// `serializeFragment`, `serializeMark`) e o que as extensões usam ao montar nós
// com o documento de renderização. `writeHtml` escreve pelo algoritmo de
// serialização do HTML, sem DOM real.

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** Elementos vazios: sem fechamento e sem `/`. */
const VOID_ELEMENTS = new Set([
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

// Mais estritos que o DOM: um nome com aspas, `<`, `>`, `=`, `/` ou espaço
// quebraria a marcação escrita.
const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9._:-]*$/;
const ATTRIBUTE_NAME = /^[^\s"'<>/=\p{Cc}]+$/u;

function invalidCharacter(kind: string, name: string): DOMException {
  return new DOMException(
    `nome de ${kind} inválido: "${name}".`,
    'InvalidCharacterError',
  );
}

type Child = StringElement | StringText | ForeignNode;
/** Nó que não é deste documento (por exemplo, devolvido pelo DOM real). */
type ForeignNode = {
  nodeType?: unknown;
  outerHTML?: unknown;
  textContent?: unknown;
};

abstract class StringParent {
  readonly childNodes: Child[] = [];

  appendChild<T>(child: T): T {
    return this.insertBefore(child, null);
  }

  insertBefore<T>(child: T, ref: unknown): T {
    let index = this.childNodes.length;
    if (ref !== null && ref !== undefined) {
      index = this.childNodes.indexOf(ref as Child);
      if (index < 0) {
        throw new DOMException(
          'o nó de referência não é filho deste nó.',
          'NotFoundError',
        );
      }
    }
    if (child instanceof StringFragment) {
      const moved = child.childNodes.splice(0);
      for (const node of moved) adopt(node, this);
      this.childNodes.splice(index, 0, ...moved);
      return child;
    }
    if (child instanceof StringElement || child instanceof StringText) {
      const old = child.parentNode;
      if (old) {
        const at = old.childNodes.indexOf(child);
        old.childNodes.splice(at, 1);
        if (old === this && at < index) index--;
      }
      adopt(child, this);
    }
    this.childNodes.splice(index, 0, child as Child);
    return child;
  }

  get textContent(): string {
    let out = '';
    for (const child of this.childNodes) out += textOf(child);
    return out;
  }

  set textContent(value: string | null) {
    for (const child of this.childNodes) adopt(child, null);
    this.childNodes.length = 0;
    const text = value == null ? '' : String(value);
    if (text !== '') this.appendChild(new StringText(text));
  }
}

function adopt(node: Child, parent: StringParent | null): void {
  if (node instanceof StringElement || node instanceof StringText) {
    node.parentNode = parent;
  }
}

function textOf(node: Child): string {
  if (node instanceof StringText) return node.data;
  if (node instanceof StringElement) return node.textContent;
  return typeof node.textContent === 'string' ? node.textContent : '';
}

export class StringFragment extends StringParent {
  readonly nodeType = 11;
}

export class StringText {
  readonly nodeType = 3;
  parentNode: StringParent | null = null;
  data: string;

  constructor(data: string) {
    this.data = data;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string | null) {
    this.data = value == null ? '' : String(value);
  }

  get nodeValue(): string {
    return this.data;
  }
}

export class StringElement extends StringParent {
  readonly nodeType = 1;
  parentNode: StringParent | null = null;
  /** Atributos na ordem em que foram definidos. */
  readonly attributes: [name: string, value: string][] = [];
  readonly style: { cssText: string };

  constructor(
    readonly tagName: string,
    readonly namespaceURI: string,
  ) {
    super();
    // `style.cssText` grava o atributo `style` literal, na posição em que foi
    // definido (sem o CSSOM do motor, que reescreve cores e acrescenta `;`).
    const style = {} as { cssText: string };
    Object.defineProperty(style, 'cssText', {
      get: () => this.getAttribute('style') ?? '',
      set: (value: unknown) => this.setAttribute('style', String(value ?? '')),
    });
    this.style = style;
  }

  get isHtml(): boolean {
    return this.namespaceURI === HTML_NS;
  }

  setAttribute(name: string, value: unknown): void {
    const key = String(name);
    if (!ATTRIBUTE_NAME.test(key)) throw invalidCharacter('atributo', key);
    const normalized = this.isHtml ? key.toLowerCase() : key;
    const text = String(value);
    const existing = this.attributes.find(([n]) => n === normalized);
    if (existing) existing[1] = text;
    else this.attributes.push([normalized, text]);
  }

  setAttributeNS(
    _namespace: string | null,
    name: string,
    value: unknown,
  ): void {
    const key = String(name);
    if (!ATTRIBUTE_NAME.test(key)) throw invalidCharacter('atributo', key);
    const text = String(value);
    const existing = this.attributes.find(([n]) => n === key);
    if (existing) existing[1] = text;
    else this.attributes.push([key, text]);
  }

  getAttribute(name: string): string | null {
    const key = this.isHtml ? String(name).toLowerCase() : String(name);
    return this.attributes.find(([n]) => n === key)?.[1] ?? null;
  }

  /** Lista de classes do atributo `class` (separadas por espaço ASCII). */
  get classTokens(): string[] {
    return (this.getAttribute('class') ?? '')
      .split(/[\t\n\f\r ]+/)
      .filter((token) => token !== '');
  }
}

/** Cria um documento em memória que só produz strings. */
export function createStringDocument(): Document {
  const doc = {
    createElement(tagName: string): StringElement {
      const name = String(tagName);
      if (!ELEMENT_NAME.test(name)) throw invalidCharacter('elemento', name);
      return new StringElement(name.toLowerCase(), HTML_NS);
    },
    createElementNS(namespace: string | null, qualifiedName: string) {
      const name = String(qualifiedName);
      if (!ELEMENT_NAME.test(name)) throw invalidCharacter('elemento', name);
      const ns = namespace ?? '';
      return new StringElement(ns === HTML_NS ? name.toLowerCase() : name, ns);
    },
    createTextNode(data: string): StringText {
      return new StringText(String(data));
    },
    createDocumentFragment(): StringFragment {
      return new StringFragment();
    },
  };
  return doc as unknown as Document;
}

/**
 * Pré-processamento da entrada do HTML (WHATWG 13.2.3.5) já na escrita: CR e
 * CRLF viram LF e NUL vira U+FFFD, como a releitura faria. Sem isso a saída
 * não seria ponto fixo (o CR de um bloco de código voltaria como LF).
 */
function preprocess(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\0/g, REPLACEMENT_CHAR);
}

const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

function escapeText(text: string): string {
  return preprocess(text)
    .replace(/&/g, '&amp;')
    .replace(/\u00a0/g, '&nbsp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return preprocess(text)
    .replace(/&/g, '&amp;')
    .replace(/\u00a0/g, '&nbsp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escreve o HTML de um nó do documento de strings. Desvio deliberado do
 * algoritmo: o texto de `script`/`style` também é escapado (nenhum dos dois
 * está no contrato), e texto e atributos passam por `preprocess`. Nó de outro documento com `nodeType: 1` é escrito pelo
 * `outerHTML`; sem ele, lança `TypeError`.
 */
export function writeHtml(node: unknown): string {
  if (node instanceof StringText) return escapeText(node.data);
  if (node instanceof StringFragment) return writeChildren(node);
  if (node instanceof StringElement) {
    let out = `<${node.tagName}`;
    for (const [name, value] of node.attributes) {
      out += ` ${name}="${escapeAttribute(value)}"`;
    }
    out += '>';
    if (node.isHtml && VOID_ELEMENTS.has(node.tagName)) return out;
    return `${out}${writeChildren(node)}</${node.tagName}>`;
  }
  const foreign = node as ForeignNode | null;
  if (
    foreign !== null &&
    typeof foreign === 'object' &&
    foreign.nodeType === 1 &&
    typeof foreign.outerHTML === 'string'
  ) {
    return foreign.outerHTML;
  }
  throw new TypeError(
    'serializeRteHtml: nó de DOM sem outerHTML não pode ser escrito; use a estrutura de array do renderHTML ou o documento de renderização.',
  );
}

function writeChildren(parent: StringParent): string {
  let out = '';
  for (const child of parent.childNodes) out += writeHtml(child);
  return out;
}
