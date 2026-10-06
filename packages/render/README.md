# @cds/rte-render

Exibição do HTML produzido pelo editor, sem carregar o editor: igual ao do editor, segura por padrão e legível sem JavaScript (SSR e _prerender_).

**Status: pré-lançamento.** Ainda sem versão publicada. Nome provisório (escopo `@cds` ainda não confirmado): `npm i @cds/rte-render`. Requer Angular `>=22.2.1 <23` e `@cds/rte-core`; o `@cds/rte-sanitizer` é _peer_ opcional (só quem usa o modo `sanitize`, o padrão, o instala).

## Uso

```ts
// app.config.ts: as MESMAS opções do editor
import { createSanitizer } from '@cds/rte-sanitizer';
import { provideRteRender } from '@cds/rte-render';
import { editorOptions } from './editor-options';

providers: [provideRteRender({ sanitize: createSanitizer(editorOptions) })];
```

```html
<rte-toc [html]="c.renderedHtml()" />
<article
  [rteContent]="post.body"
  #c="rteContent"
  data-rte-mode="auto"
></article>
```

```ts
import { RteContent } from '@cds/rte-render';
import { RteToc } from '@cds/rte-render/toc';
```

`provideRteRender` vale na raiz, numa rota ou num componente. O pacote **não** importa o código do sanitizador: ele só entra no _bundle_ se você chamar `createSanitizer`. As opções de `createSanitizer` precisam ser as do editor (provedores de _embed_, `mediaHosts`, `linkPolicy`); com outras, o servidor continua sendo a autoridade e a diferença só remove mais ou menos, nunca executa.

### Modos

- **`sanitize` (padrão):** o HTML exibido é `sanitize(html)` mais as transformações de exibição. Sem `sanitize` fornecido a diretiva **lança** na criação, com instrução de configuração (no SSR, com o `ErrorHandler` padrão, o erro é registrado e o artigo sai vazio: olhe o log).
- **`trusted` (`[mode]="'trusted'"`):** usa o HTML como veio e dispensa o sanitizador. **Só use se o servidor já sanitiza com `createSanitizer`** (mesma versão maior, opções do editor). As transformações supõem a forma canônica da saída do sanitizador; com HTML de outra origem não há barreira alguma.
- **`error()`:** `RteSanitizeError` (`input-too-long`, `max-depth`) deixa o conteúdo **vazio**, emite um `console.warn` com `code` e `limit` e preenche `error()`; mostre a alternativa que quiser. Outra exceção propaga. `null`/`undefined` valem `''`.
- **`renderedHtml()`:** o HTML exibido (antes das transformações), para alimentar o sumário.

## CSS

Ordem de inclusão:

```
@cds/rte-theme/theme.css  →  @cds/rte-core/styles/content.css  →  @cds/rte-render/styles/render.css
```

O `render.css` só tem o que é de leitura (rolador de tabela, sumário, margem de rolagem das âncoras e foco visível dos links); a aparência `rt-*` é do `content.css`, a mesma do editor. Camadas `rte.components` e `rte.content`; só tokens `--rte-*`; `forced-colors` tratado.

**Tema e modo escuro.** O _host_ (`.rte-content` e `rte-toc`) é `.rte-root` e pinta por padrão `color: var(--rte-text)` e `background-color: var(--rte-surface)`, para ficar legível no escuro sem fundo do site. Claro/escuro por `data-rte-mode="light|dark|auto"` posto por você no próprio elemento (o `rte-toc` e o artigo aceitam). Tema por instância: CSS ou `applyRteTheme(el)` do `@cds/rte-theme`, chamado por você. Para um fundo transparente ou outra cor, **sobrescreva** `background-color`/`color` no elemento (por exemplo `article.post { background-color: transparent; }`): `data-rte-mode="inherit"` não torna o fundo transparente.

## Âncoras, sumário e rolagem

- Links de fragmento do conteúdo (`href="#x"`) viram `<caminho do documento>#x` (com consulta), porque o `<base href="/">` de todo app Angular os mandaria para a raiz. A navegação é a nativa (rolagem, `:target`, histórico, foco), com e sem JS; nada intercepta clique. `provideRteRender({ fragmentLinks: 'keep' })` mantém o `href` original (`'document'` é o padrão). **Limitação:** `HashLocationStrategy` não é suportada; use `'keep'`.
- `--rte-scroll-margin` (padrão `1rem`) é o `scroll-margin-top` de todo `[id]` do conteúdo; ajuste-o para cabeçalho fixo do site.
- `rte-toc` (`@cds/rte-render/toc`, a única parte que carrega o `htmlparser2`): `<rte-toc [html]="…" [levels]="[2, 3]" [labels]="…" />` gera `nav.rte-toc > ol.rte-toc__list > li.rte-toc__item > a.rte-toc__link`, aninhado por nível (nível que salta fica sob o último anterior), ignora título vazio, vale a primeira ocorrência de `id` repetido e, sem entradas, não renderiza nada (nem o `nav`). Os `href` usam a mesma base das âncoras. O servidor pode pré-calcular as entradas com `extractToc` de `@cds/rte-core/html`.
- **Tabelas largas:** cada `table` fica num `div.rte-table-scroll` (no HTML do servidor também). Quando transborda, o rolador ganha `tabindex="0"`, `role="region"` e `aria-label` (rótulo `tableScroller`) e responde a setas, `Home` e `End`; quando deixa de transbordar, os três saem (só tabela larga vira parada de `Tab`).

## Rótulos

`RTE_RENDER_LABELS_EN` é o padrão; `RTE_RENDER_LABELS_PT_BR` e `RTE_RENDER_LABELS_ES` estão em `@cds/rte-render/i18n`. Forneça por `provideRteRender({ labels })` ou `RTE_RENDER_LABELS`, ou pela entrada `labels` (parcial) da diretiva e do `rte-toc`, que vence o _provider_ e troca ao vivo.

## CSP e _Trusted Types_

O HTML entra no DOM pela ligação de `innerHTML` do _host_ com `DomSanitizer.bypassSecurityTrustHtml`, a única porta do pacote. Compatível com:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  require-trusted-types-for 'script'; trusted-types angular angular#unsafe-bypass
```

A CSP sem `'unsafe-inline'` bloqueia o atributo `style` que vem no HTML; a diretiva reaplica por CSSOM, depois de cada inserção, `text-align`, `width` de `col` (e a dimensão da tabela), `aspect-ratio` de `iframe` e as cores da paleta. Os relatórios `style-src-attr` na inserção são esperados (um por elemento com `style`, e outro na hidratação); `script-src*` nunca. Detalhes de segurança: `docs/security.md` (seção "Exibição").

## Sem JavaScript

O HTML do servidor já traz o conteúdo transformado, o sumário, as tabelas com rolador (sem `tabindex`) e os `href` de âncora corretos: texto, links, rolagem para o fragmento e as cores da paleta funcionam. Ficam de fora (CSP sem `'unsafe-inline'`): alinhamento de texto, larguras de coluna, proporção de `iframe` e a dimensão da tabela (uma tabela com larguras de coluna cai num layout fixo de colunas iguais), além do rótulo e do foco do rolador.

## SSR e hidratação

O mesmo código roda no servidor. A hidratação re-atribui o `innerHTML` do _host_ (nós novos; `iframe`/`video` recarregam), sem erros `NG05xx` e sem `ngSkipHydration`.

## Limites e limitações

- Mantenha `maxDepth` do sanitizador no padrão (256) e o conteúdo a menos de ~250 níveis da raiz do documento (`docs/security.md`, hipótese 3).
- **Sem realce de código:** `pre > code` usa `--rte-code-text`/`--rte-code-bg`; o editor realça, a página não (evolução).
- **Legendas de outra origem** em `video`/`track` não carregam (o esquema não tem `crossorigin`).
- A tabela sem larguras de coluna não reproduz exatamente o `min-width` do editor.

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

Repositório: cds-text-editor (monorepo). Licença MIT.
