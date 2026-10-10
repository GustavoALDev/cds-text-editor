import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  FormRoot,
  maxLength,
  validate,
  type FieldTree,
} from '@angular/forms/signals';
import type { RteAttrRule } from '@comodeviaser/rte-core';
import type { RteImageAlign } from '@comodeviaser/rte-core/extensions';
import { applyImage, removeMediaAt } from '../apply-media';
import type { RteDialogRequest } from '../controller';
import { focusFirstInvalid, text } from '../form-helpers';
import {
  canonicalMediaUrl,
  mediaUrlValidator,
  optionalIntegerInRange,
  requiredTrimmed,
} from '../media-validate';
import { RteMediaSourceForm, type MediaSourceModel } from './media-source';

/** Limites da imagem (V6): `alt` é o teto do core; legenda e crédito, da UI. */
const ALT_MAX = 1000;
const CAPTION_MAX = 300;
const WIDTH_MAX = 10000;

const ALIGNS: readonly RteImageAlign[] = ['left', 'center', 'right', 'full'];

interface ImageModel extends MediaSourceModel {
  src: string;
  alt: string;
  decorative: boolean;
  caption: string;
  credit: string;
  align: RteImageAlign;
  width: number | null;
}

const IMAGE_INITIAL: Readonly<ImageModel> = Object.freeze({
  source: 'url',
  file: null,
  src: '',
  alt: '',
  decorative: false,
  caption: '',
  credit: '',
  align: 'center',
  width: null,
});

/**
 * Valores de abertura (pré-voo 6): inserir → vazio; editar → os atributos
 * do nó, com `alt: null` sem escolha, `alt: ''` como "decorativa" (V7).
 */
function imageValues(req: RteDialogRequest): ImageModel {
  const node = req.mode === 'edit' ? req.doc.nodeAt(req.range.from) : null;
  if (!node || node.type.name !== 'rtImage') return { ...IMAGE_INITIAL };
  const a = node.attrs;
  const align = a['align'] as RteImageAlign;
  const width: unknown = a['width'];
  return {
    source: 'url',
    file: null,
    src: text(a['src']),
    alt: text(a['alt']),
    decorative: a['alt'] === '',
    caption: text(a['caption']),
    credit: text(a['credit']),
    align: ALIGNS.includes(align) ? align : 'center',
    width: typeof width === 'number' ? width : null,
  };
}

/** Largura do campo: vazio (ou não numérico) é "sem largura". */
function widthOf(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value;
}

/** Formulário do diálogo de imagem (V6, V7), filho do `RteDialogs`. */
@Component({
  selector: 'rte-image-form',
  templateUrl: './image-form.html',
  imports: [FormField, FormRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RteImageForm extends RteMediaSourceForm<ImageModel> {
  protected readonly kind = 'image';
  /** Regra de `img[src]` do esquema do editor (V4); `null` sem `media`. */
  readonly rule = input<RteAttrRule | null>(null);
  /** Nomes dos alinhamentos, de `floating` (V14). */
  readonly alignNames =
    input.required<Readonly<Record<RteImageAlign, string>>>();

  protected readonly aligns = ALIGNS;
  protected readonly ids = computed(() => {
    const p = `${this.idPrefix()}-image`;
    return {
      src: `${p}-src`,
      alt: `${p}-alt`,
      decorative: `${p}-decorative`,
      caption: `${p}-caption`,
      credit: `${p}-credit`,
      align: `${p}-align`,
      width: `${p}-width`,
    };
  });

  protected readonly model = signal<ImageModel>({ ...IMAGE_INITIAL });
  /** Largura da abertura: só uma largura diferente mexe no tamanho (V6). */
  private initialWidth: number | null = null;
  /** Endereço da abertura: outro endereço limpa `srcset`/`sizes`/`height`. */
  private initialSrc = '';
  protected readonly form: FieldTree<ImageModel> = form(
    this.model,
    (p) => {
      this.sourceSchema(p, (q) => {
        requiredTrimmed(q.src);
        mediaUrlValidator(q.src, () => this.rule());
      });
      // Texto obrigatório (não só espaços) sem "decorativa" (V7).
      validate(p.alt, ({ value, valueOf }) =>
        !valueOf(p.decorative) && value().trim() === ''
          ? { kind: 'required' }
          : undefined,
      );
      disabled(p.alt, ({ valueOf }) => valueOf(p.decorative));
      maxLength(p.alt, ALT_MAX);
      maxLength(p.caption, CAPTION_MAX);
      maxLength(p.credit, CAPTION_MAX);
      optionalIntegerInRange(p.width, 1, WIDTH_MAX);
    },
    {
      submission: {
        action: async () => {
          this.apply();
          return undefined;
        },
        onInvalid: () =>
          this.focusFileIfInvalid() ||
          focusFirstInvalid([
            this.form.src,
            this.form.alt,
            this.form.caption,
            this.form.credit,
            this.form.width,
          ]),
      },
    },
  );

  constructor() {
    super();
    // Pedido novo: valores atuais no formulário antes do render.
    effect(() => {
      const req = this.request();
      untracked(() => {
        const values = imageValues(req);
        this.initialWidth = values.width;
        this.initialSrc = values.src;
        this.clearFileInput();
        this.form().reset({ ...values, source: this.sourceFor(req) });
      });
    });
  }

  /** "Decorativa" marcada ou desmarcada: o texto alternativo volta vazio (V7). */
  protected onDecorative(): void {
    this.model.update((m) => ({ ...m, alt: '' }));
  }

  protected remove(): void {
    const req = untracked(this.request);
    if (req.kind !== 'image' || req.mode !== 'edit') return;
    this.controller().apply((editor) => removeMediaAt(editor, req));
  }

  private apply(): void {
    const req = untracked(this.request);
    if (req.kind !== 'image') return;
    const m = untracked(this.model);
    if (untracked(this.useFile)) {
      this.startUpload({
        alt: m.decorative ? '' : m.alt.trim(),
        caption: m.caption,
        credit: m.credit,
      });
      return;
    }
    const rule = untracked(this.rule);
    const src = canonicalMediaUrl(rule, m.src);
    if (src === null) return;
    const width = widthOf(m.width);
    const initialSrc =
      canonicalMediaUrl(rule, this.initialSrc) ?? this.initialSrc;
    const value = {
      src,
      alt: m.decorative ? '' : m.alt.trim(),
      caption: m.caption,
      credit: m.credit,
      align: m.align,
      width,
      widthChanged: width !== this.initialWidth,
      srcChanged: src !== initialSrc,
    };
    this.controller().apply((editor) => applyImage(editor, req, value));
  }
}
