// #region guarda
import { checkRteTheme, suggestRteColor, type RteTheme } from '@comodeviaser/rte-theme';

export interface Veredito {
  readonly aprovado: boolean;
  /** Sementes que não são cores CSS válidas (por exemplo `banana`). */
  readonly invalidas: readonly string[];
  /** Verificações de contraste reprovadas (ids do relatório). */
  readonly reprovadas: readonly string[];
  /** Semente próxima que passa, para uma cor primária válida que reprovou. */
  readonly sugestao: string | null;
}

// Guarda para o CI: a derivação já garante o contraste de sementes válidas, então o que este
// relatório pega é a cor inválida (e qualquer mudança futura nas fórmulas).
export function verificarTema(theme: RteTheme): Veredito {
  const relatorio = checkRteTheme(theme);
  return {
    aprovado: relatorio.ok && relatorio.invalid.length === 0,
    invalidas: relatorio.invalid,
    reprovadas: relatorio.checks.filter((c) => !c.pass).map((c) => c.id),
    sugestao: theme.primary ? suggestRteColor(theme.primary) : null,
  };
}
// #endregion
