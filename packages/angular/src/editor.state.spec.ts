import {
  ChangeDetectionStrategy,
  Component,
  effect,
  NgZone,
  signal,
  viewChild,
  type Signal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@comodeviaser/rte-angular';
import { getCharLimitState } from '@comodeviaser/rte-core/extensions';
import { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rteEditorVersion } from './editor/bridge';
import { settle } from './testing-support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

@Component({
  selector: 'rte-test-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="value()" [maxLength]="max()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('');
  readonly max = signal<number | undefined>(undefined);
  readonly cmp = viewChild.required(RteEditor);
}

/** Conta as notificações de um signal com um `effect` (R3). */
function counter(source: Signal<unknown>): { count: number } {
  const probe = { count: 0 };
  TestBed.runInInjectionContext(() =>
    effect(() => {
      source();
      probe.count++;
    }),
  );
  TestBed.tick();
  return probe;
}

async function setup(init?: (host: Host) => void) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Host);
  init?.(fixture.componentInstance);
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = fixture.componentInstance.cmp();
  return { fixture, cmp, editor: cmp.editor() as Editor };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function end(editor: Editor): number {
  return editor.state.doc.content.size - 1;
}

describe('RteEditor: ponte de signals (D4, R3)', () => {
  it('cada signal só notifica quando o valor muda', async () => {
    const { cmp, editor } = await setup();
    const empty = counter(cmp.isEmpty);
    const focused = counter(cmp.isFocused);
    const stats = counter(cmp.textStats);
    const base = [empty.count, focused.count, stats.count];
    expect(base).toEqual([1, 1, 1]);

    editor.commands.insertContent('a');
    TestBed.tick();
    expect(empty.count).toBe(2);
    expect(stats.count).toBe(2);
    editor.commands.insertContent('b');
    TestBed.tick();
    expect(empty.count).toBe(2);
    expect(stats.count).toBe(3);

    editor.commands.setTextSelection(1);
    TestBed.tick();
    expect(stats.count).toBe(3);

    // `focus`/`blur` do Tiptap agem no próximo quadro
    editor.commands.focus(null, { scrollIntoView: false }); // jsdom sem getClientRects
    await nextFrame();
    TestBed.tick();
    expect(focused.count).toBe(2);
    expect(cmp.isFocused()).toBe(true);
    editor.commands.blur();
    await nextFrame();
    TestBed.tick();
    expect(focused.count).toBe(3);
    expect(cmp.isFocused()).toBe(false);

    editor.view.dispatch(editor.state.tr.setMeta('x', 1));
    TestBed.tick();
    expect([empty.count, focused.count, stats.count]).toEqual([2, 3, 3]);
  });

  it('a versão sobe exatamente 1 por dispatch', async () => {
    const { cmp, editor } = await setup();
    const version = rteEditorVersion(cmp);
    const start = version();

    editor.view.dispatch(editor.state.tr.insertText('a'));
    expect(version()).toBe(start + 1);
    editor.view.dispatch(editor.state.tr.setMeta('x', 1));
    expect(version()).toBe(start + 2);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)),
    );
    expect(version()).toBe(start + 3);
  });

  it('textStats é getCharLimitState e null antes da criação', async () => {
    TestBed.configureTestingModule({});
    const fixture: ComponentFixture<Host> = TestBed.createComponent(Host);
    fixture.componentRef.changeDetectorRef.detectChanges();
    const cmp = fixture.componentInstance.cmp();
    expect(cmp.textStats()).toBeNull();
    expect(cmp.isEmpty()).toBe(true);
    expect(cmp.isFocused()).toBe(false);

    fixture.autoDetectChanges();
    await settle(fixture);
    const editor = cmp.editor() as Editor;
    editor.commands.insertContent('olá mundo');
    expect(cmp.textStats()).toEqual(getCharLimitState(editor));
    expect(cmp.isEmpty()).toBe(false);
  });

  it('isEmpty antes da criação segue o value', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set('<p>x</p>');
    fixture.componentRef.changeDetectorRef.detectChanges();
    expect(fixture.componentInstance.cmp().isEmpty()).toBe(false);
  });

  it('ler o estado não serializa o documento', async () => {
    const { cmp, editor } = await setup();
    editor.commands.insertContent('abc');
    cmp.isEmpty();
    cmp.textStats();
    const fromSchema = vi.spyOn(DOMSerializer, 'fromSchema');
    for (let i = 0; i < 50; i++) {
      cmp.isEmpty();
      cmp.textStats();
    }
    expect(fromSchema).not.toHaveBeenCalled();
  });
});

@Component({
  selector: 'rte-test-onpush',
  imports: [RteEditor],
  template: `<rte-editor #ed /><output>{{ ed.isEmpty() }}</output>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OnPushHost {
  readonly cmp = viewChild.required(RteEditor);
}

describe('RteEditor: template OnPush do consumidor (D3, D4)', () => {
  it('atualiza sozinho depois de uma transação fora da zona, sem tick explícito', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(OnPushHost);
    fixture.autoDetectChanges();
    await settle(fixture);
    const out = (fixture.nativeElement as HTMLElement).querySelector('output');
    const editor = fixture.componentInstance.cmp().editor() as Editor;
    expect(out?.textContent).toBe('true');

    TestBed.inject(NgZone).runOutsideAngular(() =>
      editor.view.dispatch(editor.state.tr.insertText('a', 1)),
    );
    expect(NgZone.isInAngularZone()).toBe(false);
    expect(out?.textContent).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(out?.textContent).toBe('false');
  });
});

describe('RteEditor: focus()', () => {
  it('foca o editável do editor criado', async () => {
    const { cmp, editor } = await setup();
    cmp.focus({ preventScroll: true });
    await nextFrame();
    expect(document.activeElement).toBe(editor.view.dom);
    expect(cmp.isFocused()).toBe(true);
  });
});

describe('RteEditor: maxLength vira o limite (D12, R7)', () => {
  it('muda o limite sem recriar e vale na verificação seguinte', async () => {
    const { fixture, cmp, editor } = await setup();
    const host = fixture.componentInstance;

    host.max.set(5);
    await settle(fixture);
    expect(cmp.editor()).toBe(editor);
    expect(cmp.textStats()?.limit).toBe(5);

    editor.commands.insertContent('abcde');
    const { view } = editor;
    const at = end(editor);
    expect(
      view.someProp('handleTextInput', (f) =>
        f(view, at, at, 'x', () => view.state.tr.insertText('x', at, at)),
      ),
    ).toBe(true);

    host.max.set(10);
    await settle(fixture);
    expect(cmp.textStats()?.limit).toBe(10);
    expect(
      view.someProp('handleTextInput', (f) =>
        f(view, at, at, 'x', () => view.state.tr.insertText('x', at, at)),
      ),
    ).toBeFalsy();
  });

  it.each([-1, 1.5, Number.NaN, undefined])(
    'maxLength %s vale como sem limite',
    async (max) => {
      const { cmp } = await setup((h) => h.max.set(max));
      expect(cmp.textStats()?.limit).toBeNull();
    },
  );

  it('conteúdo acima do limite fica overLimit, sem corte', async () => {
    const { cmp, editor } = await setup((h) => {
      h.value.set('<p>abcdefghijkl</p>');
      h.max.set(5);
    });
    expect(cmp.textStats()?.overLimit).toBe(true);
    expect(cmp.textStats()?.characters).toBe(12);
    expect(editor.state.doc.textContent).toBe('abcdefghijkl');
  });
});
