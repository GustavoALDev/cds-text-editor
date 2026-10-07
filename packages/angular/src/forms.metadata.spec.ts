import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  inject,
  input,
  model,
  signal,
  viewChild,
  type Signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FormField,
  MAX_LENGTH,
  REQUIRED,
  form,
  maxLength,
  metadata,
  required,
  validate,
  type FormValueControl,
  type SchemaFn,
} from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

// Spike do risco 1 (spec 05a, §7): um validador próprio publica
// `MAX_LENGTH`/`REQUIRED` com `metadata()` e o `[formField]` devolve esses
// valores às entradas `maxLength`/`required` do controle. Fica como teste de
// regressão: se quebrar numa versão nova do Angular, vale o plano B.

interface Model {
  body: string;
}

type SchemaFactory = (max: Signal<number | undefined>) => SchemaFn<Model>;

const SCHEMA = new InjectionToken<SchemaFactory>('SCHEMA');

@Component({
  selector: 'rte-stub',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StubControl implements FormValueControl<string> {
  readonly value = model('');
  readonly required = input(false);
  readonly maxLength = input<number | undefined>(undefined);
}

@Component({
  selector: 'rte-host',
  imports: [StubControl, FormField],
  template: '<rte-stub [formField]="f.body" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly max = signal<number | undefined>(10);
  readonly f = form(signal<Model>({ body: '' }), inject(SCHEMA)(this.max));
  readonly stub = viewChild.required(StubControl);
}

async function render(factory: SchemaFactory) {
  TestBed.configureTestingModule({
    providers: [{ provide: SCHEMA, useValue: factory }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return fixture;
}

const custom: SchemaFactory = (max) => (p) => {
  validate(p.body, () => undefined);
  metadata(p.body, MAX_LENGTH, () => max());
  metadata(p.body, REQUIRED, () => true);
};

describe('Signal Forms: metadados de validador próprio chegam às entradas do controle', () => {
  it('MAX_LENGTH e REQUIRED publicados com metadata() viram maxLength/required', async () => {
    const fixture = await render(custom);
    const host = fixture.componentInstance;

    expect(host.stub().maxLength()).toBe(10);
    expect(host.stub().required()).toBe(true);

    host.max.set(20);
    await fixture.whenStable();
    expect(host.stub().maxLength()).toBe(20);

    host.max.set(undefined);
    await fixture.whenStable();
    expect(host.stub().maxLength()).toBeUndefined();
  });

  it('com maxLength() nativo junto, vale o menor dos dois (redutor min)', async () => {
    const fixture = await render((max) => (p) => {
      custom(max)(p);
      maxLength(p.body, 5);
    });
    const host = fixture.componentInstance;

    // 10 (próprio) × 5 (nativo) → 5
    expect(host.stub().maxLength()).toBe(5);

    // 3 (próprio) × 5 (nativo) → 3: o metadado próprio decide
    host.max.set(3);
    await fixture.whenStable();
    expect(host.stub().maxLength()).toBe(3);
  });

  it('com required() nativo junto, basta um dos dois (redutor or)', async () => {
    const off = signal(false);
    const fixture = await render(() => (p) => {
      metadata(p.body, REQUIRED, () => off());
      required(p.body, { when: () => !off() });
    });
    const stub = fixture.componentInstance.stub();

    // próprio false + nativo true → true
    expect(stub.required()).toBe(true);

    // próprio true + nativo desligado (when: false) → true: o próprio decide
    off.set(true);
    await fixture.whenStable();
    expect(stub.required()).toBe(true);
  });
});
