import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  provideRichText,
  RteEditor,
  type RteUploadConfig,
} from '@cds/rte-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import { createFakeUploadAdapter } from './testing-support/fake-upload-adapter';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { RTE_UPLOAD_LOADER } from './upload/facade';

// Spec 05c2b, Tarefa 3: `warnOnUnsaved` (R8; S10).

@Component({
  selector: 'rte-test-unload',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [warnOnUnsaved]="warn()"
    [upload]="upload()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly warn = signal<boolean | undefined>(true);
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly cmp = viewChild.required(RteEditor);
}

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
});
afterEach(() => {
  restoreDialog();
  restorePopover();
  vi.restoreAllMocks();
});

const isUnload = (call: unknown[]) => call[0] === 'beforeunload';

async function setup(
  o: { warn?: boolean | undefined; provider?: boolean; upload?: boolean } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: RTE_UPLOAD_LOADER,
        useValue: () => import('./upload/rte-upload'),
      },
      ...(o.provider === undefined
        ? []
        : [provideRichText({ warnOnUnsaved: o.provider })]),
    ],
  });
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if ('warn' in o) host.warn.set(o.warn);
  const adapter = createFakeUploadAdapter();
  if (o.upload) host.upload.set({ adapter });
  fixture.autoDetectChanges();
  await settle(fixture);
  const editor = host.cmp().editor();
  if (!editor) throw new Error('sem editor');
  const adds = () => add.mock.calls.filter(isUnload).length;
  const removes = () => remove.mock.calls.filter(isUnload).length;
  const type = async () => {
    editor.commands.insertContent('x');
    await settle(fixture);
  };
  return { fixture, host, editor, adapter, adds, removes, type, add, remove };
}

describe('warnOnUnsaved (R8)', () => {
  it('só registra o ouvinte enquanto sujo e remove ao salvar', async () => {
    const s = await setup();
    expect(s.adds()).toBe(0);
    await s.type();
    expect(s.adds()).toBe(1);
    await s.type();
    expect(s.adds()).toBe(1);
    s.host.cmp().markSaved();
    await settle(s.fixture);
    expect(s.removes()).toBe(1);
  });

  it('registra fora da zona e chama preventDefault com returnValue vazio', async () => {
    const s = await setup();
    // fora da zona: o registro passa por `runOutsideAngular`
    const outside = vi.spyOn(TestBed.inject(NgZone), 'runOutsideAngular');
    await s.type();
    expect(outside).toHaveBeenCalled();
    expect(s.adds()).toBe(1);
    const event = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(event, 'returnValue', {
      value: 'antes',
      writable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect((event as BeforeUnloadEvent).returnValue).toBe('');
    s.host.cmp().markSaved();
    await settle(s.fixture);
  });

  it('mantém o ouvinte com envio em curso mesmo limpo', async () => {
    const s = await setup({ upload: true });
    await new Promise((r) => setTimeout(r));
    await settle(s.fixture);
    expect(
      s.host
        .cmp()
        .uploadFiles([new File(['x'], 'a.png', { type: 'image/png' })]),
    ).toBe(1);
    await new Promise((r) => setTimeout(r));
    await settle(s.fixture);
    expect(s.host.cmp().pendingUploads()).toBe(1);
    expect(s.host.cmp().isDirty()).toBe(false);
    expect(s.adds()).toBe(1);
    s.host.cmp().cancelAllUploads();
    await settle(s.fixture);
    expect(s.removes()).toBe(1);
  });

  it('desligado por padrão', async () => {
    const s = await setup({ warn: undefined });
    await s.type();
    expect(s.adds()).toBe(0);
  });

  it('a entrada vence o provider, nos dois sentidos', async () => {
    const off = await setup({ warn: false, provider: true });
    await off.type();
    expect(off.adds()).toBe(0);
    TestBed.resetTestingModule();
    const on = await setup({ warn: undefined, provider: true });
    await on.type();
    expect(on.adds()).toBe(1);
  });

  it('desligar ao vivo remove o ouvinte', async () => {
    const s = await setup();
    await s.type();
    s.host.warn.set(false);
    await settle(s.fixture);
    expect(s.removes()).toBe(1);
  });

  it('destroy remove o ouvinte', async () => {
    const s = await setup();
    await s.type();
    s.fixture.destroy();
    expect(s.removes()).toBe(1);
  });
});
