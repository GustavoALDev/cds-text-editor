import { TestBed } from '@angular/core/testing';
import { RteEditor } from '@cds/rte-angular';
import { getRteEditor } from '@cds/rte-angular/testing';
import { describe, expect, it, vi } from 'vitest';

// Primeira criação do editor carrega chunks sob demanda: folga no relógio do teste.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { EDITOR_MAX_CHARS, EditorPage } from './editor.page';

// Primeira criação do editor carrega chunks sob demanda: folga no relógio do teste.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe('página /editor', () => {
  it('liga o editor completo: preset full, contadores, limite e rascunho', async () => {
    const fixture = TestBed.createComponent(EditorPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('rte-editor') as HTMLElement;
    expect(host).not.toBeNull();
    const ed = fixture.debugElement.children
      .map((d) => d.componentInstance)
      .find((c) => c instanceof RteEditor) as RteEditor;
    expect(ed.toolbar()).toBe('full');
    expect(ed.maxLength()).toBe(EDITOR_MAX_CHARS);
    expect(ed.showCharCount()).toBe(true);
    expect(ed.showWordCount()).toBe(true);
    expect(ed.draftKey()).toBe('demo:editor');
    await fixture.whenStable();
    expect(getRteEditor(host)).not.toBeNull();
    expect(root.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(root.querySelector('.rte-editor__footer')).not.toBeNull();
  });

  it('explica o que mostra e liga ao README do pacote', async () => {
    const fixture = TestBed.createComponent(EditorPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.page-note')?.textContent).toContain('O que isto mostra');
    expect(root.querySelector('.page-note a')?.getAttribute('href')).toContain(
      'packages/angular/README.md',
    );
  });

  it('o valor do editor aparece no HTML canônico', async () => {
    const fixture = TestBed.createComponent(EditorPage);
    await fixture.whenStable();
    const pre = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="editor-html"]');
    expect((pre as HTMLTextAreaElement).value).toContain('<h2');
  });
});
