import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  type RteMediaChange,
  type RteMediaSession,
} from '@cds/rte-angular';
import type { Editor, JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  Plugin,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPendingSelection } from './dialogs/ui-extension';
import {
  RteMediaTracker,
  countMedia,
  mediaTrackerProbe,
  mediaUrlsOf,
  sameMediaSession,
} from './editor/media-session';
import { validDoc } from './testing-support/core-docs';
import {
  createTestEditor,
  destroyTestEditors,
} from './testing-support/editors';
import { fcOptions } from './testing-support/media-urls';
import { settle } from './testing-support/render';
import { RTE_TEST_MODE } from './testing-support/test-mode';

// Spec 05c1, Tarefa 9: sessão de mídia (R9, R13 parcial; V13, V17).

const IMG = (src: string, extra = '') =>
  `<figure class="rt-figure rt-figure--center"><img src="${src}" alt="A"${extra}></figure>`;
const EMPTY: RteMediaSession = { current: [], added: [], removed: [] };
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

@Component({
  selector: 'rte-test-media-session',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="onValue()"
    (mediaChange)="onMedia($event)"
    (editorReady)="log.push('ready')"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p></p>');
  readonly log: string[] = [];
  readonly changes: RteMediaChange[] = [];
  readonly zones: boolean[] = [];
  readonly cmp = viewChild.required(RteEditor);

  onValue(): void {
    this.log.push('value');
  }

  onMedia(change: RteMediaChange): void {
    this.log.push('media');
    this.changes.push(change);
    this.zones.push(NgZone.isInAngularZone());
  }
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  editor: Editor;
  error: ReturnType<typeof vi.spyOn>;
}

async function setup(doc = '<p>ab</p>'): Promise<Setup> {
  const error = vi.spyOn(console, 'error');
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.value.set(doc);
  fixture.autoDetectChanges();
  await settle(fixture);
  return { fixture, host, editor: host.cmp().editor() as Editor, error };
}

function noNg010x(error: Setup['error']): void {
  const messages: string[] = error.mock.calls.map((args: unknown[]) =>
    args.map(String).join(' '),
  );
  expect(messages.filter((m) => /NG010[01]/.test(m))).toEqual([]);
}

/** Posição do `n`-ésimo nó do tipo `type` (ordem do documento). */
function nodePos(doc: ProseMirrorNode, type: string, n = 0): number {
  let seen = 0;
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === type && seen++ === n) found = pos;
    return true;
  });
  if (found < 0) throw new Error(`sem ${type} #${n}`);
  return found;
}

function selectNode(editor: Editor, type: string, n = 0): void {
  const { state } = editor;
  editor.view.dispatch(
    state.tr.setSelection(
      NodeSelection.create(state.doc, nodePos(state.doc, type, n)),
    ),
  );
}

/** Cursor no fim do primeiro bloco de texto. */
function caretInFirstText(editor: Editor): void {
  const { state } = editor;
  let at = -1;
  state.doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (node.isTextblock) at = pos + 1 + node.content.size;
    return true;
  });
  editor.view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, at)),
  );
}

function newUndoStep(editor: Editor): void {
  editor.view.dispatch(closeHistory(editor.state.tr));
}

afterEach(() => {
  TestBed.resetTestingModule();
  destroyTestEditors();
  vi.restoreAllMocks();
});

describe('sessão de mídia: tabela (R9)', () => {
  it('nada antes do editorReady; base da criação sem emitir', async () => {
    const fixture = TestBed.createComponent(RteEditor);
    expect(fixture.componentInstance.mediaSession()).toEqual(EMPTY);
    fixture.destroy();

    const s = await setup(`${IMG('/b.png')}${IMG('/a.png')}`);
    expect(s.host.log).toEqual(['ready']);
    expect(s.host.changes).toEqual([]);
    expect(s.host.cmp().mediaSession()).toEqual({
      current: ['/a.png', '/b.png'],
      added: [],
      removed: [],
    });
  });

  it('inserir, trocar o endereço e desfazer: delta e líquido', async () => {
    const s = await setup();
    const cmp = s.host.cmp();
    caretInFirstText(s.editor);
    expect(s.editor.commands.setImage({ src: '/a.png', alt: 'A' })).toBe(true);
    expect(s.host.changes).toEqual([{ added: ['/a.png'], removed: [] }]);
    expect(cmp.mediaSession()).toEqual({
      current: ['/a.png'],
      added: ['/a.png'],
      removed: [],
    });

    newUndoStep(s.editor);
    selectNode(s.editor, 'rtImage');
    expect(s.editor.commands.updateImage({ src: '/b.png' })).toBe(true);
    expect(s.host.changes[1]).toEqual({
      added: ['/b.png'],
      removed: ['/a.png'],
    });
    expect(cmp.mediaSession()).toEqual({
      current: ['/b.png'],
      added: ['/b.png'],
      removed: ['/a.png'],
    });

    expect(s.editor.commands.undo()).toBe(true);
    expect(s.host.changes[2]).toEqual({
      added: ['/a.png'],
      removed: ['/b.png'],
    });
    expect(cmp.mediaSession()).toEqual({
      current: ['/a.png'],
      added: ['/a.png'],
      removed: ['/b.png'],
    });
    expect(s.host.changes).toHaveLength(3);
    expect(Object.isFrozen(cmp.mediaSession())).toBe(true);
    expect(Object.isFrozen(cmp.mediaSession().current)).toBe(true);
    expect(Object.isFrozen(s.host.changes[2]?.added)).toBe(true);
  });

  it('mesmo endereço em duas imagens: só sai quando as duas saem', async () => {
    const s = await setup(`<p>x</p>${IMG('/d.png')}${IMG('/d.png')}`);
    selectNode(s.editor, 'rtImage', 1);
    expect(s.editor.commands.deleteSelection()).toBe(true);
    expect(s.host.changes).toEqual([]);
    expect(s.host.cmp().mediaSession().current).toEqual(['/d.png']);
    selectNode(s.editor, 'rtImage', 0);
    expect(s.editor.commands.deleteSelection()).toBe(true);
    expect(s.host.changes).toEqual([{ added: [], removed: ['/d.png'] }]);
    expect(s.host.cmp().mediaSession()).toEqual({
      current: [],
      added: [],
      removed: ['/d.png'],
    });
  });

  it('srcset, pôster e faixa contam; embed não conta', async () => {
    const s = await setup('<p>x</p>');
    caretInFirstText(s.editor);
    expect(
      s.editor.commands.insertContent(
        `${IMG('/i.png', ' srcset="/s1.png 1x, /s2.png 2x"')}` +
          '<figure class="rt-figure rt-figure--video"><video src="/v.webm" poster="/p.png" controls=""><track kind="captions" src="/t.vtt" srclang="en" label="English"></video></figure>',
      ),
    ).toBe(true);
    expect(s.host.changes).toEqual([
      {
        added: ['/i.png', '/p.png', '/s1.png', '/s2.png', '/t.vtt', '/v.webm'],
        removed: [],
      },
    ]);
    caretInFirstText(s.editor);
    const values = s.host.log.filter((e) => e === 'value').length;
    expect(s.editor.commands.setEmbed(YOUTUBE, { caption: '' })).toBe(true);
    expect(s.host.log.filter((e) => e === 'value').length).toBe(values + 1);
    expect(s.host.changes).toHaveLength(1);
    expect(s.host.cmp().mediaSession().current).toEqual([
      '/i.png',
      '/p.png',
      '/s1.png',
      '/s2.png',
      '/t.vtt',
      '/v.webm',
    ]);
  });

  it('seleção, meta (setPendingSelection) e texto não emitem', async () => {
    const s = await setup(`<p>ab</p>${IMG('/a.png')}`);
    const before = s.host.cmp().mediaSession();
    selectNode(s.editor, 'rtImage');
    caretInFirstText(s.editor);
    setPendingSelection(s.editor, { from: 1, to: 2 });
    setPendingSelection(s.editor, null);
    s.editor.commands.insertContent('xyz');
    expect(s.host.log).toEqual(['ready', 'value']);
    expect(s.host.changes).toEqual([]);
    expect(s.host.cmp().mediaSession()).toBe(before);
  });

  it('ordem: valueChange antes de mediaChange, na zona', async () => {
    const s = await setup();
    caretInFirstText(s.editor);
    s.editor.commands.setImage({ src: '/a.png', alt: 'A' });
    expect(s.host.log).toEqual(['ready', 'value', 'media']);
    if (TestBed.inject(RTE_TEST_MODE) === 'zone') {
      expect(s.host.zones).toEqual([true]);
    }
  });

  it('carga externa: nova base, sem emissão', async () => {
    const s = await setup(`<p>a</p>${IMG('/a.png')}`);
    caretInFirstText(s.editor);
    s.editor.commands.insertContent('x');
    s.host.value.set(`<p>novo</p>${IMG('/e.png')}`);
    await settle(s.fixture);
    expect(s.host.changes).toEqual([]);
    expect(s.host.cmp().mediaSession()).toEqual({
      current: ['/e.png'],
      added: [],
      removed: [],
    });
    selectNode(s.editor, 'rtImage');
    s.editor.commands.deleteSelection();
    expect(s.host.changes).toEqual([{ added: [], removed: ['/e.png'] }]);
    expect(s.host.cmp().mediaSession()).toEqual({
      current: [],
      added: [],
      removed: ['/e.png'],
    });
  });

  it('Review Focus 4: appendTransaction que desfaz a inserção → lote líquido vazio', async () => {
    const s = await setup();
    s.editor.registerPlugin(
      new Plugin({
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((tr) => tr.docChanged)) return null;
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === 'rtImage' &&
              node.attrs['src'] === '/x.png'
            ) {
              tr.delete(
                tr.mapping.map(pos),
                tr.mapping.map(pos + node.nodeSize),
              );
            }
          });
          return tr.docChanged ? tr : null;
        },
      }),
    );
    caretInFirstText(s.editor);
    s.editor.commands.setImage({ src: '/x.png', alt: 'X' });
    expect(s.host.changes).toEqual([]);
    expect(s.host.cmp().mediaSession().current).not.toContain('/x.png');
    expect(s.editor.getHTML()).not.toContain('/x.png');
  });
});

describe('sessão de mídia: zona e detecção de mudanças (V17, R13)', () => {
  it('transação sem delta não chama NgZone.run do rastreador', async () => {
    const s = await setup(`<p>ab</p>${IMG('/a.png')}`);
    // Conta só as entradas na zona feitas pelo ouvinte de transação do
    // editor; as do próprio Angular (agendamento do `tick`) ficam de fora.
    const zone = TestBed.inject(NgZone);
    const run = zone.run.bind(zone);
    let fromEditor = 0;
    vi.spyOn(zone, 'run').mockImplementation(
      <T>(fn: (...a: unknown[]) => T) => {
        if (/onTransaction/.test(new Error().stack ?? '')) fromEditor += 1;
        return run(fn);
      },
    );
    caretInFirstText(s.editor);
    expect(fromEditor).toBe(0); // só seleção
    s.editor.commands.insertContent('x');
    expect(fromEditor).toBe(1); // só o `value`
    fromEditor = 0;
    s.editor.commands.setImage({ src: '/n.png', alt: 'N' });
    expect(fromEditor).toBe(2); // `value` + `mediaChange`
    await settle(s.fixture);
    expect(s.host.changes).toEqual([{ added: ['/n.png'], removed: [] }]);
    noNg010x(s.error);
  });
});

// ---------------------------------------------------------------------------
// Propriedade: incremental = recontagem

type Cmd =
  | {
      op: 'setImage';
      at: number;
      src: string;
      alt: string | null;
      srcset: string | null;
    }
  | { op: 'updateImage'; n: number; src: string }
  | { op: 'deleteMedia'; n: number }
  | { op: 'deleteRange'; a: number; b: number }
  | {
      op: 'setVideo';
      at: number;
      src: string;
      poster: string | null;
      tracks: readonly string[];
    }
  | { op: 'attrStep'; n: number; key: 'src' | 'alt'; value: string | null }
  | { op: 'bold'; a: number; b: number }
  | { op: 'undo' }
  | { op: 'redo' }
  | { op: 'insertHtml'; at: number; html: string };

const url = fc.constantFrom(
  '/a.png',
  '/b.png',
  '/c.png',
  '/d.webm',
  '/t.vtt',
  'https://x.test/e.png',
);

const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  fc.record({
    op: fc.constant('setImage' as const),
    at: fc.nat(),
    src: url,
    alt: fc.option(fc.constantFrom('A', ''), { nil: null }),
    srcset: fc.option(
      fc.tuple(url, url).map(([a, b]) => `${a} 1x, ${b} 2x`),
      { nil: null },
    ),
  }),
  fc.record({ op: fc.constant('updateImage' as const), n: fc.nat(), src: url }),
  fc.record({ op: fc.constant('deleteMedia' as const), n: fc.nat() }),
  fc.record({
    op: fc.constant('deleteRange' as const),
    a: fc.nat(),
    b: fc.nat(),
  }),
  fc.record({
    op: fc.constant('setVideo' as const),
    at: fc.nat(),
    src: url,
    poster: fc.option(url, { nil: null }),
    tracks: fc.array(url, { maxLength: 3 }),
  }),
  // `AttrStep` (mapa vazio com `pos`), inclusive `alt: null`
  fc.oneof(
    fc.record({
      op: fc.constant('attrStep' as const),
      n: fc.nat(),
      key: fc.constant('src' as const),
      value: url,
    }),
    fc.record({
      op: fc.constant('attrStep' as const),
      n: fc.nat(),
      key: fc.constant('alt' as const),
      value: fc.option(fc.constant('A'), { nil: null }),
    }),
  ),
  // passos de marca (mapa vazio com `from`/`to`)
  fc.record({ op: fc.constant('bold' as const), a: fc.nat(), b: fc.nat() }),
  fc.constant({ op: 'undo' as const }),
  fc.constant({ op: 'redo' as const }),
  fc.record({
    op: fc.constant('insertHtml' as const),
    at: fc.nat(),
    html: fc
      .tuple(url, url)
      .map(
        ([a, b]) =>
          `<p>t</p>${IMG(a)}<figure class="rt-figure rt-figure--video"><video src="${b}" controls=""></video></figure>`,
      ),
  }),
);

function caretAt(editor: Editor, at: number): void {
  const { state } = editor;
  const pos = at % (state.doc.content.size + 1);
  editor.view.dispatch(
    state.tr.setSelection(TextSelection.near(state.doc.resolve(pos))),
  );
}

function mediaPositions(doc: ProseMirrorNode): number[] {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (['rtImage', 'rtVideo', 'rtEmbed'].includes(node.type.name))
      out.push(pos);
  });
  return out;
}

function run(editor: Editor, cmd: Cmd): void {
  const { state } = editor;
  switch (cmd.op) {
    case 'setImage':
      caretAt(editor, cmd.at);
      editor.commands.setImage({
        src: cmd.src,
        alt: cmd.alt,
        srcset: cmd.srcset,
      });
      return;
    case 'updateImage': {
      const images: number[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'rtImage') images.push(pos);
      });
      if (!images.length) return;
      const pos = images[cmd.n % images.length] as number;
      editor.view.dispatch(
        state.tr.setSelection(NodeSelection.create(state.doc, pos)),
      );
      editor.commands.updateImage({ src: cmd.src });
      return;
    }
    case 'deleteMedia': {
      const all = mediaPositions(state.doc);
      if (!all.length) return;
      const pos = all[cmd.n % all.length] as number;
      editor.view.dispatch(
        state.tr.setSelection(NodeSelection.create(state.doc, pos)),
      );
      editor.commands.deleteSelection();
      return;
    }
    case 'deleteRange': {
      const size = state.doc.content.size + 1;
      const a = cmd.a % size;
      const b = cmd.b % size;
      try {
        editor.commands.deleteRange({
          from: Math.min(a, b),
          to: Math.max(a, b),
        });
      } catch (e) {
        // intervalo que o ProseMirror não sabe apagar (`TransformError`, sem
        // tipo exportado): nada é despachado
        if (!(e instanceof Error) || e.constructor.name !== 'TransformError') {
          throw e;
        }
      }
      return;
    }
    case 'setVideo':
      caretAt(editor, cmd.at);
      editor.commands.setVideo({
        src: cmd.src,
        poster: cmd.poster,
        tracks: cmd.tracks.map((src, i) => ({
          kind: 'captions' as const,
          src,
          srclang: 'en',
          label: `T${i}`,
        })),
      });
      return;
    case 'attrStep': {
      const images: number[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'rtImage') images.push(pos);
      });
      if (!images.length) return;
      const pos = images[cmd.n % images.length] as number;
      editor.view.dispatch(state.tr.setNodeAttribute(pos, cmd.key, cmd.value));
      return;
    }
    case 'bold': {
      const size = state.doc.content.size + 1;
      const a = cmd.a % size;
      const b = cmd.b % size;
      const bold = state.schema.marks['bold'];
      if (!bold) throw new Error('sem a marca bold');
      editor.view.dispatch(
        state.tr.addMark(Math.min(a, b), Math.max(a, b), bold.create()),
      );
      return;
    }
    case 'undo':
      editor.commands.undo();
      return;
    case 'redo':
      editor.commands.redo();
      return;
    case 'insertHtml':
      caretAt(editor, cmd.at);
      editor.commands.insertContent(cmd.html);
      return;
  }
}

const sorted = (xs: Iterable<string>) =>
  [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function missingAltOf(doc: ProseMirrorNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === 'rtImage' && node.attrs['alt'] === null) n += 1;
  });
  return n;
}

describe('sessão de mídia: propriedade (R9)', () => {
  it('incremental = recontagem completa depois de cada transação', () => {
    fc.assert(
      fc.property(
        validDoc,
        fc.array(cmdArb, { minLength: 1, maxLength: 12 }),
        (json, cmds) => {
          destroyTestEditors();
          const editor = createTestEditor('');
          editor.commands.setContent(json, { emitUpdate: false });
          const tracker = new RteMediaTracker(editor.state.doc);
          const base = new Set(countMedia(editor.state.doc).keys());
          const seen = new Set<string>();
          let previous = sorted(base);
          let deltas: ReturnType<RteMediaTracker['apply']>[] = [];
          editor.on('transaction', ({ transaction, appendedTransactions }) => {
            deltas.push(tracker.apply([transaction, ...appendedTransactions]));
          });
          for (const cmd of cmds) {
            deltas = [];
            run(editor, cmd);
            const current = sorted(countMedia(editor.state.doc).keys());
            for (const u of current) seen.add(u);
            const session = tracker.session();
            expect(session.current).toEqual(current);
            expect(session.added).toEqual(current.filter((u) => !base.has(u)));
            expect(session.removed).toEqual(
              sorted([...base, ...seen]).filter((u) => !current.includes(u)),
            );
            expect(tracker.missingAlt()).toBe(missingAltOf(editor.state.doc));
            // o delta líquido de todas as transações do comando
            const added = current.filter((u) => !previous.includes(u));
            const removed = previous.filter((u) => !current.includes(u));
            const emitted = deltas.filter((d) => d !== null);
            if (!added.length && !removed.length) expect(emitted).toEqual([]);
            else {
              expect(emitted).toHaveLength(1);
              expect(emitted[0]).toEqual({ added, removed });
            }
            previous = current;
          }
        },
      ),
      fcOptions(),
    );
  }, 120_000);

  it('mediaUrlsOf ignora embeds; sameMediaSession compara conteúdo', () => {
    const editor = createTestEditor('<p>x</p>');
    editor.commands.setTextSelection(1);
    editor.commands.setEmbed(YOUTUBE, { caption: '' });
    let embed: ProseMirrorNode | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'rtEmbed') embed = node;
    });
    expect(embed).not.toBeNull();
    expect(mediaUrlsOf(embed as unknown as ProseMirrorNode)).toEqual([]);
    expect(
      sameMediaSession(
        { current: ['/a'], added: [], removed: [] },
        { current: ['/a'], added: [], removed: [] },
      ),
    ).toBe(true);
    expect(
      sameMediaSession(
        { current: ['/a'], added: [], removed: [] },
        { current: ['/a'], added: ['/a'], removed: [] },
      ),
    ).toBe(false);
  });
});

describe('sessão de mídia: incremental (pré-voo 12 e 17)', () => {
  function bigDoc(images: boolean): JSONContent {
    const content: JSONContent[] = [];
    for (let i = 0; i < 2000; i++) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: `p${i}` }],
      });
      if (images && i % 10 === 0) {
        content.push({
          type: 'rtImage',
          attrs: { src: `/i${i}.png`, alt: 'x' },
        });
      }
    }
    return { type: 'doc', content };
  }

  function visitedFor(images: boolean): number {
    const editor = createTestEditor('');
    editor.commands.setContent(bigDoc(images), { emitUpdate: false });
    expect(countMedia(editor.state.doc).size).toBe(images ? 200 : 0);
    const tracker = new RteMediaTracker(editor.state.doc);
    // o parágrafo `p1000`
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at >= 0) return false;
      if (node.isTextblock && node.textContent === 'p1000') at = pos + 1;
      return false;
    });
    const tr: Transaction = editor.state.tr.insertText('z', at);
    mediaTrackerProbe.visited = 0;
    expect(tracker.apply([tr])).toBeNull();
    return mediaTrackerProbe.visited;
  }

  it('visited independe do número de mídias', () => {
    const withImages = visitedFor(true);
    const without = visitedFor(false);
    expect(withImages).toBeGreaterThan(0);
    expect(withImages).toBe(without);
    expect(withImages).toBeLessThan(10);
  });
});
