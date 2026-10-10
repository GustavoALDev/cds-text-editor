import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { RteEditor } from '@comodeviaser/rte-angular';
import { getRteEditor } from '@comodeviaser/rte-angular/testing';
import { describe, expect, it } from 'vitest';
import { settle } from './testing-support/render';

@Component({
  selector: 'rte-test-host',
  imports: [RteEditor],
  template: '<rte-editor />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly cmp = viewChild.required(RteEditor);
}

describe('getRteEditor (/testing, D23)', () => {
  it('elemento sem gancho → null', () => {
    expect(getRteEditor(document.createElement('div'))).toBeNull();
  });

  it('valor que não parece um Editor → null', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, Symbol.for('@comodeviaser/rte-angular/editor'), {
      value: { nope: true },
    });
    expect(getRteEditor(el)).toBeNull();
  });

  it('null antes da criação, a instância depois e null após destruir', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.changeDetectorRef.detectChanges();
    const host = fixture.nativeElement.querySelector('rte-editor') as Element;
    expect(getRteEditor(host)).toBeNull();

    fixture.autoDetectChanges();
    await settle(fixture);
    const editor = fixture.componentInstance.cmp().editor();
    expect(editor).not.toBeNull();
    expect(getRteEditor(host)).toBe(editor);

    fixture.destroy();
    expect(getRteEditor(host)).toBeNull();
  });
});
