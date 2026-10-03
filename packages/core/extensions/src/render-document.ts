// Pilha do "documento de renderização" (spec 03b, B11): durante a serialização
// canônica é o documento de strings; fora dela, `globalThis.document`.
const stack: Document[] = [];

/** Documento em que as extensões devem montar nós na renderização. */
export function getRenderDocument(): Document {
  // Em Node, sem DOM, o global é `undefined` (o tipo segue o do navegador).
  return stack.length > 0
    ? (stack[stack.length - 1] as Document)
    : ((globalThis as { document?: Document }).document as Document);
}

/** Executa `fn` com `doc` no topo da pilha; desempilha mesmo se `fn` lançar. */
export function withRenderDocument<T>(doc: Document, fn: () => T): T {
  stack.push(doc);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}
