import {
  fieldError,
  focusFirstInvalid,
  integerError,
  langCodeCheck,
  nonIntegerCheck,
  text,
} from './form-helpers';
import { RteDialogFormBase } from './forms/form-base';

/**
 * Âncora de *chunk* (05c2a E2, ruling 20 do ADR 0011). O *bundler* põe num
 * terceiro *chunk* compartilhado todo módulo usado pelos dois *chunks* de
 * formulários (`rte-dialogs` e `rte-media-forms`) e não pelo principal: mais
 * uma requisição em cascata no primeiro diálogo. O `RteEditor` guarda esta
 * lista num campo estático, e os módulos comuns (`form-base.ts`,
 * `form-helpers.ts`) ficam no principal.
 *
 * O preço é pago por quem nunca abre um diálogo, então a lista só leva o que
 * não depende dos Signal Forms em tempo de execução: os validadores entram
 * como fábricas de *callback* (`langCodeCheck`, `nonIntegerCheck`) que cada
 * formulário passa ao seu próprio `validate`. Assim o `@angular/forms` fica
 * fora do principal (o cenário `editor` do `size-budget.json` o proíbe). Os
 * auxiliares que chamam `required`/`min`/`max`/`validate` ficam nos *chunks*:
 * `media-validate.ts` só no da mídia e o `integerInRange` da tabela no
 * `rte-dialogs`.
 */
export const RTE_DIALOG_KIT: readonly unknown[] = Object.freeze([
  RteDialogFormBase,
  fieldError,
  focusFirstInvalid,
  text,
  langCodeCheck,
  integerError,
  nonIntegerCheck,
]);
