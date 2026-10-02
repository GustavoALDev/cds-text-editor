# Spec 03 — Core e esquema do HTML (`@cds/rte-core`)

> Depende da spec 01. Referência: plano seções 2, 4.1, 5.6, 11 e 13. Modelo (MyPresentation): `libs/forms/src/lib/components/rich-text-editor/` (`editor-extensions.ts`, `extensions/`, `utils/`) e seus `*.spec.ts`.

## 1. Objetivo

O **coração sem Angular** do produto: extensões Tiptap, utilitários puros e, novidade em relação ao modelo, o **esquema do HTML**, uma fonte única de dados da qual saem a allowlist do sanitizador (spec 04), a documentação do HTML gerado e os testes de contrato.

## 2. Fora de escopo

UI, componentes e formulários (spec 05); sanitização em si (spec 04); renderização (spec 06).

## 3. Decisões já tomadas

- Nenhum import de `@angular/*` (imposto por lint, spec 01).
- Tiptap 3 sobre ProseMirror; **nada** de extensões Pro/Cloud.
- Entry points secundários e `sideEffects: false` (lição 8).
- HTML é o formato padrão; JSON (`getJSON()`) opcional (spec 05).

## 4. Conteúdo

### 4.1 Extensões (copiar do modelo, sem mudar a lógica)
`NewsImage` (NodeView com redimensionamento pelos 4 cantos, regra de leitura `p>img`), `HeadingWithId` (H1 legado → H2, `id` automático também no carregamento inicial), `NewsBlockquote` (citação em destaque com autor), `Callout` (4 variantes), `ReadAlso`, `Lang`, `Embed`, `VideoUpload`, `SearchReplace`, `SlashCommand`, `CharLimit`.

### 4.2 Fábrica
`createEditorExtensions(options)`: **única** fonte da lista de extensões; `options.features` liga/desliga recursos (tabelas, código, embeds, tarefas, mídia, blocos de notícia, busca, comandos `/`) e `options.extensions` aceita extensões do consumidor. Valores dinâmicos (placeholder, limite) por **função**, nunca mutando `extension.options` (lição 4).

### 4.3 Utilitários puros
`normalizeHref` e política de links configurável (protocolos, `rel` padrão, domínios bloqueados, `target`), slug e ids de título, tempo de leitura e contagem de palavras, embeds (`toEmbed`), `computeResize`, helpers de imagem, rascunho com **`DraftStorage` injetável** (padrão: localStorage com fallback seguro), `extractToc` (somente string; funciona em SSR).

### 4.4 Provedores de embed
```ts
interface RteEmbedProvider {
  id: string; hosts: string[];
  match(url: string): boolean;
  toEmbed(url: string): { src: string; height?: number; aspectRatio?: string };
}
```
Padrão: YouTube, Vimeo, Spotify (entry point `/embeds`). X e Instagram **não** entram (exigem script de terceiros).

### 4.5 Linguagens do realce de código
Registro **por linguagem, sob demanda** (entry point `/code-languages` e `import()`), em vez de `lowlight/common` inteiro (≈ 330 kB no modelo).

### 4.6 Esquema do HTML (novo)
Um objeto de dados, tipado, descrevendo **por recurso**: tags, atributos (e validação de cada um: `rel`, `lang`, `id`, números), classes (`rt-*`, `hljs-*`), estilos permitidos (`color`, `background-color`, `text-align`), esquemas de URL, hosts de iframe **derivados dos provedores de embed ativos**, transformações (ex.: `a` sem `target`, remoção de mídia sem `src`). API sugerida:

```ts
getHtmlSchema(options?: { features?: RteFeatures; embedProviders?: RteEmbedProvider[] }): RteHtmlSchema
```
O esquema depende do conjunto de recursos ativo: desligar tabelas retira `table*` da allowlist.

## 5. Requisitos

- **R1.** Todo recurso do modelo (plano 2.1) existe no core, com os testes do modelo portados (editor em jsdom com Tiptap real) e passando.
- **R2.** `getHtmlSchema` é a **única** fonte de tags/atributos permitidos; não há lista paralela em nenhum pacote.
- **R3.** Teste de contrato: um **fixture "todos os recursos"** é carregado no editor, o HTML sai por `getHTML()` e **cada tag, atributo, classe e estilo** está no esquema. Esse mesmo fixture é consumido pela spec 04.
- **R4.** Teste de carga inicial de conteúdo legado: `<p><img></p>`, H1, `<a>` sem `target`, ids de título no primeiro carregamento (lições 10 e 18).
- **R5.** Embeds registráveis; a allowlist de hosts vem dos provedores **ativos**.
- **R6.** Realce de código com linguagens sob demanda; bundle do core medido e registrado, com orçamento (`size-limit`).
- **R7.** Código compila e testa em ambiente **sem DOM de navegador real** (jsdom) e não acessa `window`/`document` no topo do módulo (SSR-safe).

## 6. Testes

Vitest puro + jsdom; contrato gerado do esquema; **fast-check** em `normalizeHref` e no esquema (nenhum `javascript:`/`data:` aceito em `href`/`src`). A verificação em navegador real do NodeView de redimensionamento e dos menus acontece na spec 08 (E2E), mas o **gancho de teste** (acesso estável ao `Editor`, sem depender de `ng.getComponent`) é definido na spec 05.

## 7. Critérios de aceite

- [ ] Suíte do core verde (equivalente à do modelo: ≥ 134 testes do editor portados + novos do esquema).
- [ ] Contrato: HTML do fixture ⊆ esquema; mudar uma extensão sem atualizar o esquema **faz o teste falhar**.
- [ ] Nenhum import de Angular; `attw`/`publint` verdes; bundle medido e dentro do orçamento.
- [ ] Documento `docs/html-schema.md` **gerado** a partir do esquema (tags, atributos, classes por recurso).

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Mudança de API entre Tiptap da versão do modelo e a fixada | Testes portados mostram o que quebra; fixar versão na spec 01 |
| Esquema ficar mais restrito que o editor (ou o contrário) em silêncio | Teste de contrato obrigatório e gerado (lição 9) |
| NodeView de redimensionamento difícil de testar em jsdom | Cobrir a lógica em `computeResize` (pura) e o resto no E2E (spec 08) |
