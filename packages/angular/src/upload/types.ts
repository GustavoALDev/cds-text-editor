import type { RteVideoTrack } from '@cds/rte-core/extensions';

/** Contexto passado ao adaptador de envio (E4). */
export interface RteUploadContext {
  /**
   * Sinal de cancelamento do envio; dispara quando o autor cancela ou o envio é abortado.
   */
  readonly signal: AbortSignal;
  /** Fração 0–1; `null` = indeterminado. */
  onProgress(fraction: number | null): void;
}

/** Resultado do envio de uma imagem. */
export interface RteUploadedImage {
  /** Endereço da imagem enviada. */
  url: string;
  /** Largura intrínseca em pixels. */
  width?: number;
  /** Altura intrínseca em pixels. */
  height?: number;
  /** Atributo `srcset` da imagem responsiva. */
  srcset?: string;
  /** Atributo `sizes` da imagem responsiva. */
  sizes?: string;
}

/** Resultado do envio de um vídeo. */
export interface RteUploadedVideo {
  /** Endereço do vídeo enviado. */
  url: string;
  /** Largura em pixels. */
  width?: number;
  /** Altura em pixels. */
  height?: number;
  /** Endereço da imagem de capa. */
  poster?: string;
}

/** Adaptador do consumidor: um envio por arquivo, nunca repetido pelo editor. */
export interface RteUploadAdapter {
  /**
   * Envia uma imagem e devolve o endereço final; rejeite com `RteUploadError` para dar o motivo.
   */
  uploadImage(file: File, ctx: RteUploadContext): Promise<RteUploadedImage>;
  /** Envia um vídeo; sem este método, vídeos não são aceitos. */
  uploadVideo?(file: File, ctx: RteUploadContext): Promise<RteUploadedVideo>;
  /**
   * Re-hospeda uma imagem externa colada (S10): o adaptador baixa ou
   * registra `url` do lado do servidor e devolve o endereço próprio. O
   * editor não busca nada (sem credenciais do navegador); só roda com
   * `rehostExternal: true`. Falha ou resposta recusada mantêm o original.
   */
  registerExternal?(
    url: string,
    ctx: RteUploadContext,
  ): Promise<RteUploadedImage>;
  /**
   * Endereços de mídia que saíram do documento desde a base salva, entregues
   * depois de `markSaved` (S9). Fora da zona; exceção ou rejeição é engolida.
   * Peça exclusão com carência no servidor: o desfazer pode trazê-los de volta.
   */
  onMediaRemoved?(urls: readonly string[]): void | Promise<void>;
}

/** Tipo de arquivo enviado: imagem ou vídeo. */
export type RteUploadType = 'image' | 'video';

/** Tipos MIME de imagem aceitos. */
export type RteUploadImageMime =
  'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/avif';

/** Tipos MIME de vídeo aceitos. */
export type RteUploadVideoMime = 'video/mp4' | 'video/webm';

/** Configuração do envio de arquivos. */
export interface RteUploadConfig {
  /** Adaptador que faz o envio. */
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
  /** Re-hospeda imagens externas `https:` coladas (exige `registerExternal`); padrão `false`. */
  rehostExternal?: boolean;
  /** Hosts próprios, que não são re-hospedados (a origem da página também não é). */
  ownHosts?: readonly string[];
}

/**
 * Motivo de uma falha de envio: tipo, tamanho ou quantidade recusados pelo editor; rede, servidor ou resposta inválida vindos do adaptador; ou envio indisponível.
 */
export type RteUploadErrorReason =
  'type' | 'size' | 'count' | 'network' | 'server' | 'response' | 'unavailable';

/** Motivos que o adaptador pode dar (E4). */
export type RteUploadAdapterReason = 'network' | 'server' | 'response';

/** Lançada pelo adaptador para dar o motivo da falha (E4). */
export class RteUploadError extends Error {
  /** Sempre `'RteUploadError'`. */
  override readonly name = 'RteUploadError';
  /** Motivo da falha. */
  readonly reason: RteUploadAdapterReason;

  constructor(reason: RteUploadAdapterReason, options?: { cause?: unknown }) {
    super(`Falha no envio do arquivo: ${reason}`, options);
    this.reason = reason;
  }
}

/** Falha de envio de um arquivo, emitida por `uploadError`. */
export interface RteUploadErrorEvent {
  /** Nome do arquivo. */
  readonly fileName: string;
  /** Tipo do envio. */
  readonly type: RteUploadType;
  /** Motivo da falha. */
  readonly reason: RteUploadErrorReason;
  /** Erro original, quando houver. */
  readonly cause?: unknown;
}

/** Estado de um envio em curso. */
export interface RteUploadStatus {
  /** Identificador do envio. */
  readonly id: string;
  /** Nome do arquivo. */
  readonly fileName: string;
  /** Tipo do envio. */
  readonly type: RteUploadType;
  /** Fase: na fila, enviando ou inserindo no documento. */
  readonly state: 'queued' | 'uploading' | 'inserting';
  /** Fração de 0 a 1, ou `null` quando indeterminado. */
  readonly progress: number | null;
}

/**
 * Textos do diálogo guardados e aplicados na chegada (E9, E14).
 *
 * @internal
 */
export interface RteUploadText {
  alt?: string;
  caption: string;
  credit?: string;
  poster?: string | null;
  tracks?: RteVideoTrack[];
}
