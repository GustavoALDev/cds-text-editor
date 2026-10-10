/**
 * Editor de texto rico para Angular: o componente `RteEditor`, `provideRichText`, rótulos, barra de ferramentas e tipos do envio de arquivos.
 *
 * @packageDocumentation
 */

export { provideRichText, RTE_LABELS } from './config';
export type {
  RteConfig,
  RteCountersConfig,
  RteEditorConfig,
} from './config';
export { RTE_DIALOG_LANGUAGES } from './dialogs/types';
export type { RteDialogKind } from './dialogs/types';
export { clearLocalDrafts } from '@comodeviaser/rte-core';
export { RteEditor } from './editor/rte-editor';
export type { RteMediaChange, RteMediaSession } from './editor/media-session';
export { RTE_LABELS_EN } from './labels/en';
export { RTE_TOOLBAR_PRESETS } from './toolbar/items';
export type {
  RteToolbarConfig,
  RteToolbarGroups,
  RteToolbarItemId,
  RteToolbarPreset,
} from './toolbar/items';
export type {
  RteFloatingMenuKind,
  RteFloatingMenusConfig,
} from './floating/types';
export type {
  RteCounterLabels,
  RteDialogLabels,
  RteDraftLabels,
  RteEditorLabels,
  RteErrorLabels,
  RteFloatingMenuLabels,
  RteLabels,
  RteLabelsInput,
  RteLabelsSource,
  RteSearchLabels,
  RteSlashMenuLabels,
  RteToolbarLabels,
  RteUploadLabels,
} from './labels/types';
export type {
  RteDraftAvailable,
  RteDraftConfig,
  RteDraftErrorEvent,
} from './draft/types';
export { RteUploadError } from './upload/types';
export type {
  RteUploadAdapter,
  RteUploadConfig,
  RteUploadAdapterReason,
  RteUploadContext,
  RteUploadedImage,
  RteUploadedVideo,
  RteUploadErrorEvent,
  RteUploadErrorReason,
  RteUploadImageMime,
  RteUploadStatus,
  RteUploadType,
  RteUploadVideoMime,
} from './upload/types';
export type { RteFloatingMenusApi } from './floating/types';
export type { RteItemState, RteToolbarState } from './toolbar/state';
export type { RteSlashMenuApi } from './slash/types';
export type { RteCounterLevel, RteFooterModel } from './counters/footer';
export type { RteLimitAnnouncement } from './counters/limit-announcer';
export { RteDialogController } from './dialogs/controller';
export type {
  RteDialogRequest,
  RteDialogView,
} from './dialogs/controller';
export type { RteDialogMode, RteDialogTarget } from './dialogs/target';
export type { RteMediaRules } from './dialogs/media-rules';
export type { RteDialogUploads, RteFileRules } from './upload/dialog-port';
export type { RteUploadText } from './upload/types';
