---
'@cds/rte-core': patch
---

Correções do editor (`/extensions`): `Ctrl+Shift+B` (`⇧⌘B` no Mac) volta a criar citação — o `bold` não registra mais o `Mod-B` do Tiptap, que casava com a tecla com Shift; `Ctrl+B` com Caps Lock continua alternando o negrito. `rtTaskList` ganha o atalho `Mod-Shift-9` (`toggleTaskList`), o mesmo do `TaskList` do Tiptap. `setCallout` passa a se desfazer com `undo` (o passo em volta dos blocos deixa de ser estrutural). No `styles/content.css`, a barra lateral de citação, destaque, caixa e "leia também" usa `border-inline-start` (segue o `dir`).
