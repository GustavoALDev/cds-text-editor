import type { Type } from '@angular/core';

/**
 * Exemplos vivos do guia (spec 07c, X6): `<!-- live: id -->` no Markdown renderiza o componente
 * do id, entre os trechos de HTML da página. Cada entrada é carregada sob demanda e é
 * compilada em modo estrito pelo `ng build` contra os tarballs.
 */
export const EXAMPLES: Readonly<Record<string, () => Promise<Type<unknown>>>> =
  {
    resumo: () => import('./resumo.live').then((m) => m.ResumoLive),
    'inicio-rapido': () =>
      import('./inicio-rapido/form-example').then((m) => m.FormExample),
    configuracao: () =>
      import('./configuracao/route-live').then((m) => m.RouteLive),
    'barra-e-recursos': () =>
      import('./barra-e-recursos/live').then((m) => m.BarraLive),
    formularios: () =>
      import('./formularios/live').then((m) => m.FormulariosLive),
    idiomas: () => import('./idiomas/live').then((m) => m.IdiomasLive),
    tema: () => import('./tema/live').then((m) => m.TemaLive),
    exibicao: () => import('./exibicao/live').then((m) => m.DisplayLive),
  };
