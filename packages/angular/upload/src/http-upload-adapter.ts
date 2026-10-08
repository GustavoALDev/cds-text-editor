import type {
  RteUploadAdapter,
  RteUploadContext,
  RteUploadedImage,
  RteUploadedVideo,
  RteUploadType,
} from '@cds/rte-angular';

export interface RteHttpUploadOptions {
  endpoint: string | { image: string; video?: string };
  /** Nome do campo do arquivo no multipart; padrão `'file'`. */
  fieldName?: string;
  /**
   * Cabeçalhos extras (objeto ou função chamada a cada envio). `Content-Type` é ignorado. O envio usa
   * `XMLHttpRequest`: **os interceptors do `HttpClient` não passam por aqui** (nenhum cabeçalho XSRF do
   * Angular é acrescentado; envie o seu por `headers`) e, com `withCredentials`, os cookies vão ao endpoint.
   */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Padrão `false`. */
  withCredentials?: boolean;
  /** 0 = sem limite. */
  timeoutMs?: number;
  mapResponse?(
    body: unknown,
    info: { file: File; kind: RteUploadType },
  ): RteUploadedImage | RteUploadedVideo;
}

type Reason = 'network' | 'server' | 'response';

/**
 * Erro com a marca (`name` + `reason`) que o gerenciador reconhece sem que este
 * entry importe o principal (R1).
 */
class HttpUploadError extends Error {
  override readonly name = 'RteUploadError';
  constructor(
    readonly reason: Reason,
    cause?: unknown,
  ) {
    super(`Falha no envio do arquivo: ${reason}`, { cause });
  }
}

function abortError(): DOMException {
  return new DOMException('Envio cancelado', 'AbortError');
}

const KNOWN = ['url', 'width', 'height', 'srcset', 'sizes', 'poster'] as const;

function defaultMap(body: unknown): RteUploadedImage | RteUploadedVideo {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Resposta não é um objeto');
  }
  const out: Record<string, unknown> = {};
  for (const key of KNOWN) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as RteUploadedImage;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new HttpUploadError('response', cause);
  }
}

/** Adaptador de envio por `XMLHttpRequest` (progresso real e cancelamento; E24). */
export function httpUploadAdapter(
  options: RteHttpUploadOptions,
): RteUploadAdapter {
  const field = options.fieldName ?? 'file';
  const map = options.mapResponse ?? defaultMap;

  async function send(
    file: File,
    kind: RteUploadType,
    endpoint: string,
    ctx: RteUploadContext,
  ): Promise<RteUploadedImage | RteUploadedVideo> {
    const { signal } = ctx;
    if (signal.aborted) throw abortError();
    const extra =
      typeof options.headers === 'function'
        ? await options.headers()
        : options.headers;
    if (signal.aborted) throw abortError();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const onAbort = () => {
        xhr.abort();
        reject(abortError());
      };
      const done = () => signal.removeEventListener('abort', onAbort);

      xhr.open('POST', endpoint);
      xhr.withCredentials = options.withCredentials ?? false;
      if (options.timeoutMs) xhr.timeout = options.timeoutMs;
      for (const [name, value] of Object.entries(extra ?? {})) {
        // O `Content-Type` do multipart (com o `boundary`) é do navegador: sobrescrevê-lo quebra o envio.
        if (name.toLowerCase() === 'content-type') continue;
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.onprogress = (e) => {
        ctx.onProgress(e.lengthComputable ? e.loaded / e.total : null);
      };
      xhr.onerror = () => {
        done();
        reject(new HttpUploadError('network'));
      };
      xhr.ontimeout = () => {
        done();
        reject(new HttpUploadError('network'));
      };
      xhr.onabort = () => {
        done();
        reject(abortError());
      };
      xhr.onload = () => {
        done();
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new HttpUploadError('server'));
          return;
        }
        try {
          const result = map(parse(xhr.responseText), { file, kind });
          if (typeof (result as { url?: unknown } | null)?.url !== 'string') {
            throw new Error('Resposta sem url');
          }
          resolve(result);
        } catch (cause) {
          reject(
            cause instanceof HttpUploadError
              ? cause
              : new HttpUploadError('response', cause),
          );
        }
      };

      signal.addEventListener('abort', onAbort, { once: true });
      const body = new FormData();
      body.append(field, file);
      body.append('kind', kind);
      xhr.send(body);
    });
  }

  const imageEndpoint =
    typeof options.endpoint === 'string'
      ? options.endpoint
      : options.endpoint.image;
  const videoEndpoint =
    typeof options.endpoint === 'string'
      ? options.endpoint
      : options.endpoint.video;

  const adapter: RteUploadAdapter = {
    uploadImage: (file, ctx) =>
      send(file, 'image', imageEndpoint, ctx) as Promise<RteUploadedImage>,
  };
  if (videoEndpoint !== undefined) {
    adapter.uploadVideo = (file, ctx) =>
      send(file, 'video', videoEndpoint, ctx) as Promise<RteUploadedVideo>;
  }
  return adapter;
}
