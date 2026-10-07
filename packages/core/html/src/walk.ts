import { Parser } from 'htmlparser2';

/** Elementos cujo conteúdo nunca é texto visível. */
const SKIPPED = new Set(['script', 'style', 'template']);

/** Profundidade máxima de elementos aceita por padrão. */
export const DEFAULT_MAX_DEPTH = 256;

/** Lança `RangeError` se `maxDepth` não for inteiro positivo. */
export function resolveMaxDepth(maxDepth: number | undefined): number {
  const value = maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `maxDepth ${String(value)} inválido: precisa ser um inteiro positivo.`,
    );
  }
  return value;
}

export interface HtmlHandlers {
  open?(name: string, attributes: Record<string, string>): void;
  close?(name: string): void;
  /** Só recebe texto visível (fora de script/style/template). */
  text?(data: string): void;
}

/**
 * Percorre o HTML com o `htmlparser2` (sem DOM), entregando só texto visível.
 * Tolera HTML malformado: o parser fecha implicitamente o que ficou aberto.
 * Devolve `true` se a leitura foi interrompida por passar de `maxDepth`.
 */
export function walkHtml(
  html: string,
  handlers: HtmlHandlers,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): boolean {
  let skipDepth = 0;
  let depth = 0;
  let stopped = false;
  // A pilha de tags do htmlparser2 é quadrática em aninhamento profundo (DoS):
  // ao passar de `maxDepth` a leitura é interrompida e o que foi coletado é mantido.
  const parser: Parser = new Parser(
    {
      onopentag(name, attributes) {
        if (stopped) return;
        if (depth + 1 > maxDepth) {
          stopped = true;
          parser.pause();
          return;
        }
        depth++;
        if (SKIPPED.has(name)) skipDepth++;
        handlers.open?.(name, attributes);
      },
      onclosetag(name) {
        if (stopped) return;
        depth--;
        handlers.close?.(name);
        if (SKIPPED.has(name) && skipDepth > 0) skipDepth--;
      },
      ontext(data) {
        if (!stopped && skipDepth === 0) handlers.text?.(data);
      },
    },
    { decodeEntities: true },
  );
  parser.write(String(html));
  if (!stopped) parser.end();
  return stopped;
}
