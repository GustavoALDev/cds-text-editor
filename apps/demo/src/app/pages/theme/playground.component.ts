import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  checkRteTheme,
  suggestRteColor,
  supportsRelativeColors,
  type RteTheme,
  type RteThemePresetName,
  type RteThemeReport,
} from '@cds/rte-theme';
import { buildCss } from '../../theme-playground/css-snippet';
import {
  activePreset,
  applyPreset,
  clampDensity,
  clampRadius,
  COLOR_FIELDS,
  colorError,
  colorInputValue,
  DENSITY_LIMITS,
  DEFAULT_STATE,
  MODES,
  NEUTRALS,
  PRESET_LABELS,
  PRESET_NAMES,
  RADIUS_LIMITS,
  toRteTheme,
  type ColorField,
  type PlaygroundState,
} from '../../theme-playground/model';
import { buildContrastReport } from '../../theme-playground/report';
import {
  CssVars,
  Swatch,
  ThemeScope,
} from '../../theme-playground/scope.directives';
import { buildTs } from '../../theme-playground/ts-snippet';
import { readPresetParam } from './preset-param';

type SnippetKind = 'css' | 'ts';

/** Verificação de contraste e sugestão de cor (substituíveis nos testes). */
export interface ContrastTools {
  check(theme: RteTheme): RteThemeReport;
  suggest(color: string): string | null;
}

export const CONTRAST_TOOLS = new InjectionToken<ContrastTools>('CONTRAST_TOOLS', {
  providedIn: 'root',
  factory: () => ({ check: checkRteTheme, suggest: suggestRteColor }),
});

const COLOR_LABELS: Readonly<Record<ColorField, string>> = {
  primary: 'Primária',
  secondary: 'Secundária',
  tertiary: 'Terciária',
};

const MODE_LABELS = {
  auto: 'Automático (segue o sistema)',
  inherit: 'Herdar do site',
  light: 'Claro',
  dark: 'Escuro',
} as const;

const NEUTRAL_LABELS = { tinted: 'Tingidos', gray: 'Cinza' } as const;

/** Tokens derivados mostrados nas amostras, em claro e escuro lado a lado. */
const SWATCH_TOKENS = [
  ...(['primary', 'secondary', 'tertiary'] as const).flatMap((role) => [
    role,
    `${role}-hover`,
    `${role}-active`,
    `${role}-subtle`,
    `${role}-border`,
    `${role}-text`,
    `on-${role}`,
  ]),
  'surface',
  'surface-raised',
  'text',
  'text-muted',
  'border',
];

/**
 * Playground do tema (spec 07b, W7-W11): estado, relatório e snippets. A prévia com o `rte-editor`
 * é projetada pela página (`[preview]`), para este componente não depender do editor.
 */
@Component({
  selector: 'demo-theme-playground',
  imports: [ThemeScope, Swatch, CssVars],
  templateUrl: './playground.component.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePlayground {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly tools = inject(CONTRAST_TOOLS);

  protected readonly state = signal<PlaygroundState>(DEFAULT_STATE);
  protected readonly siteDark = signal(false);
  /** `null` até o navegador responder (no prerender não há como saber). */
  protected readonly nativeColors = signal<boolean | null>(null);
  protected readonly copiedMessage = signal('');
  protected readonly fallbackKind = signal<SnippetKind | null>(null);

  protected readonly presetNames = PRESET_NAMES;
  protected readonly presetLabels = PRESET_LABELS;
  protected readonly modes = MODES.map((value) => ({
    value,
    label: MODE_LABELS[value],
  }));
  protected readonly neutrals = NEUTRALS.map((value) => ({
    value,
    label: NEUTRAL_LABELS[value],
  }));
  protected readonly radiusLimits = RADIUS_LIMITS;
  protected readonly densityLimits = DENSITY_LIMITS;
  protected readonly swatchTokens = SWATCH_TOKENS;

  /** Tema do estado, para a prévia projetada pela página. */
  readonly theme = computed(() => toRteTheme(this.state()));
  protected readonly lightTheme = computed(() => ({
    ...this.theme(),
    mode: 'light' as const,
  }));
  protected readonly darkTheme = computed(() => ({
    ...this.theme(),
    mode: 'dark' as const,
  }));
  protected readonly cssVars = computed(() => ({
    '--rte-radius': `${this.state().radius}px`,
    '--rte-density': String(this.state().density),
  }));
  protected readonly activePreset = computed(() => activePreset(this.state()));
  protected readonly report = computed(() =>
    buildContrastReport(this.state(), this.tools.check, this.tools.suggest),
  );
  protected readonly css = computed(() => buildCss(this.state()));
  protected readonly ts = computed(() => buildTs(this.state()));
  protected readonly fields = computed(() =>
    COLOR_FIELDS.map((field) => {
      const text = this.state()[field];
      return {
        field,
        label: COLOR_LABELS[field],
        text,
        error: colorError(text),
        picker: colorInputValue(text) ?? '#000000',
      };
    }),
  );
  protected readonly fallbackText = computed(() => {
    const kind = this.fallbackKind();
    return kind === 'css' ? this.css() : kind === 'ts' ? this.ts() : '';
  });

  private readonly fallbackArea =
    viewChild<ElementRef<HTMLTextAreaElement>>('fallbackArea');

  constructor() {
    afterNextRender(() => {
      this.nativeColors.set(supportsRelativeColors());
      // `?preset=<id>` (07d, L7): lido uma vez, só no navegador, de uma lista fechada; a URL não é
      // reescrita e nada é persistido.
      const preset = readPresetParam(
        this.document.defaultView?.location.search ?? '',
        PRESET_NAMES,
      );
      if (preset) this.choosePreset(preset);
    });
    // "Site escuro": `color-scheme: dark` no <html> por CSSOM (só no navegador), revertido no fim.
    afterRenderEffect((onCleanup) => {
      if (!this.siteDark()) return;
      const style = this.document.documentElement.style;
      const previous = style.getPropertyValue('color-scheme');
      style.setProperty('color-scheme', 'dark');
      onCleanup(() => {
        if (previous) style.setProperty('color-scheme', previous);
        else style.removeProperty('color-scheme');
      });
    });
  }

  protected choosePreset(name: RteThemePresetName): void {
    this.state.update((s) => applyPreset(s, name));
  }

  protected setColor(field: ColorField, text: string): void {
    this.state.update((s) => ({ ...s, [field]: text }));
  }

  protected onColor(field: ColorField, event: Event): void {
    this.setColor(field, (event.target as HTMLInputElement).value);
  }

  protected setRadius(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.state.update((s) => ({ ...s, radius: clampRadius(value) }));
  }

  protected setDensity(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.state.update((s) => ({ ...s, density: clampDensity(value) }));
  }

  protected setMode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.update((s) => ({
      ...s,
      mode: MODES.find((m) => m === value) ?? s.mode,
    }));
  }

  protected setNeutral(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.update((s) => ({
      ...s,
      neutral: NEUTRALS.find((n) => n === value) ?? s.neutral,
    }));
  }

  protected setSiteDark(event: Event): void {
    this.siteDark.set((event.target as HTMLInputElement).checked);
  }

  protected reset(): void {
    this.state.set(DEFAULT_STATE);
  }

  /** Copia pela API da área de transferência; sem ela (ou negada), seleciona o texto. */
  protected async copy(kind: SnippetKind): Promise<void> {
    const text = kind === 'css' ? this.css() : this.ts();
    const label = kind === 'css' ? 'CSS' : 'TypeScript';
    try {
      await navigator.clipboard.writeText(text);
      this.fallbackKind.set(null);
      this.copiedMessage.set(`${label} copiado.`);
    } catch {
      this.fallbackKind.set(kind);
      this.copiedMessage.set(
        `Não foi possível copiar sozinho: o texto do ${label} está selecionado, use Ctrl/Cmd+C.`,
      );
      afterNextRender(
        () => {
          const area = this.fallbackArea()?.nativeElement;
          area?.focus();
          area?.select();
        },
        { injector: this.injector },
      );
    }
  }
}
