import type { Signal, Type, WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { getHtmlSchema } from '@cds/rte-core';
import { getRteHtml } from '@cds/rte-core/extensions';
import { validateHtml } from '@cds/rte-core/html';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import type {
  RteEditor,
  RteLabelsSource,
  RteUploadConfig,
  RteUploadErrorEvent,
} from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { expect } from 'vitest';
import { RTE_UPLOAD_KEY } from '../upload/markers';
import { waitForDialog } from './dialog';
import {
  createFakeUploadAdapter,
  type FakeUploadAdapter,
} from './fake-upload-adapter';
import { settle } from './render';
import { whenUploadReady } from './upload-runtime';

/**
 * Host dos testes do diálogo com arquivo (05c2a E14): cada *spec* declara o
 * seu componente (template inline só em *specs*, R15) com
 * {@link UPLOAD_DIALOG_HOST_TEMPLATE}.
 */
export interface UploadDialogHost {
  readonly value: WritableSignal<string>;
  readonly upload: WritableSignal<RteUploadConfig | null>;
  readonly labels: WritableSignal<RteLabelsSource | undefined>;
  changes: number;
  readonly errors: RteUploadErrorEvent[];
  readonly cmp: Signal<RteEditor>;
}

export interface UploadDialogSetup {
  fixture: ComponentFixture<UploadDialogHost>;
  host: UploadDialogHost;
  cmp: RteEditor;
  editor: Editor;
  adapter: FakeUploadAdapter;
}

/** Monta o editor com o adaptador falso (`video: false` sem `uploadVideo`). */
export async function setupUploadDialog(
  type: Type<UploadDialogHost>,
  doc: string,
  o: { video?: boolean } = {},
): Promise<UploadDialogSetup> {
  const adapter = createFakeUploadAdapter(
    o.video === false ? { video: false } : {},
  );
  const fixture = TestBed.createComponent(type);
  const host = fixture.componentInstance;
  host.value.set(doc);
  host.upload.set({ adapter });
  fixture.autoDetectChanges();
  await settle(fixture);
  const cmp = host.cmp();
  await whenUploadReady(cmp);
  await settle(fixture);
  return { fixture, host, cmp, editor: cmp.editor() as Editor, adapter };
}

/** Abre o diálogo do tipo sobre a seleção atual (zera as emissões). */
export async function openKind(
  s: UploadDialogSetup,
  kind: 'image' | 'video' | 'link',
): Promise<HTMLDialogElement> {
  s.host.changes = 0;
  expect(s.cmp.openDialog(kind)).toBe(true);
  return waitForDialog(s.fixture);
}

/** Põe o arquivo no `input.files` e despacha `change` (como o navegador). */
export function chooseFile(input: HTMLInputElement, file: File | null): void {
  const files = file ? [file] : [];
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: Object.assign(files, { item: (i: number) => files[i] ?? null }),
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export const pngFile = (name = 'a.png', size = 1) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

export const webmFile = (name = 'v.webm') =>
  new File(['x'], name, { type: 'video/webm' });

/** HTML do editor, sempre com 0 violações de `validateHtml`. */
export function uploadHtml(s: UploadDialogSetup): string {
  const out = getRteHtml(s.editor);
  expect(validateHtml(out, getHtmlSchema({}), { mode: 'canonical' })).toEqual(
    [],
  );
  return out;
}

/** Posições dos marcadores de envio. */
export function markerPositions(editor: Editor): number[] {
  return (RTE_UPLOAD_KEY.getState(editor.state)?.markers ?? []).map(
    (m) => m.pos,
  );
}

/** Deixa o adaptador ser chamado e a chegada ser inserida. */
export async function drainUploads(
  fixture: ComponentFixture<unknown>,
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await settle(fixture);
  }
}

/** Elemento por id dentro do diálogo. */
export function byId<T extends HTMLElement>(
  dialog: HTMLElement,
  suffix: string,
): T | null {
  return dialog.querySelector<T>(`[id$="${suffix}"]`);
}
