import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@cds/rte-angular';
import { getRteHtml } from '@cds/rte-core/extensions';
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settle } from './testing-support/render';
import { RTE_TEST_MODE } from './testing-support/test-mode';

afterEach(() => {
  vi.restoreAllMocks();
});

@Component({
  selector: 'rte-test-value',
  imports: [RteEditor],
  template: `<rte-editor
    [(value)]="html"
    (valueChange)="onWrite($event)"
    (editorReady)="onReady()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly html = signal('');
  writes = 0;
  /** `NgZone.isInAngularZone()` em cada saída recebida (D3). */
  readonly zones: boolean[] = [];
  /** Reescrita do consumidor dentro do `(valueChange)` (Review Focus 2). */
  rewrite: ((v: string) => string) | null = null;
  readonly cmp = viewChild.required(RteEditor);

  onWrite(v: string): void {
    this.writes = this.writes + 1;
    this.zones.push(NgZone.isInAngularZone());
    if (this.rewrite) this.html.set(this.rewrite(v));
  }

  onReady(): void {
    this.zones.push(NgZone.isInAngularZone());
  }
}

async function setup(init?: (host: Host) => void) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Host);
  init?.(fixture.componentInstance);
  fixture.autoDetectChanges();
  await settle(fixture);
  const host = fixture.componentInstance;
  const cmp = host.cmp();
  return { fixture, host, cmp, editor: cmp.editor() as Editor };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Conta as transações do editor e as de carga externa (fora do histórico). */
function watch(editor: Editor) {
  const probe = { all: 0, loads: 0 };
  editor.on('transaction', ({ transaction }: { transaction: Transaction }) => {
    probe.all++;
    if (
      transaction.docChanged &&
      transaction.getMeta('addToHistory') === false
    ) {
      probe.loads++;
    }
  });
  return probe;
}

describe('RteEditor: emissão síncrona (D6, D8, R4)', () => {
  it('digitar escreve o HTML canônico na mesma tarefa; apagar tudo escreve ""', async () => {
    const { host, editor } = await setup();

    editor.commands.insertContent('abc');
    expect(host.html()).toBe('<p>abc</p>');
    expect(host.writes).toBe(1);

    editor.commands.clearContent(true);
    expect(host.html()).toBe('');
    expect(host.writes).toBe(2);
  });

  it('seleção, setEditable, meta e foco não escrevem', async () => {
    const { host, editor } = await setup((h) => h.html.set('<p>abc</p>'));
    const writes = host.writes;

    editor.commands.setTextSelection(1);
    editor.setEditable(false, false);
    editor.setEditable(true, false);
    editor.view.dispatch(editor.state.tr.setMeta('x', 1));
    editor.commands.focus(null, { scrollIntoView: false }); // jsdom sem getClientRects
    await nextFrame();

    expect(host.writes).toBe(writes);
    expect(host.html()).toBe('<p>abc</p>');
  });

  it('as saídas chegam dentro da zona no modo zone.js (D3)', async () => {
    const { host, editor } = await setup();
    editor.commands.insertContent('a');
    expect(host.zones).toHaveLength(2);
    if (TestBed.inject(RTE_TEST_MODE) === 'zone') {
      expect(host.zones).toEqual([true, true]);
    }
  });
});

describe('RteEditor: valor externo (D9, R4)', () => {
  it('aplica sem eco, sem foco e sem reescrever o modelo', async () => {
    const { fixture, host, cmp, editor } = await setup();

    host.html.set('<p>x</p>');
    await settle(fixture);
    expect(getRteHtml(editor)).toBe('<p>x</p>');
    expect(host.writes).toBe(0);
    expect(document.activeElement).not.toBe(editor.view.dom);

    host.html.set('<p>a<b>b</b></p>');
    await settle(fixture);
    expect(getRteHtml(editor)).toBe('<p>a<strong>b</strong></p>');
    expect(host.html()).toBe('<p>a<b>b</b></p>');
    expect(host.writes).toBe(0);

    const at = editor.state.doc.content.size - 1;
    editor.view.dispatch(editor.state.tr.insert(at, editor.schema.text('c')));
    expect(host.html()).toBe('<p>a<strong>b</strong>c</p>');
    expect(host.writes).toBe(1);

    // igual ao último valor conhecido: ignorado
    const probe = watch(editor);
    host.html.set('<p>outro</p>');
    host.html.set('<p>a<strong>b</strong>c</p>');
    await settle(fixture);
    expect(probe.all).toBe(0);

    // tabela irregular: o appendTransaction de fixTables não emite
    host.html.set(
      '<table><tbody><tr><td><p>a</p></td></tr><tr><td><p>b</p></td><td><p>c</p></td></tr></tbody></table>',
    );
    await settle(fixture);
    expect(probe.loads).toBe(1);
    expect(host.writes).toBe(1);

    host.html.set('');
    await settle(fixture);
    expect(cmp.isEmpty()).toBe(true);
    expect(editor.isEmpty).toBe(true);
    expect(host.writes).toBe(1);
  });

  it('undo logo depois da carga não volta ao documento anterior', async () => {
    const { fixture, host, editor } = await setup();
    editor.commands.insertContent('a');
    host.html.set('<p>B</p>');
    await settle(fixture);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe('<p>B</p>');
  });

  it('null no componente direto vale "" e não escreve', async () => {
    TestBed.configureTestingModule({});
    const fixture: ComponentFixture<RteEditor> =
      TestBed.createComponent(RteEditor);
    const cmp = fixture.componentInstance;
    const writes: string[] = [];
    cmp.value.subscribe((v) => writes.push(v));
    fixture.componentRef.setInput('value', '<p>q</p>');
    fixture.autoDetectChanges();
    await settle(fixture);
    const editor = cmp.editor() as Editor;
    expect(getRteHtml(editor)).toBe('<p>q</p>');

    fixture.componentRef.setInput('value', null as never);
    await settle(fixture);
    expect(editor.isEmpty).toBe(true);
    expect(cmp.isEmpty()).toBe(true);
    expect(writes).toEqual([]);
  });

  it('um consumidor que reescreve no (valueChange) converge sem laço', async () => {
    const { fixture, host, editor } = await setup((h) => {
      // só o texto em maiúsculas
      h.rewrite = (v) => v.replace(/>[^<]+</g, (s) => s.toUpperCase());
    });
    const probe = watch(editor);

    editor.commands.insertContent('ab');
    await settle(fixture);

    expect(getRteHtml(editor)).toBe('<p>AB</p>');
    expect(host.html()).toBe('<p>AB</p>');
    expect(probe.loads).toBeLessThanOrEqual(1);
    expect(host.writes).toBe(1);
  });

  it('mudar o valor e destruir no mesmo tick não dá erro', async () => {
    const error = vi.spyOn(console, 'error');
    const { fixture, host } = await setup();
    host.html.set('<p>z</p>');
    fixture.destroy();
    await TestBed.inject(NgZone).run(() => Promise.resolve());
    expect(error).not.toHaveBeenCalled();
  });
});

describe('RteEditor: pedidos antes da criação', () => {
  it('valor e focus() pedidos antes da criação valem depois dela', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.changeDetectorRef.detectChanges();
    const host = fixture.componentInstance;
    const cmp = host.cmp();
    expect(cmp.editor()).toBeNull();

    host.html.set('<p>cedo</p>');
    cmp.focus({ preventScroll: true }); // jsdom sem getClientRects
    fixture.autoDetectChanges();
    await settle(fixture);
    await nextFrame();

    const editor = cmp.editor() as Editor;
    expect(getRteHtml(editor)).toBe('<p>cedo</p>');
    expect(host.writes).toBe(0);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.view.dom.classList.contains('ProseMirror')).toBe(true);
  });

  it.each([
    ['', true],
    ['   ', true],
    ['<p></p>', true],
    [' <P> </P>\n', true],
    ['<p><br></p>', false], // o <br> vira hardBreak
    ['<p>x</p>', false],
    ['<h1></h1>', false],
  ])(
    'isEmpty de %j é o mesmo antes e depois da criação',
    async (value, empty) => {
      TestBed.configureTestingModule({});
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.html.set(value);
      fixture.componentRef.changeDetectorRef.detectChanges();
      const cmp = fixture.componentInstance.cmp();
      expect(cmp.isEmpty()).toBe(empty);

      fixture.autoDetectChanges();
      await settle(fixture);
      expect(cmp.editor()).not.toBeNull();
      expect(cmp.isEmpty()).toBe(empty);
    },
  );
});
