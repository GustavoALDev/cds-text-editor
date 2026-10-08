import {
  type ColorField,
  COLOR_FIELDS,
  DEFAULT_DENSITY,
  DEFAULT_RADIUS,
  isDefaultColor,
  isValidColor,
  type PlaygroundState,
  type Supports,
} from './model';

/** Seção do README do tema com a escada de personalização. */
export const THEME_README_URL =
  'https://github.com/GustavoALDev/cds-text-editor/tree/main/packages/theme#escada-de-personaliza%C3%A7%C3%A3o-n%C3%ADveis-0-a-4';

const HEADER = [
  '/* Tema do editor (gerado pelo playground do demo).',
  ' * Funciona sozinho com o theme.css do @cds/rte-theme (cores relativas nativas).',
  ' * Navegadores sem cores relativas exigem o TypeScript copiado (plano B, applyRteTheme).',
  ` * Escada de personalização: ${THEME_README_URL}`,
  ' */',
].join('\n');

/** Texto da cor como digitado, em uma linha. */
function oneLine(text: string): string {
  return text.trim().replace(/[\r\n]+/g, ' ');
}

/**
 * CSS que reproduz o tema do estado, só com valores fora do padrão e em ordem estável (W10). O
 * estado padrão devolve apenas o cabeçalho.
 */
export function buildCss(
  state: PlaygroundState,
  supports?: Supports,
): string {
  const rootLines: string[] = [];
  for (const field of COLOR_FIELDS as readonly ColorField[]) {
    const text = state[field];
    if (isDefaultColor(field, text)) continue;
    if (isValidColor(text, supports)) rootLines.push(`  --rte-${field}: ${oneLine(text)};`);
    else rootLines.push(`  /* ${field} inválida: vale o padrão */`);
  }
  if (state.radius !== DEFAULT_RADIUS)
    rootLines.push(`  --rte-radius: ${state.radius}px;`);
  if (state.density !== DEFAULT_DENSITY)
    rootLines.push(`  --rte-density: ${state.density};`);
  if (state.neutral === 'gray') rootLines.push('  --rte-neutral-tint: 0;');

  const blocks = [HEADER];
  if (rootLines.length > 0) blocks.push(`:root {\n${rootLines.join('\n')}\n}`);
  if (state.mode !== 'auto')
    blocks.push(`.rte-root {\n  color-scheme: ${state.mode};\n}`);
  return blocks.join('\n\n') + '\n';
}
