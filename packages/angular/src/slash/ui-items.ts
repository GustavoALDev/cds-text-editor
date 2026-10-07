import { isDevMode } from '@angular/core';
import type { RteSlashOptions } from '@cds/rte-core/extensions';
import { isMediaKind, type RteDialogKind } from '../dialogs/types';

const USER_FAILED =
  '[rte-editor] o onUiItem de options.slash lançou uma exceção; ela foi ignorada.';

/**
 * `slash.onUiItem` do pacote (K6): `image`, `video` e `embed` abrem o diálogo
 * da 05c1 num *microtask* (o *callback* do core é síncrono, dentro da
 * atualização da vista, e engole exceção); **depois** chama o do consumidor
 * para todos os ids, engolindo exceção com aviso em desenvolvimento.
 */
export function composeOnUiItem(o: {
  open: (kind: RteDialogKind) => void;
  user: RteSlashOptions['onUiItem'];
}): NonNullable<RteSlashOptions['onUiItem']> {
  return (id, editor) => {
    if (isMediaKind(id as RteDialogKind)) {
      queueMicrotask(() => o.open(id as RteDialogKind));
    }
    try {
      o.user?.(id, editor);
    } catch {
      if (isDevMode()) console.warn(USER_FAILED);
    }
  };
}
