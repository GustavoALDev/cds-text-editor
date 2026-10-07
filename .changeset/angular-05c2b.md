---
'@cds/rte-angular': minor
---

Salvamento (spec 05c2b): `isDirty` e `markSaved(savedHtml?)` no `RteEditor`, `onMediaRemoved?` opcional no `RteUploadAdapter` (endereços de mídia removidos desde a base salva, entregues depois de `markSaved` e dos envios pendentes) e reexportação de `clearLocalDrafts`. Também: rascunho automático opt-in (`draftKey`, `draftAvailable`, `restoreDraft`, `discardDraft`, `draftError`, provider `draft`), `warnOnUnsaved`, `pasteEmbeds` e re-hospedagem de imagens externas coladas (`rehostExternal`, `ownHosts`, `registerExternal?` no adaptador).
