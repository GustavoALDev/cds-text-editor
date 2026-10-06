import { RTE_UPLOAD_EXTENSIONS, type RteResolvedUpload } from './config';
import type { RteUploadType } from './types';

export type RteUploadFileCheck =
  | { readonly ok: true; readonly type: RteUploadType }
  | {
      readonly ok: false;
      readonly type: RteUploadType;
      readonly reason: 'type' | 'size';
    };

/** Extensão minúscula depois do último `.`; `''` sem ponto. */
function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/**
 * Validação do arquivo antes de enviar (E5, pré-voo 5): tipo pelo MIME ou,
 * com MIME vazio, pela extensão; depois o tamanho. O `count` é do chamador
 * (posições no gesto).
 */
export function validateUploadFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  cfg: RteResolvedUpload,
): RteUploadFileCheck {
  const mime = file.type.toLowerCase();
  const effective =
    mime === '' ? (RTE_UPLOAD_EXTENSIONS[extensionOf(file.name)] ?? '') : mime;
  if (effective.startsWith('video/')) {
    const allowed =
      typeof cfg.adapter.uploadVideo === 'function' &&
      (cfg.videoTypes as readonly string[]).includes(effective);
    if (!allowed) return { ok: false, type: 'video', reason: 'type' };
    return file.size > cfg.maxVideoBytes
      ? { ok: false, type: 'video', reason: 'size' }
      : { ok: true, type: 'video' };
  }
  if (!(cfg.imageTypes as readonly string[]).includes(effective)) {
    return { ok: false, type: 'image', reason: 'type' };
  }
  return file.size > cfg.maxImageBytes
    ? { ok: false, type: 'image', reason: 'size' }
    : { ok: true, type: 'image' };
}

const MIME_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/**
 * Nome exibido (pré-voo 14): o nome aparado ou, vazio, `image.<ext>` /
 * `video.<ext>` pelo MIME (`image`/`video` sem MIME conhecido). O evento
 * `uploadError` continua com o `file.name` cru.
 */
export function displayName(file: Pick<File, 'name' | 'type'>): string {
  const name = file.name.trim();
  if (name !== '') return name;
  const mime = file.type.toLowerCase();
  const base = mime.startsWith('video/') ? 'video' : 'image';
  const ext = MIME_EXTENSION[mime];
  return ext ? `${base}.${ext}` : base;
}
