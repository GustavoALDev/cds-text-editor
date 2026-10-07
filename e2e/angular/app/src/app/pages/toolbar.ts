import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  RteEditor,
  type RteEditorConfig,
  type RteLabelsInput,
  type RteToolbarConfig,
} from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import { RTE_CODE_LANGUAGES } from '@cds/rte-core/code-languages';
import type { RteTheme } from '@cds/rte-theme';
import {
  E2eBridge,
  NO_FORM_STATE,
  type RteE2eId,
  type RteE2eLang,
} from '../e2e-bridge';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

/** Todos os recursos da barra (menos `search`/`slashCommands`, D1 da 05a). */
const ALL_FEATURES: RteEditorConfig = {
  features: {
    colors: true,
    code: true,
    tables: true,
    tasks: true,
    media: true,
    embeds: true,
    newsBlocks: true,
  },
  codeLanguages: RTE_CODE_LANGUAGES,
};

/** Recursos desligados (lidos só na criação): itens somem (U8). */
const NO_FEATURES: RteEditorConfig = {
  features: { tables: false, colors: false, newsBlocks: false },
};

/** Primária do `toolbar-alt` (N12): diferente da do `toolbar`. */
export const ALT_THEME: RteTheme = { primary: '#0b6e4f', mode: 'light' };
export const MAIN_THEME: RteTheme = { primary: '#1d4ed8' };

type ToolbarPageId = Extract<
  RteE2eId,
  'toolbar' | 'toolbar-alt' | 'toolbar-scroll' | 'toolbar-nofeat'
>;

/**
 * N9–N12, N14 (spec 05b1): a barra `full` com todos os recursos, idioma,
 * `disabled`/`readonly` e tema ao vivo (`toolbar`); uma segunda instância
 * `minimal` com outro tema (`toolbar-alt`); recursos desligados
 * (`toolbar-nofeat`); e um editor no fim de um contêiner com rolagem
 * (`toolbar-scroll`). O espaçador antes do `toolbar` permite rolar a página
 * até a barra ficar no pé da viewport (menus que viram para cima).
 */
@Component({
  selector: 'app-toolbar',
  imports: [RteEditor],
  templateUrl: './toolbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabelsInput => LABELS[this.bridge.lang()];
  protected readonly allFeatures = ALL_FEATURES;
  protected readonly noFeatures = NO_FEATURES;

  protected readonly toolbars: Record<
    ToolbarPageId,
    ReturnType<typeof signal<RteToolbarConfig>>
  > = {
    toolbar: signal<RteToolbarConfig>('full'),
    'toolbar-alt': signal<RteToolbarConfig>('minimal'),
    'toolbar-scroll': signal<RteToolbarConfig>('full'),
    'toolbar-nofeat': signal<RteToolbarConfig>('full'),
  };
  protected readonly themes: Record<
    ToolbarPageId,
    ReturnType<typeof signal<RteTheme | undefined>>
  > = {
    toolbar: signal<RteTheme | undefined>(MAIN_THEME),
    'toolbar-alt': signal<RteTheme | undefined>(ALT_THEME),
    'toolbar-scroll': signal<RteTheme | undefined>(undefined),
    'toolbar-nofeat': signal<RteTheme | undefined>(undefined),
  };
  protected readonly values: Record<
    ToolbarPageId,
    ReturnType<typeof signal<string>>
  > = {
    toolbar: signal(''),
    'toolbar-alt': signal(''),
    'toolbar-scroll': signal(''),
    'toolbar-nofeat': signal(''),
  };
  /** `touch` emitido (saída do host, D11): o foco na barra e nos menus não toca. */
  protected readonly touched: Record<
    ToolbarPageId,
    ReturnType<typeof signal<boolean>>
  > = {
    toolbar: signal(false),
    'toolbar-alt': signal(false),
    'toolbar-scroll': signal(false),
    'toolbar-nofeat': signal(false),
  };

  constructor() {
    for (const id of Object.keys(this.values) as ToolbarPageId[]) {
      const value = this.values[id];
      this.bridge.register(id, {
        value: () => value(),
        setValue: (html) => value.set(html),
        state: () => ({ ...NO_FORM_STATE, touched: this.touched[id]() }),
        reset: () => {
          value.set('');
          this.touched[id].set(false);
        },
        setToolbar: (config) => this.toolbars[id].set(config),
        setTheme: (theme) => this.themes[id].set(theme),
      });
    }
  }
}
