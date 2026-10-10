import {
  effect,
  inject,
  InjectionToken,
  isDevMode,
  signal,
  untracked,
  type NgZone,
  type Signal,
} from '@angular/core';
import type {
  RteDraftAvailable,
  RteDraftConfig,
  RteDraftErrorEvent,
} from './types';

/** O que o *chunk* `rte-draft` precisa do `RteEditor` (contrato com a fachada). */
export interface RteDraftHost {
  readonly zone: NgZone;
  readonly view: Window | null;
  /** `draft` do `provideRichText`. */
  readonly config: RteDraftConfig | undefined;
  /** Editável (nem `readonly`, nem `disabled`). */
  editable(): boolean;
  pendingUploads(): number;
  isDirty(): boolean;
  /** Valor atual e base salva (HTML canônico). */
  current(): string;
  base(): string;
  /** HTML pela leitura do esquema (a forma canônica), sem aplicar. */
  canonical(html: string): string;
  /** Aplica o HTML como o `value` (S5): emite `value` uma vez. */
  apply(html: string): boolean;
  /** Publica a decisão pendente (dentro da zona). */
  setAvailable(value: RteDraftAvailable | null): void;
  available(): RteDraftAvailable | null;
  emitError(e: RteDraftErrorEvent): void;
}

/** Rascunho montado num editor. */
export interface RteDraftRuntime {
  /** Chave de armazenamento já validada, ou `null` para parar. */
  setKey(key: string | null): void;
  onValue(): void;
  onLoaded(): void;
  restore(): boolean;
  discard(): void;
  /** `markSaved`: apaga o rascunho e a decisão pendente. */
  clear(): void;
  dispose(): void;
}

/** O que o *chunk* `rte-draft` oferece (só o tipo fica no principal). */
export interface RteDraftModule {
  createDraftRuntime(host: RteDraftHost): RteDraftRuntime;
}

export type RteDraftLoader = () => Promise<RteDraftModule>;

/**
 * Carregador do *chunk* `rte-draft` (S2): o `import()` que o ng-packagr
 * separa em `fesm2022/comodeviaser-rte-angular-rte-draft-<hash>.mjs`. Interno; os
 * testes o trocam para contar chamadas ou falhar a carga.
 */
export const RTE_DRAFT_LOADER = new InjectionToken<RteDraftLoader>(
  'RTE_DRAFT_LOADER',
  { providedIn: 'root', factory: () => () => import('./rte-draft') },
);

const LOAD_FAILED =
  '[rte-editor] não foi possível carregar o rascunho; esta página fica sem rascunho.';

const BAD_KEY =
  '[rte-editor] draftKey deve ter de 1 a 200 caracteres; foi ignorada.';

/** Tamanho máximo de `draftKey` (S3). */
export const DRAFT_KEY_MAX = 200;

/** Prefixo da chave de armazenamento (S3). */
export const DRAFT_KEY_PREFIX = 'rte-draft:';

/**
 * Fachada do rascunho no *chunk* principal (S2): só com `draftKey` válido e
 * editor criado (nunca no servidor) carrega o *chunk* `rte-draft`, que guarda
 * o agendador, o ouvinte `storage` e a verificação inicial. Falha de carga =
 * sem rascunho nesta página, aviso em `isDevMode()`, sem nova tentativa.
 */
export class RteDraft {
  private readonly pending = signal<RteDraftAvailable | null>(null, {
    equal: (a, b) => a?.savedAt === b?.savedAt,
  });
  /** Decisão de restauração pendente (S5); `null` sem rascunho. */
  readonly available: Signal<RteDraftAvailable | null> =
    this.pending.asReadonly();

  private runtime: RteDraftRuntime | null = null;
  private loading = false;
  private failed = false;
  private disposed = false;
  private clearedEarly = false;
  private warnedKey: string | null = null;

  constructor(
    private readonly host: RteDraftHost,
    private readonly editor: Signal<unknown>,
    private readonly key: Signal<string | null | undefined>,
    private readonly loader: RteDraftLoader = inject(RTE_DRAFT_LOADER),
  ) {
    effect(() => {
      const raw = this.key();
      const ready = !!this.editor();
      untracked(() => this.sync(ready ? this.valid(raw) : null));
    });
  }

  /** O host publica a decisão (dentro da zona). */
  publish(value: RteDraftAvailable | null): void {
    this.pending.set(value);
  }

  onValue(): void {
    this.runtime?.onValue();
  }

  onLoaded(): void {
    this.runtime?.onLoaded();
  }

  /** `markSaved` (S8): apaga o rascunho; antes de o *chunk* chegar, na chegada. */
  cleared(): void {
    if (this.runtime) this.runtime.clear();
    else if (this.loading) this.clearedEarly = true;
  }

  restore(): boolean {
    return this.runtime !== null && untracked(this.pending) !== null
      ? this.runtime.restore()
      : false;
  }

  discard(): void {
    this.runtime?.discard();
  }

  dispose(): void {
    this.disposed = true;
    this.runtime?.dispose();
    this.runtime = null;
  }

  private valid(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    if (
      typeof raw === 'string' &&
      raw.length >= 1 &&
      raw.length <= DRAFT_KEY_MAX
    ) {
      return raw;
    }
    if (isDevMode() && this.warnedKey !== String(raw)) {
      this.warnedKey = String(raw);
      console.warn(BAD_KEY);
    }
    return null;
  }

  private sync(key: string | null): void {
    if (this.disposed) return;
    if (this.runtime) {
      this.runtime.setKey(key);
      return;
    }
    if (key === null || this.failed || this.loading) return;
    this.loading = true;
    this.host.zone.runOutsideAngular(() => {
      this.loader().then(
        (m) => this.attach(m),
        () => this.fail(),
      );
    });
  }

  private attach(m: RteDraftModule): void {
    if (this.disposed) return;
    try {
      this.runtime = m.createDraftRuntime(this.host);
    } catch {
      this.fail();
      return;
    }
    this.loading = false;
    // A chave pode ter mudado (ou saído) durante a carga.
    this.runtime.setKey(this.currentKey());
    if (this.clearedEarly) this.runtime.clear();
    this.clearedEarly = false;
  }

  private currentKey(): string | null {
    return this.editor() ? this.valid(untracked(this.key)) : null;
  }

  private fail(): void {
    this.loading = false;
    this.failed = true;
    if (isDevMode()) console.warn(LOAD_FAILED);
  }
}
