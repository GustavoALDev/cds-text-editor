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
import { RteEditor } from '@cds/rte-angular';
import { describe, expect, it } from 'vitest';

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
  Object.setPrototypeOf(dom, DominoAdapter.prototype);
  dom.supportsDOMEvents = false;
  dom.getDefaultDocument();
  try {
    return await render();
  } finally {
    Object.setPrototypeOf(dom, proto);
    dom.supportsDOMEvents = supportsDOMEvents;
  }
}

describe('RteEditor no servidor (R12)', () => {
  it('não há DOM global no ambiente', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  it(
    'renderApplication entrega a casca acessível sem o valor',
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
    },
  );
});
