import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogShim } from './testing-support/dialog';
import {
  drainDraft,
  setupDraft,
  type DraftSetup,
} from './testing-support/draft';
import { installPopoverShim } from './testing-support/popover';
import { settle } from './testing-support/render';

// Spec 05c2b, Tarefa 2 (R3; S6): o aviso de restauração embutido.

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

const prompt = (s: DraftSetup) =>
  (s.fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    'section.rte-draft',
  );
const status = (s: DraftSetup) =>
  (s.fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    '.rte-draft__status',
  );

const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

async function shown(s: DraftSetup): Promise<void> {
  await drainDraft(s.fixture);
  await settle(s.fixture);
}

describe('aviso de restauração (S6)', () => {
  it('sem rascunho: região aria-live vazia e sem aviso', async () => {
    const s = await setupDraft();
    await shown(s);
    expect(prompt(s)).toBeNull();
    const live = status(s);
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toBe('');
  });

  it('com rascunho: região nomeada, data, botões, nunca o conteúdo; sem roubar o foco', async () => {
    const s = await setupDraft({ seed: '<p>segredo do rascunho</p>' });
    s.editor.commands.focus();
    await tick();
    const focused = document.activeElement;
    await shown(s);
    const el = prompt(s);
    expect(el).not.toBeNull();
    expect(el?.getAttribute('role')).toBe('region');
    expect(el?.getAttribute('aria-label')).toBe('Saved draft');
    expect(el?.textContent).toMatch(/A draft saved on .+ is available\./);
    expect(el?.textContent).not.toContain('segredo');
    expect(
      [...(el?.querySelectorAll('button') ?? [])].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['Restore', 'Discard']);
    expect(document.activeElement).toBe(focused);
    // anúncio único na região aria-live
    expect(status(s)?.textContent).toBe(
      el?.querySelector('.rte-draft__text')?.textContent,
    );
    // antes do editável, dentro da moldura
    const frame = el?.parentElement?.parentElement;
    expect(frame?.classList.contains('rte-editor__frame')).toBe(true);
    const mount = frame?.querySelector('.rte-editor__mount');
    expect(
      (el as Node).compareDocumentPosition(mount as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('Restaurar: conteúdo de volta, aviso some e o foco vai ao editável', async () => {
    const s = await setupDraft({ seed: '<p>velho</p>' });
    await shown(s);
    prompt(s)?.querySelectorAll('button')[0]?.focus();
    prompt(s)?.querySelectorAll('button')[0]?.click();
    await settle(s.fixture);
    await tick();
    expect(s.cmp.value()).toBe('<p>velho</p>');
    expect(prompt(s)).toBeNull();
    expect(status(s)?.textContent).toBe('');
    expect(s.editor.view.dom.contains(document.activeElement)).toBe(true);
  });

  it('Descartar: apaga, aviso some e o foco vai ao editável', async () => {
    const s = await setupDraft({ seed: '<p>velho</p>' });
    await shown(s);
    prompt(s)?.querySelectorAll('button')[1]?.focus();
    prompt(s)?.querySelectorAll('button')[1]?.click();
    await settle(s.fixture);
    await tick();
    expect(s.cmp.value()).toBe('<p>ab</p>');
    expect(prompt(s)).toBeNull();
    expect(s.cmp.draftAvailable()).toBeNull();
    expect(s.editor.view.dom.contains(document.activeElement)).toBe(true);
  });

  it('draft.prompt: false não renderiza o aviso nem o anúncio', async () => {
    const s = await setupDraft({
      seed: '<p>velho</p>',
      draft: { prompt: false },
    });
    await shown(s);
    expect(s.cmp.draftAvailable()).not.toBeNull();
    expect(prompt(s)).toBeNull();
    expect(status(s)?.textContent).toBe('');
  });

  it('somente leitura não mostra o aviso', async () => {
    const s = await setupDraft({ seed: '<p>velho</p>', ro: true });
    await shown(s);
    expect(prompt(s)).toBeNull();
  });
});
