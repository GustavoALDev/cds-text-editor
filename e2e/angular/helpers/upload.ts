import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { RteE2eId } from '../window';
import { APP_URL, editorHost } from './app';
import { chunkByMarker, type DialogsChunk } from './dialogs';

// Envio de arquivos (spec 05c2a, E25, pré-voo 16): os arquivos de teste são
// montados aqui (PNG e WebM lidos de `app/public`, SVG em texto, PNG de 1,1 MB)
// e recriados como `File` dentro da página; nenhum binário novo no repositório.

const PUBLIC = resolve(__dirname, '../app/public');

/** Arquivo serializável para `page.evaluate` (vira `File` na página). */
export interface PageFile {
  readonly name: string;
  readonly type: string;
  /** Conteúdo em base64. */
  readonly base64: string;
}

function publicFile(file: string): Buffer {
  return readFileSync(resolve(PUBLIC, file));
}

/** O `e2e.png` do app com outro nome (`__d<ms>` no nome atrasa a resposta). */
export function pngFile(name: string): PageFile {
  return {
    name,
    type: 'image/png',
    base64: publicFile('e2e.png').toString('base64'),
  };
}

/** O `e2e.webm` do app com outro nome. */
export function webmFile(name: string): PageFile {
  return {
    name,
    type: 'video/webm',
    base64: publicFile('e2e.webm').toString('base64'),
  };
}

/** Um SVG mínimo (tipo nunca aceito, E5). */
export function svgFile(name: string): PageFile {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  return {
    name,
    type: 'image/svg+xml',
    base64: Buffer.from(svg).toString('base64'),
  };
}

/** PNG de 1,1 MB (acima do `maxImageBytes` de 1 MiB do app): o `e2e.png` com bytes depois do IEND. */
export function bigPngFile(name: string): PageFile {
  const png = publicFile('e2e.png');
  const padding = Buffer.alloc(Math.ceil(1.1 * 1024 * 1024) - png.length);
  return {
    name,
    type: 'image/png',
    base64: Buffer.concat([png, padding]).toString('base64'),
  };
}

/** Uma entrada do `GET /__upload/log` do `serve.mjs`. */
export interface UploadLogEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly aborted: boolean;
  readonly headers: Record<string, string>;
}

/**
 * Requisições recebidas pelo `POST /__upload` desde o início do servidor (de
 * todos os *workers*: filtre por nome único).
 */
export async function uploadLog(
  request: APIRequestContext,
): Promise<UploadLogEntry[]> {
  const response = await request.get(`${APP_URL}/__upload/log`);
  return (await response.json()) as UploadLogEntry[];
}

/** `uploadFiles` do editor `id` com os arquivos recriados na página; os aceitos. */
export function uploadInPage(
  page: Page,
  id: RteE2eId,
  files: readonly PageFile[],
): Promise<number> {
  return page.evaluate(
    ({ id, files }) => {
      const list = files.map((f) => {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        return new File([bytes], f.name, { type: f.type });
      });
      return window.rteE2e.uploadFiles(id, list);
    },
    { id, files: [...files] },
  );
}

/** A bandeja de envios (`section.rte-uploads`) do editor `id`. */
export function tray(page: Page, id: RteE2eId): Locator {
  return editorHost(page, id).locator('section.rte-uploads');
}

/** Nome único por teste para filtrar o log compartilhado do servidor. */
export function uniqueName(base: string, ext: string, delay?: number): string {
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${base}-${tag}${delay === undefined ? '' : `__d${delay}`}.${ext}`;
}

/**
 * *Chunk* `rte-upload` (Ruling 28): o `.js` com o nome do *plugin* da
 * composição; registrar antes do `gotoApp`.
 */
export function uploadChunk(page: Page): Promise<DialogsChunk> {
  return chunkByMarker(page, 'rteUploadComposition');
}
