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
import { getHtmlSchema, parseSrcset } from '@cds/rte-core';
import { getRteHtml } from '@cds/rte-core/extensions';
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
  readMediaUrlRules,
  sameMediaSession,
} from './editor/media-session';
import { validDoc } from './testing-support/core-docs';
import {
  createTestEditor,
  destroyTestEditors,
} from './testing-support/editors';
import { FC_RUNS, fcOptions } from './testing-support/media-urls';
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

  it('endereço com espaço nas pontas conta pelo canônico: sem delta', async () => {
    const s = await setup(`<p>a</p>${IMG('/a.png')}`);
    const before = s.host.cmp().mediaSession();
    selectNode(s.editor, 'rtImage');
    expect(
      s.editor.commands.updateAttributes('rtImage', { src: ' /a.png	' }),
    ).toBe(true);
    expect(
      s.editor.state.doc.nodeAt(nodePos(s.editor.state.doc, 'rtImage'))?.attrs[
        'src'
      ],
    ).toBe(' /a.png	');
    expect(s.host.changes).toEqual([]);
    expect(s.host.cmp().mediaSession()).toEqual(before);
    expect(s.host.cmp().mediaSession().removed).toEqual([]);
  });

  it('endereço que a regra recusa (javascript:) não conta', async () => {
    const s = await setup(`<p>a</p>${IMG('/a.png')}`);
    const { state } = s.editor;
    const pos = nodePos(state.doc, 'rtImage');
    const node = state.doc.nodeAt(pos);
    s.editor.view.dispatch(
      state.tr.setNodeMarkup(pos, undefined, {
        ...node?.attrs,
        src: 'javascript:alert(1)',
      }),
    );
    expect(s.host.cmp().mediaSession()).toEqual({
      current: [],
      added: [],
      removed: ['/a.png'],
    });
    expect(s.host.changes).toEqual([{ added: [], removed: ['/a.png'] }]);
    expect(s.host.log).toEqual(['ready', 'value', 'media']);
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
    // Conta só as entradas externas na zona durante o comando síncrono; as
    // aninhadas (o agendamento do `tick` do zone.js ao sair da zona) não.
    const zone = TestBed.inject(NgZone);
    const run = zone.run.bind(zone);
    let armed = false;
    let depth = 0;
    let runs = 0;
    vi.spyOn(zone, 'run').mockImplementation(
      <T>(fn: (...a: unknown[]) => T) => {
        if (armed && depth === 0) runs += 1;
        depth += 1;
        try {
          return run(fn);
        } finally {
          depth -= 1;
        }
      },
    );
    const count = (command: () => void): number => {
      runs = 0;
      armed = true;
      try {
        command();
      } finally {
        armed = false;
      }
      return runs;
    };
    expect(count(() => caretInFirstText(s.editor))).toBe(0); // só seleção
    expect(count(() => s.editor.commands.insertContent('x'))).toBe(1); // `value`
    expect(
      count(() => s.editor.commands.setImage({ src: '/n.png', alt: 'N' })),
    ).toBe(2); // `value` + `mediaChange`
    await settle(s.fixture);
    expect(s.host.changes).toEqual([{ added: ['/n.png'], removed: [] }]);
    noNg010x(s.error);
  });
});

// ---------------------------------------------------------------------------
// Propriedade: incremental = endereços do HTML canônico

type AttrKey = 'src' | 'srcset' | 'alt' | 'poster';

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
  | {
      op: 'attrStep';
      n: number;
      type: 'rtImage' | 'rtVideo';
      key: AttrKey;
      value: string | null;
    }
  | { op: 'bold'; a: number; b: number }
  | {
      op: 'wrap';
      onMedia: boolean;
      n: number;
      kind: 'blockquote' | 'bulletList';
    }
  | { op: 'lift'; onMedia: boolean; n: number }
  | { op: 'setContent'; doc: JSONContent }
  | { op: 'undo' }
  | { op: 'redo' }
  | { op: 'insertHtml'; at: number; html: string };

/** Válidos, com espaço/TAB nas pontas (o canônico apara) e recusados. */
const url = fc.constantFrom(
  '/a.png',
  '/b.png',
  '/c.png',
  '/d.webm',
  '/t.vtt',
  'https://x.test/e.png',
  ' /a.png',
  '\t/b.png ',
  '\n/c.png\t',
  'javascript:alert(1)',
  'data:image/png;base64,AAAA',
  '',
);
const srcset = fc.tuple(url, url).map(([a, b]) => `${a} 1x, ${b} 2x`);

const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  fc.record({
    op: fc.constant('setImage' as const),
    at: fc.nat(),
    src: url,
    alt: fc.option(fc.constantFrom('A', ''), { nil: null }),
    srcset: fc.option(srcset, { nil: null }),
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
  // `AttrStep` (mapa vazio com `pos`) com valores crus: inclusive recusados,
  // com espaço nas pontas e `alt: null`
  fc.oneof(
    fc.record({
      op: fc.constant('attrStep' as const),
      n: fc.nat(),
      type: fc.constant('rtImage' as const),
      key: fc.constant('src' as const),
      value: url,
    }),
    fc.record({
      op: fc.constant('attrStep' as const),
      n: fc.nat(),
      type: fc.constant('rtImage' as const),
      key: fc.constant('srcset' as const),
      value: fc.option(srcset, { nil: null }),
    }),
    fc.record({
      op: fc.constant('attrStep' as const),
      n: fc.nat(),
      type: fc.constant('rtImage' as const),
      key: fc.constant('alt' as const),
      value: fc.option(fc.constant('A'), { nil: null }),
    }),
    fc.record({
      op: fc.constant('attrStep' as const),
      n: fc.nat(),
      type: fc.constant('rtVideo' as const),
      key: fc.constantFrom('src' as const, 'poster' as const),
      value: fc.option(url, { nil: null }),
    }),
  ),
  // passos de marca (mapa vazio com `from`/`to`)
  fc.record({ op: fc.constant('bold' as const), a: fc.nat(), b: fc.nat() }),
  // `ReplaceAroundStep` (envolver e levantar), sobre texto ou mídia
  fc.record({
    op: fc.constant('wrap' as const),
    onMedia: fc.boolean(),
    n: fc.nat(),
    kind: fc.constantFrom('blockquote' as const, 'bulletList' as const),
  }),
  fc.record({
    op: fc.constant('lift' as const),
    onMedia: fc.boolean(),
    n: fc.nat(),
  }),
  // troca do documento inteiro no meio da sequência
  fc.record({
    op: fc.constant('setContent' as const),
    doc: validDoc as fc.Arbitrary<JSONContent>,
  }),
  fc.constant({ op: 'undo' as const }),
  fc.constant({ op: 'redo' as const }),
  fc.record({
    op: fc.constant('insertHtml' as const),
    at: fc.nat(),
    html: fc
      .tuple(url, url, url)
      .map(
        ([a, b, c]) =>
          `<p>t</p>${IMG(a, ` srcset="${b} 2x"`)}<figure class="rt-figure rt-figure--video"><video src="${b}" poster="${c}" controls=""><track kind="captions" src="${c}" srclang="en" label="E"></video></figure>`,
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

function positionsOf(doc: ProseMirrorNode, types: readonly string[]) {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (types.includes(node.type.name)) out.push(pos);
  });
  return out;
}

const MEDIA_TYPES = ['rtImage', 'rtVideo', 'rtEmbed'];

/** Seleciona a `n`-ésima mídia (`NodeSelection`); `false` se não houver. */
function selectMedia(editor: Editor, n: number, types = MEDIA_TYPES): boolean {
  const { state } = editor;
  const all = positionsOf(state.doc, types);
  if (!all.length) return false;
  const pos = all[n % all.length] as number;
  editor.view.dispatch(
    state.tr.setSelection(NodeSelection.create(state.doc, pos)),
  );
  return true;
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
    case 'updateImage':
      if (selectMedia(editor, cmd.n, ['rtImage'])) {
        editor.commands.updateImage({ src: cmd.src });
      }
      return;
    case 'deleteMedia':
      if (selectMedia(editor, cmd.n)) editor.commands.deleteSelection();
      return;
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
        // tipo exportado): nada foi despachado; a execução é descartada
        if (!(e instanceof Error) || e.constructor.name !== 'TransformError') {
          throw e;
        }
        fc.pre(false);
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
      const all = positionsOf(state.doc, [cmd.type]);
      if (!all.length) return;
      const pos = all[cmd.n % all.length] as number;
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
    case 'wrap':
      if (!cmd.onMedia || !selectMedia(editor, cmd.n)) caretAt(editor, cmd.n);
      if (cmd.kind === 'blockquote') editor.commands.wrapIn('blockquote');
      else editor.commands.toggleBulletList();
      return;
    case 'lift':
      if (!cmd.onMedia || !selectMedia(editor, cmd.n)) caretAt(editor, cmd.n);
      editor.commands.lift('blockquote');
      return;
    case 'setContent':
      editor.commands.setContent(cmd.doc);
      return;
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

/**
 * Oráculo independente do rastreador: os endereços que o HTML canônico
 * (`getRteHtml`) escreve em `img[src]`, `img[srcset]`, `video[src]`,
 * `video[poster]` e `track[src]`.
 */
function urlsInHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const attr = (selector: string, name: string) =>
    doc.querySelectorAll(selector).forEach((el) => {
      const value = el.getAttribute(name);
      if (value) out.push(value);
    });
  attr('img[src]', 'src');
  attr('video[src]', 'src');
  attr('video[poster]', 'poster');
  attr('track[src]', 'src');
  doc.querySelectorAll('img[srcset]').forEach((el) => {
    for (const c of parseSrcset(el.getAttribute('srcset') ?? '') ?? []) {
      out.push(c.url);
    }
  });
  return sorted(out);
}

function missingAltOf(doc: ProseMirrorNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === 'rtImage' && node.attrs['alt'] === null) n += 1;
  });
  return n;
}

const RULES = readMediaUrlRules(getHtmlSchema({}));

describe('sessão de mídia: propriedade (R9)', () => {
  it('as regras de URL vêm do esquema', () => {
    expect(RULES).not.toBeNull();
  });

  it(
    'incremental = endereços do HTML canônico depois de cada transação',
    () => {
      fc.assert(
        fc.property(
          validDoc,
          fc.array(cmdArb, { minLength: 1, maxLength: 12 }),
          (json, cmds) => {
            destroyTestEditors();
            const editor = createTestEditor('');
            editor.commands.setContent(json, { emitUpdate: false });
            const tracker = new RteMediaTracker(editor.state.doc, RULES);
            const base = new Set(urlsInHtml(getRteHtml(editor)));
            expect(sorted(countMedia(editor.state.doc, RULES).keys())).toEqual(
              sorted(base),
            );
            const seen = new Set<string>();
            let previous = sorted(base);
            let html = getRteHtml(editor);
            let deltas: ReturnType<RteMediaTracker['apply']>[] = [];
            editor.on(
              'transaction',
              ({ transaction, appendedTransactions }) => {
                const delta = tracker.apply([
                  transaction,
                  ...appendedTransactions,
                ]);
                const next = getRteHtml(editor);
                // todo delta não nulo vem numa transação que muda o `value`
                if (delta) expect(next).not.toBe(html);
                html = next;
                deltas.push(delta);
              },
            );
            for (const cmd of cmds) {
              deltas = [];
              run(editor, cmd);
              const current = urlsInHtml(getRteHtml(editor));
              for (const u of current) seen.add(u);
              const session = tracker.session();
              expect(session.current).toEqual(current);
              expect(session.added).toEqual(
                current.filter((u) => !base.has(u)),
              );
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
    },
    120_000 * Math.max(1, FC_RUNS / 100),
  );

  it('mediaUrlsOf ignora embeds; sameMediaSession compara conteúdo', () => {
    const editor = createTestEditor('<p>x</p>');
    editor.commands.setTextSelection(1);
    editor.commands.setEmbed(YOUTUBE, { caption: '' });
    let embed: ProseMirrorNode | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'rtEmbed') embed = node;
    });
    expect(embed).not.toBeNull();
    expect(mediaUrlsOf(embed as unknown as ProseMirrorNode, RULES)).toEqual([]);
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

  /** Editor, rastreador e a posição do texto do parágrafo `p1000`. */
  function big(images: boolean) {
    const editor = createTestEditor('');
    editor.commands.setContent(bigDoc(images), { emitUpdate: false });
    expect(countMedia(editor.state.doc, RULES).size).toBe(images ? 200 : 0);
    const tracker = new RteMediaTracker(editor.state.doc, RULES);
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at >= 0) return false;
      if (node.isTextblock && node.textContent === 'p1000') at = pos + 1;
      return false;
    });
    return { editor, tracker, at };
  }

  function probe(tracker: RteMediaTracker, tr: Transaction) {
    mediaTrackerProbe.visited = 0;
    const delta = tracker.apply([tr]);
    return { delta, visited: mediaTrackerProbe.visited };
  }

  it('visited independe do número de mídias (inserir e apagar texto)', () => {
    const results = [true, false].map((images) => {
      const { editor, tracker, at } = big(images);
      const insertTr = editor.state.tr.insertText('z', at);
      const insert = probe(tracker, insertTr);
      editor.view.dispatch(insertTr);
      tracker.reset(editor.state.doc);
      const del = probe(tracker, editor.state.tr.delete(at, at + 1));
      expect(insert.delta).toBeNull();
      expect(del.delta).toBeNull();
      return [insert.visited, del.visited];
    });
    const [withImages, without] = results as [number[], number[]];
    expect(withImages[0]).toBeGreaterThan(0);
    expect(withImages[1]).toBeGreaterThan(0);
    expect(withImages).toEqual(without);
    expect(Math.max(...withImages)).toBeLessThan(10);
  });

  it('apagar uma imagem visita só a vizinhança', () => {
    const { editor, tracker, at } = big(true);
    // a imagem `/i1000.png` vem logo depois do parágrafo `p1000`
    const pos = at - 1 + editor.state.doc.resolve(at).parent.nodeSize;
    expect(editor.state.doc.nodeAt(pos)?.attrs['src']).toBe('/i1000.png');
    const { delta, visited } = probe(
      tracker,
      editor.state.tr.delete(pos, pos + 1),
    );
    expect(delta).toEqual({ added: [], removed: ['/i1000.png'] });
    expect(visited).toBeGreaterThan(0);
    expect(visited).toBeLessThan(10);
  });
});
