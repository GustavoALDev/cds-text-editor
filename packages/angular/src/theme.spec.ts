import {
  ChangeDetectionStrategy,
  Component,
  signal,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { provideRichText, RteEditor } from '@comodeviaser/rte-angular';
import type { RteTheme } from '@comodeviaser/rte-theme';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { renderHost, settle } from './testing-support/render';
import { mergeTheme, sameTheme, themeKey } from './theme/instance-theme';

// Spec 05b1, Tarefa 7: tema por instância (U15, R10). Sem `CSS.supports` o
// jsdom cai no plano B do `applyRteTheme`, que grava `--rte-*` e
// `color-scheme` por `style.setProperty` (pré-voo 8).

@Component({
  selector: 'rte-test-theme-host',
  imports: [RteEditor],
  template: `<rte-editor [theme]="theme()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly theme = signal<RteTheme | undefined>(undefined);
}

@Component({
  selector: 'rte-test-theme-two',
  imports: [RteEditor],
  template: `<rte-editor class="a" [theme]="{ primary: '#0b57d0' }" />
    <rte-editor class="b" [theme]="{ primary: '#b3261e' }" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoHosts {}

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

async function setup(
  theme?: RteTheme,
  providers: (Provider | EnvironmentProviders)[] = [],
): Promise<{ fixture: ComponentFixture<Host>; host: HTMLElement }> {
  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.theme.set(theme);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = (fixture.nativeElement as HTMLElement).querySelector(
    'rte-editor',
  ) as HTMLElement;
  return { fixture, host };
}

async function setTheme(fixture: ComponentFixture<Host>, theme?: RteTheme) {
  fixture.componentInstance.theme.set(theme);
  await settle(fixture);
}

function rteProps(el: HTMLElement): string[] {
  return [...Array.from(el.style)].filter((p) => p.startsWith('--rte-'));
}

function themeWarnings(): unknown[] {
  return warn.mock.calls
    .map(([m]) => m)
    .filter((m) => typeof m === 'string' && m.startsWith('[rte-theme]'));
}

describe('mergeTheme / sameTheme / themeKey', () => {
  it('mescla por chave, instância > provider', () => {
    expect(
      mergeTheme({ primary: 'a', mode: 'dark' }, { primary: 'b' }),
    ).toEqual({ primary: 'b', mode: 'dark' });
  });

  it('valor undefined da instância não apaga o do provider', () => {
    expect(
      mergeTheme({ primary: 'a' }, {
        primary: undefined,
      } as unknown as RteTheme),
    ).toEqual({
      primary: 'a',
    });
  });

  it('ausentes ou sem chave → undefined', () => {
    expect(mergeTheme(undefined, undefined)).toBeUndefined();
    expect(mergeTheme({}, undefined)).toBeUndefined();
    expect(
      mergeTheme(undefined, { mode: undefined } as unknown as RteTheme),
    ).toBeUndefined();
  });

  it('sameTheme compara por valor', () => {
    expect(sameTheme({ primary: 'a' }, { primary: 'a' })).toBe(true);
    expect(sameTheme({ primary: 'a' }, { primary: 'b' })).toBe(false);
    expect(sameTheme(undefined, undefined)).toBe(true);
    expect(sameTheme(undefined, { primary: 'a' })).toBe(false);
    expect(sameTheme({ mode: 'dark' }, { mode: 'light' })).toBe(false);
    expect(sameTheme({ neutral: 'gray' }, {})).toBe(false);
  });

  it('themeKey distingue temas diferentes e iguala os iguais', () => {
    expect(themeKey({ primary: 'a' })).toBe(themeKey({ primary: 'a' }));
    expect(themeKey({ primary: 'a' })).not.toBe(themeKey({ secondary: 'a' }));
  });
});

describe('RteEditor [theme] (U15, R10)', () => {
  it('sem tema: nenhum atributo style nem data-rte-mode no host', async () => {
    const { host } = await setup();
    expect(host.hasAttribute('style')).toBe(false);
    expect(host.hasAttribute('data-rte-mode')).toBe(false);
  });

  it('[theme] com primária aplica --rte-primary no host (plano B)', async () => {
    const { host } = await setup({ primary: '#0b57d0' });
    expect(host.style.getPropertyValue('--rte-primary')).not.toBe('');
    expect(rteProps(host).length).toBeGreaterThan(10);
  });

  it('provideRichText({ theme }) dá o modo; a entrada mescla por chave', async () => {
    const { host, fixture } = await setup(undefined, [
      provideRichText({ theme: { mode: 'dark' } }),
    ]);
    expect(host.getAttribute('data-rte-mode')).toBe('dark');
    expect(host.style.getPropertyValue('color-scheme')).toBe('dark');
    await setTheme(fixture, { primary: '#0b57d0' });
    expect(host.getAttribute('data-rte-mode')).toBe('dark');
    expect(host.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(host.style.getPropertyValue('--rte-primary')).not.toBe('');
  });

  it('duas instâncias com primárias diferentes não interferem', async () => {
    const fixture = await renderHost(TwoHosts);
    const el = fixture.nativeElement as HTMLElement;
    const a = el.querySelector('rte-editor.a') as HTMLElement;
    const b = el.querySelector('rte-editor.b') as HTMLElement;
    const pa = a.style.getPropertyValue('--rte-primary');
    const pb = b.style.getPropertyValue('--rte-primary');
    expect(pa).not.toBe('');
    expect(pb).not.toBe('');
    expect(pa).not.toBe(pb);
  });

  it('trocar o tema reaplica com o novo valor', async () => {
    const { host, fixture } = await setup({ primary: '#0b57d0' });
    const before = host.style.getPropertyValue('--rte-primary');
    await setTheme(fixture, { primary: '#b3261e' });
    const after = host.style.getPropertyValue('--rte-primary');
    expect(after).not.toBe('');
    expect(after).not.toBe(before);
  });

  it('tema undefined sem provider limpa as --rte-* e o data-rte-mode', async () => {
    const { host, fixture } = await setup({
      primary: '#0b57d0',
      mode: 'dark',
    });
    expect(host.getAttribute('data-rte-mode')).toBe('dark');
    await setTheme(fixture, undefined);
    expect(rteProps(host)).toEqual([]);
    expect(host.style.getPropertyValue('color-scheme')).toBe('');
    expect(host.hasAttribute('data-rte-mode')).toBe(false);
  });

  it('destroy remove as --rte-* do host', async () => {
    const { host, fixture } = await setup({ primary: '#0b57d0' });
    expect(rteProps(host).length).toBeGreaterThan(0);
    fixture.destroy();
    expect(rteProps(host)).toEqual([]);
  });

  it('objeto novo com os mesmos valores não reaplica', async () => {
    const { fixture } = await setup({ primary: '#0b57d0', mode: 'light' });
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    await setTheme(fixture, { primary: '#0b57d0', mode: 'light' });
    await setTheme(fixture, { mode: 'light', primary: '#0b57d0' });
    expect(setProperty).not.toHaveBeenCalled();
  });

  // `#ffff00` (o exemplo do plano) passa em todas as checagens: a derivação
  // garante o contraste de qualquer semente (check-theme.spec.ts). O aviso
  // `[rte-theme]` só sai para valor inválido.
  it('warnIfPoorTheme uma vez por tema diferente', async () => {
    const { fixture } = await setup({ primary: 'banana' });
    const first = themeWarnings().length;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) await setTheme(fixture, { primary: 'banana' });
    expect(themeWarnings()).toHaveLength(first);
    await setTheme(fixture, { tertiary: '12px' });
    const second = themeWarnings().length;
    expect(second).toBeGreaterThan(first);
    // voltar a um tema já avisado não repete o aviso
    await setTheme(fixture, { primary: 'banana' });
    expect(themeWarnings()).toHaveLength(second);
  });

  it('sem ngDevMode, nenhum aviso de tema', async () => {
    const { fixture } = await setup();
    const g = globalThis as { ngDevMode?: unknown };
    const saved = g.ngDevMode;
    try {
      g.ngDevMode = false;
      await setTheme(fixture, { primary: 'banana' });
      expect(themeWarnings()).toHaveLength(0);
    } finally {
      g.ngDevMode = saved;
    }
  });
});
