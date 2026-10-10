---
'@comodeviaser/rte-render': minor
---

Primeira versão do `@comodeviaser/rte-render`: exibição do HTML do editor em Angular, sem carregar o editor.

**Entries.** `.` (diretiva `[rteContent]`, `provideRteRender`), `/toc` (sumário `rte-toc`), `/i18n` e `@comodeviaser/rte-render/styles/render.css`. A aparência do conteúdo vem de `@comodeviaser/rte-core/styles/content.css`. O `[rteContent]` tem dois modos: `sanitize`, com o sanitizador injetado por `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`, e `trusted`, só para HTML já sanitizado pelo servidor. Tabelas que transbordam ganham um rolador focável; os estilos do conteúdo são reaplicados por CSSOM sob CSP estrita; âncoras de fragmento funcionam com `<base href>` (a base sai com uma só barra inicial, então um `pathname` `//outro.host/x` não vira link protocolo-relativo). Internamente, o preparo do HTML tem custo linear com milhares de tabelas com `caption` e sem `colgroup`, e a classe `rte-table--sized` vai para a tabela certa. Ajudantes de `rte-content` e `rte-toc` são `@internal`.

**Requisitos.** Peers `@angular/{core,common,platform-browser}` `>=22.2.1 <23`. `@comodeviaser/rte-core` é dependência exata (versão igual à do pacote). O sanitizador não é peer: quem usa o modo `sanitize` instala `@comodeviaser/rte-sanitizer` à parte, **na mesma versão do `@comodeviaser/rte-render`** (versões diferentes podem duplicar o `@comodeviaser/rte-core`), e o passa ao `provideRteRender`. Não há constante de versão exportada.

**Segurança.** O caminho do HTML até o DOM está descrito em `docs/security.md`. A reaplicação dos estilos por CSSOM usa só as propriedades de `RTE_STYLE_PROPERTIES` do core para cada _tag_, nos modos `sanitize` e `trusted`; declarações com `!important` são descartadas, e o `style` inteiro se tiver `\` ou comentário. Assim a escrita por CSSOM não reabilita, sob CSP sem `'unsafe-inline'`, CSS que o navegador barrou (`position: fixed`, `background-image`…). Em `trusted`, o CSS fora da lista é retirado no navegador também sem CSP.
