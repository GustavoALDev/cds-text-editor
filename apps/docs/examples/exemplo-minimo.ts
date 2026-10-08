import { htmlToText } from '@cds/rte-core/html';

// #region uso
export function resumo(html: string): string {
  return htmlToText(html).trim();
}
// #endregion
