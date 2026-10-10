import {
  afterRenderEffect,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { applyRteTheme, type RteTheme } from '@comodeviaser/rte-theme';

/**
 * Aplica o tema num painel pelo mesmo caminho do integrador (`applyRteTheme`, estilo só por
 * CSSOM: compatível com a CSP estrita). Só roda no navegador (`afterRenderEffect`), então nada
 * vira atributo `style` no prerender.
 */
@Directive({ selector: '[demoThemeScope]' })
export class ThemeScope {
  readonly theme = input.required<RteTheme>({ alias: 'demoThemeScope' });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect((onCleanup) => {
      onCleanup(applyRteTheme(this.host.nativeElement, this.theme()));
    });
  }
}

/** Pinta a amostra com o token derivado (`var(--rte-<token>)`) por CSSOM. */
@Directive({ selector: '[demoSwatch]' })
export class Swatch {
  readonly token = input.required<string>({ alias: 'demoSwatch' });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      this.host.nativeElement.style.setProperty(
        'background-color',
        `var(--rte-${this.token()})`,
      );
    });
  }
}

/** Define uma variável CSS no elemento por CSSOM (raio e densidade do nível 2). */
@Directive({ selector: '[demoCssVars]' })
export class CssVars {
  readonly vars = input.required<Readonly<Record<string, string>>>({
    alias: 'demoCssVars',
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect((onCleanup) => {
      const vars = this.vars();
      const style = this.host.nativeElement.style;
      for (const [name, value] of Object.entries(vars))
        style.setProperty(name, value);
      onCleanup(() => {
        for (const name of Object.keys(vars)) style.removeProperty(name);
      });
    });
  }
}
