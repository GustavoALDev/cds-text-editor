import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  hidden,
  readonly,
} from '@angular/forms/signals';
import {
  RteEditor,
  type RteDialogKind,
  type RteEditorConfig,
  type RteLabelsInput,
  type RteToolbarConfig,
  type RteMediaChange,
} from '@comodeviaser/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@comodeviaser/rte-angular/i18n';
import { E2eBridge, NO_FORM_STATE, type RteE2eLang } from '../e2e-bridge';
import { MEDIA_FIXTURE } from './media-fixture';
import { ALT_THEME, MAIN_THEME } from './toolbar';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

/** Documento da carga externa (muda os endereços sem emitir `mediaChange`). */
export const MEDIA_EXTERNAL =
  '<p>Carga externa</p><figure class="rt-figure rt-figure--center"><img src="/e2e.png?external" alt="Externa"></figure>';

const FEATURES: RteEditorConfig['features'] = {
  media: true,
  embeds: true,
};

const MAIN_OPTIONS: RteEditorConfig = {
  features: FEATURES,
  mediaHosts: ['media.example.test'],
  allowRelativeMedia: true,
};

/** `media-alt`: sem provedores de embed, sem o menu de embed e sem barra. */
const ALT_OPTIONS: RteEditorConfig = {
  features: FEATURES,
  embedProviders: [],
  allowRelativeMedia: true,
};

/**
 * Instâncias sem `(mediaChange)` ligado: ler o delta delas é erro do teste,
 * não `null`/0 em silêncio (Fix 6 da revisão final da 05c1).
 */
function notWired(id: string): never {
  throw new Error(`rteE2e: editor '${id}' sem (mediaChange) ligado.`);
}

/**
 * N25–N31 (spec 05c1): diálogos e menus de mídia no editor `media` (barra
 * `full`, `[formField]`, `mediaChange` gravado e mostrado) e no `media-alt`
 * (sem barra, `embedProviders: []`, `floatingMenus: { embed: false }`, com
 * botões `media-open-*` que chamam `openDialog`).
 */
@Component({
  selector: 'app-media',
  imports: [RteEditor, FormField],
  templateUrl: './media.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaPage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly labels = (): RteLabelsInput => LABELS[this.bridge.lang()];
  protected readonly mainOptions = MAIN_OPTIONS;
  protected readonly altOptions = ALT_OPTIONS;
  protected readonly mainTheme = MAIN_THEME;
  protected readonly altTheme = ALT_THEME;
  protected readonly altMenus = { embed: false };
  protected readonly kinds: readonly RteDialogKind[] = [
    'image',
    'video',
    'embed',
  ];

  protected readonly model = signal({ body: MEDIA_FIXTURE });
  protected readonly f = form(this.model, (p) => {
    disabled(p.body, () => this.bridge.disabled());
    readonly(p.body, () => this.bridge.readonly());
    hidden(p.body, () => this.bridge.hidden());
  });
  protected readonly altValue = signal(MEDIA_FIXTURE);
  protected readonly keyValue = signal(MEDIA_FIXTURE);
  protected readonly toolbar = signal<RteToolbarConfig>('full');

  protected readonly lastChange = signal<RteMediaChange | null>(null);
  protected readonly changeCount = signal(0);
  protected readonly results = signal<Partial<Record<RteDialogKind, boolean>>>(
    {},
  );

  private readonly main = viewChild.required<RteEditor>('main');
  private readonly alt = viewChild.required<RteEditor>('alt');
  private readonly key = viewChild.required<RteEditor>('key');

  constructor() {
    this.bridge.register('media', {
      value: () => this.model().body,
      setValue: (html) => this.model.update((m) => ({ ...m, body: html })),
      state: () => {
        const field = this.f.body();
        return {
          valid: field.valid(),
          touched: field.touched(),
          dirty: field.dirty(),
          errors: field.errors().map((e) => e.kind),
        };
      },
      reset: () => this.f().reset({ body: MEDIA_FIXTURE }),
      openDialog: (kind) => this.main().openDialog(kind as RteDialogKind),
      lastMediaChange: () => this.lastChange(),
      mediaChanges: () => this.changeCount(),
      mediaSession: () => this.main().mediaSession(),
      setToolbar: (config) => this.toolbar.set(config),
    });
    this.bridge.register('media-alt', {
      value: () => this.altValue(),
      setValue: (html) => this.altValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.altValue.set(MEDIA_FIXTURE),
      openDialog: (kind) => this.alt().openDialog(kind as RteDialogKind),
      lastMediaChange: () => notWired('media-alt'),
      mediaChanges: () => notWired('media-alt'),
      mediaSession: () => this.alt().mediaSession(),
    });
    this.bridge.register('media-key', {
      value: () => this.keyValue(),
      setValue: (html) => this.keyValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.keyValue.set(MEDIA_FIXTURE),
      openDialog: (kind) => this.key().openDialog(kind as RteDialogKind),
      lastMediaChange: () => notWired('media-key'),
      mediaChanges: () => notWired('media-key'),
      mediaSession: () => this.key().mediaSession(),
    });
  }

  protected onChange(change: RteMediaChange): void {
    this.lastChange.set(change);
    this.changeCount.update((n) => n + 1);
  }

  protected open(kind: RteDialogKind): void {
    const result = this.alt().openDialog(kind);
    this.results.update((r) => ({ ...r, [kind]: result }));
  }

  /** Carga externa: troca o modelo (a sessão refaz a base, sem `mediaChange`). */
  protected loadExternal(): void {
    this.model.update((m) => ({ ...m, body: MEDIA_EXTERNAL }));
  }

  protected json(value: unknown): string {
    return JSON.stringify(value);
  }
}
