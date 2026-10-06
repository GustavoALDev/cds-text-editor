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
}

/** `video: false` cria o adaptador sem `uploadVideo`. */
export function createFakeUploadAdapter(
  o: { video?: boolean } = {},
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
  const adapter: FakeUploadAdapter = {
    calls,
    uploadImage: call('image'),
    resolve: (i, value) => at(settle, i).resolve(value),
    reject: (i, error) => at(settle, i).reject(error),
    progress: (i, fraction) => at(calls, i).ctx.onProgress(fraction),
    signal: (i) => at(calls, i).ctx.signal,
  };
  if (o.video !== false) adapter.uploadVideo = call('video');
  return adapter;
}
