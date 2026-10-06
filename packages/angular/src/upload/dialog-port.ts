import { RTE_UPLOAD_EXTENSIONS, type RteResolvedUpload } from './config';
import type { RteUploadText, RteUploadType } from './types';
import { validateUploadFile } from './validate';

/** O que o campo de arquivo do diálogo mostra (pré-voo 13). */
export interface RteFileRules {
  /** `accept` do `<input type="file">`: os MIMEs e depois as extensões. */
  readonly accept: string;
  /** Nomes dos tipos para a dica (`PNG`, `JPEG`, …). */
  readonly typeNames: readonly string[];
  /** Teto em MB com uma casa (`bytes / 1048576`, arredondado). */
  readonly maxMegabytes: number;
}

/**
 * Porta do envio para os diálogos de imagem e vídeo (05c2a E14, pré-voo 13):
 * fica no principal e chega ao *chunk* `rte-media-forms` por entrada, que
 * assim não importa o gerenciador. `null` no `RteEditor` sem adaptador.
 */
export interface RteDialogUploads {
  readonly image: RteFileRules;
  /** `null` sem `uploadVideo` (ou sem tipo de vídeo). */
  readonly video: RteFileRules | null;
  /** Erro do arquivo para o diálogo do tipo dado; `null` se aceito. */
  check(file: File, type: RteUploadType): 'type' | 'size' | null;
  /** Cria o envio (marcador no ponto `at`); `false` se recusado. */
  start(o: {
    file: File;
    type: RteUploadType;
    at: number;
    text: RteUploadText;
  }): boolean;
}

/** Quem cria o envio: a fachada `RteUploads` (ou o gerenciador). */
export interface RteDialogUploadStarter {
  start(files: readonly File[], at: number, text?: RteUploadText): number;
}

const TYPE_NAMES: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/avif': 'AVIF',
    'video/mp4': 'MP4',
    'video/webm': 'WebM',
  }),
);

/** Regras do campo de arquivo do tipo; `null` se o tipo não tem MIME aceito. */
export function fileRules(
  cfg: RteResolvedUpload,
  type: RteUploadType,
): RteFileRules | null {
  const mimes: readonly string[] =
    type === 'image' ? cfg.imageTypes : cfg.videoTypes;
  if (mimes.length === 0) return null;
  const extensions = Object.keys(RTE_UPLOAD_EXTENSIONS)
    .filter((ext) => mimes.includes(RTE_UPLOAD_EXTENSIONS[ext] as string))
    .map((ext) => `.${ext}`);
  const bytes = type === 'image' ? cfg.maxImageBytes : cfg.maxVideoBytes;
  return Object.freeze({
    accept: [...mimes, ...extensions].join(','),
    typeNames: Object.freeze(mimes.map((m) => TYPE_NAMES[m] ?? m)),
    maxMegabytes: Math.round((bytes / 1048576) * 10) / 10,
  });
}

/** Porta do diálogo sobre a configuração resolvida (pré-voo 13). */
export function createDialogUploads(
  uploads: RteDialogUploadStarter,
  cfg: RteResolvedUpload,
): RteDialogUploads {
  return Object.freeze({
    image: fileRules(cfg, 'image') as RteFileRules,
    video: fileRules(cfg, 'video'),
    check(file: File, type: RteUploadType) {
      const r = validateUploadFile(file, cfg);
      if (r.type !== type) return 'type';
      return r.ok ? null : r.reason;
    },
    start(o: {
      file: File;
      type: RteUploadType;
      at: number;
      text: RteUploadText;
    }) {
      return uploads.start([o.file], o.at, o.text) > 0;
    },
  });
}
