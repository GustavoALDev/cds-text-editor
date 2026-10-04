import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import {
  form,
  maxLength,
  type LogicFn,
  type SchemaFn,
} from '@angular/forms/signals';
/* eslint-disable @nx/enforce-module-boundaries -- os testes importam os entries pelo alias público (pré-voo 9) */
import { RTE_LABELS_EN, RteEditor, provideRichText } from '@cds/rte-angular';
import { RTE_LABELS_ES, RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import {
  RteValidators,
  formatRteError,
  isRteValidationError,
  rteMaxChars,
  rteMaxWords,
  rteRequired,
} from '@cds/rte-angular/validators';
/* eslint-enable @nx/enforce-module-boundaries */
import { RTE_CODE_LANGUAGES } from '@cds/rte-core/code-languages';
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- medida interna, só teste
import {
  measureProbe,
  measureRteText,
  resolveMax,
} from '../validators/src/measure';
import { validDoc } from './testing-support/core-docs';
import { readFixture } from './testing-support/fixtures';
import { settle } from './testing-support/render';

const IMG = '<figure class="rt-image"><img src="x" alt=""></figure>';

describe('measureRteText', () => {
  it('mede caracteres, palavras e presença de texto', () => {
    expect(measureRteText('<p>a b</p>')).toEqual({
      characters: 3,
      words: 2,
      hasText: true,
      hasMedia: false,
    });
  });

  it('vazio, só espaço e nulos medem zero', () => {
    for (const v of ['<p> </p>', '', null, undefined]) {
      const m = measureRteText(v);
      expect(m.characters).toBe(0);
      expect(m.words).toBe(0);
      expect(m.hasText).toBe(false);
    }
  });

  it('detecta mídia só em marcação real', () => {
    expect(measureRteText(IMG).hasMedia).toBe(true);
    expect(measureRteText('<p>&lt;img a&gt;</p>').hasMedia).toBe(false);
  });

  it('um parse por valor, mesmo medindo duas vezes', () => {
    const value = '<p>cache ' + String(Math.random()) + '</p>';
    const before = measureProbe.parses;
    measureRteText(value);
    measureRteText(value);
    expect(measureProbe.parses).toBe(before + 1);
  });

  it('resolveMax só aceita inteiros não negativos', () => {
    for (const v of [-1, 1.5, NaN, Infinity, '5', null, undefined]) {
      expect(resolveMax(v)).toBeUndefined();
    }
    expect(resolveMax(0)).toBe(0);
    expect(resolveMax(7)).toBe(7);
  });
});

interface Model {
  body: string;
}

function make(schema: SchemaFn<Model>, body: string) {
  return TestBed.runInInjectionContext(() =>
    form(signal<Model>({ body }), schema),
  );
}

describe('Signal Forms: rteRequired', () => {
  it('vazio e só espaço invalidam; texto e só imagem passam', () => {
    for (const body of ['', '<p> </p>']) {
      const f = make((p) => rteRequired(p.body), body);
      expect(f.body().errors()).toEqual([
        expect.objectContaining({ kind: 'rteRequired' }),
      ]);
    }
    for (const body of ['<p>a</p>', IMG]) {
      const f = make((p) => rteRequired(p.body), body);
      expect(f.body().errors()).toEqual([]);
    }
  });

  it('o título de caixa escrito pela serialização conta como texto', () => {
    const f = make(
      (p) => rteRequired(p.body),
      '<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">Informação</p><p></p></aside>',
    );
    expect(f.body().errors()).toEqual([]);
  });

  it('when: false desliga a regra e o metadado', () => {
    const f = make((p) => rteRequired(p.body, { when: () => false }), '');
    expect(f.body().errors()).toEqual([]);
    expect(f.body().required()).toBe(false);
  });

  it('publica REQUIRED', () => {
    const f = make((p) => rteRequired(p.body), '');
    expect(f.body().required()).toBe(true);
  });
});

describe('Signal Forms: rteMaxChars e rteMaxWords', () => {
  it('rteMaxChars erra acima do limite e publica MAX_LENGTH', () => {
    const f = make((p) => rteMaxChars(p.body, 10), '<p>abcdefghijk</p>');
    expect(f.body().errors()).toEqual([
      expect.objectContaining({ kind: 'rteMaxChars', max: 10, actual: 11 }),
    ]);
    expect(f.body().maxLength?.()).toBe(10);
  });

  it('no limite não erra', () => {
    const f = make((p) => rteMaxChars(p.body, 3), '<p>abc</p>');
    expect(f.body().errors()).toEqual([]);
  });

  it('com maxLength() nativo vale o menor', () => {
    const f = make((p) => {
      rteMaxChars(p.body, 10);
      maxLength(p.body, 5);
    }, '');
    expect(f.body().maxLength?.()).toBe(5);
  });

  it('max inválido ou LogicFn sem valor: sem erro e sem maxLength', () => {
    const undef: LogicFn<string, number | undefined> = () => undefined;
    for (const max of [-1, 1.5, NaN, undef]) {
      const f = make((p) => rteMaxChars(p.body, max), '<p>abcdef</p>');
      expect(f.body().errors()).toEqual([]);
      expect(f.body().maxLength?.()).toBeUndefined();
    }
  });

  it('rteMaxWords conta palavras e não publica MAX_LENGTH', () => {
    const f = make((p) => rteMaxWords(p.body, 2), '<p>a b c</p>');
    expect(f.body().errors()).toEqual([
      expect.objectContaining({ kind: 'rteMaxWords', max: 2, actual: 3 }),
    ]);
    expect(f.body().maxLength?.()).toBeUndefined();
  });
});

describe('RteValidators (Reactive Forms)', () => {
  it('required', () => {
    expect(RteValidators.required(new FormControl(''))).toEqual({
      rteRequired: true,
    });
    expect(RteValidators.required(new FormControl(null))).toEqual({
      rteRequired: true,
    });
    expect(RteValidators.required(new FormControl('<p>a</p>'))).toBeNull();
    expect(RteValidators.required(new FormControl(IMG))).toBeNull();
  });

  it('maxChars e maxWords', () => {
    expect(RteValidators.maxChars(3)(new FormControl('<p>abcd</p>'))).toEqual({
      rteMaxChars: { max: 3, actual: 4 },
    });
    expect(
      RteValidators.maxChars(4)(new FormControl('<p>abcd</p>')),
    ).toBeNull();
    expect(RteValidators.maxWords(2)(new FormControl('<p>a b c</p>'))).toEqual({
      rteMaxWords: { max: 2, actual: 3 },
    });
    expect(RteValidators.maxChars(3)(new FormControl(null))).toBeNull();
  });

  it('max inválido nunca erra', () => {
    const c = new FormControl('<p>abcdef g</p>');
    expect(RteValidators.maxChars(-1)(c)).toBeNull();
    expect(RteValidators.maxChars(1.5)(c)).toBeNull();
    expect(RteValidators.maxWords(NaN)(c)).toBeNull();
  });
});

describe('erros tipados', () => {
  it('isRteValidationError reconhece só os três kinds', () => {
    expect(isRteValidationError({ kind: 'rteRequired' })).toBe(true);
    expect(isRteValidationError({ kind: 'rteMaxChars' })).toBe(true);
    expect(isRteValidationError({ kind: 'rteMaxWords' })).toBe(true);
    expect(isRteValidationError({ kind: 'required' })).toBe(false);
  });

  it('formatRteError usa os rótulos de cada idioma', () => {
    const chars = { kind: 'rteMaxChars', max: 5, actual: 7 } as const;
    const words = { kind: 'rteMaxWords', max: 5, actual: 7 } as const;
    const req = { kind: 'rteRequired' } as const;
    for (const pack of [RTE_LABELS_EN, RTE_LABELS_PT_BR, RTE_LABELS_ES]) {
      expect(formatRteError(req, pack)).toBe(pack.errors.rteRequired);
      expect(formatRteError(chars, pack)).toBe(
        pack.errors.rteMaxChars({ max: 5, actual: 7 }),
      );
      expect(formatRteError(words, pack)).toBe(
        pack.errors.rteMaxWords({ max: 5, actual: 7 }),
      );
    }
    expect(formatRteError(chars, RTE_LABELS_EN)).toBe(
      'Use at most 5 characters (7 now).',
    );
  });
});

@Component({
  selector: 'rte-test-measure',
  imports: [RteEditor],
  template: `<rte-editor [value]="html()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MeasureHost {
  readonly html = signal('');
  readonly cmp = viewChild.required(RteEditor);
}

async function setupEditor() {
  TestBed.configureTestingModule({
    providers: [
      provideRichText({ editor: { codeLanguages: RTE_CODE_LANGUAGES } }),
    ],
  });
  const fixture = TestBed.createComponent(MeasureHost);
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = fixture.componentInstance.cmp();
  return { fixture, cmp, editor: cmp.editor() as Editor };
}

const RUNS = Number(process.env['FC_RUNS'] ?? 100);

describe('igualdade com o editor (C5)', () => {
  it('fixture all-features: medida do validador = textStats()', async () => {
    const { fixture, cmp, editor } = await setupEditor();
    fixture.componentInstance.html.set(readFixture('all-features.html'));
    await settle(fixture);
    const m = measureRteText(getRteHtml(editor));
    expect(m.characters).toBeGreaterThan(0);
    expect(m.characters).toBe(cmp.textStats()?.characters);
    expect(m.words).toBe(cmp.textStats()?.words);
  });

  it('propriedade: documentos gerados medem igual', async () => {
    const { fixture, cmp, editor } = await setupEditor();
    await fc.assert(
      fc.asyncProperty(validDoc, async (json) => {
        editor.commands.setContent(json);
        await settle(fixture);
        const m = measureRteText(getRteHtml(editor));
        expect(m.characters).toBe(cmp.textStats()?.characters);
        expect(m.words).toBe(cmp.textStats()?.words);
      }),
      {
        numRuns: RUNS,
        ...(process.env['FC_SEED']
          ? { seed: Number(process.env['FC_SEED']) }
          : {}),
      },
    );
  }, 120_000);
});
