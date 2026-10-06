import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  FormRoot,
  maxLength,
  required,
  validate,
  type FieldTree,
} from '@angular/forms/signals';
import { normalizeAttribute } from '@cds/rte-core';
import type { RteVideoTrack } from '@cds/rte-core/extensions';
import { applyVideo, removeMediaAt } from '../apply-media';
import type { RteDialogRequest } from '../controller';
import {
  focusFirstInvalid,
  langCodeValidator,
  requiredTrimmed,
  text,
} from '../form-helpers';
import type { RteMediaRules } from '../media-rules';
import { canonicalMediaUrl, mediaUrlValidator } from '../media-validate';
import { RteDialogFormBase } from './form-base';

/** Limites do vídeo (V8): legenda e rótulo da faixa, da UI; faixas 0–10. */
const CAPTION_MAX = 300;
const LABEL_MAX = 100;
const VIDEO_TRACKS_MAX = 10;

const KINDS: readonly RteVideoTrack['kind'][] = ['captions', 'subtitles'];

/** Faixa no formulário (pré-voo 9). */
interface TrackModel {
  kind: RteVideoTrack['kind'];
  src: string;
  srclang: string;
  label: string;
  isDefault: boolean;
}

interface VideoModel {
  src: string;
  poster: string;
  caption: string;
  tracks: TrackModel[];
}

function emptyVideo(): VideoModel {
  return { src: '', poster: '', caption: '', tracks: [] };
}

function newTrack(): TrackModel {
  return {
    kind: 'captions',
    src: '',
    srclang: '',
    label: '',
    isDefault: false,
  };
}

/** Faixas do nó (o core já as guarda canônicas, com no máximo um padrão). */
function tracksOf(value: unknown): TrackModel[] {
  if (!Array.isArray(value)) return [];
  return (value as Record<string, unknown>[]).map((t) => ({
    kind: t['kind'] === 'subtitles' ? 'subtitles' : 'captions',
    src: text(t['src']),
    srclang: text(t['srclang']),
    label: text(t['label']),
    isDefault: t['default'] === true,
  }));
}

/** Valores de abertura: inserir → vazio; editar → os atributos do nó. */
function videoValues(req: RteDialogRequest): VideoModel {
  const node = req.mode === 'edit' ? req.doc.nodeAt(req.range.from) : null;
  if (!node || node.type.name !== 'rtVideo') return emptyVideo();
  const a = node.attrs;
  return {
    src: text(a['src']),
    poster: text(a['poster']),
    caption: text(a['caption']),
    // Todas as faixas do nó, mesmo acima do teto: nenhuma some em silêncio
    // (R4); o teto só desabilita "Acrescentar faixa".
    tracks: tracksOf(a['tracks']),
  };
}

/** Formulário do diálogo de vídeo e das faixas (V8), filho do `RteDialogs`. */
@Component({
  selector: 'rte-video-form',
  templateUrl: './video-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteVideoForm extends RteDialogFormBase {
  /** Regras das mídias do esquema do editor (V4); `null` sem `media`. */
  readonly rules = input<RteMediaRules | null>(null);

  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  protected readonly kinds = KINDS;
  protected readonly ids = computed(() => {
    const p = this.idPrefix();
    return {
      src: `${p}-video-src`,
      poster: `${p}-video-poster`,
      caption: `${p}-video-caption`,
      tracks: `${p}-video-tracks`,
      hint: `${p}-video-captions-hint`,
      add: `${p}-track-add`,
    };
  });

  private readonly model = signal<VideoModel>(emptyVideo());
  protected readonly form: FieldTree<VideoModel> = form(
    this.model,
    (p) => {
      requiredTrimmed(p.src);
      mediaUrlValidator(p.src, () => this.rules()?.videoSrc ?? null);
      mediaUrlValidator(p.poster, () => this.rules()?.videoPoster ?? null);
      maxLength(p.caption, CAPTION_MAX);
      applyEach(p.tracks, (t) => {
        requiredTrimmed(t.src);
        mediaUrlValidator(t.src, () => this.rules()?.trackSrc ?? null);
        required(t.srclang);
        langCodeValidator(t.srclang, () => this.rules()?.trackLang ?? null);
        // Rótulo obrigatório (não só espaços): é o nome no menu do player.
        validate(t.label, ({ value }) =>
          value().trim() === '' ? { kind: 'required' } : undefined,
        );
        maxLength(t.label, LABEL_MAX);
      });
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () =>
          focusFirstInvalid([
            this.form.src,
            this.form.poster,
            this.form.caption,
            ...[...this.form.tracks].flatMap((t) => [
              t.src,
              t.srclang,
              t.label,
            ]),
          ]),
      },
    },
  );

  protected readonly full = computed(
    () => this.model().tracks.length >= VIDEO_TRACKS_MAX,
  );
  /** Lembrete da WCAG 1.2.2 sem faixa `captions` (não bloqueia, V8). */
  protected readonly noCaptions = computed(
    () => !this.model().tracks.some((t) => t.kind === 'captions'),
  );

  constructor() {
    super();
    // Pedido novo: valores atuais no formulário antes do render.
    effect(() => {
      const req = this.request();
      untracked(() => this.form().reset(videoValues(req)));
    });
  }

  protected kindName(kind: RteVideoTrack['kind']): string {
    const l = this.labels();
    return kind === 'captions' ? l.videoTrackCaptions : l.videoTrackSubtitles;
  }

  /** Id do `<select>` de tipo da faixa `i` (alvo do foco, pré-voo 9). */
  protected kindId(i: number): string {
    return `${this.idPrefix()}-track-${i}-kind`;
  }

  protected trackId(i: number, name: string): string {
    return `${this.idPrefix()}-track-${i}-${name}`;
  }

  protected addTrack(): void {
    const tracks = untracked(this.model).tracks;
    if (tracks.length >= VIDEO_TRACKS_MAX) return;
    this.model.update((m) => ({ ...m, tracks: [...m.tracks, newTrack()] }));
    this.focusAfterRender(this.kindId(tracks.length));
  }

  /** Remove a faixa `i`; foco na seguinte, senão na anterior, senão em "Acrescentar" (V8). */
  protected removeTrack(i: number): void {
    const count = untracked(this.model).tracks.length;
    this.model.update((m) => ({
      ...m,
      tracks: m.tracks.filter((_, j) => j !== i),
    }));
    const next = i < count - 1 ? i : i - 1;
    this.focusAfterRender(
      next >= 0 ? this.kindId(next) : untracked(this.ids).add,
    );
  }

  /** "Padrão" marcado desmarca as outras faixas (V8). */
  protected onDefault(i: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.model.update((m) => ({
      ...m,
      tracks: m.tracks.map((t, j) =>
        j === i
          ? { ...t, isDefault: checked }
          : checked && t.isDefault
            ? { ...t, isDefault: false }
            : t,
      ),
    }));
  }

  private focusAfterRender(id: string): void {
    afterNextRender(
      { write: () => this.document.getElementById(id)?.focus() },
      { injector: this.injector },
    );
  }

  protected remove(): void {
    const req = untracked(this.request);
    if (req.kind !== 'video' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeMediaAt(editor, req));
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'video') return;
    // Os retornos abaixo são inalcançáveis enquanto os validadores do
    // formulário seguirem as mesmas regras; só protegem contra divergência.
    const m = untracked(this.model);
    const rules = untracked(this.rules);
    const src = canonicalMediaUrl(rules?.videoSrc ?? null, m.src);
    if (src === null) return;
    const poster =
      m.poster.trim() === ''
        ? null
        : canonicalMediaUrl(rules?.videoPoster ?? null, m.poster);
    if (m.poster.trim() !== '' && poster === null) return;
    const tracks: RteVideoTrack[] = [];
    for (const t of m.tracks) {
      const trackSrc = canonicalMediaUrl(rules?.trackSrc ?? null, t.src);
      // Idioma sem `trim` (Ruling 11), canônico pela regra (pré-voo 9).
      const srclang = rules
        ? normalizeAttribute(rules.trackLang, t.srclang)
        : null;
      if (trackSrc === null || srclang === null) return;
      tracks.push({
        kind: t.kind,
        src: trackSrc,
        srclang,
        label: t.label.trim(),
        default: t.isDefault,
      });
    }
    const value = { src, poster, caption: m.caption, tracks };
    this.controller().apply((editor) => applyVideo(editor, req, value));
  }
}
