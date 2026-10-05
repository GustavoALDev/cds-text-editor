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
  type RteMediaChange,
} from '@cds/rte-angular';
import {
  RTE_LABELS_EN,
  RTE_LABELS_ES,
  RTE_LABELS_PT_BR,
} from '@cds/rte-angular/i18n';
import { E2eBridge, NO_FORM_STATE, type RteE2eLang } from '../e2e-bridge';
import { ALT_THEME, MAIN_THEME } from './toolbar';

const LABELS: Record<RteE2eLang, RteLabelsInput> = {
  en: RTE_LABELS_EN,
  'pt-BR': RTE_LABELS_PT_BR,
  es: RTE_LABELS_ES,
};

/**
 * Documento inicial do `media` (N25-N31): imagem com `alt`, imagem decorativa
 * (`alt=""`: o HTML canônico não distingue "sem `alt`"), vídeo WebM com uma
 * faixa de legenda, o *embed* do YouTube que `toEmbed` produz e um parágrafo
 * final. WebM + `.vtt` (sem MP4, ruling 6 do ADR 0011). Forma canônica de
 * `getRteHtml`, menos o `style="aspect-ratio: 16 / 9"` que o core acrescenta
 * ao `iframe` na saída: um atributo `style` no HTML carregado violaria a CSP
 * estrita (`style-src-attr`); o N30 confere a ida e volta sem ele.
 */
export const MEDIA_FIXTURE =
  '<p>Mídia</p>' +
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="Imagem de teste" loading="lazy" decoding="async"></figure>' +
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="" loading="lazy" decoding="async"></figure>' +
  '<figure class="rt-figure rt-figure--video"><video src="/e2e.webm" controls="" preload="metadata" playsinline=""><track kind="captions" src="/e2e.vtt" srclang="pt-BR" label="Português"></video></figure>' +
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="560" height="315" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe></figure>' +
  '<p>Fim</p>';

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

  protected readonly lastChange = signal<RteMediaChange | null>(null);
  protected readonly changeCount = signal(0);
  protected readonly results = signal<Partial<Record<RteDialogKind, boolean>>>(
    {},
  );

  private readonly main = viewChild.required<RteEditor>('main');
  private readonly alt = viewChild.required<RteEditor>('alt');

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
    });
    this.bridge.register('media-alt', {
      value: () => this.altValue(),
      setValue: (html) => this.altValue.set(html),
      state: () => NO_FORM_STATE,
      reset: () => this.altValue.set(MEDIA_FIXTURE),
      openDialog: (kind) => this.alt().openDialog(kind as RteDialogKind),
      lastMediaChange: () => null,
      mediaChanges: () => 0,
      mediaSession: () => this.alt().mediaSession(),
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
