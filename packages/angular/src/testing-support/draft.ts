import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  createDraftStore,
  createLocalDraftStorage,
  createMemoryDraftStorage,
  type DraftStorage,
} from '@cds/rte-core';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import {
  provideRichText,
  RteEditor,
  type RteDraftConfig,
  type RteDraftErrorEvent,
} from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { vi } from 'vitest';
import { RTE_DRAFT_LOADER, type RteDraftLoader } from '../draft/facade';
import { settle } from './render';

/** Host de teste do rascunho (spec 05c2b, S3–S7). */
@Component({
  selector: 'rte-test-draft',
  imports: [RteEditor],
  templateUrl: './draft-host.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftHost {
  readonly value = signal('<p>ab</p>');
  readonly key = signal<string | null | undefined>('doc');
  readonly ro = signal(false);
  readonly off = signal(false);
  readonly values: string[] = [];
  readonly errors: RteDraftErrorEvent[] = [];
  readonly cmp = viewChild.required(RteEditor);
}

export interface DraftSetup {
  fixture: ComponentFixture<DraftHost>;
  host: DraftHost;
  cmp: RteEditor;
  editor: Editor;
  storage: DraftStorage;
  loader: ReturnType<typeof vi.fn<RteDraftLoader>>;
}

export const realDraftLoader: RteDraftLoader = () =>
  import('../draft/rte-draft');

/** Grava um rascunho no armazenamento, como o editor o faria. */
export function seedDraft(
  storage: DraftStorage,
  key: string,
  html: string,
  now?: () => number,
): void {
  createDraftStore({
    storage,
    key: `rte-draft:${key}`,
    ...(now ? { now } : {}),
  }).save(html);
}

/** Lê o HTML gravado de uma chave, ou `null`. */
export function storedDraft(storage: DraftStorage, key: string): string | null {
  return (
    createDraftStore({ storage, key: `rte-draft:${key}` }).load()?.html ?? null
  );
}

export interface DraftSetupOptions {
  value?: string;
  key?: string | null | undefined;
  storage?: DraftStorage;
  /** Sem `storage` no provider: o armazenamento padrão (`localStorage`). */
  defaultStorage?: boolean;
  draft?: RteDraftConfig;
  loader?: RteDraftLoader;
  seed?: string;
  ro?: boolean;
}

/** Cria o editor com `draftKey` e espera o *chunk* do rascunho chegar. */
export async function setupDraft(
  o: DraftSetupOptions = {},
): Promise<DraftSetup> {
  const storage =
    o.storage ??
    (o.defaultStorage ? createLocalDraftStorage() : createMemoryDraftStorage());
  const provided = o.defaultStorage ? { ...o.draft } : { storage, ...o.draft };
  const loader = vi.fn(o.loader ?? realDraftLoader);
  TestBed.configureTestingModule({
    providers: [
      provideRichText({ draft: provided }),
      { provide: RTE_DRAFT_LOADER, useValue: loader },
    ],
  });
  const key = o.key === undefined ? 'doc' : o.key;
  if (o.seed !== undefined && typeof key === 'string') {
    seedDraft(storage, key, o.seed);
  }
  const fixture = TestBed.createComponent(DraftHost);
  const host = fixture.componentInstance;
  host.value.set(o.value ?? '<p>ab</p>');
  host.key.set(key);
  host.ro.set(o.ro ?? false);
  fixture.autoDetectChanges();
  await settle(fixture);
  await drainDraft(fixture);
  // Sob carga o `import()` do *chunk* pode passar das voltas do `drainDraft`
  // (teste do temporizador intermitente): com chave válida, espera a chamada
  // do carregador e a promessa dele (o `attach` é a primeira continuação).
  const valid = typeof key === 'string' && key.length >= 1 && key.length <= 200;
  for (let i = 0; valid && i < 50 && loader.mock.results.length === 0; i++) {
    await drainDraft(fixture);
  }
  await Promise.allSettled(loader.mock.results.map((r) => r.value));
  await drainDraft(fixture);
  const cmp = host.cmp();
  return {
    fixture,
    host,
    cmp,
    editor: cmp.editor() as Editor,
    storage,
    loader,
  };
}

/** Deixa o *chunk* e a verificação inicial terminarem. */
export async function drainDraft(
  fixture: ComponentFixture<unknown>,
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await settle(fixture);
  }
}
