/**
 * Validadores do `RteEditor` para Signal Forms, Reactive Forms e Template Forms, e a formatação das mensagens de erro.
 *
 * @packageDocumentation
 */

export { formatRteError, isRteValidationError } from './errors';
export type {
  RteEmptyHeadingsError,
  RteFormattableError,
  RteImagesMissingAltError,
  RteMaxCharsError,
  RteMaxWordsError,
  RteReactiveValidationError,
  RteRequiredError,
  RteUnsafeLinksError,
  RteUploadsPendingError,
  RteValidationError,
} from './errors';
export { RteValidators } from './reactive-validators';
export {
  rteMaxChars,
  rteMaxWords,
  rteNoEmptyHeadings,
  rteRequired,
  rteSafeLinks,
} from './signal-validators';
export type { RtePath, RteSafeLinksOptions } from './signal-validators';
export {
  RteCountValidator,
  RteImagesHaveAltValidator,
  RteUploadsFinishedValidator,
} from './upload-directives';
export { rteImagesHaveAlt, rteUploadsFinished } from './upload-validators';
export type { RteEditorRef } from './upload-validators';
export {
  RteMaxCharsValidator,
  RteMaxWordsValidator,
  RteNoEmptyHeadingsValidator,
  RteRequiredValidator,
  RteSafeLinksValidator,
  RteTextValidator,
} from './text-directives';
