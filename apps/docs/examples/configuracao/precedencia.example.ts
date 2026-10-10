// #region precedencia
import { Component, input } from '@angular/core';
import {
  RteEditor,
  provideRichText,
  type RteToolbarConfig,
} from '@comodeviaser/rte-angular';

@Component({
  selector: 'docs-precedence-editor',
  imports: [RteEditor],
  template: `
    <rte-editor
      ariaLabel="Texto"
      [toolbar]="toolbar()"
      [showCharCount]="chars()"
      [theme]="theme()"
    />
  `,
})
export class PrecedenceEditor {
  // Sem valor, a entrada não decide nada: vale o provider mais próximo.
  readonly toolbar = input<RteToolbarConfig>();
  readonly chars = input<boolean>();
  readonly theme = input<{ primary?: string; secondary?: string }>();
}

// Na raiz (`app.config`): barra completa, contador de caracteres, duas cores.
export const rootProviders = [
  provideRichText({
    toolbar: 'full',
    counters: { chars: true },
    theme: { primary: '#0b57d0', secondary: '#7a5900' },
  }),
];

// Na rota: um novo `provideRichText` SUBSTITUI o da raiz por inteiro. Sem `counters` aqui, não
// há contador, mesmo que a raiz tenha ligado um.
export const routeProviders = [
  provideRichText({ toolbar: 'minimal', theme: { primary: '#b3261e' } }),
];
// #endregion
