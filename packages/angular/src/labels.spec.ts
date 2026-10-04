import { RTE_CONTENT_LABELS, RTE_SLASH_LABELS } from '@cds/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RTE_LABELS_EN as EN_FROM_ROOT,
  type RteLabels,
  type RteLabelsInput,
} from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import { describe, expect, it } from 'vitest';
import { mergeLabels, readLabelsSource } from './labels/merge';

function deepKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return [prefix];
  return Object.keys(value)
    .sort()
    .flatMap((key) =>
      deepKeys((value as Record<string, unknown>)[key], `${prefix}.${key}`),
    );
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return (
    Object.isFrozen(value) &&
    Object.values(value).every((child) => isDeepFrozen(child))
  );
}

describe('pacotes de rótulos', () => {
  const packs = [
    ['en', RTE_LABELS_EN],
    ['pt-BR', RTE_LABELS_PT_BR],
    ['es', RTE_LABELS_ES],
  ] as const;

  it('têm as mesmas chaves profundas', () => {
    expect(deepKeys(RTE_LABELS_PT_BR)).toEqual(deepKeys(RTE_LABELS_EN));
    expect(deepKeys(RTE_LABELS_ES)).toEqual(deepKeys(RTE_LABELS_EN));
  });

  it('não têm string vazia', () => {
    for (const [, pack] of packs) {
      for (const text of strings(pack)) expect(text).not.toBe('');
    }
  });

  it('interpolam max e actual', () => {
    for (const [, pack] of packs) {
      for (const text of [
        pack.errors.rteMaxChars({ max: 5, actual: 7 }),
        pack.errors.rteMaxWords({ max: 5, actual: 7 }),
      ]) {
        expect(text).toContain('5');
        expect(text).toContain('7');
      }
    }
  });

  it('reutilizam os objetos do core', () => {
    for (const [lang, pack] of packs) {
      expect(pack.content).toBe(RTE_CONTENT_LABELS[lang]);
      expect(pack.slash).toBe(RTE_SLASH_LABELS[lang]);
    }
  });

  it('são congelados em profundidade', () => {
    for (const [, pack] of packs) expect(isDeepFrozen(pack)).toBe(true);
  });

  it('têm a cópia fixada pelo plano', () => {
    expect(RTE_LABELS_EN.editor.ariaLabel).toBe('Rich text editor');
    expect(RTE_LABELS_EN.errors.rteRequired).toBe('This field is required.');
    expect(RTE_LABELS_EN.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      'Use at most 5 characters (7 now).',
    );
    expect(RTE_LABELS_EN.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      'Use at most 5 words (7 now).',
    );
    expect(RTE_LABELS_PT_BR.editor.ariaLabel).toBe('Editor de texto rico');
    expect(RTE_LABELS_PT_BR.errors.rteRequired).toBe(
      'Este campo é obrigatório.',
    );
    expect(RTE_LABELS_PT_BR.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      'Use no máximo 5 caracteres (7 agora).',
    );
    expect(RTE_LABELS_PT_BR.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      'Use no máximo 5 palavras (7 agora).',
    );
    expect(RTE_LABELS_ES.editor.ariaLabel).toBe('Editor de texto enriquecido');
    expect(RTE_LABELS_ES.errors.rteRequired).toBe('Este campo es obligatorio.');
    expect(RTE_LABELS_ES.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      'Usa como máximo 5 caracteres (7 ahora).',
    );
    expect(RTE_LABELS_ES.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      'Usa como máximo 5 palabras (7 ahora).',
    );
  });

  it('o /i18n reexporta o RTE_LABELS_EN do entry .', () => {
    expect(RTE_LABELS_EN).toBe(EN_FROM_ROOT);
  });
});

describe('mergeLabels', () => {
  const base: RteLabels = RTE_LABELS_EN;

  it('sem entrada devolve a base', () => {
    expect(mergeLabels(base, undefined)).toBe(base);
  });

  it('mescla calloutTitles por variante', () => {
    const out = mergeLabels(base, {
      content: { calloutTitles: { info: 'I' } },
    });
    expect(out.content.calloutTitles.info).toBe('I');
    expect(out.content.calloutTitles.warning).toBe('Warning');
    expect(out.slash).toBe(base.slash);
  });

  it('ignora valores do tipo errado', () => {
    const input = { editor: { ariaLabel: 1 } } as unknown as RteLabelsInput;
    expect(mergeLabels(base, input).editor.ariaLabel).toBe('Rich text editor');
  });

  it('ignora chaves herdadas', () => {
    const input = Object.create({
      editor: { ariaLabel: 'herdado' },
    }) as RteLabelsInput;
    expect(mergeLabels(base, input).editor.ariaLabel).toBe('Rich text editor');
  });

  it('aceita slash[id] válido e ignora keywords inválidas', () => {
    const ok = mergeLabels(base, {
      slash: { table: { title: 'Grade', keywords: ['a'] } },
    });
    expect(ok.slash.table).toEqual({ title: 'Grade', keywords: ['a'] });
    expect(ok.slash.image).toBe(base.slash.image);
    const bad = mergeLabels(base, {
      slash: { table: { title: 'Grade', keywords: 'x' } },
    } as unknown as RteLabelsInput);
    expect(bad.slash.table).toBe(base.slash.table);
    const badItem = mergeLabels(base, {
      slash: { table: { title: 'G', keywords: [1] } },
    } as unknown as RteLabelsInput);
    expect(badItem.slash.table).toBe(base.slash.table);
  });

  it('funções que lançam ou devolvem não-string caem no rótulo da base', () => {
    const out = mergeLabels(base, {
      errors: {
        rteMaxChars: () => {
          throw new Error('x');
        },
        rteMaxWords: (() => 1) as unknown as () => string,
      },
      content: {
        taskCheckbox: () => {
          throw new Error('x');
        },
      },
    });
    expect(out.errors.rteMaxChars({ max: 5, actual: 7 })).toBe(
      base.errors.rteMaxChars({ max: 5, actual: 7 }),
    );
    expect(out.errors.rteMaxWords({ max: 5, actual: 7 })).toBe(
      base.errors.rteMaxWords({ max: 5, actual: 7 }),
    );
    expect(out.content.taskCheckbox('a')).toBe(base.content.taskCheckbox('a'));
  });

  it('usa funções válidas do consumidor', () => {
    const out = mergeLabels(base, {
      errors: { rteMaxChars: ({ max }) => `max ${max}` },
    });
    expect(out.errors.rteMaxChars({ max: 3, actual: 9 })).toBe('max 3');
  });
});

describe('readLabelsSource', () => {
  it('lê objetos e funções', () => {
    const obj = { editor: { ariaLabel: 'X' } };
    expect(readLabelsSource(obj)).toBe(obj);
    expect(readLabelsSource(() => obj)).toBe(obj);
    expect(readLabelsSource(undefined)).toBeUndefined();
  });

  it('função que lança ou devolve não-objeto vira undefined', () => {
    expect(
      readLabelsSource(() => {
        throw 1;
      }),
    ).toBeUndefined();
    expect(
      readLabelsSource((() => 1) as unknown as () => RteLabelsInput),
    ).toBeUndefined();
  });
});
