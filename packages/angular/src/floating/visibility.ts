import type { RteFloatingMenuKind } from './types';

/** Identidade do menu flutuante visível (tipo e intervalo/posição). */
export interface RteFloatingIdentity {
  readonly kind: RteFloatingMenuKind;
  readonly from: number;
  readonly to: number;
}

/** Contexto que decide qual menu flutuante mostrar. */
export interface RteFloatingContext {
  readonly kind: RteFloatingMenuKind;
  readonly identity: RteFloatingIdentity;
}
