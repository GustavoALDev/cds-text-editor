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

/** PNG de ~900 KB (abaixo do teto de 1 MiB do app): com `?slow=1` o progresso cresce aos poucos. */
export function slowPngFile(name: string): PageFile {
  const png = publicFile('e2e.png');
  const padding = Buffer.alloc(900 * 1024 - png.length);
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

/** Resultado de um gesto despachado na página: `defaultPrevented` de cada evento. */
export interface GestureResult {
  readonly prevented: Record<string, boolean>;
}

/**
 * Cola `files` no editável do editor `id` (E12): `DataTransfer` real com os
 * arquivos e, opcionalmente, `text/plain`/`text/html`, num `ClipboardEvent`
 * `paste` despachado no elemento focado (a seleção atual do editor).
 */
export function pasteFiles(
  page: Page,
  id: RteE2eId,
  files: readonly PageFile[],
  data: { text?: string; html?: string } = {},
): Promise<GestureResult> {
  return page.evaluate(
    ({ id, files, data }) => {
      const host = document.querySelector(`rte-editor[data-testid="${id}"]`);
      const editable = host?.querySelector('.ProseMirror');
      if (!editable) throw new Error(`sem o editável de ${id}`);
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      if (data.text !== undefined) dt.setData('text/plain', data.text);
      if (data.html !== undefined) dt.setData('text/html', data.html);
      const init = { bubbles: true, cancelable: true, clipboardData: dt };
      const event = new ClipboardEvent('paste', init);
      if (event.clipboardData !== dt) {
        Object.defineProperty(event, 'clipboardData', { value: dt });
      }
      const target =
        document.activeElement && editable.contains(document.activeElement)
          ? document.activeElement
          : editable;
      target.dispatchEvent(event);
      return { prevented: { paste: event.defaultPrevented } };
    },
    { id, files: [...files], data },
  );
}

/**
 * Solta `files` no editor `id` (E13): `dragenter`, `dragover` e `drop` com um
 * `DataTransfer` real, nas coordenadas `point` da janela (padrão: o centro
 * do editável), no elemento sob o ponto.
 */
export function dropFiles(
  page: Page,
  id: RteE2eId,
  files: readonly PageFile[],
  point?: { x: number; y: number },
): Promise<GestureResult> {
  return page.evaluate(
    ({ id, files, point }) => {
      const host = document.querySelector(`rte-editor[data-testid="${id}"]`);
      const editable = host?.querySelector('.ProseMirror');
      if (!editable) throw new Error(`sem o editável de ${id}`);
      const box = editable.getBoundingClientRect();
      const at = point ?? {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
      const target = document.elementFromPoint(at.x, at.y) ?? editable;
      const dt = new DataTransfer();
      for (const f of files) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      const prevented: Record<string, boolean> = {};
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: at.x,
          clientY: at.y,
          dataTransfer: dt,
        });
        if (event.dataTransfer !== dt) {
          Object.defineProperty(event, 'dataTransfer', { value: dt });
        }
        target.dispatchEvent(event);
        prevented[type] = event.defaultPrevented;
      }
      return { prevented };
    },
    { id, files: [...files], point },
  );
}
