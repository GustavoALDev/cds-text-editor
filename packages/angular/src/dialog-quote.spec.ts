import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { getRteHtml } from '@comodeviaser/rte-core/extensions';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@comodeviaser/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim, waitForDialog } from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { readFixture } from './testing-support/fixtures';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05b2a, Tarefa 4: diálogo do autor da citação (R10).

const FIXTURE = readFixture('all-features.html');

@Component({
  selector: 'rte-test-quote-host',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    (valueChange)="changes = changes + 1"
    toolbar="full"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal(FIXTURE);
  changes = 0;
  readonly cmp = viewChild.required(RteEditor);
}

let restoreDialog: () => void;
let restorePopover: () => void;
beforeEach(() => {
  restoreDialog = installDialogShim();
  restorePopover = installPopoverShim();
});
afterEach(() => {
  TestBed.resetTestingModule();
  restorePopover();
  restoreDialog();
  vi.restoreAllMocks();
});

async function open(): Promise<{
  fixture: ComponentFixture<Host>;
  host: Host;
  editor: Editor;
  dialog: HTMLDialogElement;
  author: HTMLInputElement;
  role: HTMLInputElement;
  initial: string;
}> {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const editor = host.cmp().editor() as Editor;
  selectText(editor, 'Uma frase marcante.', 4);
  const initial = getRteHtml(editor);
  host.changes = 0;
  expect(host.cmp().openDialog('quoteAuthor')).toBe(true);
  const dialog = await waitForDialog(fixture);
  return {
    fixture,
    host,
    editor,
    dialog,
    author: field(dialog, 'Author'),
    role: field(dialog, 'Role'),
    initial,
  };
}

function field(dialog: HTMLElement, label: string): HTMLInputElement {
  const found = [
    ...dialog.querySelectorAll<HTMLLabelElement>('.rte-dialog__label'),
  ].find((l) => l.textContent?.trim() === label);
  const input = found?.htmlFor
    ? dialog.ownerDocument.getElementById(found.htmlFor)
    : null;
  if (!input) throw new Error(`campo ${label} ausente`);
  return input as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function apply(dialog: HTMLElement): void {
  dialog.querySelector<HTMLButtonElement>('.rte-dialog__apply')?.click();
}

const QUOTE_START =
  '<figure class="rt-pullquote"><blockquote><p>Uma frase marcante.</p></blockquote>';

describe('autor da citação (R10)', () => {
  it('preenchido com autor e cargo atuais', async () => {
    const { author, role } = await open();
    expect(author.value).toBe('Fulana de Tal');
    expect(role.value).toBe('editora');
    expect(author.maxLength).toBe(200);
    expect(role.maxLength).toBe(200);
  });

  it('aplicar Ana/repórter: figcaption como o core serializa, 1 emissão, 1 undo', async () => {
    const { fixture, host, editor, dialog, author, role, initial } =
      await open();
    type(author, 'Ana');
    type(role, 'repórter');
    apply(dialog);
    await settle(fixture);
    expect(dialog.open).toBe(false);
    expect(getRteHtml(editor)).toContain(
      QUOTE_START +
        '<figcaption><cite>Ana</cite>, repórter</figcaption></figure>',
    );
    expect(host.changes).toBe(1);
    editor.commands.undo();
    expect(getRteHtml(editor)).toBe(initial);
  });

  it('vazio/vazio remove o figcaption', async () => {
    const { fixture, editor, dialog, author, role } = await open();
    type(author, '');
    type(role, '');
    apply(dialog);
    await settle(fixture);
    expect(getRteHtml(editor)).toContain(QUOTE_START + '</figure>');
  });

  it('<b>x</b> sai como texto escapado dentro do cite', async () => {
    const { fixture, editor, dialog, author } = await open();
    type(author, '<b>x</b>');
    apply(dialog);
    await settle(fixture);
    expect(getRteHtml(editor)).toContain(
      '<figcaption><cite>&lt;b&gt;x&lt;/b&gt;</cite>, editora</figcaption>',
    );
  });

  it('201 caracteres: erro de tamanho, diálogo aberto, nada aplicado', async () => {
    const { fixture, host, editor, dialog, author, initial } = await open();
    type(author, 'a'.repeat(201));
    apply(dialog);
    await settle(fixture);
    const error = dialog.querySelector<HTMLElement>('.rte-dialog__error');
    expect(error?.textContent?.trim()).toBe('Use at most 200 characters.');
    expect(error?.id).toBeTruthy();
    expect(author.getAttribute('aria-invalid')).toBe('true');
    expect(author.getAttribute('aria-describedby')?.split(' ')).toContain(
      error?.id,
    );
    expect(document.activeElement).toBe(author);
    expect(dialog.open).toBe(true);
    expect(getRteHtml(editor)).toBe(initial);
    expect(host.changes).toBe(0);
  });
});
