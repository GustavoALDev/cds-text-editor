import { InjectionToken } from '@angular/core';

/**
 * O que o `RteEditor` usa da lista do menu `/`. O componente fica num *chunk*
 * do `@defer` (K3): o editor o consulta por este token, nunca pela classe.
 * Antes da carga a consulta é `undefined` (sem ARIA de autocompletar).
 *
 * @internal
 */
export interface RteSlashMenuApi {
  /** A lista está montada (o elemento existe). */
  readonly ready: true;
}

export const RTE_SLASH_MENU = new InjectionToken<RteSlashMenuApi>(
  'RTE_SLASH_MENU',
);
