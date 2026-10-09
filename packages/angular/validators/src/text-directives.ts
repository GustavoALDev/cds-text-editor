import {
  booleanAttribute,
  DestroyRef,
  Directive,
  effect,
  inject,
  Injector,
  input,
  numberAttribute,
  untracked,
} from '@angular/core';
import {
  NgControl,
  type AbstractControl,
  type ValidatorFn,
} from '@angular/forms';
import { RteValidators } from './reactive-validators';
import type { RteSafeLinksOptions } from './signal-validators';

/**
 * Base das diretivas de validação de texto para Template/Reactive Forms.
 *
 * O `@angular/forms` 22.2 liga o `rte-editor` pelo caminho de controle
 * customizado, que não lê `NG_VALIDATORS` do elemento. A diretiva por isso não
 * provê esse token: acrescenta (`addValidators`) o validador funcional de
 * `RteValidators` ao controle do `NgControl` do próprio elemento, troca-o
 * quando a entrada muda (`removeValidators` + `addValidators`, preservando os
 * validadores do consumidor) e o retira na destruição.
 *
 * @internal Base compartilhada; exportada como valor só para o .d.ts bater com o JS.
 */
export abstract class RteTextValidator {
  private readonly injector = inject(Injector);
  private control: AbstractControl | null = null;
  private current: ValidatorFn | null = null;

  constructor() {
    effect(() => {
      const next = this.build();
      untracked(() => this.swap(next));
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.current) this.control?.removeValidators(this.current);
      this.control = null;
      this.current = null;
    });
  }

  /** Validador para as entradas atuais (`null` desliga). Lê só *signals*. */
  protected abstract build(): ValidatorFn | null;

  private swap(next: ValidatorFn | null): void {
    const control =
      this.injector.get(NgControl, null, { self: true })?.control ?? null;
    if (!control) return;
    if (this.current) this.control?.removeValidators(this.current);
    this.control = control;
    this.current = next;
    if (next) control.addValidators(next);
    control.updateValueAndValidity();
  }
}

/** `{ rteRequired: true }` sem texto e sem mídia. Seletor `rteRequired` (não o `required` nativo). */
@Directive({ selector: 'rte-editor[rteRequired]' })
export class RteRequiredValidator extends RteTextValidator {
  /** Liga (padrão) ou desliga a exigência de conteúdo. */
  readonly rteRequired = input(true, { transform: booleanAttribute });
  /** Cria o validador, ou `null` quando a entrada está desligada. */
  protected build(): ValidatorFn | null {
    return this.rteRequired() ? RteValidators.required : null;
  }
}

/** `{ rteMaxChars: { max, actual } }`; `[rteMaxChars]="n"` (mesma medida do `textStats()`). */
@Directive({ selector: 'rte-editor[rteMaxChars]' })
export class RteMaxCharsValidator extends RteTextValidator {
  /** Limite máximo de caracteres. */
  readonly rteMaxChars = input.required<number, unknown>({
    transform: numberAttribute,
  });
  /** Cria o validador com o limite atual. */
  protected build(): ValidatorFn {
    return RteValidators.maxChars(this.rteMaxChars());
  }
}

/** `{ rteMaxWords: { max, actual } }`; `[rteMaxWords]="n"`. */
@Directive({ selector: 'rte-editor[rteMaxWords]' })
export class RteMaxWordsValidator extends RteTextValidator {
  /** Limite máximo de palavras. */
  readonly rteMaxWords = input.required<number, unknown>({
    transform: numberAttribute,
  });
  /** Cria o validador com o limite atual. */
  protected build(): ValidatorFn {
    return RteValidators.maxWords(this.rteMaxWords());
  }
}

/** `{ rteUnsafeLinks: { count, ... } }`; `rteSafeLinks` ou `[rteSafeLinks]="{ policy }"`. */
@Directive({ selector: 'rte-editor[rteSafeLinks]' })
export class RteSafeLinksValidator extends RteTextValidator {
  /**
   * Opções da conferência (por exemplo, a política de links); vazio usa a política padrão.
   */
  readonly rteSafeLinks = input<RteSafeLinksOptions | '' | undefined>('');
  /** Cria o validador com as opções atuais. */
  protected build(): ValidatorFn {
    const options = this.rteSafeLinks();
    return RteValidators.safeLinks(options === '' ? undefined : options);
  }
}

/** `{ rteEmptyHeadings: { count } }` com títulos vazios; `[rteNoEmptyHeadings]="false"` desliga. */
@Directive({ selector: 'rte-editor[rteNoEmptyHeadings]' })
export class RteNoEmptyHeadingsValidator extends RteTextValidator {
  /** Liga (padrão) ou desliga a conferência de títulos vazios. */
  readonly rteNoEmptyHeadings = input(true, { transform: booleanAttribute });
  /** Cria o validador, ou `null` quando a entrada está desligada. */
  protected build(): ValidatorFn | null {
    return this.rteNoEmptyHeadings() ? RteValidators.noEmptyHeadings() : null;
  }
}
