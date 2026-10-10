// #region provider
import { signal, type ApplicationConfig } from '@angular/core';
import { provideRichText } from '@comodeviaser/rte-angular';
import { RTE_LABELS_EN, RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';

// Um signal de módulo (fora de componente) que o seu seletor de idioma atualiza.
export const appLang = signal<'pt-BR' | 'en'>('pt-BR');

export const appConfig: ApplicationConfig = {
  providers: [
    // A fonte é uma função, lida dentro de um `computed`: lê o signal e acompanha a troca.
    provideRichText({
      labels: () => (appLang() === 'pt-BR' ? RTE_LABELS_PT_BR : RTE_LABELS_EN),
    }),
  ],
};
// #endregion
