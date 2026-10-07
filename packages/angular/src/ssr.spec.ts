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
import { RTE_DRAFT_LOADER } from './draft/facade';
import { RTE_UPLOAD_LOADER } from './upload/facade';

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

/** Barra `full` (spec 05c1): botões de mídia, nenhum diálogo de mídia. */
@Component({
  selector: 'rte-ssr-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="secret" toolbar="full" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SsrMediaHost {
  readonly secret =
    '<p>segredo</p><figure class="rt-figure rt-figure--center"><img src="/a.png" alt="A"></figure>';
}

/** Entrada `[upload]` (spec 05c2a, E8/R15): região de status vazia, sem bandeja. */
@Component({
  selector: 'rte-ssr-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="secret" [upload]="upload" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SsrUploadHost {
  readonly secret = '<p>segredo</p>';
  readonly upload = {
    adapter: { uploadImage: () => Promise.reject(new Error('servidor')) },
  };
}

/** Entrada `[draftKey]` (spec 05c2b, S2, S6): sem aviso, sem armazenamento. */
@Component({
  selector: 'rte-ssr-host',
  imports: [RteEditor],
  template: `<rte-editor [value]="secret" draftKey="doc" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SsrDraftHost {
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

      // Menus flutuantes (spec 05b2b, R12): nenhum menu nem texto deles no servidor.
      expect(html).not.toContain('rte-floating');
      // Os menus da barra (`popover="auto"`) existem no servidor; os flutuantes (`manual`) não.
      expect(html).not.toContain('popover="manual"');
      expect(html).not.toContain('Text formatting');
    },
  );
  it(
    'barra full: botões de mídia presentes, nenhum diálogo nem texto de diálogo de mídia (05c1)',
    { timeout: 30_000 },
    async () => {
      const error = vi.spyOn(console, 'error');
      const html = await withServerDomAdapter(() =>
        renderApplication(
          (context) =>
            bootstrapApplication(
              SsrMediaHost,
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

      const toolbar =
        /<rte-toolbar\b[\s\S]*?<\/rte-toolbar>/.exec(html)?.[0] ?? '';
      const buttons = [...toolbar.matchAll(/<button\b[^>]*>/g)].map(([m]) => m);
      for (const label of [
        'Insert image',
        'Insert video',
        'Insert embedded content',
      ]) {
        const button = buttons.find((b) => b.includes(`aria-label="${label}"`));
        expect(button, label).toBeDefined();
        expect(button).toMatch(/\sdisabled(?:=""|\s|>)/);
      }

      expect(html).not.toContain('<dialog');
      expect(html).not.toContain('rte-dialog');
      for (const tag of ['rte-image-form', 'rte-video-form', 'rte-embed-form'])
        expect(html).not.toContain(tag);
      for (const text of [
        'Image details',
        'Image address (URL)',
        'Alternative text',
        'Decorative image',
        'Video details',
        'Video address (URL)',
        'Text tracks',
        'Add track',
        'Embedded content details',
        'Page address (URL)',
        'Accepted:',
        'Apply',
      ])
        expect(html).not.toContain(text);
      // Nem o menu flutuante da imagem do valor.
      expect(html).not.toContain('rte-floating');
      expect(html).not.toContain('Image details…');
      expect(html).not.toContain('segredo');
      expect(error).not.toHaveBeenCalled();
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
  it(
    'com configuração de envio, o chunk rte-upload nunca é pedido no servidor (Ruling 28)',
    { timeout: 30_000 },
    async () => {
      const error = vi.spyOn(console, 'error');
      const loader = vi.fn(() => import('./upload/rte-upload'));
      const adapter = {
        uploadImage: () => Promise.reject(new Error('servidor')),
      };
      const html = await withServerDomAdapter(() =>
        renderApplication(
          (context) =>
            bootstrapApplication(
              SsrHost,
              {
                providers: [
                  provideZonelessChangeDetection(),
                  provideServerRendering(),
                  provideRichText({ upload: { adapter } }),
                  { provide: RTE_UPLOAD_LOADER, useValue: loader },
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
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(html).toContain('class="rte-root rte-editor');
      expect(html).not.toContain('rte-upload-marker');
      expect(html).not.toMatch(/class="rte-uploads"|<section/);
      expect(loader).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    },
  );
  it(
    'com [upload]: a região aria-live vazia está no HTML, sem bandeja nem marcador (E8, R15)',
    { timeout: 30_000 },
    async () => {
      const error = vi.spyOn(console, 'error');
      const loader = vi.fn(() => import('./upload/rte-upload'));
      const html = await withServerDomAdapter(() =>
        renderApplication(
          (context) =>
            bootstrapApplication(
              SsrUploadHost,
              {
                providers: [
                  provideZonelessChangeDetection(),
                  provideServerRendering(),
                  { provide: RTE_UPLOAD_LOADER, useValue: loader },
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
      const region =
        /(<div[^>]*class="rte-uploads__status"[^>]*>)(.*?)<\/div>/s.exec(html);
      expect(region).not.toBeNull();
      expect(region?.[1]).toContain('aria-live="polite"');
      expect(region?.[2]?.replace(/<!--.*?-->/gs, '').trim()).toBe('');
      expect(html).not.toMatch(/class="rte-uploads"|<section/);
      expect(html).not.toContain('rte-upload-marker');
      expect(html).not.toContain('segredo');
      expect(loader).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    },
  );
  it(
    'com [draftKey]: região aria-live vazia, sem aviso, sem chunk e sem localStorage (S2, S6, S13)',
    { timeout: 30_000 },
    async () => {
      const error = vi.spyOn(console, 'error');
      const loader = vi.fn(() => import('./draft/rte-draft'));
      const html = await withServerDomAdapter(() =>
        renderApplication(
          (context) =>
            bootstrapApplication(
              SsrDraftHost,
              {
                providers: [
                  provideZonelessChangeDetection(),
                  provideServerRendering(),
                  { provide: RTE_DRAFT_LOADER, useValue: loader },
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
      const region =
        /(<div[^>]*class="rte-draft__status"[^>]*>)(.*?)<\/div>/s.exec(html);
      expect(region).not.toBeNull();
      expect(region?.[1]).toContain('aria-live="polite"');
      expect(region?.[2]?.replace(/<!--.*?-->/gs, '').trim()).toBe('');
      expect(html).not.toMatch(/class="rte-draft"|<section/);
      expect(html).not.toContain('segredo');
      expect(loader).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    },
  );
});
