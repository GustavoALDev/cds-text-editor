// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import * as api from '@cds/rte-angular';
import * as i18n from '@cds/rte-angular/i18n';
import * as testing from '@cds/rte-angular/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import * as validators from '@cds/rte-angular/validators';
import { describe, expect, it } from 'vitest';

describe('@cds/rte-angular', () => {
  it('exporta só a API pública do entry .', () => {
    expect(Object.keys(api).sort()).toEqual([
      'RTE_DIALOG_LANGUAGES',
      'RTE_LABELS',
      'RTE_LABELS_EN',
      'RTE_TOOLBAR_PRESETS',
      'RteEditor',
      'provideRichText',
    ]);
  });

  it('RTE_DIALOG_LANGUAGES é congelado', () => {
    expect(Object.isFrozen(api.RTE_DIALOG_LANGUAGES)).toBe(true);
  });

  it('o /i18n exporta os três pacotes de rótulos', () => {
    expect(Object.keys(i18n).sort()).toEqual([
      'RTE_LABELS_EN',
      'RTE_LABELS_ES',
      'RTE_LABELS_PT_BR',
    ]);
  });

  it('o /testing exporta só getRteEditor', () => {
    expect(Object.keys(testing).sort()).toEqual(['getRteEditor']);
  });

  it('o /validators exporta só validadores, tipos de erro e formatRteError', () => {
    expect(Object.keys(validators).sort()).toEqual([
      'RteValidators',
      'formatRteError',
      'isRteValidationError',
      'rteMaxChars',
      'rteMaxWords',
      'rteRequired',
    ]);
  });
});
