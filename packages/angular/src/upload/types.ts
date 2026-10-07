import type { RteVideoTrack } from '@cds/rte-core/extensions';

/** Contexto passado ao adaptador de envio (E4). */
export interface RteUploadContext {
  readonly signal: AbortSignal;
  /** Fração 0–1; `null` = indeterminado. */
  onProgress(fraction: number | null): void;
}

export interface RteUploadedImage {
  url: string;
  width?: number;
  height?: number;
  srcset?: string;
  sizes?: string;
}

export interface RteUploadedVideo {
  url: string;
  width?: number;
  height?: number;
  poster?: string;
}

/** Adaptador do consumidor: um envio por arquivo, nunca repetido pelo editor. */
export interface RteUploadAdapter {
  uploadImage(file: File, ctx: RteUploadContext): Promise<RteUploadedImage>;
  uploadVideo?(file: File, ctx: RteUploadContext): Promise<RteUploadedVideo>;
  /**
   * Endereços de mídia que saíram do documento desde a base salva, entregues
   * depois de `markSaved` (S9). Fora da zona; exceção ou rejeição é engolida.
   * Peça exclusão com carência no servidor: o desfazer pode trazê-los de volta.
   */
  onMediaRemoved?(urls: readonly string[]): void | Promise<void>;
}

export type RteUploadType = 'image' | 'video';

export type RteUploadImageMime =
  'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/avif';

export type RteUploadVideoMime = 'video/mp4' | 'video/webm';

export interface RteUploadConfig {
  adapter: RteUploadAdapter;
  /** Subconjunto da lista fechada; padrão: todos (E5). */
  imageTypes?: readonly RteUploadImageMime[];
  /** Subconjunto da lista fechada; padrão: todos. */
  videoTypes?: readonly RteUploadVideoMime[];
  /** Inteiro positivo; padrão 10 MiB. */
  maxImageBytes?: number;
  /** Inteiro positivo; padrão 200 MiB. */
  maxVideoBytes?: number;
  /** Inteiro positivo; padrão 20. */
  maxFilesPerAction?: number;
  /** Pré-visualização local (exige `img-src blob:`); padrão `false`. */
  preview?: boolean;
}

export type RteUploadErrorReason =
  'type' | 'size' | 'count' | 'network' | 'server' | 'response' | 'unavailable';

/** Motivos que o adaptador pode dar (E4). */
export type RteUploadAdapterReason = 'network' | 'server' | 'response';

/** Lançada pelo adaptador para dar o motivo da falha (E4). */
export class RteUploadError extends Error {
  override readonly name = 'RteUploadError';
  readonly reason: RteUploadAdapterReason;

  constructor(reason: RteUploadAdapterReason, options?: { cause?: unknown }) {
    super(`Falha no envio do arquivo: ${reason}`, options);
    this.reason = reason;
  }
}

export interface RteUploadErrorEvent {
  readonly fileName: string;
  readonly type: RteUploadType;
  readonly reason: RteUploadErrorReason;
  readonly cause?: unknown;
}

export interface RteUploadStatus {
  readonly id: string;
  readonly fileName: string;
  readonly type: RteUploadType;
  readonly state: 'queued' | 'uploading' | 'inserting';
  readonly progress: number | null;
}

/** Textos do diálogo guardados e aplicados na chegada (E9, E14). */
export interface RteUploadText {
  alt?: string;
  caption: string;
  credit?: string;
  poster?: string | null;
  tracks?: RteVideoTrack[];
}
