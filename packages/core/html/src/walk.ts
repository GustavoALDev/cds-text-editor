import { Parser } from 'htmlparser2';

/** Elementos cujo conteúdo nunca é texto visível. */
const SKIPPED = new Set(['script', 'style', 'template']);

export interface HtmlHandlers {
  open?(name: string, attributes: Record<string, string>): void;
  close?(name: string): void;
  /** Só recebe texto visível (fora de script/style/template). */
  text?(data: string): void;
}

/**
 * Percorre o HTML com o `htmlparser2` (sem DOM), entregando só texto visível.
 * Tolera HTML malformado: o parser fecha implicitamente o que ficou aberto.
 */
export function walkHtml(html: string, handlers: HtmlHandlers): void {
  let skipDepth = 0;
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (SKIPPED.has(name)) skipDepth++;
        handlers.open?.(name, attributes);
      },
      onclosetag(name) {
        handlers.close?.(name);
        if (SKIPPED.has(name) && skipDepth > 0) skipDepth--;
      },
      ontext(data) {
        if (skipDepth === 0) handlers.text?.(data);
      },
    },
    { decodeEntities: true },
  );
  parser.write(String(html));
  parser.end();
}
