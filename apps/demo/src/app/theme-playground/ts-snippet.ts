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

/** Literal de string TypeScript com aspas simples. */
function quote(text: string): string {
  const escaped = text
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
  return `'${escaped}'`;
}

/**
 * Configuração em TypeScript que reproduz o tema do estado (W11): `provideRichText({ theme })`
 * com só as chaves fora do padrão. Raio e densidade não fazem parte de `RteTheme` (são CSS do
 * nível 2): viram um comentário que remete ao CSS copiado.
 */
export function buildTs(
  state: PlaygroundState,
  supports?: Supports,
): string {
  const themeLines: string[] = [];
  for (const field of COLOR_FIELDS as readonly ColorField[]) {
    const text = state[field];
    if (isDefaultColor(field, text)) continue;
    if (isValidColor(text, supports)) themeLines.push(`      ${field}: ${quote(text)},`);
    else themeLines.push(`      // ${field} inválida: vale o padrão`);
  }
  if (state.mode !== 'auto') themeLines.push(`      mode: ${quote(state.mode)},`);
  if (state.neutral !== 'tinted')
    themeLines.push(`      neutral: ${quote(state.neutral)},`);

  const lines = ["import { provideRichText } from '@cds/rte-angular';", ''];
  if (state.radius !== DEFAULT_RADIUS || state.density !== DEFAULT_DENSITY)
    lines.push(
      '// Raio e densidade são CSS do nível 2 (não fazem parte de RteTheme): use também o CSS copiado.',
    );
  lines.push('export const richTextProviders = [');
  if (themeLines.length === 0) lines.push('  provideRichText(),');
  else {
    lines.push('  provideRichText({', '    theme: {', ...themeLines, '    },');
    lines.push('  }),');
  }
  lines.push('];', '');
  return lines.join('\n');
}
