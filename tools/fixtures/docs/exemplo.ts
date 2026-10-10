// #region cabecalho
import { htmlToText } from '@comodeviaser/rte-core/html';
// #endregion

// #region uso
export function resumo(html: string): string {
  // #region interno
  const texto = htmlToText(html);
  // #endregion
  return texto.trim();
}
// #endregion
