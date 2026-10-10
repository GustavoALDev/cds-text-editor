import type { RteDraftStorage } from '@comodeviaser/rte-core';

/** Rascunho do editor (S3): tudo opcional, padrões do core. */
export interface RteDraftConfig {
  /** Padrão: `createLocalDraftStorage()` (cai para memória sem `localStorage`). */
  readonly storage?: RteDraftStorage;
  /** Idade máxima do rascunho em ms; padrão do core (7 dias). */
  readonly maxAgeMs?: number;
  /** Mostra o aviso de restauração embutido (padrão `true`, S6). */
  readonly prompt?: boolean;
}

/** Erro do rascunho (S4): falha de escrita ou armazenamento indisponível. */
export interface RteDraftErrorEvent {
  /**
   * `write` quando a escrita falhou; `unavailable` quando não há armazenamento.
   */
  readonly reason: 'write' | 'unavailable';
}

/** Rascunho encontrado e ainda não decidido (S5): só a data, nunca o conteúdo. */
export interface RteDraftAvailable {
  /** Quando o rascunho foi salvo (ms desde a época). */
  readonly savedAt: number;
}
