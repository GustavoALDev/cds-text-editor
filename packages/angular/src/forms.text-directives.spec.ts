import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FormControl,
  FormsModule,
  NG_VALIDATORS,
  NgModel,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
} from '@angular/forms';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteMaxCharsValidator,
  RteMaxWordsValidator,
  RteNoEmptyHeadingsValidator,
  RteRequiredValidator,
  RteSafeLinksValidator,
} from '@cds/rte-angular/validators';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it } from 'vitest';
import { settle } from './testing-support/render';

// Diretivas de validação de texto para Template/Reactive Forms: acrescentam o
// validador de `RteValidators` ao controle do elemento (sem `NG_VALIDATORS`,
// que o caminho de controle customizado do @angular/forms 22.2 não lê).

const DIRECTIVES = [
  RteRequiredValidator,
  RteMaxCharsValidator,
  RteMaxWordsValidator,
  RteSafeLinksValidator,
  RteNoEmptyHeadingsValidator,
];

const ATTRS = `rteRequired [rteMaxChars]="max()" [rteMaxWords]="2" rteSafeLinks rteNoEmptyHeadings`;

interface Host {
  max: ReturnType<typeof signal<number>>;
  control(): AbstractControl;
}

@Component({
  selector: 'rte-test-text-reactive',
  imports: [RteEditor, ReactiveFormsModule, ...DIRECTIVES],
  template: `<rte-editor [formControl]="ctrl" ${ATTRS} />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ReactiveHost implements Host {
  readonly max = signal(5);
  // Validador do próprio consumidor: precisa sobreviver à troca do limite.
  readonly ctrl = new FormControl<string | null>('', Validators.maxLength(500));
  readonly cmp = viewChild.required(RteEditor);
  control() {
    return this.ctrl;
  }
}

@Component({
  selector: 'rte-test-text-model',
  imports: [RteEditor, FormsModule, ...DIRECTIVES],
  template: `<rte-editor
    name="body"
    [(ngModel)]="body"
    [ngModelOptions]="{ standalone: true }"
    ${ATTRS}
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ModelHost implements Host {
  readonly max = signal(5);
  readonly body = signal('');
  readonly ngModel = viewChild.required(NgModel);
  control() {
    return this.ngModel().control;
  }
}

describe.each<[string, Type<Host>]>([
  ['Reactive Forms ([formControl])', ReactiveHost],
  ['Template Forms ([(ngModel)])', ModelHost],
])('diretivas de texto com %s', (_, type) => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup() {
    const fixture = TestBed.createComponent(type);
    fixture.autoDetectChanges();
    await settle(fixture);
    return {
      fixture,
      host: fixture.componentInstance,
      control: fixture.componentInstance.control(),
    };
  }

  it('vazio: só rteRequired', async () => {
    const { control } = await setup();
    expect(control.errors).toEqual({ rteRequired: true });
  });

  it('cada diretiva reprova o que lhe cabe', async () => {
    const { control } = await setup();
    control.setValue('<p>abcdef</p>');
    expect(control.errors).toEqual({ rteMaxChars: { max: 5, actual: 6 } });
    control.setValue('<p>a b c</p>');
    expect(control.errors).toEqual({ rteMaxWords: { max: 2, actual: 3 } });
    control.setValue('<h2></h2><p>ok</p>');
    expect(control.errors).toEqual({ rteEmptyHeadings: { count: 1 } });
    control.setValue('<p><a href="javascript:alert(1)">x</a></p>');
    expect(Object.keys(control.errors ?? {})).toEqual(['rteUnsafeLinks']);
    control.setValue('<p>abc</p>');
    expect(control.errors).toBeNull();
  });

  it('mudar o limite revalida sem mudar o valor, e preserva outros validadores', async () => {
    const { fixture, host, control } = await setup();
    control.setValue('<p>abcdef</p>');
    expect(control.errors).toEqual({ rteMaxChars: { max: 5, actual: 6 } });
    host.max.set(10);
    await settle(fixture);
    expect(control.errors).toBeNull();
    host.max.set(3);
    await settle(fixture);
    expect(control.errors).toEqual({ rteMaxChars: { max: 3, actual: 6 } });
    if (type === ReactiveHost) {
      control.setValue('<p>' + 'a'.repeat(600) + '</p>');
      expect(Object.keys(control.errors ?? {}).sort()).toEqual([
        'maxlength',
        'rteMaxChars',
      ]);
    }
  });

  it('não provê NG_VALIDATORS no elemento', async () => {
    const { fixture } = await setup();
    const el = fixture.debugElement.query(By.directive(RteEditor));
    expect(el.injector.get(NG_VALIDATORS, null)).toBeNull();
  });
});

@Component({
  selector: 'rte-test-text-toggle',
  imports: [RteEditor, ReactiveFormsModule, RteNoEmptyHeadingsValidator],
  template: `@if (on()) {
    <rte-editor [formControl]="ctrl" [rteNoEmptyHeadings]="flag()" />
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ToggleHost {
  readonly on = signal(true);
  readonly flag = signal(true);
  readonly ctrl = new FormControl<string | null>('<h2></h2>');
}

describe('ciclo de vida da diretiva de texto', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('desligar pela entrada e destruir o elemento retiram o validador do controle', async () => {
    const fixture = TestBed.createComponent(ToggleHost);
    fixture.autoDetectChanges();
    await settle(fixture);
    const { ctrl } = fixture.componentInstance;
    expect(ctrl.errors).toEqual({ rteEmptyHeadings: { count: 1 } });
    fixture.componentInstance.flag.set(false);
    await settle(fixture);
    expect(ctrl.errors).toBeNull();
    fixture.componentInstance.flag.set(true);
    await settle(fixture);
    expect(ctrl.invalid).toBe(true);
    fixture.componentInstance.on.set(false);
    await settle(fixture);
    ctrl.updateValueAndValidity();
    expect(ctrl.errors).toBeNull();
  });
});
