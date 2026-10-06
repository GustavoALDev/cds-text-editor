import {
  fieldError,
  focusFirstInvalid,
  langCodeValidator,
  optionalIntegerInRange,
  requiredTrimmed,
  text,
} from './form-helpers';
import { RteDialogFormBase } from './forms/form-base';
import { canonicalMediaUrl, mediaUrlValidator } from './media-validate';

/**
 * Âncora de *chunk* (05c2a E2, ruling 20 do ADR 0011): os auxiliares usados
 * pelos formulários dos dois *chunks* (`rte-dialogs` e `rte-media-forms`) só
 * ficam no principal se o principal os importar **e usar** (o `RteEditor`
 * guarda esta lista num campo estático). Sem ela, o *bundler* cria um
 * terceiro *chunk* compartilhado só com eles, mais uma requisição em cascata
 * no primeiro diálogo.
 */
export const RTE_DIALOG_KIT: readonly unknown[] = Object.freeze([
  RteDialogFormBase,
  fieldError,
  focusFirstInvalid,
  requiredTrimmed,
  optionalIntegerInRange,
  langCodeValidator,
  text,
  canonicalMediaUrl,
  mediaUrlValidator,
]);
