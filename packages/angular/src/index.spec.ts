// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import * as api from '@cds/rte-angular';
import * as i18n from '@cds/rte-angular/i18n';
import { describe, expect, it } from 'vitest';

describe('@cds/rte-angular', () => {
  it('exporta só a API pública do entry .', () => {
    expect(Object.keys(api).sort()).toEqual([
      'RTE_LABELS',
      'RTE_LABELS_EN',
      'provideRichText',
    ]);
  });

  it('o /i18n exporta os três pacotes de rótulos', () => {
    expect(Object.keys(i18n).sort()).toEqual([
      'RTE_LABELS_EN',
      'RTE_LABELS_ES',
      'RTE_LABELS_PT_BR',
    ]);
  });
});
