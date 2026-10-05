import {
  ɵgetDOM as getDOM,
  type ɵDomAdapter as DomAdapter,
} from '@angular/common';
import { ɵDominoAdapter as DominoAdapter } from '@angular/platform-server';

/**
 * Roda `render` com o adaptador de DOM do servidor (cópia do `ssr.spec.ts` do
 * `rte-angular`).
 *
 * O setup do builder inicia o TestBed (plataforma de navegador) em todo
 * arquivo, inclusive nos de ambiente `node`, e o `@angular/common` só aceita
 * o primeiro adaptador de DOM (`setRootDomAdapter` usa `??=`): o
 * `DominoAdapter` da plataforma de servidor nunca assumiria e o adaptador de
 * navegador leria o `document` global. Num processo de servidor real não há
 * adaptador anterior; aqui o adaptador atual vira um `DominoAdapter` só
 * durante o render e volta ao fim (o estado de módulo é compartilhado entre
 * arquivos, `isolate: false`).
 */
export async function withServerDomAdapter<T>(
  render: () => Promise<T>,
): Promise<T> {
  const dom = getDOM() as DomAdapter & { supportsDOMEvents: boolean };
  const proto: object | null = Object.getPrototypeOf(dom);
  const supportsDOMEvents = dom.supportsDOMEvents;
  try {
    Object.setPrototypeOf(dom, DominoAdapter.prototype);
    dom.supportsDOMEvents = false;
    dom.getDefaultDocument();
    return await render();
  } finally {
    Object.setPrototypeOf(dom, proto);
    dom.supportsDOMEvents = supportsDOMEvents;
  }
}
