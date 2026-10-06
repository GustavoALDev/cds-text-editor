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

type AdapterReason = 'network' | 'server' | 'response';

/** Lançada pelo adaptador para dar o motivo da falha (E4). */
export class RteUploadError extends Error {
  override readonly name = 'RteUploadError';
  readonly reason: AdapterReason;

  constructor(reason: AdapterReason, options?: { cause?: unknown }) {
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

/**
 * Motivo de um erro do adaptador (E4, pré-voo 4): reconhece pela marca
 * (`name` + `reason` válido), não só por `instanceof`, para que o `/upload`
 * crie erros sem importar o principal. Tudo o mais vale `'server'`.
 */
export function uploadReason(e: unknown): AdapterReason {
  if (e instanceof RteUploadError) return e.reason;
  if (typeof e === 'object' && e !== null) {
    const { name, reason } = e as { name?: unknown; reason?: unknown };
    if (
      name === 'RteUploadError' &&
      (reason === 'network' || reason === 'server' || reason === 'response')
    ) {
      return reason;
    }
  }
  return 'server';
}
