import { TestBed } from '@angular/core/testing';
import { RteEditor } from '@cds/rte-angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeUploadError, FilesPage } from './files.page';

function stubConfig(body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 200 })),
  );
}

describe('página /files', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('modo simulado (padrão): aviso visível e chaves "lento"/"falhar"', async () => {
    stubConfig('{"upload":"simulated"}');
    const fixture = TestBed.createComponent(FilesPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      root.querySelector('[data-testid="files-simulated"]')?.textContent,
    ).toContain('nenhum arquivo sai do navegador');
    expect(root.querySelectorAll('.files-switches input').length).toBe(2);
    expect(
      root.querySelector('[role="status"][aria-live="polite"]'),
    ).not.toBeNull();
    const editor = fixture.debugElement.children
      .map((d) => d.componentInstance)
      .find((c) => c instanceof RteEditor) as RteEditor;
    expect(editor.upload()?.adapter.uploadVideo).toBeUndefined();
  });

  it('modo server: aviso de envio real e sem as chaves do simulado', async () => {
    stubConfig('{"upload":"server"}');
    const fixture = TestBed.createComponent(FilesPage);
    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(root.querySelector('[data-testid="files-server"]')).not.toBeNull();
    });
    expect(root.querySelector('[data-testid="files-simulated"]')).toBeNull();
    expect(root.querySelector('rte-editor')).not.toBeNull();
  });

  it('anuncia a falha com o motivo e o nome só como texto', () => {
    expect(
      describeUploadError({
        fileName: '<b>x</b>.png',
        type: 'image',
        reason: 'server',
      }),
    ).toBe('Falha ao enviar <b>x</b>.png: o servidor recusou ou falhou.');
  });
});
