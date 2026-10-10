import { ComponentFixture, TestBed } from '@angular/core/testing';
import { checkRteTheme, RTE_THEME_PRESETS } from '@comodeviaser/rte-theme';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCss } from '../../theme-playground/css-snippet';
import { DEFAULT_STATE } from '../../theme-playground/model';
import { buildTs } from '../../theme-playground/ts-snippet';
import { CONTRAST_TOOLS, ThemePlayground } from './playground.component';

async function setup(): Promise<{
  fixture: ComponentFixture<ThemePlayground>;
  root: HTMLElement;
  q: <T extends HTMLElement = HTMLElement>(id: string) => T;
  type: (id: string, value: string, event?: string) => Promise<void>;
  click: (id: string) => Promise<void>;
}> {
  const fixture = TestBed.createComponent(ThemePlayground);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`data-testid="${id}" não encontrado`);
    return el;
  };
  const type = async (id: string, value: string, event = 'input'): Promise<void> => {
    const el = q<HTMLInputElement>(id);
    el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
    await fixture.whenStable();
  };
  const click = async (id: string): Promise<void> => {
    q(id).click();
    await fixture.whenStable();
  };
  return { fixture, root, q, type, click };
}

const setClipboard = (value: unknown): void => {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });
};

afterEach(() => {
  document.documentElement.style.removeProperty('color-scheme');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('playground do tema', () => {
  it('estado inicial: padrão do pacote, 72 verificações, snippets dos geradores', async () => {
    const { q, root } = await setup();
    expect(q('contrast-summary').textContent).toBe('72 verificações: 0 reprovadas');
    expect(q('css-snippet').textContent).toBe(buildCss(DEFAULT_STATE));
    expect(q('ts-snippet').textContent).toBe(buildTs(DEFAULT_STATE));
    expect(q<HTMLInputElement>('color-primary').value).toBe(RTE_THEME_PRESETS.angular.primary);
    expect(q('preset-angular').getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('.page-note')?.textContent).toContain('O que isto mostra');
  });

  it('escolher um preset troca as cores e os dois textos', async () => {
    const { q, click } = await setup();
    await click('preset-ocean');
    const { ocean } = RTE_THEME_PRESETS;
    expect(q<HTMLInputElement>('color-primary').value).toBe(ocean.primary);
    expect(q<HTMLInputElement>('color-tertiary').value).toBe(ocean.tertiary);
    expect(q('css-snippet').textContent).toContain(`--rte-primary: ${ocean.primary};`);
    expect(q('ts-snippet').textContent).toContain(`primary: '${ocean.primary}'`);
    expect(q('preset-ocean').getAttribute('aria-pressed')).toBe('true');
    expect(q('preset-angular').getAttribute('aria-pressed')).toBe('false');
  });

  it('cor pelo seletor e pelo texto; texto inválido mostra o erro no campo', async () => {
    const { q, type, root } = await setup();
    await type('picker-secondary', '#00aa00');
    expect(q<HTMLInputElement>('color-secondary').value).toBe('#00aa00');
    await type('color-tertiary', 'oklch(0.55 0.2 250)');
    expect(q('css-snippet').textContent).toContain('--rte-tertiary: oklch(0.55 0.2 250);');
    await type('color-primary', 'banana');
    const input = q<HTMLInputElement>('color-primary');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = root.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(error?.textContent).toMatch(/inválida/);
    expect(q('css-snippet').textContent).toContain('/* primary inválida: vale o padrão */');
    expect(q('contrast-invalid').textContent).toContain('primary');
  });

  it('raio e densidade vão ao contêiner por CSSOM e ao CSS copiável', async () => {
    const { q, type, root } = await setup();
    await type('radius', '2');
    await type('density', '0.9');
    const frame = root.querySelector<HTMLElement>('.theme-preview');
    expect(frame?.style.getPropertyValue('--rte-radius')).toBe('2px');
    expect(frame?.style.getPropertyValue('--rte-density')).toBe('0.9');
    expect(q('css-snippet').textContent).toContain('--rte-radius: 2px;');
    expect(q('css-snippet').textContent).toContain('--rte-density: 0.9;');
    expect(q('ts-snippet').textContent).toContain('Raio e densidade');
  });

  it('modo e neutros', async () => {
    const { q, type } = await setup();
    await type('mode', 'dark', 'change');
    await type('neutral', 'gray', 'change');
    expect(q('css-snippet').textContent).toContain('color-scheme: dark');
    expect(q('css-snippet').textContent).toContain('--rte-neutral-tint: 0;');
    expect(q('ts-snippet').textContent).toContain("mode: 'dark'");
    expect(q('ts-snippet').textContent).toContain("neutral: 'gray'");
  });

  it('"site escuro" põe color-scheme: dark no <html> e reverte ao destruir', async () => {
    const { fixture, click } = await setup();
    const html = document.documentElement;
    expect(html.style.getPropertyValue('color-scheme')).toBe('');
    await click('site-dark');
    expect(html.style.getPropertyValue('color-scheme')).toBe('dark');
    fixture.destroy();
    expect(html.style.getPropertyValue('color-scheme')).toBe('');
  });

  it('cor reprovada oferece a sugestão e "usar sugestão" a aplica', async () => {
    // Com cores legíveis o pacote nunca reprova (os derivados se adaptam): injeta uma verificação.
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CONTRAST_TOOLS,
          useValue: {
            check: (theme: { primary?: string }) => {
              const report = checkRteTheme(theme);
              return theme.primary === '#ffff00'
                ? {
                    ...report,
                    ok: false,
                    checks: report.checks.map((c, i) =>
                      i === 0 ? { ...c, pass: false, ratio: 2.5, min: 4.5 } : c,
                    ),
                  }
                : report;
            },
            suggest: () => '#123456',
          },
        },
      ],
    });
    const { q, type, click, root } = await setup();
    expect(root.querySelector('[data-testid="use-suggestion"]')).toBeNull();
    await type('color-primary', '#ffff00');
    expect(q('contrast-summary').textContent).toBe('72 verificações: 1 reprovada');
    expect(q('contrast-failed').textContent).toContain('2.50 (mínimo 4.5)');
    expect(q('use-suggestion').textContent).toContain('#123456');
    await click('use-suggestion');
    expect(q<HTMLInputElement>('color-primary').value).toBe('#123456');
    expect(q('contrast-summary').textContent).toBe('72 verificações: 0 reprovadas');
  });

  it('a região aria-live não é tocada quando o resumo não muda', async () => {
    const { q, type } = await setup();
    const node = q('contrast-summary').firstChild;
    await type('radius', '3');
    await type('density', '1.1');
    expect(q('contrast-summary').firstChild).toBe(node);
    expect(q('contrast-summary').textContent).toBe('72 verificações: 0 reprovadas');
  });

  it('copiar usa navigator.clipboard.writeText e anuncia "copiado"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { q, click, root } = await setup();
    await click('copy-css');
    expect(writeText).toHaveBeenCalledWith(buildCss(DEFAULT_STATE));
    expect(q('copied').textContent).toBe('CSS copiado.');
    await click('copy-ts');
    expect(writeText).toHaveBeenLastCalledWith(buildTs(DEFAULT_STATE));
    expect(q('copied').textContent).toBe('TypeScript copiado.');
    expect(root.querySelector('textarea')).toBeNull();
  });

  it.each([
    ['sem a API', undefined],
    ['com a permissão negada', { writeText: () => Promise.reject(new Error('negado')) }],
  ])('copiar %s: o texto fica selecionado num <textarea readonly>', async (_name, clipboard) => {
    setClipboard(clipboard);
    const { q, click } = await setup();
    await click('copy-css');
    await click('copy-css');
    const area = q<HTMLTextAreaElement>('copy-fallback');
    expect(area.readOnly).toBe(true);
    expect(area.value).toBe(buildCss(DEFAULT_STATE));
    expect(area.selectionEnd - area.selectionStart).toBe(area.value.length);
    expect(q('copied').textContent).toMatch(/Ctrl\/Cmd\+C/);
    await click('copy-ts');
    expect(q<HTMLTextAreaElement>('copy-fallback').value).toBe(buildTs(DEFAULT_STATE));
  });

  describe('?preset=', () => {
    afterEach(() => history.replaceState(null, '', location.pathname));

    it('id válido aplica as cores do preset depois da renderização, sem tocar na URL', async () => {
      history.replaceState(null, '', '/theme?preset=ocean');
      const replace = vi.spyOn(history, 'replaceState');
      const push = vi.spyOn(history, 'pushState');
      const { q } = await setup();
      const { ocean } = RTE_THEME_PRESETS;
      expect(q<HTMLInputElement>('color-primary').value).toBe(ocean.primary);
      expect(q('preset-ocean').getAttribute('aria-pressed')).toBe('true');
      expect(replace).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(location.search).toBe('?preset=ocean');
      replace.mockRestore();
      push.mockRestore();
    });

    it.each(['?preset=banana', '?preset=', '?preset=ocean&preset=forest'])(
      '%j: ignorado em silêncio, padrão intacto',
      async (search) => {
        history.replaceState(null, '', '/theme' + search);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { q } = await setup();
        expect(q<HTMLInputElement>('color-primary').value).toBe(RTE_THEME_PRESETS.angular.primary);
        expect(q('preset-angular').getAttribute('aria-pressed')).toBe('true');
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
      },
    );
  });
});
