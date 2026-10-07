import type { DraftStorage } from '@cds/rte-core';

/** Rascunho do editor (S3): tudo opcional, padrões do core. */
export interface RteDraftConfig {
  /** Padrão: `createLocalDraftStorage()` (cai para memória sem `localStorage`). */
  readonly storage?: DraftStorage;
  /** Idade máxima do rascunho em ms; padrão do core (7 dias). */
  readonly maxAgeMs?: number;
  /** Mostra o aviso de restauração embutido (padrão `true`, S6). */
  readonly prompt?: boolean;
}

/** Erro do rascunho (S4): falha de escrita ou armazenamento indisponível. */
export interface RteDraftErrorEvent {
  readonly reason: 'write' | 'unavailable';
}

/** Rascunho encontrado e ainda não decidido (S5): só a data, nunca o conteúdo. */
export interface RteDraftAvailable {
  readonly savedAt: number;
}
