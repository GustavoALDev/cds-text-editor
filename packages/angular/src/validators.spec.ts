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
import { RTE_LABELS_EN, RteEditor, provideRichText } from '@comodeviaser/rte-angular';
import { RTE_LABELS_ES, RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';
import {
  RteValidators,
  formatRteError,
  isRteValidationError,
  rteMaxChars,
  rteImagesHaveAlt,
  rteMaxWords,
  rteNoEmptyHeadings,
  rteRequired,
  rteSafeLinks,
  rteUploadsFinished,
} from '@comodeviaser/rte-angular/validators';
/* eslint-enable @nx/enforce-module-boundaries */
import { RTE_CODE_LANGUAGES } from '@comodeviaser/rte-core/code-languages';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
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
  it('isRteValidationError reconhece só os cinco kinds', () => {
    expect(isRteValidationError({ kind: 'rteRequired' })).toBe(true);
    expect(isRteValidationError({ kind: 'rteMaxChars' })).toBe(true);
    expect(isRteValidationError({ kind: 'rteMaxWords' })).toBe(true);
    expect(isRteValidationError({ kind: 'rteUploadsPending' })).toBe(true);
    expect(isRteValidationError({ kind: 'rteImagesMissingAlt' })).toBe(true);
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

describe('formatRteError: formas de erro e rótulos malformados', () => {
  const en = RTE_LABELS_EN.errors;

  it('aceita o ReactiveValidationError ({ kind, context }) do controle nativo', () => {
    expect(
      formatRteError(
        { kind: 'rteMaxChars', context: { max: 5, actual: 7 } },
        RTE_LABELS_PT_BR,
      ),
    ).toBe(RTE_LABELS_PT_BR.errors.rteMaxChars({ max: 5, actual: 7 }));
    expect(
      formatRteError(
        { kind: 'rteMaxWords', context: { max: 2, actual: 3 } },
        RTE_LABELS_EN,
      ),
    ).toBe(en.rteMaxWords({ max: 2, actual: 3 }));
    expect(
      formatRteError({ kind: 'rteRequired', context: true }, RTE_LABELS_EN),
    ).toBe(en.rteRequired);
  });

  it('aceita o control.errors do Reactive ({ rteMaxChars: { max, actual } })', () => {
    const ctrl = new FormControl('<p>abcdefg</p>', [
      RteValidators.required,
      RteValidators.maxChars(5),
    ]);
    expect(ctrl.errors).toEqual({ rteMaxChars: { max: 5, actual: 7 } });
    expect(formatRteError(ctrl.errors, RTE_LABELS_EN)).toBe(
      'Use at most 5 characters (7 now).',
    );
    ctrl.setValue('');
    expect(formatRteError(ctrl.errors, RTE_LABELS_PT_BR)).toBe(
      RTE_LABELS_PT_BR.errors.rteRequired,
    );
    expect(
      formatRteError({ rteMaxWords: { max: 1, actual: 2 } }, RTE_LABELS_EN),
    ).toBe(en.rteMaxWords({ max: 1, actual: 2 }));
    ctrl.setValue('<p>ok</p>');
    expect(ctrl.errors).toBeNull();
    expect(formatRteError(ctrl.errors, RTE_LABELS_EN)).toBe('');
  });

  it('kind desconhecido ou entrada inválida devolve string vazia, sem lançar', () => {
    for (const input of [
      { kind: 'required' },
      { required: true },
      {},
      null,
      undefined,
      42,
      'rteRequired',
    ]) {
      expect(formatRteError(input as never, RTE_LABELS_EN)).toBe('');
    }
  });

  it('rótulos malformados caem no inglês, sem lançar', () => {
    const throwing = {
      errors: {
        get rteRequired(): never {
          throw new Error('getter');
        },
        rteMaxChars: () => {
          throw new Error('fn');
        },
        rteMaxWords: () => 1,
      },
    } as unknown as typeof RTE_LABELS_EN;
    const chars = { kind: 'rteMaxChars', max: 5, actual: 7 } as const;
    const words = { kind: 'rteMaxWords', max: 5, actual: 7 } as const;
    for (const labels of [
      throwing,
      {} as typeof RTE_LABELS_EN,
      null as unknown as typeof RTE_LABELS_EN,
      { errors: { rteRequired: 1, rteMaxChars: 'x' } } as never,
    ]) {
      expect(formatRteError({ kind: 'rteRequired' }, labels)).toBe(
        en.rteRequired,
      );
      expect(formatRteError(chars, labels)).toBe(en.rteMaxChars(chars));
      expect(formatRteError(words, labels)).toBe(en.rteMaxWords(words));
    }
  });

  it('max/actual ausentes ou não numéricos devolvem string vazia (nunca "undefined")', () => {
    for (const error of [
      { kind: 'rteMaxChars' },
      { kind: 'rteMaxWords', context: { max: '5', actual: 7 } },
      { kind: 'rteMaxChars', context: null },
      { rteMaxChars: true },
    ]) {
      expect(formatRteError(error as never, RTE_LABELS_EN)).toBe('');
    }
  });
});

// Spec 05c2a, Tarefa 11: validadores do estado do editor (E19, R13).

/** Editor falso: só os dois *signals* que os validadores leem. */
function fakeEditor(pending: number, missing: number) {
  return {
    pendingUploads: signal(pending),
    imagesMissingAlt: signal(missing),
  } as unknown as RteEditor;
}

describe('Signal Forms: rteUploadsFinished e rteImagesHaveAlt (E19)', () => {
  it('leem o editor; null/undefined são válidos', () => {
    const editor = signal<RteEditor | null | undefined>(undefined);
    const f = make((p) => {
      rteUploadsFinished(p.body, () => editor());
      rteImagesHaveAlt(p.body, () => editor());
    }, '<p>a</p>');
    expect(f.body().errors()).toEqual([]);
    editor.set(null);
    expect(f.body().errors()).toEqual([]);
    const live = fakeEditor(2, 1);
    editor.set(live);
    expect(f.body().errors()).toEqual([
      expect.objectContaining({ kind: 'rteUploadsPending', count: 2 }),
      expect.objectContaining({ kind: 'rteImagesMissingAlt', count: 1 }),
    ]);
    (live.pendingUploads as ReturnType<typeof signal<number>>).set(0);
    (live.imagesMissingAlt as ReturnType<typeof signal<number>>).set(0);
    expect(f.body().errors()).toEqual([]);
  });

  it('nenhum dos dois publica metadado (REQUIRED, MAX_LENGTH)', () => {
    const f = make((p) => {
      rteUploadsFinished(p.body, () => fakeEditor(1, 1));
      rteImagesHaveAlt(p.body, () => fakeEditor(1, 1));
    }, '');
    expect(f.body().required()).toBe(false);
    expect(f.body().maxLength?.()).toBeUndefined();
    expect(
      f
        .body()
        .errors()
        .map((e) => e.kind),
    ).toEqual(['rteUploadsPending', 'rteImagesMissingAlt']);
  });
});

describe('formatRteError: envios e texto alternativo (E19, E20)', () => {
  const forms = (kind: string, count: number) => [
    { kind, count },
    { kind, context: { count } },
    { [kind]: { count } },
  ];

  it('as três formas nos três idiomas', () => {
    for (const pack of [RTE_LABELS_EN, RTE_LABELS_PT_BR, RTE_LABELS_ES]) {
      for (const count of [1, 2]) {
        for (const e of forms('rteUploadsPending', count)) {
          expect(formatRteError(e as never, pack)).toBe(
            pack.errors.rteUploadsPending(count),
          );
        }
        for (const e of forms('rteImagesMissingAlt', count)) {
          expect(formatRteError(e as never, pack)).toBe(
            pack.errors.rteImagesMissingAlt(count),
          );
        }
      }
    }
    expect(
      formatRteError({ rteUploadsPending: { count: 2 } }, RTE_LABELS_PT_BR),
    ).toBe('Aguarde o fim de 2 envios.');
    expect(
      formatRteError(
        { kind: 'rteImagesMissingAlt', count: 1 } as never,
        RTE_LABELS_EN,
      ),
    ).toBe('1 image has no alternative text.');
  });

  it('rótulo ausente ou que lança cai no inglês; count inválido devolve vazio', () => {
    const throwing = {
      errors: {
        rteUploadsPending: () => {
          throw new Error('fn');
        },
      },
    } as unknown as typeof RTE_LABELS_EN;
    for (const labels of [throwing, {} as typeof RTE_LABELS_EN]) {
      expect(
        formatRteError(
          { kind: 'rteUploadsPending', count: 2 } as never,
          labels,
        ),
      ).toBe('Wait for 2 uploads to finish.');
      expect(
        formatRteError({ rteImagesMissingAlt: { count: 3 } }, labels),
      ).toBe('3 images have no alternative text.');
    }
    for (const error of [
      { kind: 'rteUploadsPending' },
      { kind: 'rteImagesMissingAlt', context: { count: '1' } },
      { rteUploadsPending: true },
    ]) {
      expect(formatRteError(error as never, RTE_LABELS_EN)).toBe('');
    }
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

describe('Signal Forms e Reactive: rteSafeLinks e rteNoEmptyHeadings (K13)', () => {
  const link = (h: string) => `<p><a href="${h}">x</a></p>`;

  it('política padrão: links bons e valor vazio passam; javascript: erra', () => {
    for (const body of [
      '',
      '<p>a</p>',
      link('https://a.com/'),
      link('mailto:a@b.com'),
    ]) {
      expect(
        make((p) => rteSafeLinks(p.body), body)
          .body()
          .errors(),
      ).toEqual([]);
    }
    const f = make((p) => rteSafeLinks(p.body), link('javascript:alert(1)'));
    expect(f.body().errors()).toEqual([
      expect.objectContaining({
        kind: 'rteUnsafeLinks',
        count: 1,
        hrefs: ['javascript:alert(1)'],
      }),
    ]);
  });

  it('política estrita: host bloqueado e http: recusados', () => {
    const body =
      link('https://evil.com/a') +
      link('http://ok.com/') +
      link('https://ok.com/');
    const f = make(
      (p) =>
        rteSafeLinks(p.body, {
          policy: { blockedDomains: ['evil.com'], protocols: ['https'] },
        }),
      body,
    );
    expect(f.body().errors()).toEqual([
      expect.objectContaining({
        kind: 'rteUnsafeLinks',
        count: 2,
        hrefs: ['https://evil.com/a', 'http://ok.com/'],
      }),
    ]);
    // a política padrão aceita os dois
    expect(
      make((p) => rteSafeLinks(p.body), body)
        .body()
        .errors(),
    ).toEqual([]);
  });

  it('a lista é truncada em 5, mas count conta todos', () => {
    const body = Array.from({ length: 8 }, (_, i) =>
      link(`javascript:${i}`),
    ).join('');
    const err = make((p) => rteSafeLinks(p.body), body)
      .body()
      .errors()[0] as unknown as { count: number; hrefs: string[] };
    expect(err.count).toBe(8);
    expect(err.hrefs).toHaveLength(5);
  });

  it('rteNoEmptyHeadings erra com h2-h4 vazios e passa sem eles', () => {
    for (const body of ['', '<h2>a</h2>', '<h1></h1>']) {
      expect(
        make((p) => rteNoEmptyHeadings(p.body), body)
          .body()
          .errors(),
      ).toEqual([]);
    }
    const f = make(
      (p) => rteNoEmptyHeadings(p.body),
      '<h2> </h2><h3><br></h3><h4>ok</h4>',
    );
    expect(f.body().errors()).toEqual([
      expect.objectContaining({ kind: 'rteEmptyHeadings', count: 2 }),
    ]);
  });

  it('HTML aninhado além de 256 níveis não esconde javascript: nem título vazio (truncated)', () => {
    const hostile =
      '<div>'.repeat(257) + '<a href="javascript:alert(1)">x</a><h2></h2>';
    expect(
      make((p) => rteSafeLinks(p.body), hostile)
        .body()
        .errors(),
    ).toEqual([expect.objectContaining({ kind: 'rteUnsafeLinks', count: 1 })]);
    expect(
      make((p) => rteNoEmptyHeadings(p.body), hostile)
        .body()
        .errors(),
    ).toEqual([expect.objectContaining({ kind: 'rteEmptyHeadings', count: 1 })]);
    expect(RteValidators.safeLinks()(new FormControl(hostile))).toEqual({
      rteUnsafeLinks: { count: 1, hrefs: [] },
    });
    expect(RteValidators.noEmptyHeadings()(new FormControl(hostile))).toEqual({
      rteEmptyHeadings: { count: 1 },
    });
  });

  it('Reactive devolve o mesmo', () => {
    const bad = link('https://evil.com/');
    const strict = RteValidators.safeLinks({
      policy: { blockedDomains: ['evil.com'] },
    });
    expect(strict(new FormControl(bad))).toEqual({
      rteUnsafeLinks: { count: 1, hrefs: ['https://evil.com/'] },
    });
    expect(strict(new FormControl(null))).toBeNull();
    expect(RteValidators.safeLinks()(new FormControl(bad))).toBeNull();
    expect(
      RteValidators.noEmptyHeadings()(new FormControl('<h3></h3>')),
    ).toEqual({
      rteEmptyHeadings: { count: 1 },
    });
    expect(RteValidators.noEmptyHeadings()(new FormControl(''))).toBeNull();
  });

  it('formatRteError nas três formas e nos três idiomas', () => {
    const hrefs = ['x', 'y'];
    for (const pack of [RTE_LABELS_EN, RTE_LABELS_PT_BR, RTE_LABELS_ES]) {
      for (const e of [
        { kind: 'rteUnsafeLinks', count: 3, hrefs },
        { kind: 'rteUnsafeLinks', context: { count: 3, hrefs } },
        { rteUnsafeLinks: { count: 3, hrefs } },
      ]) {
        expect(formatRteError(e as never, pack)).toBe(
          pack.errors.rteUnsafeLinks({ count: 3, hrefs }),
        );
      }
      for (const e of [
        { kind: 'rteEmptyHeadings', count: 2 },
        { kind: 'rteEmptyHeadings', context: { count: 2 } },
        { rteEmptyHeadings: { count: 2 } },
      ]) {
        expect(formatRteError(e as never, pack)).toBe(
          pack.errors.rteEmptyHeadings(2),
        );
      }
    }
    expect(
      formatRteError({ kind: 'rteEmptyHeadings' } as never, RTE_LABELS_EN),
    ).toBe('');
  });
});
