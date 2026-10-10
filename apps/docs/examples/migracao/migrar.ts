// #region migrar
import { getHtmlSchema } from '@comodeviaser/rte-core';
import { validateHtml, type RteHtmlViolation } from '@comodeviaser/rte-core/html';
import { createSanitizer } from '@comodeviaser/rte-sanitizer';

const schema = getHtmlSchema();
const sanitize = createSanitizer();

export interface Migracao {
  /** HTML no esquema do editor. */
  html: string;
  /** O que o HTML antigo tinha fora do esquema, contado por tipo de problema. */
  descartado: Record<string, number>;
}

/** Função pura: não lê nem grava nada. Rode-a sobre o legado e revise `descartado` antes de gravar. */
export function migrar(htmlAntigo: string): Migracao {
  const descartado: Record<string, number> = {};
  const violacoes: RteHtmlViolation[] = validateHtml(htmlAntigo, schema, {
    mode: 'accepted',
  });
  for (const v of violacoes) {
    const chave = v.name
      ? `${v.kind}: ${v.tag}[${v.name}]`
      : `${v.kind}: ${v.tag}`;
    descartado[chave] = (descartado[chave] ?? 0) + 1;
  }
  return { html: sanitize(htmlAntigo), descartado };
}
// #endregion
