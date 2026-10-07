import type {
  RteUploadAdapter,
  RteUploadContext,
  RteUploadType,
} from '../upload/types';

export interface FakeUploadCall {
  readonly file: File;
  readonly ctx: RteUploadContext;
  readonly type: RteUploadType;
}

/**
 * Adaptador de envio controlado pelo teste (spec 05c2a §6.1): cada chamada
 * fica em `calls` com uma *promise* pendente que o teste resolve, rejeita ou
 * faz progredir; `signal(i)` é o `AbortSignal` recebido.
 */
export interface FakeUploadAdapter extends RteUploadAdapter {
  readonly calls: readonly FakeUploadCall[];
  resolve(i: number, value: unknown): void;
  reject(i: number, error: unknown): void;
  progress(i: number, fraction: number | null): void;
  signal(i: number): AbortSignal;
  /** Chamadas de `registerExternal` (só com `external: true`). */
  readonly externalCalls: { readonly url: string; readonly ctx: RteUploadContext }[];
  resolveExternal(i: number, value: unknown): void;
  rejectExternal(i: number, error: unknown): void;
}

/** `video: false` cria o adaptador sem `uploadVideo`. */
export function createFakeUploadAdapter(
  o: { video?: boolean; external?: boolean } = {},
): FakeUploadAdapter {
  const calls: FakeUploadCall[] = [];
  const settle: {
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const call =
    (type: RteUploadType) =>
    (file: File, ctx: RteUploadContext): Promise<never> =>
      new Promise((resolve, reject) => {
        calls.push({ file, ctx, type });
        settle.push({ resolve: resolve as (v: unknown) => void, reject });
      });
  const at = <T>(list: readonly T[], i: number): T => {
    const item = list[i];
    if (item === undefined) throw new Error(`sem a chamada ${i}`);
    return item;
  };
  const externalCalls: FakeUploadAdapter['externalCalls'] = [];
  const externalSettle: typeof settle = [];
  const adapter: FakeUploadAdapter = {
    calls,
    externalCalls,
    resolveExternal: (i, value) => at(externalSettle, i).resolve(value),
    rejectExternal: (i, error) => at(externalSettle, i).reject(error),
    uploadImage: call('image'),
    resolve: (i, value) => at(settle, i).resolve(value),
    reject: (i, error) => at(settle, i).reject(error),
    progress: (i, fraction) => at(calls, i).ctx.onProgress(fraction),
    signal: (i) => at(calls, i).ctx.signal,
  };
  if (o.external) {
    adapter.registerExternal = (url, ctx) =>
      new Promise((resolve, reject) => {
        externalCalls.push({ url, ctx });
        externalSettle.push({
          resolve: resolve as (v: unknown) => void,
          reject,
        });
      });
  }
  if (o.video !== false) adapter.uploadVideo = call('video');
  return adapter;
}
