import type { Type } from '@angular/core';

/**
 * Exemplos vivos do guia (spec 07c, X6): `<!-- live: id -->` no Markdown renderiza o componente
 * do id, entre os trechos de HTML da página. Cada entrada é carregada sob demanda e é
 * compilada em modo estrito pelo `ng build` contra os tarballs.
 */
export const EXAMPLES: Readonly<Record<string, () => Promise<Type<unknown>>>> =
  {
    resumo: () => import('./resumo.live').then((m) => m.ResumoLive),
  };
