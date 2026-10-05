import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor, type RteDialogKind } from '@cds/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeDialog,
  installDialogShim,
  waitForDialog,
} from './testing-support/dialog';
import { selectText } from './testing-support/editors';
import { installPopoverShim } from './testing-support/popover';

// Os botões do rodapé não tiram o foco do campo no `mousedown`: o `blur`
// marcaria o campo como tocado, o erro em linha deslocaria o botão e o clique
// se perderia (Firefox). O envio já marca tudo e foca o primeiro inválido.

@Component({
  selector: 'rte-test-actions-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="value()" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal(
    '<p>ab</p><figure class="rt-pullquote"><blockquote><p>Uma frase.</p></blockquote></figure>',
  );
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

const KINDS: readonly RteDialogKind[] = [
  'link',
  'lang',
  'quoteAuthor',
  'table',
  'image',
  'video',
  'embed',
];

function mousedown(target: Element): MouseEvent {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe('mousedown nos botões do rodapé', () => {
  it.each(KINDS)('%s: não tira o foco do campo', async (kind) => {
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const editor = host.cmp().editor() as Editor;
    selectText(
      editor,
      kind === 'quoteAuthor' ? 'Uma frase.' : 'ab',
      kind === 'lang' ? 0 : 1,
    );
    expect(host.cmp().openDialog(kind)).toBe(true);
    const dialog = await waitForDialog(fixture);

    const buttons = dialog.querySelectorAll('.rte-dialog__actions button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(mousedown(button).defaultPrevented).toBe(true);
    }
    const field = dialog.querySelector('input, select');
    expect(field).not.toBeNull();
    expect(mousedown(field as Element).defaultPrevented).toBe(false);
    escapeDialog(dialog);
  });
});
