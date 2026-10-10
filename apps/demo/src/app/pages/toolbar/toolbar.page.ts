import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RteEditor, type RteToolbarConfig } from '@comodeviaser/rte-angular';
import { RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';

export type ToolbarPreset = 'minimal' | 'article' | 'full';
export type ToolbarFeature = 'colors' | 'tasks' | 'code' | 'tables' | 'newsBlocks';

export const TOOLBAR_PRESETS: readonly ToolbarPreset[] = ['minimal', 'article', 'full'];
export const TOOLBAR_FEATURES: readonly { id: ToolbarFeature; label: string }[] = [
  { id: 'colors', label: 'Cores (texto e destaque)' },
  { id: 'tasks', label: 'Lista de tarefas' },
  { id: 'code', label: 'Código' },
  { id: 'tables', label: 'Tabelas' },
  { id: 'newsBlocks', label: 'Blocos de notícia' },
];

/** Configuração de criação do editor: as opções são lidas uma vez, então mudar recria. */
export interface ToolbarSetup {
  readonly key: string;
  readonly toolbar: RteToolbarConfig;
  readonly options: { readonly features: Readonly<Record<ToolbarFeature, boolean>> };
}

/** Página "Barra": preset e features; a troca recria o editor (as opções são lidas uma vez). */
@Component({
  selector: 'demo-toolbar-page',
  imports: [RteEditor],
  templateUrl: './toolbar.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarPage {
  protected readonly labels = RTE_LABELS_PT_BR;
  protected readonly presets = TOOLBAR_PRESETS;
  protected readonly featureList = TOOLBAR_FEATURES;
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md#barra-de-ferramentas';

  readonly preset = signal<ToolbarPreset>('article');
  readonly features = signal<Readonly<Record<ToolbarFeature, boolean>>>({
    colors: true,
    tasks: true,
    code: true,
    tables: true,
    newsBlocks: true,
  });
  protected readonly html = signal('<p>Troque o preset ou as features: o editor é recriado.</p>');

  /** Lista de um item só; o `track` pela chave mantém a instância enquanto a configuração é a mesma. */
  protected readonly setups = computed<readonly ToolbarSetup[]>(() => {
    const preset = this.preset();
    const features = this.features();
    return [
      {
        key: `${preset}|${TOOLBAR_FEATURES.map((f) => (features[f.id] ? '1' : '0')).join('')}`,
        toolbar: preset,
        options: { features },
      },
    ];
  });

  protected setPreset(event: Event): void {
    this.preset.set((event.target as HTMLSelectElement).value as ToolbarPreset);
  }

  protected toggle(id: ToolbarFeature, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.features.update((f) => ({ ...f, [id]: checked }));
  }
}
