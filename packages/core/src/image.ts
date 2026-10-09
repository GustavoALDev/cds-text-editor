export { parseSrcset, formatSrcset } from './schema/srcset';
export type { RteSrcsetCandidate } from './schema/srcset';

export type RteResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export interface RteResizeInput {
  width: number;
  height: number;
  dx: number;
  dy: number;
  corner: RteResizeCorner;
  minWidth?: number;
  maxWidth?: number;
}

const ABS_MAX = 10000;

/**
 * Calcula o novo tamanho de uma imagem arrastando um canto, mantendo a
 * proporção. O eixo com maior variação absoluta (empate: horizontal) manda.
 * Resultado inteiro, com largura e altura dentro de 1–10000 (esquema).
 */
export function computeResize(input: RteResizeInput): {
  width: number;
  height: number;
} {
  const { width, height, dx, dy, corner } = input;
  const minWidth = input.minWidth ?? 48;
  const maxWidth = input.maxWidth ?? ABS_MAX;
  if (!Number.isFinite(width) || width <= 0)
    throw new RangeError('width deve ser finito e maior que 0');
  if (!Number.isFinite(height) || height <= 0)
    throw new RangeError('height deve ser finito e maior que 0');
  if (!Number.isFinite(dx) || !Number.isFinite(dy))
    throw new RangeError('dx e dy devem ser finitos');
  if (!Number.isFinite(minWidth) || minWidth < 1)
    throw new RangeError('minWidth deve ser >= 1');
  if (!Number.isFinite(maxWidth) || maxWidth > ABS_MAX)
    throw new RangeError('maxWidth deve ser <= 10000');
  if (minWidth > maxWidth)
    throw new RangeError('minWidth não pode exceder maxWidth');

  const ratio = height / width;
  const wX = width + (corner.endsWith('e') ? dx : -dx);
  const wY = width + (corner.startsWith('s') ? dy : -dy) / ratio;
  const proposed = Math.abs(wY - width) > Math.abs(wX - width) ? wY : wX;

  let w = Math.min(maxWidth, Math.max(minWidth, proposed));
  if (w * ratio > ABS_MAX) w = ABS_MAX / ratio;
  w = Math.max(1, Math.round(w));
  let h = Math.max(1, Math.round(w * ratio));
  if (h > ABS_MAX) {
    h = ABS_MAX;
    w = Math.max(1, Math.floor(h / ratio));
  }
  return { width: w, height: h };
}
