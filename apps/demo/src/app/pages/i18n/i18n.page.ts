import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RteEditor, type RteLabels } from '@comodeviaser/rte-angular';
import { RTE_LABELS_EN, RTE_LABELS_ES, RTE_LABELS_PT_BR } from '@comodeviaser/rte-angular/i18n';

export type DemoLang = 'pt-BR' | 'en' | 'es';

export const DEMO_LANGS: readonly { id: DemoLang; label: string }[] = [
  { id: 'pt-BR', label: 'Português (pt-BR)' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

const PACKS: Readonly<Record<DemoLang, RteLabels>> = {
  'pt-BR': RTE_LABELS_PT_BR,
  en: RTE_LABELS_EN,
  es: RTE_LABELS_ES,
};

/** Página "Idiomas": um signal troca os rótulos do mesmo editor, sem recriá-lo. */
@Component({
  selector: 'demo-i18n-page',
  imports: [RteEditor],
  templateUrl: './i18n.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class I18nPage {
  protected readonly langs = DEMO_LANGS;
  protected readonly readmeUrl =
    'https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md#rotulos-e-idioma';

  readonly lang = signal<DemoLang>('pt-BR');
  protected readonly labels = computed(() => PACKS[this.lang()]);
  protected readonly empty = signal('');

  protected setLang(event: Event): void {
    this.lang.set((event.target as HTMLSelectElement).value as DemoLang);
  }
}
