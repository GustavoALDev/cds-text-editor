import {
  computed,
  Directive,
  ElementRef,
  input,
  untracked,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import {
  applyWhen,
  validate,
  type FieldTree,
  type SchemaPath,
  type SchemaPathTree,
  type ValidationError,
} from '@angular/forms/signals';
import type { RteDialogUploads, RteFileRules } from '../../upload/dialog-port';
import type { RteUploadText, RteUploadType } from '../../upload/types';
import type { RteDialogRequest } from '../controller';
import { RteDialogFormBase } from './form-base';

/** Origem da mídia no modo inserir com adaptador (05c2a E14). */
export type RteMediaSource = 'file' | 'url';

/** Parte do modelo comum aos formulários de imagem e vídeo. */
export interface MediaSourceModel {
  source: RteMediaSource;
  file: File | null;
}

/**
 * Base dos formulários de imagem e vídeo com origem "Arquivo" ou "Endereço"
 * (05c2a E14, pré-voo 13). Com a porta (`uploads`), no modo inserir, o grupo
 * "Origem" escolhe entre o campo de arquivo e o de endereço; os dois ficam no
 * DOM e o inativo leva `hidden` (o arquivo escolhido sobrevive à troca de
 * origem e de idioma). O `<input type="file">` não usa `[formField]`: o
 * `change` grava o modelo e marca o campo como tocado.
 */
@Directive()
export abstract class RteMediaSourceForm<
  M extends MediaSourceModel,
> extends RteDialogFormBase {
  /** Porta do envio (pré-voo 13); `null` sem adaptador. */
  readonly uploads = input<RteDialogUploads | null>(null);

  protected abstract readonly kind: RteUploadType;
  protected abstract readonly model: WritableSignal<M>;
  protected abstract readonly form: FieldTree<M>;

  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Regras do arquivo: só com a porta, o tipo aceito e o modo inserir. */
  protected readonly fileRules = computed<RteFileRules | null>(() => {
    const uploads = this.uploads();
    if (!uploads || this.request().mode !== 'insert') return null;
    return this.kind === 'image' ? uploads.image : uploads.video;
  });

  /** A origem efetiva é o arquivo. */
  protected readonly useFile = computed(
    () => this.fileRules() !== null && this.model().source === 'file',
  );

  protected readonly sourceIds = computed(() => {
    const p = `${this.idPrefix()}-${this.kind}`;
    return {
      name: `${p}-source`,
      file: `${p}-source-file`,
      url: `${p}-source-url`,
      input: `${p}-file`,
    };
  });

  /** Origem inicial de um pedido: "Arquivo" quando há regras (E14). */
  protected sourceFor(req: RteDialogRequest): RteMediaSource {
    const uploads = untracked(this.uploads);
    const rules =
      uploads && req.mode === 'insert'
        ? this.kind === 'image'
          ? uploads.image
          : uploads.video
        : null;
    return rules ? 'file' : 'url';
  }

  /**
   * Validadores da origem (pré-voo 13): os do endereço (`url`) só sem o
   * arquivo; os do arquivo só com ele.
   */
  protected sourceSchema(
    p: SchemaPathTree<M>,
    url: (p: SchemaPathTree<M>) => void,
  ): void {
    const tree = p as unknown as SchemaPathTree<MediaSourceModel>;
    applyWhen(p as unknown as SchemaPath<M>, () => !this.useFile(), url);
    applyWhen(
      tree,
      () => this.useFile(),
      (q) => validate(q.file, ({ value }) => this.fileError(value())),
    );
  }

  /** Limpa o arquivo do `<input>` nativo (pedido novo). */
  protected clearFileInput(): void {
    const el = untracked(this.fileInput)?.nativeElement;
    if (el) el.value = '';
  }

  protected onSource(source: RteMediaSource): void {
    this.model.update((m) => ({ ...m, source }));
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.model.update((m) => ({ ...m, file }));
    this.fileField()().markAsTouched();
  }

  /** O campo de arquivo é o primeiro inválido: foca o `<input>` nativo. */
  protected focusFileIfInvalid(): boolean {
    if (!untracked(this.useFile) || !this.fileField()().invalid()) {
      return false;
    }
    untracked(this.fileInput)?.nativeElement.focus();
    return true;
  }

  /**
   * "Aplicar" com arquivo (E14): fecha como aplicação, devolve o foco ao
   * editável e cria o envio no ponto do alvo do pedido.
   */
  protected startUpload(text: RteUploadText): void {
    const req = untracked(this.request);
    const uploads = untracked(this.uploads);
    const file = untracked(this.model).file;
    if (!uploads || !file) return;
    const type = this.kind;
    this.controller().apply((editor) => {
      // O `focus` do Tiptap foca num quadro seguinte; o `view.focus()` foca
      // já (G4), antes de o marcador entrar.
      editor.commands.focus();
      editor.view.focus();
      return uploads.start({ file, type, at: req.range.to, text });
    });
  }

  protected fileError(file: File | null): ValidationError | undefined {
    if (!file) return { kind: 'rteFileRequired' };
    const uploads = this.uploads();
    const reason = uploads ? uploads.check(file, this.kind) : 'type';
    if (reason === 'type') return { kind: 'rteFileType' };
    if (reason === 'size') {
      return {
        kind: 'rteFileSize',
        maxMegabytes: this.fileRules()?.maxMegabytes ?? 0,
      } as ValidationError;
    }
    return undefined;
  }

  private fileField(): FieldTree<File | null> {
    return (this.form as unknown as FieldTree<MediaSourceModel>).file;
  }
}
