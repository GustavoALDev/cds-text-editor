import { isDevMode } from '@angular/core';
import type {
  RteUploadAdapter,
  RteUploadConfig,
  RteUploadImageMime,
  RteUploadVideoMime,
} from './types';

/** Listas fechadas da E5 (nunca `image/svg+xml`). */
export const RTE_UPLOAD_IMAGE_TYPES: readonly RteUploadImageMime[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
];
export const RTE_UPLOAD_VIDEO_TYPES: readonly RteUploadVideoMime[] = [
  'video/mp4',
  'video/webm',
];

/** Extensão (minúscula) → tipo, para o MIME vazio (E5). */
export const RTE_UPLOAD_EXTENSIONS: Readonly<
  Record<string, RteUploadImageMime | RteUploadVideoMime>
> = Object.freeze(
  Object.assign(
    Object.create(null) as Record<
      string,
      RteUploadImageMime | RteUploadVideoMime
    >,
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      avif: 'image/avif',
      mp4: 'video/mp4',
      webm: 'video/webm',
    },
  ),
);

const DEFAULT_MAX_IMAGE = 10 * 1024 * 1024;
const DEFAULT_MAX_VIDEO = 200 * 1024 * 1024;
const DEFAULT_MAX_FILES = 20;

/** Configuração de envio já resolvida (E3, E5). */
export interface RteResolvedUpload {
  readonly adapter: RteUploadAdapter;
  readonly imageTypes: readonly RteUploadImageMime[];
  readonly videoTypes: readonly RteUploadVideoMime[];
  readonly maxImageBytes: number;
  readonly maxVideoBytes: number;
  readonly maxFilesPerAction: number;
  readonly preview: boolean;
  /** O objeto de entrada (identidade para abortar ao trocar, E17). */
  readonly source: RteUploadConfig;
}

function warn(message: string): void {
  if (isDevMode()) console.warn(`[rte-editor] ${message}`);
}

function subset<T extends string>(
  requested: readonly T[] | undefined,
  allowed: readonly T[],
  discarded: string[],
): readonly T[] {
  if (requested === undefined) return allowed;
  if (!Array.isArray(requested)) {
    discarded.push('(valor que não é lista)');
    return allowed;
  }
  const out: T[] = [];
  for (const t of requested as readonly T[]) {
    if (allowed.includes(t)) {
      if (!out.includes(t)) out.push(t);
    } else {
      discarded.push(String(t));
    }
  }
  return out;
}

function positiveInt(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (Number.isSafeInteger(value) && value > 0) return value;
  warn(
    `upload.${name} deve ser um inteiro positivo; usando o padrão (${fallback}).`,
  );
  return fallback;
}

/**
 * Resolve a configuração (E3, E5): `null` sem objeto ou sem
 * `adapter.uploadImage`; tipos fora da lista fechada são descartados com um
 * aviso; números inválidos voltam ao padrão com aviso.
 */
export function resolveUploadConfig(
  config: RteUploadConfig | null | undefined,
): RteResolvedUpload | null {
  if (
    typeof config !== 'object' ||
    config === null ||
    typeof config.adapter?.uploadImage !== 'function'
  ) {
    return null;
  }
  const discarded: string[] = [];
  const imageTypes = subset(
    config.imageTypes,
    RTE_UPLOAD_IMAGE_TYPES,
    discarded,
  );
  const videoTypes =
    typeof config.adapter.uploadVideo === 'function'
      ? subset(config.videoTypes, RTE_UPLOAD_VIDEO_TYPES, discarded)
      : [];
  if (discarded.length > 0) {
    warn(
      `upload: tipos fora da lista permitida foram descartados (${discarded.join(', ')}); svg nunca é aceito.`,
    );
  }
  return {
    adapter: config.adapter,
    imageTypes,
    videoTypes,
    maxImageBytes: positiveInt(
      config.maxImageBytes,
      DEFAULT_MAX_IMAGE,
      'maxImageBytes',
    ),
    maxVideoBytes: positiveInt(
      config.maxVideoBytes,
      DEFAULT_MAX_VIDEO,
      'maxVideoBytes',
    ),
    maxFilesPerAction: positiveInt(
      config.maxFilesPerAction,
      DEFAULT_MAX_FILES,
      'maxFilesPerAction',
    ),
    preview: config.preview === true,
    source: config,
  };
}
