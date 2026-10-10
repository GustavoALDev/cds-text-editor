import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  RteEditor,
  RteUploadError,
  type RteUploadConfig,
  type RteUploadErrorEvent,
} from '@comodeviaser/rte-angular';
import { getHtmlSchema } from '@comodeviaser/rte-core';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
import { validateHtml } from '@comodeviaser/rte-core/html';
import type { Editor } from '@tiptap/core';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './testing-support/fake-upload-adapter';
import {
  FC_RUNS,
  fcOptions,
  generatedMediaUrl,
} from './testing-support/media-urls';
import {
  installObjectUrlProbe,
  type ObjectUrlProbe,
} from './testing-support/object-url';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';
import { whenUploadReady } from './testing-support/upload-runtime';

// Spec 05c2a, Tarefa 12: segurança do envio (R11), miniatura local (E16, R10)
// e nenhuma requisição sem gesto (R3).

@Component({
  selector: 'rte-test-upload-security-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [upload]="upload()"
    (uploadError)="errors.push($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p>ab</p>');
  readonly upload = signal<RteUploadConfig | null>(null);
  readonly errors: RteUploadErrorEvent[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  cmp: RteEditor;
  editor: Editor;
  adapter: FakeUploadAdapter;
}

async function setup(preview = false): Promise<Setup> {
  const adapter = createFakeUploadAdapter();
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.upload.set({ adapter, preview });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  await whenUploadReady(cmp);
  await settle(fixture);
  return { fixture, host, cmp, editor: cmp.editor() as Editor, adapter };
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const webm = (name: string) => new File(['v'], name, { type: 'video/webm' });

async function drain(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await settle(fixture);
}

const LOCAL = /blob:|data:/i;

function assertSafe(s: Setup): void {
  const html = getRteHtml(s.editor);
  expect(validateHtml(html, getHtmlSchema({}), { mode: 'canonical' })).toEqual(
    [],
  );
  expect(html).not.toMatch(LOCAL);
  expect(s.cmp.value()).not.toMatch(LOCAL);
  const session = s.cmp.mediaSession();
  for (const list of [session.current, session.added, session.removed]) {
    for (const src of list) expect(src).not.toMatch(LOCAL);
  }
  for (const e of s.host.errors) {
    expect(`${e.fileName} ${e.type} ${e.reason}`).not.toMatch(LOCAL);
  }
}

let restoreDialog: () => void;
let restorePopover: () => void;
let probe: ObjectUrlProbe;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
  probe = installObjectUrlProbe();
});
afterEach(() => {
  TestBed.resetTestingModule();
  probe.restore();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

const HOSTILE_SET = fc.constantFrom(
  'javascript:alert(1) 1x',
  'data:image/png;base64,AAAA 1x',
  'blob:https://x.test/abc 2x',
  'http://evil.test/a.png 1x',
  '/ok.png 1x, javascript:x 2x',
  '',
  '/ok.png 1x',
);
const DIMENSION = fc.constantFrom(-5, 0, 1.5, 1e9, 10001, 640, Number.NaN);

const RESPONSE = fc.record(
  {
    url: fc.oneof(
      generatedMediaUrl('png'),
      fc.constantFrom('/ok.png', 'data:image/png;base64,AAAA', 'blob:x'),
    ),
    width: DIMENSION,
    height: DIMENSION,
    srcset: HOSTILE_SET,
    sizes: fc.constantFrom('(max-width: 600px) 100vw', 'javascript:x', ''),
    poster: fc.oneof(generatedMediaUrl('png'), fc.constant('data:x')),
  },
  { requiredKeys: [] },
);

type Reason = 'network' | 'server' | 'response';
type Op =
  | { kind: 'upload'; video: boolean; n: number }
  | { kind: 'resolve'; i: number; response: unknown }
  | { kind: 'reject'; i: number; reason: Reason }
  | { kind: 'cancel' }
  | { kind: 'swap' }
  | { kind: 'set'; html: string }
  | { kind: 'edit'; text: string };

const OP: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('upload' as const),
    video: fc.boolean(),
    n: fc.integer({ min: 1, max: 3 }),
  }),
  fc.record({
    kind: fc.constant('resolve' as const),
    i: fc.nat(8),
    response: fc.oneof(RESPONSE, fc.constantFrom(null, 'x', 3, [])),
  }),
  fc.record({
    kind: fc.constant('reject' as const),
    i: fc.nat(8),
    reason: fc.constantFrom<Reason>('network', 'server', 'response'),
  }),
  fc.constant<Op>({ kind: 'cancel' }),
  fc.constant<Op>({ kind: 'swap' }),
  fc.record({
    kind: fc.constant('set' as const),
    html: fc.constantFrom(
      '<p>x</p>',
      '<p><img src="/a.png" alt="a"></p>',
      '<p><img src="javascript:alert(1)" alt="a"></p>',
    ),
  }),
  fc.record({
    kind: fc.constant('edit' as const),
    text: fc.constantFrom('a', ' ', 'zz'),
  }),
);

describe('propriedade de segurança (R11)', () => {
  it('respostas hostis, rejeições, cancelamentos e edições nunca vazam blob:/data: nem violam o contrato', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.array(OP, { minLength: 1, maxLength: 10 }),
        async (preview, ops) => {
          TestBed.resetTestingModule();
          probe.created.length = 0;
          probe.revoked.length = 0;
          const s = await setup(preview);
          let seq = 0;
          for (const op of ops) {
            const calls = s.adapter.calls.length;
            switch (op.kind) {
              case 'upload': {
                const files = Array.from({ length: op.n }, () =>
                  op.video ? webm(`v${++seq}.webm`) : png(`a${++seq}.png`),
                );
                s.cmp.uploadFiles(files);
                break;
              }
              case 'resolve':
                if (calls) s.adapter.resolve(op.i % calls, op.response);
                break;
              case 'reject':
                if (calls)
                  s.adapter.reject(op.i % calls, new RteUploadError(op.reason));
                break;
              case 'cancel':
                s.cmp.cancelAllUploads();
                break;
              case 'swap':
                s.host.upload.set({ adapter: s.adapter, preview });
                break;
              case 'set':
                s.host.value.set(op.html);
                break;
              case 'edit':
                s.editor.commands.insertContent(op.text);
                break;
            }
            await drain(s.fixture);
            assertSafe(s);
          }
          s.fixture.destroy();
          // cada miniatura criada é revogada ao fim de todos os caminhos
          expect([...probe.revoked].sort()).toEqual([...probe.created].sort());
        },
      ),
      fcOptions(Math.min(FC_RUNS, 40)),
    );
  }, 120_000);
});

describe('miniatura local (E16, R10)', () => {
  const marker = (s: Setup) =>
    s.editor.view.dom.querySelector('.rte-upload-marker');

  it('preview: true + imagem → 1 createObjectURL e img[alt=""] no marcador', async () => {
    const s = await setup(true);
    s.cmp.uploadFiles([png('a.png')]);
    await drain(s.fixture);
    expect(probe.created.length).toBe(1);
    const img = marker(s)?.querySelector('img.rte-upload-marker__preview');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('src')).toBe(probe.created[0]);
    expect(getRteHtml(s.editor)).not.toMatch(LOCAL);
  });

  it('vídeo e preview: false não criam miniatura', async () => {
    const v = await setup(true);
    v.cmp.uploadFiles([webm('v.webm')]);
    await drain(v.fixture);
    expect(probe.created).toEqual([]);
    TestBed.resetTestingModule();
    const f = await setup(false);
    f.cmp.uploadFiles([png('a.png')]);
    await drain(f.fixture);
    expect(probe.created).toEqual([]);
  });

  const ways: [string, (s: Setup) => void][] = [
    ['sucesso', (s) => s.adapter.resolve(0, { url: '/a.png' })],
    ['erro', (s) => s.adapter.reject(0, new RteUploadError('server'))],
    ['cancelamento', (s) => s.cmp.cancelAllUploads()],
    [
      'abortAll (troca da configuração)',
      (s) => s.host.upload.set({ adapter: s.adapter, preview: true }),
    ],
    ['destroy', (s) => s.fixture.destroy()],
  ];
  for (const [name, end] of ways) {
    it(`revoga o URL criado no fim: ${name}`, async () => {
      const s = await setup(true);
      s.cmp.uploadFiles([png('a.png')]);
      await drain(s.fixture);
      expect(probe.created.length).toBe(1);
      expect(probe.revoked).toEqual([]);
      end(s);
      await new Promise((resolve) => setTimeout(resolve));
      expect(probe.revoked).toEqual(probe.created);
    });
  }
});

describe('nenhuma requisição sem gesto (R3)', () => {
  it('criar, digitar e carregar valor não chamam o adaptador', async () => {
    const s = await setup(true);
    s.editor.commands.insertContent('texto');
    s.host.value.set('<p><img src="/a.png" alt="a"></p>');
    await drain(s.fixture);
    s.host.value.set('<p>outro</p>');
    await drain(s.fixture);
    expect(s.adapter.calls.length).toBe(0);
    expect(probe.created).toEqual([]);
  });
});
