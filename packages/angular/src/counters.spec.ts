import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { provideRichText, RteEditor, type RteConfig } from '@comodeviaser/rte-angular';
import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ajudante de teste do core, só teste
import { typeText } from '../../core/extensions/src/testing/type-text';
import { settle } from './testing-support/render';

// Spec 05d1, Tarefa 4 (R5): rodapé de contadores (K11) e anúncios do limite (K12).

@Component({
  selector: 'rte-test-counters',
  imports: [RteEditor],
  template: `<rte-editor
    [value]="value()"
    [maxLength]="maxLength()"
    [showCharCount]="chars()"
    [showWordCount]="words()"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly value = signal('<p></p>');
  readonly maxLength = signal<number | undefined>(undefined);
  readonly chars = signal<boolean | undefined>(undefined);
  readonly words = signal<boolean | undefined>(undefined);
  readonly cmp = viewChild.required(RteEditor);
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

interface Setup {
  fixture: ComponentFixture<Host>;
  host: Host;
  root: HTMLElement;
  editor: Editor;
}

async function setup(
  init: (h: Host) => void = () => undefined,
  config?: RteConfig,
): Promise<Setup> {
  TestBed.configureTestingModule({
    providers: config ? [provideRichText(config)] : [],
  });
  const fixture = TestBed.createComponent(Host);
  init(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance.cmp().editor() as Editor;
  editor.commands.focus('end', { scrollIntoView: false });
  return {
    fixture,
    host: fixture.componentInstance,
    root: (fixture.nativeElement as HTMLElement).querySelector(
      'rte-editor',
    ) as HTMLElement,
    editor,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const footer = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-editor__footer');
const charsEl = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-counter--chars');
const liveSpan = (root: ParentNode) =>
  root.querySelector<HTMLElement>('.rte-live--limit span');
const live = (root: ParentNode) => liveSpan(root)?.textContent?.trim() ?? '';

async function flush(s: Setup): Promise<void> {
  await settle(s.fixture);
  await sleep(15);
  await settle(s.fixture);
}

async function type(s: Setup, text: string): Promise<void> {
  typeText(s.editor, text);
  await flush(s);
}

describe('rodapé de contadores (K11)', () => {
  it('não existe por padrão', async () => {
    const s = await setup();
    expect(footer(s.root)).toBeNull();
  });

  it('mostra caracteres sem limite e palavras com o tempo de leitura', async () => {
    const s = await setup((h) => {
      h.chars.set(true);
      h.words.set(true);
      h.value.set('<p>um dois tres</p>');
    });
    expect(charsEl(s.root)?.textContent).toBe('12 characters');
    expect(s.root.querySelector('.rte-counter--words')?.textContent).toBe(
      '3 words · 1 min read',
    );
  });

  it('o tempo de leitura arredonda para cima (201 palavras = 2 min)', async () => {
    const words = Array.from({ length: 201 }, () => 'a').join(' ');
    const s = await setup((h) => {
      h.words.set(true);
      h.value.set(`<p>${words}</p>`);
    });
    expect(s.root.querySelector('.rte-counter--words')?.textContent).toBe(
      '201 words · 2 min read',
    );
    expect(charsEl(s.root)).toBeNull();
  });

  it('com limite mostra "n/limite" e acompanha a digitação', async () => {
    const s = await setup((h) => {
      h.chars.set(true);
      h.maxLength.set(50);
    });
    expect(charsEl(s.root)?.textContent).toBe('0/50');
    await type(s, 'abc');
    expect(charsEl(s.root)?.textContent).toBe('3/50');
  });

  it('o provider liga os contadores e a entrada vence o provider', async () => {
    const s = await setup(() => undefined, { counters: { chars: true } });
    expect(charsEl(s.root)).not.toBeNull();
    s.host.chars.set(false);
    await settle(s.fixture);
    expect(footer(s.root)).toBeNull();
  });

  it('marca perto (restam <= 10%) com classe', async () => {
    const s = await setup((h) => {
      h.chars.set(true);
      h.maxLength.set(100);
    });
    const el = () => charsEl(s.root) as HTMLElement;
    expect(el().classList.contains('rte-counter--near')).toBe(false);
    await type(s, 'a'.repeat(90));
    expect(el().textContent).toBe('90/100');
    expect(el().classList.contains('rte-counter--near')).toBe(true);
    expect(el().classList.contains('rte-counter--over')).toBe(false);
  });

  it('marca acima do limite com classe e o número no texto', async () => {
    const s = await setup((h) => {
      h.chars.set(true);
      h.value.set(`<p>${'a'.repeat(30)}</p>`);
      h.maxLength.set(20);
    });
    const el = charsEl(s.root) as HTMLElement;
    expect(el.textContent).toBe('30/20');
    expect(el.classList.contains('rte-counter--over')).toBe(true);
    expect(el.classList.contains('rte-counter--near')).toBe(false);
  });

  it('o rodapé não é região viva nem entra no aria-describedby', async () => {
    const s = await setup((h) => h.chars.set(true));
    const f = footer(s.root) as HTMLElement;
    expect(f.closest('[aria-live]')).toBeNull();
    const editable = s.root.querySelector('.ProseMirror') as HTMLElement;
    const ids = (editable.getAttribute('aria-describedby') ?? '').split(' ');
    expect(f.id === '' || !ids.includes(f.id)).toBe(true);
  });
});

describe('anúncios do limite (K12)', () => {
  it('a região viva existe sempre e nada é anunciado na criação', async () => {
    const s = await setup((h) => h.maxLength.set(100));
    expect(s.root.querySelector('.rte-live--limit')).not.toBeNull();
    await flush(s);
    expect(live(s.root)).toBe('');
  });

  it('sem limite nada é anunciado', async () => {
    const s = await setup();
    await type(s, 'abc');
    expect(live(s.root)).toBe('');
  });

  it('anuncia a recusa ao bater no limite e no máximo uma vez por segundo', async () => {
    const s = await setup((h) => h.maxLength.set(3));
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await type(s, 'abc');
    expect(live(s.root)).toBe('');
    await type(s, 'd');
    expect(live(s.root)).toBe('Character limit of 3 reached.');
    const first = liveSpan(s.root);
    now += 500;
    await type(s, 'e');
    expect(liveSpan(s.root)).toBe(first);
    now += 1000;
    await type(s, 'f');
    expect(liveSpan(s.root)).not.toBe(first);
    expect(live(s.root)).toBe('Character limit of 3 reached.');
  });

  it('anuncia o que resta uma vez por cruzamento e rearma ao subir', async () => {
    const s = await setup((h) => h.maxLength.set(100));
    await type(s, 'a'.repeat(90));
    expect(live(s.root)).toBe('');
    await type(s, 'a');
    expect(live(s.root)).toBe('9 characters left.');
    const node = liveSpan(s.root);
    await type(s, 'a');
    expect(liveSpan(s.root)).toBe(node);
    // Sobe acima do limiar e cruza de novo.
    s.editor.commands.deleteRange({ from: 1, to: 31 });
    await flush(s);
    expect(liveSpan(s.root)).toBe(node);
    await type(s, 'a'.repeat(31));
    expect(liveSpan(s.root)).not.toBe(node);
    expect(live(s.root)).toMatch(/characters? left\./);
  });

  it('anuncia o excesso na transição para acima do limite', async () => {
    const s = await setup((h) => h.maxLength.set(10));
    await type(s, 'abc');
    s.editor.commands.insertContent('x'.repeat(10));
    await flush(s);
    expect(s.editor.storage['rtCharLimit']).toBeDefined();
    expect(live(s.root)).toMatch(/over the limit\.$/);
  });

  it('a carga externa do valor não anuncia nada', async () => {
    const s = await setup((h) => {
      h.maxLength.set(100);
      h.value.set('<p>curto</p>');
    });
    s.host.value.set(`<p>${'a'.repeat(95)}</p>`);
    await flush(s);
    expect(live(s.root)).toBe('');
  });

  it('mudar o limite pela entrada não anuncia', async () => {
    const s = await setup((h) => {
      h.maxLength.set(100);
      h.value.set(`<p>${'a'.repeat(50)}</p>`);
    });
    s.host.maxLength.set(40);
    await flush(s);
    expect(live(s.root)).toBe('');
  });
});
