import type { RteRenderMode, RteSanitizeErrorLike } from '../types';

/** Resultado da derivação do HTML exibido (antes da H6). */
export interface RenderContentResult {
  html: string;
  error: RteSanitizeErrorLike | null;
}

/**
 * Reconhece o `RteSanitizeError` pela forma (`name`, `code`, `limit`), sem
 * `instanceof`: funciona com duas cópias do sanitizador e sem importá-lo (H4, H5).
 */
export function isRteSanitizeError(e: unknown): e is RteSanitizeErrorLike {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code, limit } = e as Record<string, unknown>;
  return (
    name === 'RteSanitizeError' &&
    (code === 'input-too-long' || code === 'max-depth') &&
    typeof limit === 'number'
  );
}

/** Erro do modo `sanitize` sem sanitizador fornecido (H4, pré-voo 4). */
export function missingSanitizerError(): Error {
  return new Error(
    "[rte-render] modo 'sanitize' sem sanitizador: forneça provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) }) ou use [mode]=\"'trusted'\" com HTML já sanitizado pelo servidor.",
  );
}

/**
 * HTML exibido conforme o modo (H4, H5): `null`/`undefined` = `''`; `trusted`
 * devolve o HTML como veio; `sanitize` passa pelo sanitizador fornecido (sem
 * ele, lança). Um `RteSanitizeError` vira conteúdo vazio, o erro e um
 * `console.warn` (um por chamada; quem chama memoiza); qualquer outra exceção
 * propaga.
 */
export function renderContent(
  html: string | null | undefined,
  mode: RteRenderMode,
  sanitize: ((html: string) => string) | undefined,
): RenderContentResult {
  const input = html ?? '';
  if (mode === 'trusted') return { html: input, error: null };
  if (typeof sanitize !== 'function') throw missingSanitizerError();
  try {
    return { html: sanitize(input), error: null };
  } catch (e) {
    if (!isRteSanitizeError(e)) throw e;
    console.warn(
      `[rte-render] conteúdo não exibido: ${e.code} (limite ${e.limit}).`,
    );
    return { html: '', error: e };
  }
}
