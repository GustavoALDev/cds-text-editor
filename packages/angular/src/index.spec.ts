import type { InputSignal, OutputRef, Signal } from '@angular/core';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import * as api from '@cds/rte-angular';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import type {
  RteDialogKind,
  RteFloatingMenuKind,
  RteFloatingMenuLabels,
  RteFloatingMenusConfig,
  RteMediaChange,
  RteMediaSession,
  RteUploadAdapterReason,
  RteUploadConfig,
  RteUploadErrorEvent,
  RteUploadStatus,
} from '@cds/rte-angular';
import * as i18n from '@cds/rte-angular/i18n';
import * as testing from '@cds/rte-angular/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import * as upload from '@cds/rte-angular/upload';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import * as validators from '@cds/rte-angular/validators';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('@cds/rte-angular', () => {
  it('exporta só a API pública do entry .', () => {
    expect(Object.keys(api).sort()).toEqual([
      'RTE_DIALOG_LANGUAGES',
      'RTE_LABELS',
      'RTE_LABELS_EN',
      'RTE_TOOLBAR_PRESETS',
      'RteEditor',
      'RteUploadError',
      'provideRichText',
    ]);
  });

  it('exporta os tipos dos menus flutuantes', () => {
    const kind: RteFloatingMenuKind = 'image';
    const config: RteFloatingMenusConfig = { [kind]: false };
    const labels: Partial<RteFloatingMenuLabels> = { textMenu: 'x' };
    expect(config).toEqual({ image: false });
    expect(labels.textMenu).toBe('x');
  });

  it('RteDialogKind aceita os três tipos de mídia (05c1)', () => {
    expectTypeOf<RteDialogKind>().toEqualTypeOf<
      'link' | 'lang' | 'quoteAuthor' | 'table' | 'image' | 'video' | 'embed'
    >();
  });

  it('exporta os tipos da sessão de mídia (05c1)', () => {
    expectTypeOf<RteMediaChange>().toEqualTypeOf<{
      readonly added: readonly string[];
      readonly removed: readonly string[];
    }>();
    expectTypeOf<RteMediaSession>().toEqualTypeOf<{
      readonly current: readonly string[];
      readonly added: readonly string[];
      readonly removed: readonly string[];
    }>();
    expectTypeOf<api.RteEditor['mediaSession']>().toEqualTypeOf<
      Signal<RteMediaSession>
    >();
  });

  it('RteUploadError guarda o motivo e a causa (E4)', () => {
    const e = new api.RteUploadError('server', { cause: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('RteUploadError');
    expect(e.reason).toBe('server');
    expectTypeOf(e.reason).toEqualTypeOf<RteUploadAdapterReason>();
    expect(e.cause).toBe(1);
  });

  it('RteEditor ganha a API de envio (05c2a §4)', () => {
    type E = api.RteEditor;
    expectTypeOf<E['upload']>().toEqualTypeOf<
      InputSignal<RteUploadConfig | null | undefined>
    >();
    expectTypeOf<E['uploadError']>().toExtend<OutputRef<RteUploadErrorEvent>>();
    expectTypeOf<E['uploads']>().toEqualTypeOf<
      Signal<readonly RteUploadStatus[]>
    >();
    expectTypeOf<E['pendingUploads']>().toEqualTypeOf<Signal<number>>();
    expectTypeOf<E['imagesMissingAlt']>().toEqualTypeOf<Signal<number>>();
    expectTypeOf<E['cancelUpload']>().toEqualTypeOf<(id: string) => boolean>();
    expectTypeOf<E['cancelAllUploads']>().toEqualTypeOf<() => void>();
    expectTypeOf<E['uploadFiles']>().toEqualTypeOf<
      (files: Iterable<File>) => number
    >();
    expect(typeof api.RteEditor.prototype.uploadFiles).toBe('function');
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

  it('o /validators exporta só validadores, diretivas, tipos de erro e formatRteError', () => {
    expect(Object.keys(validators).sort()).toEqual([
      'RteImagesHaveAltValidator',
      'RteUploadsFinishedValidator',
      'RteValidators',
      'formatRteError',
      'isRteValidationError',
      'rteImagesHaveAlt',
      'rteMaxChars',
      'rteMaxWords',
      'rteRequired',
      'rteUploadsFinished',
    ]);
  });

  it('o /upload exporta só httpUploadAdapter', () => {
    expect(Object.keys(upload)).toEqual(['httpUploadAdapter']);
  });
});
