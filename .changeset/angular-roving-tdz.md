---
'@cds/rte-angular': patch
---

Corrige `ReferenceError: Cannot access 'RteRovingItem' before initialization` ao importar o pacote sem o linker do Angular (por exemplo, `ng test` com Vitest num app consumidor): `RteRovingItem` agora é declarada antes de `RteRovingFocus`, cuja `contentChildren(RteRovingItem)` vira um predicate avaliado na declaração da classe.
