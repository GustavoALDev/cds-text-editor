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
  FormGroup,
  FormsModule,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  NgModel,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
} from '@angular/forms';
import { By } from '@angular/platform-browser';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteImagesHaveAltValidator,
  RteUploadsFinishedValidator,
  RteValidators,
} from '@cds/rte-angular/validators';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDataTransferShim } from './testing-support/data-transfer';
import { installDialogShim } from './testing-support/dialog';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './testing-support/fake-upload-adapter';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { drainUploads, pngFile } from './testing-support/upload-dialog';
import { fixAlt, imageSrc, pasteImage } from './testing-support/upload-forms';
import { whenUploadReady } from './testing-support/upload-runtime';

// D5 (revisado na Tarefa 7): sem CVA. O `NgControl` do @angular/forms 22.2
// liga um `FormValueControl` pelo caminho de controle customizado
// (`ngControlCreate` → `host.customControl`: valor, touched, dirty, invalid,
// disabled, required e errors chegam às entradas). Um `NG_VALUE_ACCESSOR` no
// elemento venceria esse caminho e perderia estado.

afterEach(() => {
  document.body
    .querySelectorAll('[data-test-outside]')
    .forEach((el) => el.remove());
});

const TASKS =
  '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="">A</label></li></ul>';

interface CompatHost {
  cmp: () => RteEditor;
  control(): AbstractControl;
  /** Valor do lado do consumidor (modelo do `ngModel` ou do controle). */
  modelValue(): unknown;
}

@Component({
  selector: 'rte-test-control-name',
  imports: [RteEditor, ReactiveFormsModule],
  template: `<form [formGroup]="group">
    <rte-editor formControlName="body" />
  </form>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ControlNameHost implements CompatHost {
  readonly group = new FormGroup({
    body: new FormControl<string | null>('', Validators.required),
  });
  readonly cmp = viewChild.required(RteEditor);
  control() {
    return this.group.controls.body;
  }
  modelValue() {
    return this.group.controls.body.value;
  }
}

@Component({
  selector: 'rte-test-control',
  imports: [RteEditor, ReactiveFormsModule],
  template: '<rte-editor [formControl]="ctrl" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ControlHost implements CompatHost {
  readonly ctrl = new FormControl<string | null>('', Validators.required);
  readonly cmp = viewChild.required(RteEditor);
  control() {
    return this.ctrl;
  }
  modelValue() {
    return this.ctrl.value;
  }
}

@Component({
  selector: 'rte-test-ng-model-name',
  imports: [RteEditor, FormsModule],
  template: `<form>
    <rte-editor name="body" required [(ngModel)]="body" />
  </form>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class NgModelNameHost implements CompatHost {
  readonly body = signal('');
  readonly cmp = viewChild.required(RteEditor);
  readonly ngModel = viewChild.required(NgModel);
  control() {
    return this.ngModel().control;
  }
  modelValue() {
    return this.body();
  }
}

@Component({
  selector: 'rte-test-ng-model-standalone',
  imports: [RteEditor, FormsModule],
  template: `<rte-editor
    required
    [(ngModel)]="body"
    [ngModelOptions]="{ standalone: true }"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class NgModelStandaloneHost extends NgModelNameHost {}

async function setup(type: Type<CompatHost>) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(type);
  fixture.autoDetectChanges();
  await settle(fixture);
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  const editor = cmp.editor() as Editor;
  const probe = { writes: 0 };
  cmp.value.subscribe(() => probe.writes++);
  return {
    fixture,
    host,
    cmp,
    editor,
    probe,
    control: host.control(),
    el: fixture.debugElement.query(By.directive(RteEditor)),
    dom: editor.view.dom,
  };
}

function outsideButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.setAttribute('data-test-outside', '');
  document.body.appendChild(button);
  return button;
}

function focusEvent(type: 'focusin' | 'focusout', related: Element | null) {
  return new FocusEvent(type, { bubbles: true, relatedTarget: related });
}

const CASES: [string, Type<CompatHost>][] = [
  ['formControlName', ControlNameHost],
  ['[formControl]', ControlHost],
  ['[(ngModel)] com name num form', NgModelNameHost],
  ['[(ngModel)] standalone', NgModelStandaloneHost],
];

describe.each(CASES)(
  '%s sem diretiva: caminho nativo do controle customizado (D5, R6)',
  (_, type) => {
    it('nenhum NG_VALUE_ACCESSOR no elemento', async () => {
      const { el } = await setup(type);
      expect(el.injector.get(NG_VALUE_ACCESSOR, null)).toBeNull();
    });

    it('digitar escreve o modelo e deixa o controle dirty', async () => {
      const { fixture, host, editor, control } = await setup(type);
      editor.commands.insertContent('abc');
      await settle(fixture);
      expect(control.value).toBe('<p>abc</p>');
      expect(host.modelValue()).toBe('<p>abc</p>');
      expect(control.dirty).toBe(true);
    });

    it('setValue chega ao editor sem emitir de volta (controle pristine)', async () => {
      const { fixture, editor, control, probe } = await setup(type);
      control.setValue('<p>x</p>');
      await settle(fixture);
      expect(editor.getHTML()).toBe('<p>x</p>');
      expect(probe.writes).toBe(0);
      expect(control.pristine).toBe(true);
    });

    it("setValue(null) vale ''", async () => {
      const { fixture, cmp, editor, control } = await setup(type);
      control.setValue('<p>x</p>');
      await settle(fixture);
      control.setValue(null);
      await settle(fixture);
      expect(cmp.value() ?? '').toBe('');
      expect(editor.isEmpty).toBe(true);
    });

    it('markAsTouched e focusout para fora do host tocam; para dentro, não', async () => {
      const { fixture, cmp, control, el, dom } = await setup(type);
      const inner = document.createElement('button');
      (el.nativeElement as HTMLElement).appendChild(inner);
      dom.dispatchEvent(focusEvent('focusin', null));
      dom.dispatchEvent(focusEvent('focusout', inner));
      await settle(fixture);
      expect(control.touched).toBe(false);

      inner.dispatchEvent(focusEvent('focusout', outsideButton()));
      await settle(fixture);
      expect(control.touched).toBe(true);
      expect(cmp.touched()).toBe(true);

      control.markAsUntouched();
      await settle(fixture);
      expect(cmp.touched()).toBe(false);
      control.markAsTouched();
      await settle(fixture);
      expect(cmp.touched()).toBe(true);
    });

    it('disable()/enable() ligam o editável, a classe e os checkboxes das tarefas', async () => {
      const { fixture, cmp, editor, control, el, dom } = await setup(type);
      control.setValue(TASKS);
      await settle(fixture);
      const box = () => dom.querySelector<HTMLInputElement>('li.rt-task input');
      expect(box()?.disabled).toBe(false);

      control.disable();
      await settle(fixture);
      expect(cmp.disabled()).toBe(true);
      expect(editor.isEditable).toBe(false);
      expect(box()?.disabled).toBe(true);
      expect(
        (el.nativeElement as HTMLElement).classList.contains(
          'rte-editor--disabled',
        ),
      ).toBe(true);

      control.enable();
      await settle(fixture);
      expect(cmp.disabled()).toBe(false);
      expect(editor.isEditable).toBe(true);
      expect(box()?.disabled).toBe(false);
    });

    it('Validators.required chega a required() e ao aria-required', async () => {
      const { cmp, dom } = await setup(type);
      expect(cmp.required()).toBe(true);
      expect(dom.getAttribute('aria-required')).toBe('true');
    });

    it('RteValidators.maxChars: erro no controle e invalid() no componente', async () => {
      const { fixture, cmp, control, dom } = await setup(type);
      control.addValidators(RteValidators.maxChars(3));
      control.setValue('<p>abcd</p>');
      await settle(fixture);
      expect(control.errors).toEqual({ rteMaxChars: { max: 3, actual: 4 } });
      expect(cmp.invalid()).toBe(true);

      control.markAsTouched();
      await settle(fixture);
      expect(dom.getAttribute('aria-invalid')).toBe('true');
    });
  },
);

// Spec 05c2a, Tarefa 11: diretivas RteUploadsFinishedValidator e
// RteImagesHaveAltValidator (E19, R13) no Reactive e no Template Forms.

interface UploadCompatHost extends CompatHost {
  readonly adapter: FakeUploadAdapter;
}

@Component({
  selector: 'rte-test-upload-control-name',
  imports: [
    RteEditor,
    ReactiveFormsModule,
    RteUploadsFinishedValidator,
    RteImagesHaveAltValidator,
  ],
  template: `<form [formGroup]="group">
    <rte-editor
      formControlName="body"
      [upload]="upload"
      rteUploadsFinished
      rteImagesHaveAlt
    />
  </form>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UploadControlNameHost implements UploadCompatHost {
  readonly adapter = createFakeUploadAdapter();
  readonly upload = { adapter: this.adapter };
  readonly group = new FormGroup({
    body: new FormControl<string | null>('<p>ab</p>'),
  });
  readonly cmp = viewChild.required(RteEditor);
  control() {
    return this.group.controls.body;
  }
  modelValue() {
    return this.group.controls.body.value;
  }
}

@Component({
  selector: 'rte-test-upload-ng-model',
  imports: [
    RteEditor,
    FormsModule,
    RteUploadsFinishedValidator,
    RteImagesHaveAltValidator,
  ],
  template: `<form>
    <rte-editor
      name="body"
      [upload]="upload"
      rteUploadsFinished
      rteImagesHaveAlt
      [(ngModel)]="body"
    />
  </form>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UploadNgModelHost implements UploadCompatHost {
  readonly adapter = createFakeUploadAdapter();
  readonly upload = { adapter: this.adapter };
  readonly body = signal('<p>ab</p>');
  readonly cmp = viewChild.required(RteEditor);
  readonly ngModel = viewChild.required(NgModel);
  control() {
    return this.ngModel().control;
  }
  modelValue() {
    return this.body();
  }
}

const UPLOAD_CASES: [string, Type<UploadCompatHost>][] = [
  ['formControlName', UploadControlNameHost],
  ['[(ngModel)]', UploadNgModelHost],
];

describe.each(UPLOAD_CASES)(
  '%s com os validadores do envio (E19)',
  (_, type) => {
    let restore: (() => void)[] = [];
    beforeEach(() => {
      restore = [
        installDialogShim(),
        installPopoverShim(),
        installDataTransferShim(),
      ];
    });
    afterEach(() => {
      TestBed.resetTestingModule();
      for (const r of restore) r();
      vi.restoreAllMocks();
    });

    async function setupUploads() {
      const s = await setup(type);
      await whenUploadReady(s.cmp);
      await settle(s.fixture);
      return { ...s, adapter: (s.host as UploadCompatHost).adapter };
    }

    it('as diretivas provêem NG_VALIDATORS no elemento', async () => {
      const { el } = await setupUploads();
      const validators = el.injector.get(NG_VALIDATORS);
      expect(validators.map((v) => v.constructor)).toEqual(
        expect.arrayContaining([
          RteUploadsFinishedValidator,
          RteImagesHaveAltValidator,
        ]),
      );
    });

    it('válido sem envio; { rteUploadsPending: { count: 2 } } com dois envios; válido depois de terminar', async () => {
      const { fixture, cmp, control, adapter } = await setupUploads();
      expect(control.errors).toBeNull();
      cmp.uploadFiles([pngFile('a.png'), pngFile('b.png')]);
      await drainUploads(fixture);
      expect(control.errors).toEqual({ rteUploadsPending: { count: 2 } });
      expect(cmp.invalid()).toBe(true);
      adapter.resolve(0, { url: '/a.png' });
      adapter.resolve(1, { url: '/b.png' });
      await drainUploads(fixture);
      expect(control.errors).toEqual({ rteImagesMissingAlt: { count: 2 } });
    });

    it('falhar e cancelar revalidam sem mudar o valor (registerOnValidatorChange)', async () => {
      const { fixture, host, cmp, control, adapter } = await setupUploads();
      const before = host.modelValue();
      cmp.uploadFiles([pngFile('a.png'), pngFile('b.png')]);
      await drainUploads(fixture);
      const revalidate = vi.spyOn(control, 'updateValueAndValidity');
      adapter.reject(0, new Error('500'));
      await drainUploads(fixture);
      expect(revalidate).toHaveBeenCalled();
      expect(control.errors).toEqual({ rteUploadsPending: { count: 1 } });
      revalidate.mockClear();
      cmp.cancelAllUploads();
      await drainUploads(fixture);
      expect(revalidate).toHaveBeenCalled();
      expect(control.errors).toBeNull();
      expect(control.valid).toBe(true);
      expect(host.modelValue()).toBe(before);
    });

    it('registerOnValidatorChange: a função registrada dispara ao falhar, não na primeira leitura', async () => {
      const { fixture, cmp, el, adapter } = await setupUploads();
      const dir = el.injector.get(RteUploadsFinishedValidator);
      const spy = vi.fn();
      dir.registerOnValidatorChange(spy);
      cmp.uploadFiles([pngFile('a.png')]);
      await drainUploads(fixture);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(dir.validate()).toEqual({ rteUploadsPending: { count: 1 } });
      adapter.reject(0, new Error('500'));
      await drainUploads(fixture);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(dir.validate()).toBeNull();
    });

    it('imagem colada: rteImagesMissingAlt até o "Detalhes…" com texto ou decorativa', async () => {
      const { fixture, cmp, editor, control, adapter } = await setupUploads();
      await pasteImage(fixture, editor, (url) => adapter.resolve(0, { url }));
      expect(control.errors).toEqual({ rteImagesMissingAlt: { count: 1 } });
      await fixAlt(fixture, cmp, editor, 'Gato');
      expect(control.errors).toBeNull();
      expect(imageSrc(editor)).toBe('/up.png');
      await pasteImage(
        fixture,
        editor,
        (url) => adapter.resolve(1, { url }),
        '/up2.png',
      );
      expect(control.errors).toEqual({ rteImagesMissingAlt: { count: 1 } });
    });

    it('decorativa também valida, sem mudar a URL', async () => {
      const { fixture, cmp, editor, control, adapter } = await setupUploads();
      await pasteImage(fixture, editor, (url) => adapter.resolve(0, { url }));
      expect(control.invalid).toBe(true);
      await fixAlt(fixture, cmp, editor, null);
      expect(control.valid).toBe(true);
      expect(imageSrc(editor)).toBe('/up.png');
    });
  },
);
