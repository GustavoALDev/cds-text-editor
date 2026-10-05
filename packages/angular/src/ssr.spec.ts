// @vitest-environment node
import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  ɵgetDOM as getDOM,
  type ɵDomAdapter as DomAdapter,
} from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  ɵDominoAdapter as DominoAdapter,
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server';
// eslint-disable-next-line @nx/enforce-module-boundaries -- os testes importam o entry . pelo alias público (pré-voo 9)
import { provideRichText, RteEditor } from '@cds/rte-angular';
import { afterEach, describe, expect, it, vi } from 'vitest';

// R12 (D19): no servidor só a casca; nenhum Editor e nenhum HTML do valor.

@Component({
  selector: 'rte-ssr-host',
  imports: [RteEditor],
  template: `
    <rte-editor [value]="''" [placeholder]="'Escreva'" [ariaLabel]="'Corpo'" />
    <rte-editor [value]="secret" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SsrHost {
  readonly secret = '<p>segredo</p>';
}

/**
 * O setup do builder inicia o TestBed (plataforma de navegador) em todo
 * arquivo, inclusive nos de ambiente `node`, e o `@angular/common` só aceita
 * o primeiro adaptador de DOM (`setRootDomAdapter` usa `??=`): o
 * `DominoAdapter` da plataforma de servidor nunca assumiria e o adaptador de
 * navegador leria o `document` global. Num processo de servidor real não há
 * adaptador anterior; aqui o adaptador atual vira um `DominoAdapter` só
 * durante o render e volta ao fim (o estado de módulo é compartilhado entre
 * arquivos, `isolate: false`).
 */
async function withServerDomAdapter<T>(render: () => Promise<T>): Promise<T> {
  const dom = getDOM() as DomAdapter & { supportsDOMEvents: boolean };
  const proto: object | null = Object.getPrototypeOf(dom);
  const supportsDOMEvents = dom.supportsDOMEvents;
  try {
    Object.setPrototypeOf(dom, DominoAdapter.prototype);
    dom.supportsDOMEvents = false;
    dom.getDefaultDocument();
    return await render();
  } finally {
    Object.setPrototypeOf(dom, proto);
    dom.supportsDOMEvents = supportsDOMEvents;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RteEditor no servidor (R12)', () => {
  it('não há DOM global no ambiente', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it(
    'renderApplication entrega a casca acessível sem o valor',
    { timeout: 30_000 },
    async () => {
      const error = vi.spyOn(console, 'error');
      const html = await withServerDomAdapter(() =>
        renderApplication(
          (context) =>
            bootstrapApplication(
              SsrHost,
              {
                providers: [
                  provideZonelessChangeDetection(),
                  provideServerRendering(),
                ],
              },
              context,
            ),
          {
            document:
              '<!doctype html><html><head></head><body><rte-ssr-host></rte-ssr-host></body></html>',
            url: '/',
          },
        ),
      );

      expect(html).toContain('class="rte-root rte-editor');
      expect(html).toContain('role="textbox"');
      expect(html).toContain('aria-label="Corpo"');
      expect(html).toContain('aria-label="Rich text editor"');
      expect(html).toContain('aria-readonly="true"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('data-placeholder="Escreva"');
      expect(html).toContain('rte-editor__mount');
      expect(html).not.toContain('ProseMirror');
      expect(html).not.toContain('segredo');
      expect(error).not.toHaveBeenCalled();

      // Barra (U10, R7, R16): mesma estrutura, botões disabled, fora do Tab, sem style.
      expect(html).toContain('class="rte-toolbar"');
      expect(html).toContain('role="toolbar"');
      const toolbars = [
        ...html.matchAll(/<rte-toolbar\b[\s\S]*?<\/rte-toolbar>/g),
      ].map(([m]) => m);
      expect(toolbars).toHaveLength(2);
      for (const toolbar of toolbars) {
        const buttons = [...toolbar.matchAll(/<button\b[^>]*>/g)].map(
          ([m]) => m,
        );
        const own = buttons.filter((b) => b.includes('rte-toolbar__button'));
        expect(own.length).toBeGreaterThan(10);
        for (const b of own) expect(b).toMatch(/\sdisabled(?:=""|\s|>)/);
        expect(toolbar).not.toContain('tabindex="0"');
        expect(toolbar).not.toMatch(/\sstyle=/);
      }
      const hosts = [...html.matchAll(/<rte-editor\b[^>]*>/g)].map(([m]) => m);
      expect(hosts).toHaveLength(2);
      for (const host of hosts) expect(host).not.toMatch(/\sstyle=/);

      // Diálogos (spec 05b2a, R12, G7): o `@defer` só renderiza o placeholder
      // vazio no servidor.
      expect(html).not.toContain('<dialog');
      expect(html).not.toContain('rte-dialog');
      expect(html).not.toContain('Insert link');
      expect(html).not.toContain('Apply');
    },
  );
  it(
    'tema do provider: data-rte-mode no HTML e nenhum style no host (U15, R10)',
    { timeout: 30_000 },
    async () => {
      const html = await withServerDomAdapter(() =>
        renderApplication(
          (context) =>
            bootstrapApplication(
              SsrHost,
              {
                providers: [
                  provideZonelessChangeDetection(),
                  provideServerRendering(),
                  provideRichText({
                    theme: { mode: 'dark', primary: '#0b57d0' },
                  }),
                ],
              },
              context,
            ),
          {
            document:
              '<!doctype html><html><head></head><body><rte-ssr-host></rte-ssr-host></body></html>',
            url: '/',
          },
        ),
      );
      const hosts = [...html.matchAll(/<rte-editor\b[^>]*>/g)].map(([m]) => m);
      expect(hosts).toHaveLength(2);
      for (const host of hosts) {
        expect(host).toContain('data-rte-mode="dark"');
        expect(host).not.toMatch(/\sstyle=/);
      }
      expect(html).not.toContain('--rte-');
    },
  );
});
