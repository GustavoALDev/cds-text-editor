import type { ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import type { RteEditor } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { expect } from 'vitest';
import { dispatchPaste } from './data-transfer';
import { dialogField, setChecked, typeInto, waitForDialog } from './dialog';
import { settle } from './render';
import { drainUploads, pngFile } from './upload-dialog';

// Spec 05c2a, Tarefa 11 (R13): passos comuns dos testes dos validadores
// `rteUploadsFinished`/`rteImagesHaveAlt` nos três modos de formulário.

/** Endereço da primeira imagem do documento (`undefined` sem imagem). */
export function imageSrc(editor: Editor): string | undefined {
  let src: string | undefined;
  editor.state.doc.descendants((node) => {
    if (src === undefined && node.type.name === 'rtImage') {
      src = node.attrs['src'] as string;
    }
    return src === undefined;
  });
  return src;
}

/**
 * Cola um PNG no fim do documento (E12; exige o calço do `DataTransfer`),
 * resolve o envio `call` com `url` e espera a inserção (`alt: null`, E19).
 */
export async function pasteImage(
  fixture: ComponentFixture<unknown>,
  editor: Editor,
  resolve: (url: string) => void,
  url = '/up.png',
): Promise<void> {
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const e = dispatchPaste(editor.view.dom, { files: [pngFile('p.png')] });
  expect(e.defaultPrevented).toBe(true);
  await drainUploads(fixture);
  resolve(url);
  await drainUploads(fixture);
  expect(editor.getHTML()).toContain(`src="${url}"`);
}

/**
 * "Detalhes…" da imagem: seleciona a primeira imagem, abre o diálogo e
 * aplica o texto alternativo `alt` (ou marca "decorativa" com `null`).
 */
export async function fixAlt(
  fixture: ComponentFixture<unknown>,
  cmp: RteEditor,
  editor: Editor,
  alt: string | null,
): Promise<void> {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.type.name === 'rtImage') at = pos;
    return at < 0;
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)),
  );
  expect(cmp.openDialog('image')).toBe(true);
  const dialog = await waitForDialog(fixture);
  if (alt === null) setChecked(dialogField(dialog, 'Decorative image'), true);
  else typeInto(dialogField(dialog, 'Alternative text'), alt);
  await settle(fixture);
  const apply = dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply');
  if (!apply) throw new Error('.rte-dialog__apply ausente');
  apply.click();
  await settle(fixture);
  expect(dialog.open).toBe(false);
}
