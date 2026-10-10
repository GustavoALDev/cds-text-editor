// #region mensagem
import type { ValidationErrors } from '@angular/forms';
import type { RteLabels } from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';
import { formatRteError } from '@comodeviaser/rte-angular/validators';

// Aceita o `errors` de Reactive e Template Forms (e o erro de Signal Forms); nunca lança.
export function mensagem(
  errors: ValidationErrors | null,
  labels: RteLabels = RTE_LABELS_PT_BR,
): string {
  return formatRteError(errors, labels);
}
// #endregion
