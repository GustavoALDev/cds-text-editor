---
'@cds/rte-angular': patch
---

Menus flutuantes e lista do `/` são posicionados pela viewport visual (`visualViewport`) quando ela existe, e reposicionam em `resize`/`scroll` dela: com o teclado virtual aberto (iOS) ou com zoom por pinça, ficam dentro da parte visível da tela.
