# Spec 05d1 — Menu `/`, busca e substituição, contadores e validadores de conteúdo (`@cds/rte-angular`)

> Parte 8 de 9 da spec 05 (05a, 05b1, 05b2a, 05b2b, 05c1, 05c2a, 05c2b, **05d1**, 05d2) (ver `05-editor-angular.md`). Depende da 05c2b (concluída: aviso de restauração, `isDirty`, fachada do rascunho) e consome a lógica sem UI da 03c (ADR 0005: `rtSearch`, `rtSlashCommand`, `rtCharLimit`, getters `getSearchState`/`getSlashMenuState`/`getCharLimitState`). Encerra o D1 da 05a. Consumida pela 05d2 (diretrizes Q1–Q9 no Apêndice A).
> Decisões tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". Spec enxuta: só decisões que mudam comportamento ou API. Fatos conferidos em 2026-10-07: `buildEditorOptions` (`editor/options.ts`) força `search: false`/`slashCommands: false` com aviso em dev; `RteSlashOptions.onUiItem` existe no core e o `RteEditorConfig.slash` o repassa sem tratamento; o menu `/` do core trata `ArrowUp/Down`, `Enter` e `Escape` com `priority: 1000` (C16) e os itens `image`/`video`/`embed` não têm comando (C15); os comandos de busca em cadeia devolvem `false` (ruling 16); `textStats` (`Signal<RteCharLimitState | null>`, com `rejected`) já existe na ponte; `readingTime(text)` do core recebe **texto** (a 05d usa `Math.ceil(words / 200)` sobre `textStats().words`, mesma regra); o `UndoRedo` da fábrica usa o padrão `newGroupDelay: 500`; `@cds/rte-core/html` exporta `htmlToText`, `extractToc`, `validateHtml` (nada que liste links ou títulos vazios); `normalizeHref(input, policy)` está no `.` do core; orçamentos atuais `editor` 39168 B, `whole` 39360 B, `i18n` 5248 B, `validators` 2368 B; o N8 (ADR 0007) mediu p95 por tecla de 14–28 ms em 20 mil palavras.

## 1. Objetivo

Dar ao `rte-editor` a interface dos recursos de produtividade do core: **menu `/`** acessível no editável (abrindo os diálogos de mídia da 05c1 para `image`/`video`/`embed`), **barra de busca e substituição** com atalhos e anúncios, **contadores** de caracteres, palavras e tempo de leitura, **anúncios do limite** e os validadores **`rteSafeLinks`** e **`rteNoEmptyHeadings`**. Tudo com CSP estrita, SSR, os dois modos de detecção de mudanças e o mínimo no *chunk* principal.

## 2. Fora de escopo

**05d2:** `updateOn`/adiamento da serialização, orçamentos finais de desempenho, `api-extractor`, README completo e fechamento da spec 05 (Apêndice A). **Evolução (ADR 0015):** busca em atributos, por expressão regular e sem diacríticos (C9 da 03c); "substituir" com preservação de caixa; busca entre várias instâncias; menu `/` com itens agrupados por cabeçalho visual e ícones; contador por bloco ou por seleção; `rteSafeLinks` com verificação remota (lista de bloqueio online); validador de hierarquia de títulos (h2 → h4 sem h3).

## 3. Decisões

Divergências na execução viram o **ADR 0015** (menu `/`, busca e contadores). Numeração própria (K1…) para não colidir com C, D, U, G, F, M, V, P, E, H e S.

| # | Decisão | Motivo |
|---|---|---|
| K1 | **Divisão da 05d:** **05d1** = interface nova (menu `/`, busca, contadores, anúncios do limite) e os dois validadores; **05d2** = medidas e fechamento (`updateOn`, orçamentos finais, `api-extractor`, README, critérios da spec 05). ~10 tarefas aqui. | O `api-extractor` e os orçamentos finais só fazem sentido sobre a API e o *bundle* finais; a 05d2 mede o que a 05d1 entrega (busca ativa em 20 mil palavras). |
| K2 | **Fim do D1:** `buildEditorOptions` deixa de forçar; `features.search` e `features.slashCommands` seguem o padrão do core (`true`) e a configuração do consumidor (entrada > *provider*). Sem o aviso de dev. Mudança de comportamento para quem já usa o pacote: *changeset* `minor` com nota. | A UI existe; o padrão do core (C20) volta a valer; quem não quer desliga por `features`. |
| K3 | **Onde vive o código:** no **principal**, a extensão de atalhos (`Mod-F`, `F3`/`Shift-F3`), os `computed` de `getSearchState`/`getSlashMenuState` sobre a versão da ponte, os atributos ARIA do editável (K4), o `onUiItem` (K6), os contadores e os anúncios do limite (K11, K12). A **lista do menu `/`** é o *chunk* `rte-slash-menu` (`@defer (when slashOpen(); prefetch on idle)`) e a **barra de busca** o *chunk* `rte-search` (`@defer (when searchOpen(); prefetch on idle)`). Falha de carga: aviso em `isDevMode()` pelo `rteDeferFailed`; o menu `/` continua funcionando pelo teclado (o core trata as teclas) sem lista visível; `Mod-F` não abre a barra e devolve `false` (o navegador busca). | Mesmo padrão dos diálogos e menus flutuantes; o teclado do menu não depende da lista. |
| K4 | **ARIA do menu `/` no editável:** o editável **mantém `role="textbox"`** (multilinha); com o menu aberto e a lista carregada recebe `aria-autocomplete="list"`, `aria-controls` (id da lista) e `aria-activedescendant` (id da opção ativa); sem menu, os três saem. **Sem `role="combobox"` nem `aria-expanded`** (inválidos num `textbox` multilinha pela ARIA 1.2; o axe os acusa). A lista é `role="listbox"` com nome `labels.slashMenu.listbox`, opções `role="option"` com `aria-selected`, ids `rte-<instância>-slash-<id do item>`. Como o suporte a `aria-activedescendant` em `contenteditable` é desigual, uma região `aria-live="polite"` anuncia `labels.slashMenu.count(n)` ao abrir e quando o número de itens muda (adiado 300 ms), e `labels.slashMenu.empty` sem itens. | Desvio consciente do "combobox" da 03c §8/spec 05 §4: mesmo comportamento de teclado (C16), semântica válida e anúncio garantido. |
| K5 | **Lista do menu `/`:** `popover="manual"` dentro do *host*, posicionada pela função pura dos menus flutuantes (`floating/place.ts`) a partir de `view.coordsAtPos(range.from)` (abaixo da linha; acima se não couber; recalculada em rolagem/redimensionamento pelo `viewport-watch` existente); nunca recebe foco; clique numa opção (`mousedown` com `preventDefault`) roda `runSlashItem(i)`; passar o ponteiro **não** muda o ativo (evita trocar o anúncio sob o leitor de tela). Sem itens, a lista não é mostrada (só o anúncio). Enquanto o menu está aberto, os menus flutuantes ficam ocultos. O menu fecha (`closeSlashMenu`) quando o foco sai do editável, um diálogo abre, o editor deixa de ser editável ou o aviso de restauração da 05c2b recebe o foco. | Sem roubar o foco (C16); posição pela mesma regra já testada; sem sobreposição de *popovers*. |
| K6 | **`onUiItem`:** o pacote compõe a opção `slash.onUiItem`: para `image`, `video` e `embed` agenda `openDialog(id)` num *microtask* (o *callback* do core é síncrono e engolido se lançar), com origem no editável (o foco volta a ele ao fechar); **depois** chama o `onUiItem` do consumidor (todos os ids), engolindo exceção com aviso em `isDevMode()`. O diálogo recusado (`openDialog` → `false`) não tem efeito além do `/consulta` já apagado. | Consequência da 05c1 (ligação do `onUiItem`); itens de UI do consumidor continuam possíveis. |
| K7 | **Abrir a barra de busca:** `Mod-F` com o foco em qualquer parte do *host* (editável, barra de ferramentas, menus), item novo `search` da barra (`kind: 'button'`, recurso `search`, ícone Lucide `search`, presente só no *preset* `full`) e o método público `openSearch(query?)`. Com a seleção dentro de um bloco de texto, de 1 a 200 caracteres, ela vira a consulta inicial. Com a barra aberta, `Mod-F` foca e seleciona o campo. Disponível com `readonly` (só busca); fechada e indisponível com `disabled` ou `features.search: false` (aí `Mod-F` é do navegador). | Atalho universal; `Mod-F` fora do *host* continua sendo do navegador. |
| K8 | **Barra de busca:** região `role="search"` (nome `labels.search.region`) dentro de `.rte-editor__frame`, entre a barra de ferramentas e o editável (não flutua); campo de busca, contador visível ("3 de 12"), botões anterior/próximo, alternâncias `caseSensitive`/`wholeWord` (`aria-pressed`), alternância "Substituir" que mostra o campo de substituição com "Substituir" e "Substituir tudo" (ocultos em `readonly`), e "Fechar". **Teclas no campo de busca:** `Enter` próximo, `Shift+Enter` anterior; `F3`/`Shift+F3` em toda a barra e no editável com a barra aberta; `Escape` em toda a barra fecha. No campo de substituição, `Enter` substitui o ativo. Alvos ≥ 24 px. | Padrão de editores conhecidos; as teclas não colidem com as do menu `/` (o foco está na barra). |
| K9 | **Comandos e ciclo de vida da busca:** cada `input` do campo chama `setSearchQuery(q, opções)` sozinho (sem *debounce*; durante composição IME só no `compositionend`); navegação e substituição chamam um comando por vez (`nextSearchMatch()`, `replaceSearchMatch(r)`, `replaceAllSearchMatches(r)`), nunca em `chain()` (ruling 16). Fechar a barra chama `clearSearch()` e devolve o foco ao editável com a seleção no resultado ativo (ou onde estava). A busca continua ativa enquanto o documento muda (o core remapeia); carga externa (D9) refaz a consulta atual. `disabled` fecha a barra. | Comandos em sequência evitam o `false` silencioso; o índice do core é incremental (R5 da 03c). |
| K10 | **Anúncios da busca:** região `aria-live="polite"` dentro da barra: `labels.search.position(i, n)` ("3 de 12"), `labels.search.capped(i)` com `capped` ("3 de 1000+"), `labels.search.none` e, quando `lastReplaced` muda, `labels.search.replaced(n)`. Posição/total anunciados 500 ms depois da última mudança da consulta (não a cada tecla) e imediatamente na navegação. O contador visível usa os mesmos textos. | Anúncio útil sem inundar o leitor de tela; C10 (teto de 1000) visível. |
| K11 | **Contadores:** entradas booleanas `showCharCount` e `showWordCount` (também em `provideRichText({ counters: { chars?, words? } })`, entrada > *provider*; padrão `false`). Rodapé `.rte-editor__footer` dentro da moldura, depois do editável, renderizado só no navegador com o editor pronto (`textStats()` não nulo): caracteres como `labels.counters.chars(n, limit)` ("120/500" com limite, "120 caracteres" sem); palavras com tempo de leitura `labels.counters.words(n, minutes)`, `minutes = Math.ceil(words / 200)`. O rodapé **não** é região viva nem é ligado ao `aria-describedby` do editável. Estado visual `rte-counter--near` (restam ≤ 10% do limite) e `rte-counter--over` (`overLimit`), também por texto (não só cor). Nenhum *signal* público novo: `textStats` já serve quem desenha o próprio contador. | Contar a cada tecla em voz alta é hostil; a contagem é a do C5 (igual ao validador e ao servidor). |
| K12 | **Anúncios do limite** (só com limite, mesmo sem contadores visíveis), numa região `aria-live="polite"` do principal: incremento de `rejected` → `labels.counters.rejected(limit)` (no máximo um anúncio por segundo); `remaining` cruzando para baixo de `max(10, 10% do limite)` → `labels.counters.remaining(n)` uma vez por cruzamento (rearma ao subir acima); `overLimit` passando a `true` → `labels.counters.over(n)`. Nada é anunciado na criação nem na carga externa. | Consequência da 03c §8 (`rejected`/`remaining`); WCAG 4.1.3 sem repetição. |
| K13 | **Validadores de conteúdo** no `/validators`, medindo só o **valor** (servem ao servidor e a valores ainda não carregados): `rteSafeLinks(path, { policy? })` — erro `{ kind: 'rteUnsafeLinks', count, hrefs }` (até 5 endereços) quando algum `href` de `<a>` falha em `normalizeHref(href, policy)` (padrão: política padrão do core; o README lembra que o editor já aplica a política dele, então o validador serve para uma política **mais estrita** ou valores vindos de fora); `rteNoEmptyHeadings(path)` — erro `{ kind: 'rteEmptyHeadings', count }` para `h2`–`h4` cujo texto aparado é vazio. Valor vazio passa nos dois. Versões Reactive em `RteValidators.safeLinks(opts?)`/`noEmptyHeadings()`. Para medir sem novo *parser*, o core `/html` ganha `inspectRteHtml(html): { hrefs: readonly string[]; emptyHeadings: number }` (uma passada do `htmlparser2`, sem Tiptap). `formatRteError` e `labels.errors` ganham as duas chaves. | D14 (só `/validators` importa `/html`); uma regra de link só (a do diálogo); o servidor usa a mesma função do core. |
| K14 | **Histórico:** mantém o `newGroupDelay` de 500 ms do `UndoRedo` (sem opção nova): o que se digita até 500 ms depois de um item `/` ou de uma substituição entra no mesmo passo de desfazer. Documentado no README e fixado por um teste unitário (comportamento, não opção). `replaceAllSearchMatches` continua um passo só (C10). | Consequência do ADR 0005; mudar o agrupamento afetaria toda digitação. |
| K15 | **Rótulos, CSS, testes e tamanho:** seções novas `search`, `slashMenu` e `counters` em `RteLabels` (pt-BR, en, es), item `search` em `toolbar`, chaves `rteUnsafeLinks`/`rteEmptyHeadings` em `errors`; CSS no `editor.css` (camada `rte.components`, só `--rte-*`): `.rte-search` e elementos, `.rte-slash-menu`, `.rte-slash-menu__option(--active)`, `.rte-editor__footer`, `.rte-counter(--near\|--over)`, regiões vivas visualmente ocultas. Unitários em `test` e `test-zone`; navegador real numa rota nova `productivity` (N42–N44), Chromium local e 3 motores no CI do PR; orçamentos pela regra do D26 (`ceil(medido × 1,15 / 64) × 64`), cenários novos `search` e `slash-menu`. | D15, D16, regra principal do repositório no menor conjunto que prova os fluxos. |

## 4. API

```ts
// @cds/rte-angular (entry `.`) — acréscimos à 05c2b
type RteToolbarItemId = /* … */ | 'search';                        // K7
type RteToolbarItemFeature = /* … */ | 'search';
interface RteCountersConfig { chars?: boolean; words?: boolean }
interface RteConfig { counters?: RteCountersConfig }

class RteEditor {
  readonly showCharCount: InputSignal<boolean | undefined>;        // K11
  readonly showWordCount: InputSignal<boolean | undefined>;
  readonly searchOpen: Signal<boolean>;                            // K7
  openSearch(query?: string): boolean;                             // false: busca indisponível
  closeSearch(): void;
}

interface RteSearchLabels {
  region: string; query: string; replace: string; replaceToggle: string;
  replaceOne: string; replaceAll: string; previous: string; next: string;
  caseSensitive: string; wholeWord: string; close: string;
  position(index: number, total: number): string; capped(index: number): string;
  none: string; replaced(count: number): string;
}
interface RteSlashMenuLabels { listbox: string; count(n: number): string; empty: string }
interface RteCounterLabels {
  chars(count: number, limit: number | null): string;
  words(count: number, minutes: number): string;
  rejected(limit: number): string; remaining(n: number): string; over(n: number): string;
}
interface RteLabels { search: RteSearchLabels; slashMenu: RteSlashMenuLabels; counters: RteCounterLabels }
interface RteToolbarLabels { search: string }
interface RteErrorLabels {
  rteUnsafeLinks(error: { count: number; hrefs: readonly string[] }): string;
  rteEmptyHeadings(count: number): string;
}

// @cds/rte-angular/validators
interface RteUnsafeLinksError extends ValidationError { kind: 'rteUnsafeLinks'; count: number; hrefs: readonly string[] }
interface RteEmptyHeadingsError extends ValidationError { kind: 'rteEmptyHeadings'; count: number }
function rteSafeLinks<K extends PathKind = PathKind.Root>(path: RtePath<K>, opts?: { policy?: Partial<RteLinkPolicy> }): void;
function rteNoEmptyHeadings<K extends PathKind = PathKind.Root>(path: RtePath<K>): void;
// RteValidators.safeLinks(opts?), RteValidators.noEmptyHeadings()

// @cds/rte-core/html — acréscimo
function inspectRteHtml(html: string): { readonly hrefs: readonly string[]; readonly emptyHeadings: number };
```

**Interno:** extensão de atalhos de busca e composição do `onUiItem` no principal; *chunks* `rte-slash-menu` e `rte-search`. **Classes públicas novas:** as da K15.

## 5. Requisitos

- **R1. Pacote e *chunks* (K3).** `rte-slash-menu-<hash>` e `rte-search-<hash>` no `fesm2022`, pedidos só ao abrir (ou no ocioso); `grep` no `dist`: componentes da lista e da barra ausentes do principal; `/validators` é o único a importar `@cds/rte-core/html`; nenhuma dependência nova; `verify-package` verde; falha de carga simulada mantém o teclado do menu e devolve `Mod-F` ao navegador.
- **R2. Recursos (K2).** Sem configuração, `rtSearch` e `rtSlashCommand` registrados; `features.search: false`/`slashCommands: false` (entrada e *provider*) não registram, escondem o item `search` e não abrem nada; aviso do D1 removido.
- **R3. Menu `/` (K4–K6).** Digitar `/` abre a lista na posição do `/` (geometria falsa em jsdom); atributos ARIA presentes só com o menu aberto e a lista carregada; ids estáveis; anúncio da contagem adiado e de "nenhum"; clique roda o item sem tirar o foco; o ponteiro não muda o ativo; fecha em *blur*, diálogo, `readonly` e foco no aviso de restauração; menus flutuantes ocultos enquanto aberto; `image`/`video`/`embed` abrem o diálogo da 05c1 com o foco voltando ao editável; `onUiItem` do consumidor recebe todos os ids e exceção é engolida.
- **R4. Barra de busca (K7–K10).** `Mod-F` (em todas as partes do *host*), item `search` e `openSearch`; consulta inicial pela seleção; teclas da K8; comandos um por vez (espião: nenhum `chain()` de busca); IME só no `compositionend`; substituição oculta e recusada em `readonly`; `disabled` fecha; fechar limpa as decorações e devolve o foco; carga externa reaplica a consulta; anúncios adiados, `capped` "1000+" e `replaced(n)`.
- **R5. Contadores e limite (K11, K12).** Rodapé só com as entradas, ausente no SSR, números iguais a `textStats()`; `Math.ceil(words / 200)`; classes `--near`/`--over` com texto; anúncios de `rejected` (no máximo 1/s), cruzamento de `remaining` uma vez por cruzamento, `over` na transição; nada na criação nem na carga externa.
- **R6. Validadores (K13).** `inspectRteHtml` (links em qualquer profundidade, `href` ausente ignorado, títulos só com espaços/`<br>` contam, sem Tiptap; teste `node`); `rteSafeLinks` com política padrão e estrita (host bloqueado, `http:` recusado por `allowedProtocols`), lista truncada em 5; `rteNoEmptyHeadings`; valor vazio passa; Reactive iguais; `formatRteError` nos 3 idiomas.
- **R7. Histórico (K14).** Item `/` seguido de digitação em < 500 ms desfaz junto; depois de 500 ms, em passos separados (relógio falso); substituir tudo é um passo.
- **R8. Rótulos, CSS, SSR e modos (K15).** Chaves novas completas e não vazias nos 3 idiomas; regras novas só com `--rte-*`, ausentes do `content.css`, `forced-colors` no ativo do menu e no resultado ativo da busca; SSR sem barra, lista nem rodapé e com as regiões vivas vazias; mesma suíte zoneless e zone.js sem `NG0100`/`NG0101`; *lint* D25 (sem texto literal em template).
- **R9. Tamanho e documentação.** Expectativa: `editor` +1,5–2,5 kB, `search` ~2,5–3,5 kB, `slash-menu` ~1,2–1,8 kB, `i18n` +~0,8 kB, `validators` +~0,3 kB, core `/html` +~0,3 kB; README (menu `/`, busca e atalhos, contadores, validadores, nota do `newGroupDelay`); `CLAUDE.md`; *changesets* do `@cds/rte-angular` (`minor`, K2) e do `@cds/rte-core`.

## 6. Testes

### 6.1 Unitários (`test` e `test-zone` do `@cds/rte-angular`; `test` do `@cds/rte-core`)
- Core `inspect-html.spec.ts` (`/html`): R6 (parte do core).
- `features.spec.ts` (ou `editor.lifecycle.spec.ts` ampliado): R2. `slash-menu.spec.ts`: R3. `search-bar.spec.ts`: R4. `counters.spec.ts`: R5. `validators.spec.ts` (ampliado): R6. `history-group.spec.ts`: R7.
- `slash-defer.spec.ts`/`search-defer.spec.ts`: R1 (pedido do *chunk* e falha de carga).
- `labels.spec.ts`, `css.spec.ts`, `ssr.spec.ts`, `index.spec.ts`, `api.spec.ts`, `toolbar-config.spec.ts` (ampliados): R8 e o item `search`.

### 6.2 Navegador real (Playwright; local no Chromium, 3 motores no CI do PR; app `e2e/angular/app` com CSP estrita, *builds* zoneless e zone)
Rota nova `productivity`: editor com *preset* `full`, `showCharCount`, `showWordCount`, `maxLength` 200 e um formulário com `rteSafeLinks`/`rteNoEmptyHeadings`. Em `e2e/angular/`:
- **N42 menu `/`** (`editor-slash.spec.ts`): teclado real — `/tab` + `ArrowDown`/`Enter` insere a tabela e um `Mod+Z` volta a `/tab`; lista abaixo do `/` (caixa delimitadora) e acima perto do fim da janela; `aria-activedescendant` aponta para a opção visível; `/imag` + `Enter` abre o diálogo de imagem e `Escape` devolve o foco ao editável; axe sem `serious`/`critical` com o menu aberto.
- **N43 busca** (`editor-search.spec.ts`): `Mod+F` com seleção vira consulta; `Enter`/`Shift+Enter`/`F3` andam e o resultado ativo fica visível; substituir tudo e um `Mod+Z` restaura; `Escape` fecha, limpa as decorações e o foco volta ao editável; documento com > 1000 ocorrências mostra "1000+"; axe na barra aberta.
- **N44 contadores, limite e validadores** (`editor-counters.spec.ts`): contadores mudam ao digitar; no limite, a tecla recusada gera o anúncio na região viva; link com host bloqueado e título vazio deixam o formulário inválido com as mensagens traduzidas.
- N1–N41 continuam verdes (o N8 com `search`/`slashCommands` ligados pelo K2).

## 7. Critérios de aceite

- [ ] `npx nx run-many -t lint,typecheck,build,test,test-zone,verify-package,size` verde; `npm run check:rules` e `typecheck:e2e` verdes (`check:licenses`, `notices`, `test:tools` no CI do PR).
- [ ] Unitários 6.1 verdes em `test` e `test-zone` (e `test` do core).
- [ ] N42–N44 verdes no Chromium local; N1–N44 nos 3 motores no CI do PR.
- [ ] ADR 0015 (`docs/decisions/0015-menu-busca-e-contadores.md`) registra K1–K15, os *rulings*, os desvios e os tamanhos (R9); README, `CLAUDE.md`, `docs/specs/README.md`, `05-editor-angular.md` e *changesets* atualizados.

## 8. Consequências

- **05d2:** mede o custo por tecla com busca ativa e limite ligado em 20 mil palavras, cobre a §4 no `api-extractor` (inclusive `inspectRteHtml` no core) e escreve as seções do README sobre K7–K14.
- **Spec 06:** pode usar `inspectRteHtml` para auditoria no servidor de exemplo (spec 07).
- **Spec 08:** leitores de tela reais no menu `/` (K4, `aria-activedescendant` em `contenteditable`) e na barra de busca; teclado virtual com o menu `/`.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Leitor de tela ignorar `aria-activedescendant` no `contenteditable` | Anúncio da contagem e do ativo pela região viva (K4); spec 08 com leitores reais |
| `Mod-F` roubar a busca do navegador | Só com o foco no *host* e o recurso ligado; desligável por `features.search: false` |
| K2 mudar o comportamento de quem já usa o pacote | *Changeset* `minor` com nota; o menu só abre com `/` digitado em posição válida (C13) |
| Busca por tecla em documento grande | Índice incremental do core; teto de 1000; medido na 05d2 |
| Lista do menu atrasar na primeira abertura (carga do *chunk*) | `prefetch on idle`; o teclado funciona antes da lista (K3) |
| Anúncios demais (busca, limite, envios, rascunho) | Regiões separadas, adiadas e sem repetição (K10, K12) |

## Apêndice A — Diretrizes para a 05d2 (Q1–Q9)

- **Q1. `updateOn`/adiamento:** manter a emissão síncrona do D8 como padrão (N8: p95 ≤ 28 ms). Só introduzir adiamento se o orçamento da Q2 falhar com busca e limite ligados; nesse caso, opção `valueEmission: 'sync' | 'idle'` com descarga em `blur`, `submit` e `pagehide`, e nota "devolva o que recebeu, ou o valor canônico" (risco residual do ADR 0007).
- **Q2. Orçamentos de desempenho (20 mil palavras, nos 3 motores, informativos no CI e bloqueantes localmente por limiar):** p95 por tecla ≤ 50 ms com `[formField]` + `rteMaxChars`, busca ativa e rascunho ligado; criação ≤ 300 ms; INP do fluxo de digitação ≤ 200 ms (Chromium, `PerformanceEventTiming`); criar/destruir 100× sem `Editor` vivo nem crescimento de nós de DOM.
- **Q3. Orçamentos de tamanho finais:** remedir todos os cenários pela regra do D26 e registrar no ADR da 05d2; nenhum *chunk* novo.
- **Q4. `api-extractor`:** relatório `*.api.md` versionado para **todos os entries públicos dos 5 pacotes**, conferido por um alvo `api` do Nx no CI; `@internal` fora do relatório; mudança sem relatório atualizado quebra o CI.
- **Q5. README do `@cds/rte-angular` completo:** instalação e ordem do CSS, os 3 modos de formulário, rótulos/i18n, barra e *presets*, diálogos, menus, mídia e envio, rascunho, busca e menu `/`, contadores, validadores, CSP, SSR, desempenho e limites conhecidos.
- **Q6. Fechamento da spec 05:** marcar os critérios da §6 da `05-editor-angular.md` com evidência; o que não fechar vira pendência explícita no ADR.
- **Q7. Sem recurso novo** na 05d2: só medidas, documentação e ajustes que as medidas exigirem.
- **Q8. ADR 0016** para a 05d2 (desempenho e fechamento da API).
- **Q9. Tamanho:** ~5–6 tarefas; se o `api-extractor` exigir ajuste nos *builds* do tsup/ng-packagr, isolar numa tarefa própria antes do README.
