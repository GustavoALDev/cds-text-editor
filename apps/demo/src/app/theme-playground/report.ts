import {
  checkRteTheme,
  suggestRteColor,
  type RteTheme,
  type RteThemeReport,
} from '@cds/rte-theme';
import { type ColorField, toRteTheme, type PlaygroundState } from './model';

export type ReportMode = 'light' | 'dark';

export interface ModeSummary {
  readonly mode: ReportMode;
  readonly label: string;
  readonly total: number;
  readonly failed: number;
}

export interface FailedCheck {
  readonly id: string;
  readonly mode: ReportMode;
  readonly label: string;
  /** Razão de contraste com 2 casas. */
  readonly ratio: string;
  readonly min: number;
}

export interface FieldSuggestion {
  readonly field: ColorField;
  readonly color: string;
}

export interface ContrastReport {
  readonly total: number;
  readonly failed: number;
  /** "72 verificações: N reprovadas" (singular em 1). */
  readonly summary: string;
  readonly modes: readonly ModeSummary[];
  readonly failedChecks: readonly FailedCheck[];
  /** Campos cujo valor não pôde ser lido (caem no padrão). */
  readonly invalid: readonly string[];
  /** Sugestões de cor (só a primária) quando ela é inválida ou reprovada e a lib acha uma. */
  readonly suggestions: readonly FieldSuggestion[];
}

const MODE_LABEL: Readonly<Record<ReportMode, string>> = {
  light: 'Claro',
  dark: 'Escuro',
};

/** Campo a que a verificação pertence (`C1` é a primária; `C1:secondary`, a secundária). */
function fieldOf(id: string): ColorField | null {
  if (!id.includes(':')) return 'primary';
  if (id.endsWith(':secondary')) return 'secondary';
  if (id.endsWith(':tertiary')) return 'tertiary';
  return null;
}

export function summaryText(total: number, failed: number): string {
  return `${total} verificações: ${failed} ${failed === 1 ? 'reprovada' : 'reprovadas'}`;
}

/**
 * Relatório de contraste do estado (W9): `checkRteTheme` só com o tema (raio e densidade não
 * entram), resumo geral e por modo, reprovadas e sugestões de cor.
 */
export function buildContrastReport(
  state: PlaygroundState,
  check: (theme: RteTheme) => RteThemeReport = checkRteTheme,
  suggest: (color: string) => string | null = suggestRteColor,
): ContrastReport {
  const report = check(toRteTheme(state));
  const failedChecks: FailedCheck[] = report.checks
    .filter((c) => !c.pass)
    .map((c) => ({
      id: c.id,
      mode: c.mode,
      label: c.label,
      ratio: c.ratio.toFixed(2),
      min: c.min,
    }));
  const modes: ModeSummary[] = (['light', 'dark'] as const).map((mode) => ({
    mode,
    label: MODE_LABEL[mode],
    total: report.checks.filter((c) => c.mode === mode).length,
    failed: failedChecks.filter((c) => c.mode === mode).length,
  }));

  // A sugestão da lib trata a cor como primária (W9): só a primária recebe botão.
  const primaryBad =
    report.invalid.includes('primary') ||
    failedChecks.some((c) => fieldOf(c.id) === 'primary');
  const suggestions: FieldSuggestion[] = [];
  if (primaryBad) {
    const color = suggest(state.primary);
    if (color !== null) suggestions.push({ field: 'primary', color });
  }

  return {
    total: report.checks.length,
    failed: failedChecks.length,
    summary: summaryText(report.checks.length, failedChecks.length),
    modes,
    failedChecks,
    invalid: report.invalid,
    suggestions,
  };
}
