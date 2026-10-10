import {
  createEnvironmentInjector,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RTE_LABELS, RTE_LABELS_EN, provideRichText } from '@comodeviaser/rte-angular';
import { RTE_LABELS_ES } from '@comodeviaser/rte-angular/i18n';
import { RTE_CONTENT_LABELS, RTE_SLASH_LABELS } from '@comodeviaser/rte-core/extensions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEditorOptions, mergeEditorConfig } from './editor/options';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provideRichText / RTE_LABELS', () => {
  it('sem provider devolve RTE_LABELS_EN', () => {
    expect(TestBed.inject(RTE_LABELS)()).toBe(RTE_LABELS_EN);
  });

  it('mescla os rótulos do provider sobre en', () => {
    TestBed.configureTestingModule({
      providers: [provideRichText({ labels: { editor: { ariaLabel: 'X' } } })],
    });
    const labels = TestBed.inject(RTE_LABELS)();
    expect(labels.editor.ariaLabel).toBe('X');
    expect(labels.content).toBe(RTE_LABELS_EN.content);
  });

  it('fonte por função reage a signals', () => {
    const lang = signal<'en' | 'es'>('en');
    TestBed.configureTestingModule({
      providers: [
        provideRichText({
          labels: () => (lang() === 'es' ? RTE_LABELS_ES : RTE_LABELS_EN),
        }),
      ],
    });
    const labels = TestBed.inject(RTE_LABELS);
    expect(labels().editor.ariaLabel).toBe('Rich text editor');
    lang.set('es');
    expect(labels().editor.ariaLabel).toBe('Editor de texto enriquecido');
  });

  it('injetor filho vale sozinho, sem mescla com o pai', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRichText({
          labels: {
            editor: { ariaLabel: 'pai' },
            errors: { rteRequired: 'P' },
          },
        }),
      ],
    });
    const child = createEnvironmentInjector(
      [provideRichText({ labels: { editor: { ariaLabel: 'filho' } } })],
      TestBed.inject(EnvironmentInjector),
    );
    const labels = child.get(RTE_LABELS)();
    expect(labels.editor.ariaLabel).toBe('filho');
    expect(labels.errors.rteRequired).toBe(RTE_LABELS_EN.errors.rteRequired);
    child.destroy();
  });
});

describe('mergeEditorConfig', () => {
  it('mescla features, linkPolicy, image e slash por chave', () => {
    const out = mergeEditorConfig(
      {
        features: { tables: false, tasks: true },
        linkPolicy: { protocols: ['https'] },
        image: { minWidth: 10 },
      },
      { features: { tables: true }, linkPolicy: { allowRelative: false } },
    );
    expect(out.features).toEqual({ tables: true, tasks: true });
    expect(out.linkPolicy).toEqual({
      protocols: ['https'],
      allowRelative: false,
    });
    expect(out.image).toEqual({ minWidth: 10 });
  });

  it('listas e escalares da instância substituem', () => {
    const out = mergeEditorConfig(
      {
        codeLanguages: [],
        extensions: [],
        mediaHosts: ['a.com'],
        idPrefix: 'p',
      },
      { mediaHosts: ['b.com'], idPrefix: 'i' },
    );
    expect(out.mediaHosts).toEqual(['b.com']);
    expect(out.idPrefix).toBe('i');
    expect(out.codeLanguages).toEqual([]);
  });

  it('chave undefined na instância mantém o provider', () => {
    const out = mergeEditorConfig(
      { idPrefix: 'p', features: { tables: false } },
      { idPrefix: undefined, features: undefined } as never,
    );
    expect(out.idPrefix).toBe('p');
    expect(out.features).toEqual({ tables: false });
  });

  it('aceita entradas ausentes', () => {
    expect(mergeEditorConfig(undefined, undefined)).toEqual({});
  });
});

describe('buildEditorOptions', () => {
  const sources = {
    placeholder: () => 'ph',
    charLimit: () => 10,
    content: () => RTE_CONTENT_LABELS.en,
    slash: () => RTE_SLASH_LABELS.en,
  };

  it('liga as quatro fontes e deixa features como o consumidor deu (K2)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const options = buildEditorOptions(
      {
        features: { tables: false, search: true },
        slash: { onUiItem: () => undefined },
      },
      sources,
    );
    expect(options.features).toEqual({ tables: false, search: true });
    expect(buildEditorOptions({}, sources).features).toBeUndefined();
    expect(options.placeholder).toBe(sources.placeholder);
    expect(options.charLimit).toBe(sources.charLimit);
    expect(options.labels).toBe(sources.content);
    expect(options.slash?.labels).toBe(sources.slash);
    expect(options.slash?.onUiItem).toBeTypeOf('function');
    expect(warn).not.toHaveBeenCalled();
  });
});
