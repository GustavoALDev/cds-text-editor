// #region config
import type { ApplicationConfig } from '@angular/core';
import { provideRichText } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';

export const appConfig: ApplicationConfig = {
  providers: [provideRichText({ labels: RTE_LABELS_PT_BR })],
};
// #endregion
