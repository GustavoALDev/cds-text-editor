import {
  RteUploadError,
  type RteUploadAdapter,
  type RteUploadContext,
  type RteUploadedImage,
} from '@comodeviaser/rte-angular';

/** Imagem de exemplo do próprio demo (relativa à raiz; vale com `allowRelativeMedia`). */
export const SAMPLE_IMAGE_URL = '/exemplo.png';

/** Duração do envio simulado e a do "lento" (para dar tempo de cancelar). */
export const SIMULATED_DURATION_MS = 1500;
export const SIMULATED_SLOW_DURATION_MS = 6000;
const STEPS = 15;

export interface SimulatedAdapterOptions {
  /** Lido a cada envio: chave "lento" da página. */
  readonly slow?: () => boolean;
  /** Lido a cada envio: chave "falhar" da página. */
  readonly fail?: () => boolean;
}

/**
 * Adaptador do modo simulado (spec 07b, W6): **nunca lê nem envia o arquivo** (o `File` nem é
 * tocado). O progresso é um temporizador, o `AbortSignal` é respeitado (para o temporizador e
 * rejeita) e a resposta é a URL relativa de uma imagem de exemplo. Sem `uploadVideo`.
 */
export function createSimulatedAdapter(
  options: SimulatedAdapterOptions = {},
): RteUploadAdapter {
  return {
    uploadImage(_file: File, ctx: RteUploadContext): Promise<RteUploadedImage> {
      const total = options.slow?.()
        ? SIMULATED_SLOW_DURATION_MS
        : SIMULATED_DURATION_MS;
      const fail = options.fail?.() === true;
      return new Promise<RteUploadedImage>((resolve, reject) => {
        if (ctx.signal.aborted) {
          reject(new DOMException('Envio cancelado', 'AbortError'));
          return;
        }
        let step = 0;
        const onAbort = (): void => {
          clearInterval(timer);
          reject(new DOMException('Envio cancelado', 'AbortError'));
        };
        const timer = setInterval(() => {
          step += 1;
          if (fail && step >= STEPS / 2) {
            clearInterval(timer);
            ctx.signal.removeEventListener('abort', onAbort);
            reject(new RteUploadError('server'));
            return;
          }
          ctx.onProgress(Math.min(step / STEPS, 1));
          if (step >= STEPS) {
            clearInterval(timer);
            ctx.signal.removeEventListener('abort', onAbort);
            resolve({ url: SAMPLE_IMAGE_URL });
          }
        }, total / STEPS);
        ctx.signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}
