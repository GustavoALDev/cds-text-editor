# Core 03b — Extensões de conteúdo, fábrica e teste de contrato: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `@cds/rte-core` as extensões Tiptap que produzem exatamente o HTML da 03a §4, a fábrica `createEditorExtensions`, o serializador canônico sem DOM, a leitura tolerante, o catálogo `/code-languages`, o NodeView de redimensionamento, `validateHtml`/`isAllowedClass` e o teste de contrato HTML ⊆ esquema.

**Architecture:** Todo código Tiptap/ProseMirror fica no entry novo `packages/core/extensions/src/` (B1); `.`, `/embeds` e `/html` continuam puros. A fábrica monta `getHtmlSchema(options)` uma vez e passa um contexto interno (`RteExtensionContext`) a cada `createXxxExtensions(ctx)`; toda regra de atributo vem desse esquema ou das funções da 03a (B9, R8). `serializeRteHtml` roda o `DOMSerializer` do ProseMirror sobre um documento de strings e escreve o HTML pelo algoritmo de serialização do HTML (B7); os ids de título nascem na serialização (B8). Gramáticas do realce só por `import()` no `/code-languages` (B15).

**Tech Stack:** TypeScript 6, tsup (ESM), Tiptap 3.31.4 (extensões avulsas, sem starter-kit), lowlight 3.3.0, highlight.js 11.11.1, htmlparser2 12, Vitest 4 (`node` por padrão, `jsdom` 27.4 por arquivo), fast-check 4, esbuild, Playwright (3 motores).

**Spec:** `docs/specs/03b-extensoes-de-conteudo.md` (vinculante; leia-a inteira antes de qualquer tarefa — a seção 4 tem a saída canônica de cada recurso e a seção 6 a API). Contrato da marcação: `docs/specs/03a-esquema-e-utilitarios.md` §4.

## Global Constraints

- Imports de `@tiptap/*`, `lowlight`, `highlight.js` e `highlight.js/*` só em `packages/core/extensions/src` e `packages/core/code-languages/src` (regra `no-restricted-imports`, B1); `.`, `/embeds` e `/html` sem Tiptap; `sideEffects: false` mantido.
- Pacotes de B2 (`@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-document`, `-paragraph`, `-text`, `-heading`, `-bold`, `-italic`, `-underline`, `-strike`, `-code`, `-subscript`, `-superscript`, `-blockquote`, `-horizontal-rule`, `-hard-break`, `-list`, `-text-align`, `-link`, `-code-block`, `-table`, `@tiptap/extensions`, `lowlight`, `highlight.js`): `peerDependencies` do core com `peerDependenciesMeta.optional: true`, faixas `^3.31.4` (`@tiptap/*`), `^3.3.0` (`lowlight`), `^11.11.1` (`highlight.js`); `devDependencies` exatas na raiz (`3.31.4`, `3.3.0`, `11.11.1`).
- Proibidos: `@tiptap/starter-kit`, `extension-text-style`, `extension-color`, `extension-highlight`, `extension-code-block-lowlight`, `extension-image`, `TaskList`/`TaskItem` oficiais, `TrailingNode`, `@tiptap/static-renderer`, `@tiptap/html`, `lowlight/common`, `highlightAuto` (B3, B6, B15).
- Nenhum import de `@angular/*`; nenhum acesso a `window`/`document`/`navigator` no topo de módulo; DOM só dentro de NodeViews, comandos e do documento de renderização (R11, R15). Nenhum `innerHTML`/`insertAdjacentHTML` em `extensions/src` (regra `no-restricted-syntax`, R14).
- Buscas por nome vindo de entrada (paleta, catálogo, provedores, elementos do esquema) só com `Object.hasOwn` ou `Map` (ADR 0003, decisão 16).
- Nomes de nós/marcas/atributos são API pública (B19): próprios com prefixo `rt`; oficiais mantêm o nome. Atributos fixados neste plano: `heading.level`, `paragraph|heading.textAlign`, `orderedList.start`, `link.href|target`, `rtTextColor.color`, `rtHighlight.color`, `codeBlock.language`, `tableCell|tableHeader.colspan|rowspan|colwidth`, `tableHeader.scope`, `rtTaskItem.checked`, `rtImage.src|alt|width|height|srcset|sizes|align|caption|credit`, `rtVideo.src|width|height|poster|preload|tracks|caption`, `rtEmbed.provider|src|title|width|height|aspectRatio|caption`, `rtPullquote.author|role`, `rtCallout.variant`, `rtLang.lang|dir`.
- Código e nomes públicos em inglês; comentários, mensagens de erro e documentação em pt-BR.
- Testes: `packages/core/**/*.spec.ts`; arquivos que montam editor começam com `// @vitest-environment jsdom`. Rodar de `packages/core`: `npx vitest run <arquivo>`; pacote: `NX_DAEMON=false npx nx test core`.
- Windows: `export NX_DAEMON=false`; instalar com `npx -y npm@11 install …` (o npm do sistema é 10 e o `engine-strict` exige ≥ 11); `npx prettier --check --end-of-line auto <arquivos>` antes de cada commit; Playwright sempre com `--workers=4`.
- Antes de cada commit: `npx nx run-many -t lint,typecheck,test -p core` verde.
- Commits em pt-BR (`feat(core): …`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch: `feat/spec-03-core`.

## Review Focus

1. **CRLF do checkout no Windows dentro do fixture** (o `<pre>` de `all-features.html` tem `\n`): com `core.autocrlf` o ponto fixo byte a byte falha só em máquina Windows — `.gitattributes` com `fixtures/content/** text eol=lf`, `/fixtures/content` no `.prettierignore` e teste "fixture sem `\r`" na Tarefa 15.
2. **Chaves do protótipo vindas de HTML colado** (`data-rt-color="constructor"`, `data-rt-color="__proto__"`, `language-constructor`, alias `tostring`): busca em mapa sem `Object.hasOwn` devolve função do protótipo — testes nas Tarefas 2, 6 e 8.
3. **Corte no limite partindo par substituto** (`alt` com emoji cruzando o 1000º caractere, `title` do `iframe` no 300º, `label` de `track` no 100º): metade de um par vira U+FFFD no navegador e o sanitizador descarta — `truncateText` testado na Tarefa 11 e reaplicado na 13.
4. **Exceção no meio da serialização** (extensão do consumidor que lança no `renderHTML`, nó DOM sem `outerHTML`, chamada aninhada): o documento de renderização precisa voltar ao global (`try/finally`), senão a próxima colagem/`getHTML()` usa o documento de strings — teste na Tarefa 3.
5. **Ciclo de vida assíncrono do realce** (`load()` resolvendo depois do `destroy`, dois editores com catálogos diferentes na mesma página, a mesma linguagem em vários blocos): despacho em vista destruída, `lowlight` compartilhado, `load` repetido — testes na Tarefa 8.

---

### Task 1: Correção herdada da 03a no validador de provedor (R1)

**Files:**
- Modify: `packages/core/src/embeds/validate-provider.ts`, `packages/core/src/schema/features.ts` (comentário do `patterns` do `iframe`), `docs/specs/03a-esquema-e-utilitarios.md` (§6, regra do validador), `docs/decisions/0003-esquema-do-html.md` (decisão 14)
- Test: `packages/core/src/embeds/to-embed.spec.ts`, `packages/core/src/schema/get-html-schema.spec.ts`

**Interfaces:**
- Consumes: `validateEmbedProvider(p): string[]` (existente).
- Produces: mesma assinatura; o `srcPattern` cujo caractere logo depois do prefixo `^https://<host escapado>/` for `?`, `*`, `+` ou `{` lança `TypeError`.

- [ ] **Step 1: Testes que falham.** Com o provedor de teste existente (`hosts: ['embed.example.com']`, `toEmbed` devolvendo `https://embed.example.com/v/1`), para cada `srcPattern` em `` String.raw`^https://embed\.example\.com/?.*$` ``, `` String.raw`^https://embed\.example\.com/{0}v/\d+$` ``, `` String.raw`^https://embed\.example\.com/*v/\d+$` ``, `` String.raw`^https://embed\.example\.com/+v/\d+$` ``: `getHtmlSchema({ embedProviders: [p] })` lança `TypeError`; `toEmbed('https://embed.example.com/v/1', [p])` → `null`. Continuam aceitos: `` String.raw`^https://embed\.example\.com/v/\d+$` `` (`toEmbed` não nulo), `` String.raw`^https://embed\.example\.com/\?id=\d+$` `` e `` String.raw`^https://embed\.example\.com/(?:v|e)/\d+$` ``. Os 3 provedores padrão continuam válidos.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/embeds src/schema/get-html-schema.spec.ts` → FAIL.
- [ ] **Step 3: Implementar** em `validateEmbedProvider`: além de `startsWith(prefix)`, exigir `!'?*+{'.includes(pat[prefix.length] ?? '')`; mensagem pt-BR acrescenta "sem quantificador logo depois da /". Atualizar o comentário de `features.ts`, a 03a §6 e a decisão 14 do ADR 0003 para "… + `/`, sem quantificador logo depois", com o exemplo `^https://a\.com/?.*$` aceitando `https://a.com.outro-provedor.net/x`.
- [ ] **Step 4: Rodar e ver passar** — PASS; `docs/html-schema.md` sem drift (`npx vitest run src/schema/markdown.spec.ts`).
- [ ] **Step 5: Commit** — `fix(core): srcPattern de provedor sem quantificador logo depois da barra do host`.

### Task 2: `isAllowedClass` (entry `.`) e `validateHtml` (entry `/html`)

**Files:**
- Create: `packages/core/src/schema/classes.ts`, `packages/core/html/src/validate-html.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/html/src/index.ts`, `packages/core/src/schema/types.ts` (`embedProviders?: readonly RteEmbedProvider[]`, `mediaHosts?: readonly string[]`), `packages/core/src/schema/get-html-schema.ts` (se o alargamento exigir)
- Test: `packages/core/src/schema/classes.spec.ts`, `packages/core/html/src/validate-html.spec.ts`

**Interfaces:**
- Produces: `isAllowedClass(spec: RteElementSpec, token: string): boolean` (`token` está em `classes.values` (`includes`) ou casa um `classes.patterns`; token vazio, com espaço ASCII ou acima de 128 caracteres → `false` antes de regex; regex compiladas em cache `Map<string, RegExp>`).
- Produces: `RteHtmlViolation` e `validateHtml(html: string, schema: RteHtmlSchema, options?: { mode?: 'canonical' | 'accepted'; maxDepth?: number }): RteHtmlViolation[]` exatamente como a spec §6; `path` = cadeia `tag[i]` do topo até o elemento, separada por `>`, com `i` = índice entre os elementos irmãos (ex.: `aside[0]>p[1]`). Usa `Parser` do `htmlparser2` (`decodeEntities: true`) e `resolveMaxDepth` de `walk.ts`.

- [ ] **Step 1: Testes que falham** (`classes.spec.ts`, com `s = getHtmlSchema()`): `isAllowedClass(s.elements.code, 'language-js')` true; `'language-JS'`, `'hljs'`, `'language-'` false; `isAllowedClass(s.elements.figure, 'rt-figure--left')` true; `isAllowedClass(s.elements.p, 'x')` false (sem `classes`); `'constructor'`, `'__proto__'`, `'rt-figure rt-figure--left'`, `'a'.repeat(129)` false. Tipagem: `getHtmlSchema({ embedProviders: DEFAULT_EMBED_PROVIDERS, mediaHosts: ['a.com'] as const })` compila.
- [ ] **Step 2: Testes que falham** (`validate-html.spec.ts`, `s = getHtmlSchema()`; `kinds(html, mode?)` = lista de `kind`):
  - `[]` nos dois modos: `<p style="text-align: center">a</p>`, `<h2 id="rt-a">A</h2>`, `<a href="https://a.com/" target="_blank" rel="noopener noreferrer">a</a>`, `<span data-rt-color="red" style="color: #b3261e">a</span>`, `<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">T</label></li></ul>`.
  - `<p style="text-align:center;">` → canonical `['invalid-style']`, accepted `[]`; `<p style="">` → `invalid-style`; `<p style="text-align: center; color: red">` → accepted `['invalid-style']`; `<span data-rt-color="red" style="color: #000000">` → canonical `invalid-style`, accepted `[]` (`styleFrom` ignorado).
  - `<ol start="007">` → canonical `non-canonical-attribute` (`name: 'start'`, `value: '007'`), accepted `[]`; `<ol start="0">` → `invalid-attribute`; `<a href="https://a.com/" target="_blank" rel="noreferrer noopener">` → canonical `non-canonical-attribute`.
  - `<div>`, `<constructor>`, `<__proto__>` → `unknown-element`; `<p data-x="1">`, `<p constructor="x">` → `unknown-attribute`; `<p class="x">` e `<aside class="rt-callout rt-desconhecida" role="note">` → `invalid-class`.
  - `<a href="https://a.com/" target="_blank">` → `missing-ensured-token` (`name: 'rel'`); `<img src="https://a.com/x.png" loading="lazy" decoding="async">` → `missing-required-attribute` (`name: 'alt'`); `iframe` válido sem `sandbox` → `missing-required-attribute` (`sandbox`); `<figure class="rt-figure rt-figure--center"></figure>` → `missing-required-child`.
  - `<!--x--><p>a</p>`, `<!doctype html><p>a</p>` → `unexpected-node`; `<script>x</script>` → contém `unknown-element` e `unexpected-node`.
  - `'<blockquote>'.repeat(300)` → exatamente uma `max-depth`, sem lançar; `maxDepth: 0` lança `RangeError`.
  - `path`: em `<aside class="rt-callout rt-callout--info" role="note"><p class="rt-callout__title">T</p><p class="x">a</p></aside>` a violação tem `path: 'aside[0]>p[1]'`.
- [ ] **Step 3: Rodar e ver falhar** → FAIL.
- [ ] **Step 4: Implementar.** Canonical: atributo = `normalizeAttribute(regra, valor)` (booleano = `''`); `style` = `applyStyleFrom(spec.styleFrom, valor do atributo)` quando há `styleFrom`, senão `sanitizeStyle(spec.styles, style)` e não vazio. Accepted: valor só precisa ser aceito (`!== null`); `style` com `styleFrom` ignorado; sem `styleFrom`, `sanitizeStyle` precisa manter todas as declarações (conta declarações não vazias antes e depois). Ambos: `required`, cada token de `class` por `isAllowedClass`, `ensureTokens` (com `when`), `requireChild` sobre filhos diretos. Toda busca em `schema.elements`/`attributes`/`styles` com `Object.hasOwn`.
- [ ] **Step 5: Rodar e ver passar** → PASS.
- [ ] **Step 6: Commit** — `feat(core): isAllowedClass e validateHtml (canonical e accepted) sem DOM`.

### Task 3: Entry `/extensions`, dependências e serializador canônico sem DOM

**Files:**
- Create: `packages/core/extensions/src/index.ts`, `extensions/src/render-document.ts`, `extensions/src/string-dom.ts`, `extensions/src/serialize.ts`, `extensions/src/labels.ts`, `extensions/src/types.ts`, `extensions/src/testing/editor.ts`
- Modify: `package.json` + `package-lock.json` (raiz), `packages/core/package.json` (`exports["./extensions"]`, peers, `peerDependenciesMeta`), `packages/core/tsup.config.ts` (`'extensions/index': 'extensions/src/index.ts'`), `packages/core/tsconfig.lib.json` (inclui `extensions/src/**/*.ts`; exclui `extensions/src/**/*.spec.ts`, `extensions/src/testing/**`, `code-languages/src/**/*.spec.ts`), `packages/core/tsconfig.spec.json` (inclui `extensions/src/**/*.ts`, `code-languages/src/**/*.spec.ts`), `tsconfig.base.json` (alias `@cds/rte-core/extensions`), `packages/core/vitest.config.mts` (`include` com `extensions/src` e `code-languages/src`), `packages/core/eslint.config.mjs`, `packages/core/project.json` (`test.inputs` + `{workspaceRoot}/fixtures/content/**/*`)
- Test: `packages/core/extensions/src/serialize.spec.ts`, `packages/core/extensions/src/labels.spec.ts` (ambiente `node`)

**Interfaces:**
- Produces (`render-document.ts`): `getRenderDocument(): Document` (o do topo da pilha, senão `globalThis.document`); `withRenderDocument<T>(doc: Document, fn: () => T): T` (pilha, `try/finally`).
- Produces (`string-dom.ts`): `createStringDocument(): Document` — implementa só a superfície que o `DOMSerializer` do `prosemirror-model` 1.25.12 usa (conferir `renderSpec`, `serializeFragment`, `serializeMark` em `node_modules/prosemirror-model/dist/index.js`): `createElement`, `createElementNS`, `createTextNode`, `createDocumentFragment`; nós com `nodeType`, `childNodes`, `appendChild`, `insertBefore`, `setAttribute`, `setAttributeNS`, `getAttribute`, `textContent` e `style.cssText` (setter grava o atributo `style` na posição em que foi definido, texto literal); `writeHtml(node): string` (algoritmo da spec §5.2).
- Produces (`types.ts`): `RteCalloutVariant`, `RteImageAlign`, `RteContentLabels` (spec §6).
- Produces (`serialize.ts`): `serializeRteHtml(doc, options?: { idPrefix?: string; labels?: Partial<RteContentLabels> | (() => Partial<RteContentLabels>) }): string` (sem `labels`, rótulos `en`); `getRteHeadings(doc, options?: { idPrefix?: string }): { pos: number; level: 2 | 3 | 4; text: string; id: string }[]` (nós `heading` em ordem, nível limitado a 2–4, `text = node.textContent`, ids de `createHeadingIds({ prefix })`). A Tarefa 4 acrescenta `getRteHtml`.
- Produces (`testing/editor.ts`, fora do build): stubs instalados ao importar, só quando há `document` e o recurso falta: `Range.prototype.getClientRects`/`getBoundingClientRect`, `document.elementFromPoint` e `PointerEvent` (subclasse de `MouseEvent` com `pointerId`). A Tarefa 4 acrescenta `createTestEditor`/`destroyTestEditors`.
- Produces (`labels.ts`): `RTE_CONTENT_LABELS` (congelado, pt-BR/en/es da spec §6) e `resolveContentLabels(source?: Partial<RteContentLabels> | (() => Partial<RteContentLabels>)): RteContentLabels` (chama a função a cada uso; mescla sobre `en`, inclusive variante a variante em `calloutTitles`).

- [ ] **Step 1: Dependências.** `npx -y npm@11 install -D -E` com os pacotes de B2 em `3.31.4`, `lowlight@3.3.0`, `highlight.js@11.11.1`; no `packages/core/package.json` os mesmos como peers opcionais nas faixas das Global Constraints (substituindo os `^3.0.0` atuais). `npm run check:licenses` (depois de `npx nx build core`) e `npm run notices` sem diff (peers e devDependencies ficam fora, decisão 10 do ADR 0003).
- [ ] **Step 2: Lint (B1, R14).** Em `packages/core/eslint.config.mjs`: um bloco para `src/**/*.ts`, `embeds/src/**/*.ts`, `html/src/**/*.ts` com `no-restricted-imports` cujos `patterns` têm o grupo `@angular/*` (repetido: no flat config a última ocorrência da regra substitui a do `noAngularImports`) e o grupo `@tiptap/*`, `lowlight`, `highlight.js`, `highlight.js/*` com mensagem pt-BR "Tiptap/realce só em extensions/src e code-languages/src (spec 03b, B1)"; um bloco para `extensions/src/**/*.ts` com `no-restricted-syntax` para `MemberExpression[property.name='innerHTML']` e `CallExpression[callee.property.name='insertAdjacentHTML']`; no `@nx/dependency-checks`, remover `ignoredDependencies` (a exceção "peers ainda sem uso") e acrescentar `ignoredFiles` `{projectRoot}/extensions/src/**/*.spec.ts`, `{projectRoot}/extensions/src/testing/**`, `{projectRoot}/code-languages/src/**/*.spec.ts`. Conferir: `import '@tiptap/core'` temporário em `src/index.ts` e `el.innerHTML = ''` temporário em `extensions/src/index.ts` fazem `npx nx lint core` falhar (desfazer).
- [ ] **Step 3: Testes que falham** (`serialize.spec.ts`, `node`, esquema de teste com `getSchema([Document, Paragraph, Text, Heading.configure({ levels: [2, 3, 4] }), HardBreak, HorizontalRule, Bold])` mais nós de teste criados com `Node.create`):
  - texto `a & < > " ` + U+00A0 → `<p>a &amp; &lt; &gt; " &nbsp;</p>`; atributo `title` `a&"<>` + U+00A0 → `title="a&amp;&quot;&lt;&gt;&nbsp;"`.
  - vazios: `<hr>`, `<p>a<br>b</p>`, nó de teste `['img', { src: 'a', alt: '' }]` → `<img src="a" alt="">` (sem `</img>`, sem `/`).
  - ordem: `['p', { 'data-b': '1', style: 'text-align: center', 'data-a': '2' }, 0]` → `<p data-b="1" style="text-align: center" data-a="2">`.
  - ids: títulos `Intro`, `Intro`, vazio, `!!!` → `rt-intro`, `rt-intro-2`, `rt-section`, `rt-section-2`; `id` é o 1º atributo (`<h2 id="rt-intro" style="text-align: center">`) e substitui um `id` vindo do `renderHTML`; `idPrefix: 'doc-'` → `doc-intro`; `idPrefix: 'X'` lança `RangeError`; 100 caracteres de título → id ≤ 80 e casa `getHtmlSchema().elements.h2.attributes.id.rule.pattern`; `getRteHeadings(doc)` devolve os mesmos ids, níveis e `pos`.
  - títulos de caixa: nó de teste `['aside', { class: 'rt-callout rt-callout--warning' }, ['p', { class: 'rt-callout__title' }]]` vazio → `Warning`; com `labels: () => RTE_CONTENT_LABELS['pt-BR']` → `Atenção`; `p.rt-read-also__title` vazio → `Read also`.
  - documento de renderização: dentro de um `renderHTML` de teste, `getRenderDocument()` é o de strings; depois da chamada, `getRenderDocument() === globalThis.document` (aqui `undefined` em `node`); nó de teste cujo `renderHTML` lança → `serializeRteHtml` relança e a pilha volta ao estado anterior (Review Focus 4); `serializeRteHtml` chamado dentro de outro `renderHTML` funciona.
  - nó de teste devolvendo objeto com `nodeType: 1` e `outerHTML: '<b>x</b>'` → escrito literal; sem `outerHTML` → `TypeError`.
  - `labels.spec.ts` (`node`): `RTE_CONTENT_LABELS['pt-BR'].calloutTitles.warning === 'Atenção'`, `en.readAlsoTitle === 'Read also'`, `es.taskCheckbox('X') === 'Tarea: X'`; congelado em profundidade; `resolveContentLabels(undefined)` = `en`; `resolveContentLabels({ calloutTitles: { info: 'I' } as never }).calloutTitles.danger === 'Danger'`; fonte por função é chamada a cada `resolveContentLabels`.
- [ ] **Step 4: Rodar e ver falhar** → FAIL.
- [ ] **Step 5: Implementar** `string-dom.ts`, `render-document.ts` e `serialize.ts` (spec §5: `DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content, { document })` dentro de `withRenderDocument`; normalizações (a) e (b) sobre a árvore de strings; o texto do título para o id é o `textContent` do elemento, que coincide com `node.textContent` do `heading`). `labels` resolvido por `resolveContentLabels` (`labels.ts`). `index.ts` exporta `serializeRteHtml`, `getRteHeadings`, `RTE_CONTENT_LABELS` e os tipos.
- [ ] **Step 6: Rodar e ver passar** — PASS; `npx nx run-many -t lint,typecheck,build,verify-package -p core` verde (publint/attw com `/extensions`); `dist/extensions/index.js` não contém `highlight.js/lib/languages`.
- [ ] **Step 7: Commit** — `feat(core): entry /extensions com serializador canônico sem DOM e peers opcionais do Tiptap`.

### Task 4: Fábrica, recursos base, `rtContent` e `getRteHtml`

**Files:**
- Create: `extensions/src/context.ts`, `extensions/src/content.ts`, `extensions/src/factory.ts`, `extensions/src/base.ts`
- Modify: `extensions/src/types.ts` (`RteEditorOptions`), `extensions/src/serialize.ts` (`getRteHtml`), `extensions/src/index.ts`, `extensions/src/testing/editor.ts`, `packages/core/code-languages/src/index.ts` (só o tipo `RteCodeLanguage`)
- Test: `extensions/src/factory.spec.ts`, `extensions/src/base.spec.ts` (todos `jsdom`)

**Interfaces:**
- Produces: `RteEditorOptions` (spec §6); `RteExtensionContext = { schema: RteHtmlSchema; idPrefix: string; linkPolicy: RteLinkPolicy; providers: readonly RteEmbedProvider[]; codeLanguages: readonly RteCodeLanguage[]; imageMinWidth: number; labels(): RteContentLabels }` e `createExtensionContext(options: RteEditorOptions): RteExtensionContext` (chama `getHtmlSchema(options)` uma vez; `linkPolicy = { ...DEFAULT_LINK_POLICY, ...options.linkPolicy }`; `providers` padrão `DEFAULT_EMBED_PROVIDERS`; `codeLanguages` padrão `[]`; `imageMinWidth` padrão 48). O tipo `RteCodeLanguage` (spec §6) é declarado agora em `code-languages/src/index.ts` e importado como tipo; o catálogo vem na Tarefa 7.
- Produces (`testing/editor.ts`): `createTestEditor(options?: RteEditorOptions, content?: Content, editor?: Partial<EditorOptions>): Editor` (fábrica + `div` em `document.body`) e `destroyTestEditors(): void` (para `afterEach`).
- Produces: `createContentExtension(ctx)` (nome `rtContent`, `addStorage` → `RteContentStorage = { schema; idPrefix; labels(): RteContentLabels }`, com *module augmentation* de `Storage`); `createBaseExtensions(ctx): AnyExtension[]`; `createEditorExtensions(options?: RteEditorOptions): AnyExtension[]`; `getRteHtml(editor: Editor): string`.
- Base: `Heading` estendido (`levels: [2, 3, 4]`, sem atributo `id`, regras `h1`→2, `h5`/`h6`→4, `renderHTML` limita `level` a 2–4); `OrderedList` com atributos substituídos (só `start`, regra `int` do esquema `ol.start`, 1 omitido; `type` descartado); `TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] })`.

- [ ] **Step 1: Testes que falham** (`factory.spec.ts`), com `OFF = { colors: false, code: false, tables: false, tasks: false, media: false, embeds: false, newsBlocks: false }`:
  - `createEditorExtensions({ features: OFF }).map((e) => e.name)` = `['rtContent', 'doc', 'paragraph', 'text', 'heading', 'blockquote', 'horizontalRule', 'hardBreak', 'bulletList', 'orderedList', 'listItem', 'listKeymap', 'textAlign', 'bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript', 'link', 'undoRedo', 'dropcursor', 'gapcursor']`; com `extensions: [X]` o `X` vem por último; `features: { ...OFF, search: true, slashCommands: true }` dá a mesma lista.
  - `extensions: [Paragraph]` e `[Extension.create({ name: 'x' }), Extension.create({ name: 'x' })]` lançam `TypeError` citando o nome; `idPrefix: 'X'` lança `RangeError`; provedor com `hosts: ['localhost']` lança `TypeError`.
  - duas chamadas não compartilham instâncias (`a[i] !== b[i]`); depois de criar, editar e destruir um editor, cada chave de `ext.options` é `Object.is` igual ao instantâneo anterior (lição 4).
  - `getRteHtml` de editor criado sem a fábrica lança `TypeError`; `getRteHtml` logo após `new Editor({ element, extensions, content: '<h2>A</h2>' })`, sem transação, → `<h2 id="rt-a">A</h2>` (lição 10).
- [ ] **Step 2: Testes que falham** (`base.spec.ts`, `setContent(html)` → `getRteHtml`):
  - `<h1 id="evil">A</h1><h5>B</h5><h6>C</h6><h3 style="text-align: right">D</h3>` → `<h2 id="rt-a">A</h2><h4 id="rt-b">B</h4><h4 id="rt-c">C</h4><h3 id="rt-d" style="text-align: right">D</h3>`; JSON com `level: 1` e `level: 6` → `h2` e `h4`.
  - `<p style="text-align: start">a</p>` → `<p>a</p>`; `<p style="text-align: justify">a</p>` igual na saída.
  - `<ol start="3" type="a" style="list-style-type: lower-alpha"><li>a</li></ol>` → `<ol start="3"><li><p>a</p></li></ol>`; `start` `1`, `0`, `100001` → `<ol>`.
  - `<p><b>a</b><i>b</i><u>c</u><del>d</del><code>e</code><sup>f</sup><sub>g</sub><b style="font-weight:normal">h</b></p>` → `<p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code><sup>f</sup><sub>g</sub>h</p>`.
  - `<blockquote><p>a</p></blockquote><hr><p>a<br>b</p>` igual na saída; toda saída deste arquivo dá `validateHtml(…, schema)` = `[]`.
- [ ] **Step 3: Rodar e ver falhar** → FAIL.
- [ ] **Step 4: Implementar** `context.ts`, `content.ts`, `base.ts`, `factory.ts` (lista e ordem da spec §6; checagem de nomes repetidos sobre a lista final) e `getRteHtml` (`serializeRteHtml(editor.state.doc, { idPrefix, labels })` a partir de `editor.storage.rtContent`). Nas Tarefas 5–14 cada recurso entra na fábrica no ponto da ordem da spec.
- [ ] **Step 5: Rodar e ver passar** → PASS.
- [ ] **Step 6: Commit** — `feat(core): fábrica createEditorExtensions com recursos base e getRteHtml`.

### Task 5: Links (`link`, B14, R9)

**Files:**
- Create: `extensions/src/link.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/link.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `getLinkAttributes`, `normalizeHref` (03a), `RteExtensionContext`.
- Produces: `createLinkExtension(ctx)` — `Link` estendido com `openOnClick: false`, `defaultProtocol: 'https'`, `isAllowedUri: (url) => getLinkAttributes(url, ctx.linkPolicy) !== null`; atributos guardados só `href` (normalizado) e `target` (`'_blank' | null`); `renderHTML` → `['a', getLinkAttributes(href, policy, { target }) ?? {}, 0]` na ordem `href`, `target`, `rel`. Comandos `setLink({ href, target? })` (devolve `false` se `getLinkAttributes` der `null`) e `unsetLink`.

- [ ] **Step 1: Testes que falham:**
  - leitura: `<a href="https://a.com" class="x" title="t">A</a>` → `<p><a href="https://a.com/">A</a></p>` (sem `target`, lição 10); `<a href="https://a.com" target="_BLANK" rel="nofollow">A</a>` → `<a href="https://a.com/" target="_blank" rel="noopener noreferrer">A</a>`; `href="site.com"` → `https://site.com/`; `href="javascript:alert(1)"` e `href="data:text/html,x"` → `<p>A</p>`; `mailto:a@b.com`, `tel:+5511999999999`, `/materia`, `#rt-x` mantidos.
  - política: `forceRel: ['nofollow']` → todo link com `rel="nofollow"`; `blockedDomains: ['evil.com']` → `https://sub.evil.com` vira texto; `target: 'blank'` → `https://a.com` ganha `target="_blank" rel="noopener noreferrer"` e `/interno` não; `protocols: ['https']` → `http://a.com` vira texto; `allowRelative: false` → `/x` vira texto.
  - comandos: `setLink({ href: 'site.com' })` → `true` e `getJSON` guarda `href: 'https://site.com/'`; `setLink({ href: 'javascript:x' })` → `false`, documento igual; `setLink({ href: 'https://a.com', target: '_blank' })`; `unsetLink`.
  - JSON com marca `link` `href: 'javascript:x'` → `<p><a>x</a></p>` (inerte; `validateHtml` accepted só `missing-required-attribute` `href`).
  - autolink: despachar `tr.insertText` caractere a caractere de `site.com ` → `<p><a href="https://site.com/">site.com</a> </p>`.
  - toda saída válida em `canonical`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** `link.ts` (`parseHTML` de `a[href]` com `getAttrs` chamando `getLinkAttributes(href, policy, { target: target?.toLowerCase() === '_blank' ? '_blank' : null })`, `false` quando `null`).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): link com política aplicada na leitura, comandos, autolink e renderização`.

### Task 6: Cores (`rtTextColor`, `rtHighlight`, B13)

**Files:**
- Create: `extensions/src/colors.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/colors.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `schema.palette`, `applyStyleFrom`, `schema.elements.span/mark.styleFrom`.
- Produces: `createColorExtensions(ctx): [rtTextColor, rtHighlight]`; atributo `color` (nome da paleta); comandos `setTextColor(name)`, `unsetTextColor`, `setHighlight(name)`, `unsetHighlight` (nome fora da paleta → `false`).

- [ ] **Step 1: Testes que falham:**
  - `<span data-rt-color="red" style="color: blue">a</span>` → `<p><span data-rt-color="red" style="color: #b3261e">a</span></p>`; `<span style="color: red">a</span>` → `<p>a</p>`; `data-rt-color="constructor"`, `"__proto__"`, `"magenta"` → sem marca (Review Focus 2).
  - `<mark>a</mark>`, `<mark data-color="#ff0">a</mark>`, `<mark data-rt-color="constructor">a</mark>` → `<mark data-rt-color="yellow" style="background-color: #fff3a3">a</mark>`; `<mark data-rt-color="green">` → `#ccf2d1`.
  - cada uma das 8 cores de texto e 6 de marca-texto sai `<span|mark data-rt-color="<nome>" style="<prop>: <light>">` e valida em `canonical`.
  - comandos: `setTextColor('red')` → `true`; `setTextColor('magenta')` → `false`; `setHighlight('blue')`; `unset*`; com `colors: false`, `editor.commands.setTextColor` é `undefined` e `<span data-rt-color="red">a</span>` → `<p>a</p>`.
  - JSON com `color: 'evil'` → `<span>a</span>` / `<mark>a</mark>` sem atributos (accepted `[]`).
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (regra de leitura `span[data-rt-color]` com `consuming: false`; `style` de entrada nunca lido; `renderHTML` monta `style` com `applyStyleFrom`).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): marcas de cor de texto e marca-texto pela paleta fechada`.

### Task 7: Catálogo `/code-languages`

**Files:**
- Create: `packages/core/code-languages/src/catalog.ts`
- Modify: `packages/core/code-languages/src/index.ts`
- Test: `packages/core/code-languages/src/catalog.spec.ts` (`node`)

**Interfaces:**
- Consumes: tipo `RteCodeLanguage` (Tarefa 4).
- Produces: `defineCodeLanguage(language): RteCodeLanguage` (cópia congelada; `TypeError` se `id` ou alias não casar `^[a-z0-9][a-z0-9+#-]{0,29}$`, alias repetido ou igual ao `id`, `name` vazio, `load` não função); `RTE_CODE_LANGUAGES` (24, congelado, na ordem da spec §6; `load: () => import('highlight.js/lib/languages/<x>').then((m) => m.default)`, `html` → `xml`).

- [ ] **Step 1: Testes que falham:**
  - ids na ordem `bash c cpp csharp css diff go graphql html java javascript json kotlin markdown php python ruby rust scss shell sql swift typescript yaml`; aliases exatamente os da spec §6 (`sh`→bash … `yml`→yaml), demais `[]`; ids ∪ aliases sem repetição; tudo casa o padrão; `Object.isFrozen` na lista, em cada item e em cada `aliases`.
  - `await html.load()` é a mesma função que `(await import('highlight.js/lib/languages/xml')).default`.
  - `defineCodeLanguage` lança para `id: 'JS'`, `''`, `'a'.repeat(31)`, alias `'Bad'`, alias igual ao id, aliases repetidos, `load: 1`.
  - fonte (`readFileSync` de `catalog.ts`): nenhum `import` estático de `highlight.js` além de `import type`; 24 ocorrências de `import('highlight.js/lib/languages/`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** → PASS; `npx nx build core` e `dist/code-languages/index.js` mantém os `import(` (sem gramática embutida).
- [ ] **Step 5: Commit** — `feat(core): catálogo /code-languages com 24 linguagens carregadas sob demanda`.

### Task 8: Bloco de código e realce sob demanda (B15, R10)

**Files:**
- Create: `extensions/src/code-block.ts`, `extensions/src/highlight.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/code-block.spec.ts`, `extensions/src/highlight.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `isAllowedClass`, `RteCodeLanguage`, `ctx.codeLanguages`.
- Produces: `resolveCodeLanguage(raw: string, catalog: readonly RteCodeLanguage[], codeSpec: RteElementSpec): string | null` (minúsculas ASCII, alias → `id` por `Map`, aceito se `isAllowedClass(codeSpec, 'language-' + id)`); `createCodeBlockExtension(ctx)` — `CodeBlock` estendido (`enableTabIndentation: false`, `HTMLAttributes` vazio, `languageClassPrefix: 'language-'`), comandos oficiais com `{ language }` resolvido e `setCodeBlockLanguage(id | null)` (`false` se não resolver); `createHighlightPlugin(ctx): Plugin` (um `createLowlight()` sem gramáticas por instância do plugin).

- [ ] **Step 1: Testes que falham** (`code-block.spec.ts`):
  - com `codeLanguages: RTE_CODE_LANGUAGES`: `<pre><code class="hljs language-JS">a &lt; b</code></pre>` → `<pre><code class="language-javascript">a &lt; b</code></pre>`; sem catálogo → `class="language-js"`; `language-constructor` com catálogo → `class="language-constructor"` sem `load` (Review Focus 2); `language-Bad_Id` → `<pre><code>`.
  - `<pre><code>  a\n\tb</code></pre>` preserva os espaços; `toggleCodeBlock({ language: 'ts' })` guarda `typescript`; `setCodeBlockLanguage('nope!')` → `false`; `setCodeBlockLanguage(null)` remove a classe.
  - `editor.commands.keyboardShortcut('Tab')` dentro do bloco não muda o documento (WCAG 2.1.2).
- [ ] **Step 2: Testes que falham** (`highlight.spec.ts`), com catálogo de teste `defineCodeLanguage({ id: 'fake', name: 'Fake', aliases: ['fk'], load })`, `load = vi.fn(async () => () => ({ name: 'fake', contains: [{ className: 'keyword', begin: /\bfoo\b/ }] }))`, e `vi.mock('lowlight')` envolvendo `createLowlight` para espionar `highlightAuto` de cada instância:
  - conteúdo inicial com dois blocos `language-fake` → `load` chamado uma vez; depois de `await vi.waitFor`, `view.dom.querySelector('.hljs-keyword')?.textContent === 'foo'`; a transação de realce tem `addToHistory: false` (um `undo` não desfaz nada).
  - bloco `language-outra` (sem catálogo) → nenhuma decoração e `highlightAuto` nunca chamado.
  - `load` rejeitado → nada lança; editar o documento não chama `load` de novo.
  - `load` pendente + `editor.destroy()` + resolver → nenhum erro nem despacho (Review Focus 5).
  - dois editores, A com o catálogo de teste e B sem: o registro em A não realça B.
  - `getRteHtml` e `editor.getHTML()` nunca contêm `hljs`.
- [ ] **Step 3: Rodar e ver falhar** → FAIL.
- [ ] **Step 4: Implementar.** Plugin: estado = `DecorationSet`; recalcula só os blocos de código cujo intervalo a transação alterou (via `tr.mapping`/`changedRanges`) e todos quando chega a *meta* de linguagem carregada; ao ver uma linguagem do catálogo não registrada, chama `load()` uma vez (conjunto de pendentes/falhas por instância), registra `id` e aliases no `lowlight` e despacha `tr.setMeta(key, 'loaded').setMeta('addToHistory', false)` só se a vista não foi destruída (flag da `view()` do plugin); decorações inline com as classes `hljs-*` da árvore do `lowlight.highlight`.
- [ ] **Step 5: Rodar e ver passar** → PASS.
- [ ] **Step 6: Commit** — `feat(core): bloco de código com realce lowlight por editor e gramáticas sob demanda`.

### Task 9: Tabelas (B16)

**Files:**
- Create: `extensions/src/tables.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/tables.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: regras `int` de `th`/`td` e `col.styles.width` do esquema.
- Produces: `createTableExtensions(ctx): [table, tableRow, tableHeader, tableCell]` — oficiais estendidos (`resizable: true`, `renderWrapper: false`, `allowTableNodeSelection: false`); `tableHeader.scope` (`'col' | 'row' | null`); atributos de célula na saída na ordem `colspan`, `rowspan`, `scope`, omitidos quando 1/nulos.

- [ ] **Step 1: Testes que falham:**
  - `<table style="min-width: 145px"><colgroup><col style="width: 120px"><col style="min-width: 25px"></colgroup><tbody><tr><th scope="col" align="center"><p>A</p></th><th><p>B</p></th></tr><tr><td colspan="2" style="background: red"><p>C</p></td></tr></tbody></table>` → `<table><colgroup><col style="width: 120px"><col></colgroup><tbody><tr><th scope="col"><p>A</p></th><th><p>B</p></th></tr><tr><td colspan="2"><p>C</p></td></tr></tbody></table>`.
  - sem largura → sem `colgroup`; `<th colwidth="80">` e `<col width="80">` → `width: 80px`; célula com `colspan="2"` no índice 0 recebe as larguras dos `col` 0 e 1; `colspan="0"`, `"101"`, `rowspan="x"` → omitidos; `scope="rowgroup"` → omitido; `<thead><tr><th>…` lido sem `thead` na saída; `caption` não aparece.
  - `insertTable({ rows: 2, cols: 2, withHeaderRow: true })` → saída válida em `canonical`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (`renderHTML` de `table` monta `colgroup` a partir do `colwidth` das células da 1ª linha, N 1–9999 pela regra `col.styles.width`; `parseHTML` de célula lê `colwidth` do atributo ou do `col` da coluna, achado subindo até o `table` do elemento).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): tabelas com colgroup só com largura e atributos de célula do esquema`.

### Task 10: Tarefas (`rtTaskList`, `rtTaskItem`, B11) e teclado de item

**Files:**
- Create: `extensions/src/tasks.ts`, `extensions/src/task-view.ts`, `extensions/src/item-keymap.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/tasks.spec.ts`, `extensions/src/task-view.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `getRenderDocument`, `ctx.labels`.
- Produces: `createTaskExtensions(ctx): [rtTaskList, rtTaskItem]` (`rtTaskItem` conteúdo `inline*`, atributo `checked: boolean`); comandos `toggleTaskList`, `toggleTaskItemChecked`; `createItemKeymap(itemType: string): Record<string, KeyboardShortcutCommand>` (`Enter` divide com o novo item sem `checked`, `Enter` em item vazio sai para parágrafo depois da lista, `Backspace` no início vira parágrafo dividindo a lista) — reutilizado pela Tarefa 14; `TaskItemView` (NodeView da spec §6).

- [ ] **Step 1: Testes que falham** (`tasks.spec.ts`):
  - saída: `<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">Comprar pão</label></li><li class="rt-task"><label><input type="checkbox" disabled="">Leite</label></li></ul>` é ponto fixo e válida em `canonical`.
  - leitura: `<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>A</p></div></li><li data-type="taskItem" data-checked="false"><div><p>B</p></div></li></ul>` → tarefas `A` marcada e `B` desmarcada; `<ul class="rt-tasks"><li>X</li></ul>` → tarefa `X`; `data-checked=""` → marcada.
  - dois parágrafos: `<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>A</p><p>B</p></div></li></ul>` → `<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled="" checked="">A</label></li></ul><p>B</p>` (regra `p` com `context: 'rtTaskItem/'`, `skip: true` e `getAttrs` que só aceita o primeiro elemento filho do `div`).
  - subtarefa: tarefa `A` contendo lista com `A1`, seguida de `B` → saída válida em `canonical`, sem `ul` dentro de `li.rt-task`, textos `A`, `A1`, `B` em `li.rt-task` nessa ordem (registrar a saída exata como `expected` na Tarefa 16).
  - teclado (`keyboardShortcut`): `Enter` no fim de `A` marcada cria item desmarcado; `Enter` em item vazio → `<p></p>` depois da lista; `Backspace` no início do 2º de 3 itens → lista, parágrafo, lista; `Mod-Enter` alterna `checked`; com `tasks: false`, `toggleTaskList` é `undefined`.
  - `editor.getHTML()` (documento global do jsdom) contém `<label><input type="checkbox" disabled="" checked="">A</label>`.
- [ ] **Step 2: Testes que falham** (`task-view.spec.ts`): estrutura `li.rt-task[data-checked] > span.rte-task__check[contenteditable=false] > input[type=checkbox]` + `span.rte-task__text` com o conteúdo; `aria-label` = `labels.taskCheckbox(texto)` e muda ao digitar; `editor.setEditable(false)` → `input.disabled`; `mousedown` no checkbox tem `defaultPrevented`; `click` alterna `checked` por transação; `update` com outro nó do mesmo tipo devolve `true` sem recriar o `li`.
- [ ] **Step 3: Rodar e ver falhar** → FAIL.
- [ ] **Step 4: Implementar** (`renderHTML` devolve `{ dom, contentDOM }` montado com `getRenderDocument()`: `li.rt-task > label > input` com `contentDOM` = `label`; NodeView sem `innerHTML`).
- [ ] **Step 5: Rodar e ver passar** → PASS.
- [ ] **Step 6: Commit** — `feat(core): tarefas como bloco de texto com label, NodeView acessível e teclado`.

### Task 11: Imagem e vídeo (`rtImage`, `rtVideo`, B10, lição 14)

**Files:**
- Create: `extensions/src/media.ts`, `extensions/src/insert.ts`, `extensions/src/limits.ts`
- Modify: `extensions/src/types.ts`, `extensions/src/factory.ts`, `extensions/src/index.ts`
- Test: `extensions/src/media.spec.ts` (`jsdom`), `extensions/src/limits.spec.ts` (`node`)

**Interfaces:**
- Produces: `truncateText(value: string, max: number): string` (corta em `max` unidades UTF-16 sem deixar substituto alto solto no fim); `replaceEmptyParagraphWith(node: ProseMirrorNode): Command` (`insert.ts`, lição 14: parágrafo vazio no cursor é substituído; senão insere depois do bloco).
- Produces: `RteImageAttrs = { src: string; alt?: string | null; width?: number | null; height?: number | null; srcset?: string | null; sizes?: string | null; align?: RteImageAlign; caption?: string; credit?: string }`; `RteVideoTrack = { kind: 'captions' | 'subtitles'; src: string; srclang: string; label: string; default?: boolean }`; `RteVideoAttrs = { src: string; width?: number | null; height?: number | null; poster?: string | null; preload?: 'metadata' | 'none'; tracks?: RteVideoTrack[]; caption?: string }`; padrões `alt: null`, `align: 'center'`, `caption: ''`, `credit: ''`, `preload: 'metadata'`, `tracks: []`.
- Produces: `createMediaExtensions(ctx): [rtImage, rtVideo]` (atômicos; `rtImage` arrastável); comandos `setImage`, `updateImage`, `setImageSize({ width })`, `setImageAlign(align)`, `setVideo`, `updateVideo` (entrada inválida → `false`; URLs pela regra de mídia do esquema, `srcset`/`sizes` por `normalizeAttribute`).

- [ ] **Step 1: Testes que falham** (`limits.spec.ts`): `truncateText('a'.repeat(999) + '😀', 1000)` → 999 `a`; `truncateText('abc', 2)` → `'ab'`; abaixo do limite devolve igual.
- [ ] **Step 2: Testes que falham** (`media.spec.ts`):
  - saída: `setImage({ src: 'https://cdn.site.com/a.jpg', alt: 'Gato', width: 400, height: 200, caption: 'Legenda', credit: 'Foto: Ana' })` → `<figure class="rt-figure rt-figure--center"><img src="https://cdn.site.com/a.jpg" alt="Gato" width="400" height="200" loading="lazy" decoding="async"><figcaption>Legenda <small class="rt-credit">Foto: Ana</small></figcaption></figure>`; só legenda → `<figcaption>Legenda</figcaption>`; só crédito → `<figcaption><small class="rt-credit">Foto: Ana</small></figcaption>`; nenhum → sem `figcaption`; `alt: null` → `alt=""` e `getJSON` mantém `alt: null`; `srcset`/`sizes` depois de `decoding`.
  - leitura: `<p><img src="/a.jpg"></p>` e `<p> <img src="/a.jpg"> </p>` → só a `figure` (sem `<p></p>`, lição 18); `<p>a<img src="/a.jpg">b</p>` → `<p>a</p><figure …><p>b</p>`; `<figure><img src="/a.jpg" alt="x"><figcaption>  Leg   enda <small class="rt-credit">Foto</small></figcaption></figure>` → legenda `Leg enda`, crédito `Foto`; `figure.rt-figure--left` → `left`, classe ausente → `center`; `<img src="javascript:x">` e `<figure><img src="data:x"><figcaption>Leg</figcaption></figure>` → sem imagem, `<p>Leg</p>` no segundo; `alt` de 1001 caracteres → 1000; `mediaHosts: ['cdn.site.com']` recusa `https://outro.com/a.jpg`; `allowRelativeMedia: false` recusa `/a.jpg`.
  - vídeo: `setVideo({ src: 'https://cdn.site.com/v.mp4', width: 640, height: 360, poster: 'https://cdn.site.com/p.jpg', tracks: [{ kind: 'captions', src: '/pt.vtt', srclang: 'pt-BR', label: 'Português', default: true }, { kind: 'subtitles', src: '/en.vtt', srclang: 'en', label: 'English', default: true }] })` → `<figure class="rt-figure rt-figure--video"><video src="https://cdn.site.com/v.mp4" controls="" preload="metadata" playsinline="" width="640" height="360" poster="https://cdn.site.com/p.jpg"><track kind="captions" src="/pt.vtt" srclang="pt-BR" label="Português" default=""><track kind="subtitles" src="/en.vtt" srclang="en" label="English"></video></figure>`; `track` com `src: 'javascript:x'` ou `kind: 'chapters'` descartado; `label` de 101 → 100; `<video><source src="javascript:x"><source src="/v.mp4"></video>` → `src="/v.mp4"`.
  - comandos: em `<p>a</p><p>|</p>`, `setImage` → `<p>a</p><figure …>` (lição 14); `setImage({ src: 'javascript:x' })` → `false`; `setImageSize({ width: 200 })` em 400×200 → 200×100; `setImageSize({ width: 0 })` e `10001` → `false`; `setImageAlign('full')` → `rt-figure--full`; `updateImage({ caption: 'Nova' })`.
  - JSON com `rtImage.src: 'javascript:x'` → `<figure class="rt-figure rt-figure--center"><img alt="" loading="lazy" decoding="async"></figure>` (inerte; accepted só `missing-required-attribute` `src`).
  - toda saída válida em `canonical` (exceto o caso inerte).
- [ ] **Step 3: Rodar e ver falhar** → FAIL.
- [ ] **Step 4: Implementar** (regras de leitura: `figure.rt-figure` com `img`, `figure` com `img`, `img[src]`, e `p` de prioridade 60 cujo único filho significativo — ignorando texto só de espaço — é `img`; `figure` com `video`, `video[src]`, `video > source[src]`).
- [ ] **Step 5: Rodar e ver passar** → PASS.
- [ ] **Step 6: Commit** — `feat(core): imagem e vídeo com figure, legenda em texto puro e inserção sem parágrafo vazio`.

### Task 12: NodeView de redimensionamento da imagem (B17)

**Files:**
- Create: `extensions/src/image-view.ts`
- Modify: `extensions/src/media.ts` (`addNodeView`)
- Test: `extensions/src/image-view.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `computeResize`, `RteResizeCorner` (03a), `ctx.imageMinWidth`.
- Produces: `ImageView` (NodeView da spec §6: `figure.rt-figure` com `img`, `figcaption` e 4 `span.rte-image__handle.rte-image__handle--nw|ne|sw|se[aria-hidden=true]`; `rte-image--selected` em `selectNode`/`deselectNode`; `update`, `stopEvent`, `ignoreMutation`, `destroy`).

- [ ] **Step 1: Testes que falham** (imagem 400×200; `img.getBoundingClientRect` simulado com largura 400 e `view.dom.clientWidth` 800):
  - estrutura e alças; `NodeSelection` → classe `rte-image--selected`; `update` com legenda nova muda o `figcaption` sem recriar o `img`.
  - arrasto `se`: `pointerdown` (button 0, clientX 0) → `pointermove` clientX 100 → `img` com `width="500" height="250"` e documento ainda 400×200; `pointerup` → documento 500×250 com exatamente uma transação que muda o documento; um `undo` → 400×200.
  - `nw` com dx +100 → 300×150; dx −1000 → 48×24 (`minWidth` padrão); `image: { minWidth: 100 }` → 100×50; `clientWidth` 450 → largura máxima 450.
  - escala: largura exibida 200 (atributo 400) e dx 50 → 500×250.
  - `Escape` durante o arrasto e `pointercancel` → `img` volta a 400×200, nenhuma transação.
  - sem `width`/`height` no nó: usa o tamanho exibido (300×150) e grava os dois.
  - botão secundário não inicia arrasto; `stopEvent` é `true` para evento com alvo na alça; `ignoreMutation()` → `true`; `destroy` remove os ouvintes de `document` (espião em `removeEventListener`).
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (spec §6 "Redimensionamento": `setPointerCapture` se existir; largura exibida 0 → escala 1; `clientWidth` 0 → teto 10000; ouvintes de `pointermove`/`pointerup`/`pointercancel`/`keydown` só durante o arrasto; DOM só no construtor e nos ouvintes).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): NodeView de imagem com alças, arrasto numa transação e Escape cancelando`.

### Task 13: Embeds (`rtEmbed`)

**Files:**
- Create: `extensions/src/embed.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/embed.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `toEmbed`, `ctx.providers`, regra `iframe.attributes.src`, `truncateText`, `replaceEmptyParagraphWith`.
- Produces: `createEmbedExtension(ctx)` (só registrado com `features.embeds` e provedor ativo); atributos `provider`, `src`, `title`, `width`, `height`, `aspectRatio: string | null`, `caption: string`; comandos `setEmbed(url, { caption? })` e `updateEmbed({ caption })`. Saída na ordem `src title width height [style] loading referrerpolicy allow allowfullscreen sandbox`, valores fixos lidos de `schema.elements.iframe` (`default` de cada atributo fixo).

- [ ] **Step 1: Testes que falham:**
  - `setEmbed('https://youtu.be/dQw4w9WgXcQ', { caption: 'Clipe' })` → `<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="640" height="360" style="aspect-ratio: 16 / 9" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe><figcaption>Clipe</figcaption></figure>`; Spotify track → `height="152"` sem `style`; Shorts → `aspect-ratio: 9 / 16`; `setEmbed('https://evil.com/x')` → `false`; em parágrafo vazio substitui (lição 14).
  - leitura: `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>` → embed `nocookie`; `figure.rt-embed` com `iframe` válido, `title` de 301 caracteres (com emoji cruzando o 300º) → 300 sem substituto solto, `width="560" height="315"` mantidos; sem `width`/`height` → 640 × 360; `<iframe src="https://evil.com/x">` → nada; `<iframe srcdoc="<script>x</script>">` → nada; `<iframe srcdoc="x" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">` → embed sem `srcdoc`.
  - opções: `embedProviders: []` → nomes sem `rtEmbed` e `setEmbed` `undefined`; provedor do consumidor válido aceito.
  - JSON com `src: 'https://evil.com/'` → `iframe` sem `src` (accepted só `missing-required-attribute` `src`).
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (`src` aceito pela regra do `iframe` com provedor = o primeiro cujo `srcPattern` casa, senão `toEmbed(src, providers)`; `srcdoc` nunca lido).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): embeds com src revalidado pelo esquema e valores fixos do iframe`.

### Task 14: Blocos de notícia e idioma (`rtPullquote`, `rtCallout`, `rtReadAlso`, `rtLang`, B12)

**Files:**
- Create: `extensions/src/news-blocks.ts`, `extensions/src/lang.ts`
- Modify: `extensions/src/factory.ts`
- Test: `extensions/src/news-blocks.spec.ts`, `extensions/src/lang.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `createItemKeymap` (Tarefa 10), `ctx.labels`, regra `lang` do esquema.
- Produces: `createNewsBlockExtensions(ctx)` na ordem `rtPullquote, rtCallout, rtCalloutTitle, rtReadAlso, rtReadAlsoTitle, rtReadAlsoList, rtReadAlsoItem, rtLang`; atributos `rtPullquote.author|role: string` (padrão `''`), `rtCallout.variant: RteCalloutVariant` (padrão `info`), `rtLang.lang`, `rtLang.dir: 'ltr' | 'rtl' | null`; comandos da spec §6 (`setPullquote`, `updatePullquote`, `unsetPullquote`, `setCallout`, `setCalloutVariant`, `unsetCallout`, `insertReadAlso`, `setLang`, `unsetLang`).

- [ ] **Step 1: Testes que falham** (`news-blocks.spec.ts`):
  - saídas: pullquote com autor e cargo → `<figure class="rt-pullquote"><blockquote><p>Frase</p></blockquote><figcaption><cite>Ana</cite>, editora</figcaption></figure>`; só autor → `<figcaption><cite>Ana</cite></figcaption>`; só cargo → `<figcaption>editora</figcaption>`; nenhum → sem `figcaption`. Callout → `<aside class="rt-callout rt-callout--warning" role="note"><p class="rt-callout__title">Atenção</p><p>Texto</p></aside>` (com `labels` pt-BR). Leia também → `<aside class="rt-read-also" role="note"><p class="rt-read-also__title">Leia também</p><ul><li><a href="https://a.com/">A</a></li></ul></aside>`.
  - leitura: `figure.rt-pullquote` com `figcaption` `<cite>Ana</cite>, editora` → `author: 'Ana'`, `role: 'editora'`; `<aside class="rt-callout rt-callout--danger"><p>X</p></aside>` → título sintetizado vazio e saída `<p class="rt-callout__title">Danger</p>` (rótulo `en`); classe de variante ausente → `info`; `<aside class="rt-read-also"><ul><li><p>A</p></li></ul></aside>` → título `Read also`, item `A` sem `p`.
  - comandos: `setCallout('warning')` com `labels: () => RTE_CONTENT_LABELS[lang]` e `lang` trocado de `pt-BR` para `en` entre duas inserções → títulos `Atenção` e `Warning` sem recriar extensões (lição 4); `setCalloutVariant('danger')` troca o título `Atenção` por `Perigo`, mas mantém título editado `Meu`; `unsetCallout` descarta título igual ao rótulo e transforma outro em parágrafo; `insertReadAlso()` → título + um item vazio com o cursor no item; `setPullquote({ author: 'Ana' })` envolve os parágrafos selecionados; `unsetPullquote` os devolve.
  - teclado: `Enter` no fim do título da caixa leva o cursor ao primeiro bloco da caixa; `Enter`/`Backspace` no "Leia também" como as tarefas.
  - `newsBlocks: false` → nenhum nome `rt*` desta tarefa e `setCallout` `undefined`.
- [ ] **Step 2: Testes que falham** (`lang.spec.ts`): `<span lang="en" dir="rtl">a</span>` → igual; `dir="RTL"` ou `dir="auto"` → sem `dir`; `lang="x"` → sem marca; `<span data-rt-color="red" lang="en">a</span>` → `<span data-rt-color="red" style="color: #b3261e"><span lang="en">a</span></span>`; `setLang({ lang: 'pt-BR' })` → `true`, `setLang({ lang: '1' })` → `false`; `unsetLang`.
- [ ] **Step 3: Rodar e ver falhar** → FAIL.
- [ ] **Step 4: Implementar** (títulos por regra `p.rt-callout__title`/`p.rt-read-also__title` com `context: 'rtCallout/'`/`'rtReadAlso/'` e prioridade 60; título ausente é criado vazio pela expressão de conteúdo e preenchido na serialização, spec §5.3(b); `ul`/`li` por contexto `rtReadAlso/` e `rtReadAlsoList/`).
- [ ] **Step 5: Rodar e ver passar** → PASS; `createEditorExtensions().map((e) => e.name)` tem a ordem completa da spec §6.
- [ ] **Step 6: Commit** — `feat(core): citação em destaque, caixas, Leia também e idioma com títulos traduzidos`.

### Task 15: Fixture "todos os recursos", contrato e cobertura (7.2, 7.3)

**Files:**
- Create: `fixtures/content/all-features.html`, `fixtures/content/all-features.json` (gerado), `.gitattributes`, `extensions/src/testing/fixtures.ts`, `extensions/src/testing/compare.ts`, `extensions/src/testing/schema-usage.ts`
- Modify: `.prettierignore` (`/fixtures/content`)
- Test: `extensions/src/contract.spec.ts`, `extensions/src/coverage.spec.ts` (`jsdom`)

**Interfaces:**
- Produces: `readFixture(name: string): string`, `writeFixture(name: string, text: string): void`, `FIXTURE_DIR` (raiz `fixtures/content/`); `normalizeForCompare(html: string, schema: RteHtmlSchema, doc: Document): string` (analisa com `DOMParser`, remove `id` de `h2`–`h4`, troca `style` por `applyStyleFrom`/`sanitizeStyle` do elemento, devolve o HTML reescrito — usado também no E2E); `collectUsage(html: string): Set<string>` e `schemaUsage(schema: RteHtmlSchema): Set<string>` com chaves `tag`, `tag@attr`, `tag.class` (de `values`), `tag~<padrão>` (padrão de classe que casou) e `tag{prop}` (de `styles`/`styleFrom`).

- [ ] **Step 1: Escrever o fixture** à mão em uma linha (sem `\n` final; `\n` só dentro do `pre`), na saída canônica da spec §4, com tudo da lista mínima da spec §7.3 (3 níveis de título com os 4 alinhamentos, título repetido com sufixo `-2` e título vazio; todas as marcas; links `https` com e sem `target`, `mailto:`, `tel:`, relativo e fragmento; 8 cores de texto e 6 de marca-texto; cor + `lang` juntos e `lang` com `dir`; código com e sem linguagem; tabela com cabeçalho e `scope`, `colspan`, `rowspan`, largura; tarefas marcada e desmarcada; imagem nos 4 alinhamentos, com e sem legenda/crédito, com `srcset`/`sizes`, sem `width`/`height` e decorativa; vídeo com `poster` e duas `track` (uma `default`); YouTube 16 / 9 e Shorts, Vimeo e Spotify, com e sem legenda; citação com autor e cargo, só autor, só cargo; as 4 caixas; "Leia também" com dois links; `ol start`, `hr`, `br`, `blockquote`, lista aninhada; texto com `&`, `<`, `"` e U+00A0). `.gitattributes`: `fixtures/content/** text eol=lf`.
- [ ] **Step 2: Testes que falham** (`contract.spec.ts`; editor com `createEditorExtensions({ codeLanguages: RTE_CODE_LANGUAGES })`, `S = getHtmlSchema()`):
  - o arquivo não contém `\r` (Review Focus 1); `getRteHtml` após `setContent(fixture)` é igual byte a byte ao arquivo.
  - `validateHtml(saída, S)` = `[]`; ids de título únicos; `validateHtml(editor.getHTML(), S, { mode: 'accepted' })` = `[]`; `normalizeForCompare(getRteHtml)` = `normalizeForCompare(editor.getHTML())`.
  - mutação (uma extensão da lista trocada por `.extend()`; cada caso dá ao menos uma violação do tipo e quebra a igualdade com o arquivo): `paragraph` com `data-x` (`unknown-attribute`); `rtCallout` com classe `rt-desconhecida` (`invalid-class`); `heading` renderizando `h5` (`unknown-element`); `rtTextColor` com `style="color: #000000"` (`invalid-style`); `link` com `rel` fora da ordem (`non-canonical-attribute`); `rtImage` sem `alt` (`missing-required-attribute`); `rtEmbed` sem `sandbox` (`missing-required-attribute`).
  - esquema mais restrito: `structuredClone(S)` sem `elements.mark` → violação `unknown-element`; sem `elements.col.styles.width` → `invalid-style`.
  - recurso desligado: para cada um de `colors`, `code`, `tables`, `tasks`, `media`, `embeds`, `newsBlocks`, o fixture num editor com `features: { [r]: false }` sai sem violação contra `getHtmlSchema({ features: { [r]: false } })`; idem com `idPrefix: 'doc-'`, com `embedProviders: []` e com um provedor do consumidor válido.
  - JSON: `editor.getJSON()` serializado como `JSON.stringify(json, null, 2) + '\n'`; com `UPDATE_FIXTURES=1` grava `all-features.json`, senão compara e falha com mensagem pt-BR "regenere com `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache`".
- [ ] **Step 3: Teste que falha** (`coverage.spec.ts`): `collectUsage(fixture) ∪ {'caption', 'thead'}` igual a `schemaUsage(getHtmlSchema())`, com a mensagem listando o que falta de cada lado.
- [ ] **Step 4: Rodar e ver falhar**; para cada diferença, corrigir a extensão quando ela desvia da spec §4 e o fixture quando ele desvia; gerar o JSON com `UPDATE_FIXTURES=1 npx vitest run extensions/src/contract.spec.ts`.
- [ ] **Step 5: Rodar e ver passar** → PASS; trocar um caractere do fixture faz falhar (desfazer).
- [ ] **Step 6: Commit** — `test(core): fixture all-features, contrato HTML ⊆ esquema, mutação e cobertura`.

### Task 16: Leitura tolerante e propriedades (7.4, 7.5)

**Files:**
- Create: `fixtures/content/tolerant-cases.json`
- Test: `extensions/src/tolerant.spec.ts`, `extensions/src/properties.spec.ts` (`jsdom`)

**Interfaces:**
- Consumes: `readFixture`, `createTestEditor`, `validateHtml`.
- Produces: `tolerant-cases.json` = `{ name: string; input: string; expected: string }[]`, `expected` = saída canônica com opções padrão (e `codeLanguages: RTE_CODE_LANGUAGES`, salvo o caso "sem catálogo", que tem `"options": { "codeLanguages": [] }` — campo opcional `options`).

- [ ] **Step 1: Escrever** `tolerant-cases.json` com os casos da spec §7.4 (um por item; os `expected` já fixados nas Tarefas 4–14 são copiados de lá; o da subtarefa aninhada é a saída registrada na Tarefa 10).
- [ ] **Step 2: Testes que falham** (`tolerant.spec.ts`): para cada caso, editor vazio + `editor.view.pasteHTML(input)` → `getRteHtml` igual a `expected` e `validateHtml(expected, S)` = `[]`.
- [ ] **Step 3: Testes que falham** (`properties.spec.ts`, fast-check, 500 execuções; esquema do ProseMirror de `getSchema(createEditorExtensions())`):
  - (a) gerador de documentos JSON (parágrafos com `link`, `rtImage`, `rtVideo` com `tracks`, `rtEmbed`, `codeBlock`) cujos atributos de URL vêm de `src/schema/testing/dangerous-urls.ts` (esquemas `javascript:`/`data:`/`vbscript:` com maiúsculas, TAB/LF, `\`, `//`) ou de `fc.string()`; `doc = schema.nodeFromJSON(json)`; na saída de `serializeRteHtml(doc)`, nenhum `href`/`src`/`srcset`/`poster` (lidos com `htmlparser2`) começa, em minúsculas e sem espaços/controles, com `javascript:`, `data:` ou `vbscript:`; `validateHtml(saída, S, { mode: 'accepted' })` só tem `missing-required-attribute` com `name` em `href`/`src`.
  - (b) idempotência: para os documentos de (a) e textos arbitrários (inclusive U+00A0, `<`, `&`), `serializeRteHtml(parse(serializeRteHtml(doc))) === serializeRteHtml(doc)`, com `parse` = `DOMParser.fromSchema(schema).parse` sobre um `div` do jsdom.
- [ ] **Step 4: Rodar e ver falhar** → FAIL; corrigir as extensões até passar (nunca o `expected` quando a spec §4/§7.4 o determina).
- [ ] **Step 5: Rodar e ver passar** → PASS; repetir uma vez com outra `seed` do fast-check passada a `fc.assert` (e reverter).
- [ ] **Step 6: Commit** — `test(core): casos de leitura tolerante compartilhados e propriedades de segurança e idempotência`.

### Task 17: API pública, SSR do `/extensions` e orçamento de tamanho (R15, R16)

**Files:**
- Create: `extensions/src/ssr.spec.ts`, `extensions/src/index.spec.ts`
- Modify: `extensions/src/index.ts`, `tools/check-size.mjs`, `tools/check-size.test.mjs`, `packages/core/size-budget.json`
- Test: os acima, `src/ssr.spec.ts` (inalterado), `src/index.spec.ts` (`isAllowedClass`), `html/src` (`validateHtml` exportado)

**Interfaces:**
- Produces (`@cds/rte-core/extensions`): `createEditorExtensions`, `getRteHtml`, `serializeRteHtml`, `getRteHeadings`, `RTE_CONTENT_LABELS` e os tipos `RteEditorOptions`, `RteContentLabels`, `RteCalloutVariant`, `RteImageAlign`, `RteImageAttrs`, `RteVideoAttrs`, `RteVideoTrack`; internos (`withRenderDocument`, `createStringDocument`, `createExtensionContext`, `truncateText`) **não** exportados. `@cds/rte-core/code-languages`: `RTE_CODE_LANGUAGES`, `defineCodeLanguage`, `RteCodeLanguage`.
- Produces (`check-size.mjs`): cenário aceita `external?: string[]` (repassado ao `build` do esbuild; `bundleScenario(distFile, exportsList, { external })`).

- [ ] **Step 1: Testes que falham:**
  - `index.spec.ts`: cada nome público existe; os internos não.
  - `ssr.spec.ts` (ambiente `node`, **sem** armadilhas de getter, B21): `typeof document === 'undefined'`; importar `./index` e `../../code-languages/src/index`; `createEditorExtensions()`; `new Editor({ element: null, extensions, content: JSON.parse(readFixture('all-features.json')) })`; `serializeRteHtml(editor.state.doc)` igual a `readFixture('all-features.html')`; `getRteHtml(editor)` também.
  - `check-size.test.mjs`: arquivo temporário `import x from 'fake-ext'; export default x;` → `bundleScenario` sem `external` rejeita; com `external: ['fake-ext']` resolve e o código contém `fake-ext`; `--config` com `external` no cenário mede.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar**; `npx nx build core`; acrescentar ao `size-budget.json` os cenários `extensions` (`packages/core/dist/extensions/index.js`, `["*"]`, `external: ["@tiptap/*", "lowlight", "highlight.js", "highlight.js/*"]`) e `code-languages` (`packages/core/dist/code-languages/index.js`, `["*"]`); medir com `node tools/check-size.mjs --config packages/core/size-budget.json` e fixar `extensions`, `code-languages` e o `html` remedido em `Math.ceil(medido * 1.15 / 64) * 64`. Medir também, só para o ADR 0004, o cenário `extensions` sem `external` (anotar `min` e `gzip`).
- [ ] **Step 4: Rodar e ver passar** — `npx nx run-many -t lint,typecheck,test,build,verify-package,size -p core`, `npm run test:tools`, `npm run check:rules` → verdes.
- [ ] **Step 5: Commit** — `feat(core): API pública do /extensions, SSR sem DOM e orçamento com externos`.

### Task 18: Verificação em navegador real E1–E6 (R17)

**Files:**
- Create: `e2e/core/helpers/editor-bundle.ts`, `e2e/core/helpers/editor-page.ts`, `e2e/core/editor-contract.spec.ts`, `e2e/core/editor-paste.spec.ts`, `e2e/core/editor-resize.spec.ts`, `e2e/core/editor-tasks.spec.ts`, `e2e/core/editor-highlight.spec.ts`, `e2e/core/editor-links.spec.ts`
- Modify: `e2e/core/window.d.ts` (`RteEditorLab`), `e2e/README.md`

**Interfaces:**
- Produces: `editorBundle(): string` — esbuild IIFE `window.RteEditorLab` com `Editor`, `createEditorExtensions`, `getRteHtml`, `validateHtml`, `getHtmlSchema`, `RTE_CODE_LANGUAGES`, `normalizeForCompare` (cache por worker, como `helpers/bundle.ts`); `loadEditorPage(page, options?: { content?: string; editor?: string /* expressão JS das opções */ }): Promise<void>` — `ORIGIN` de `helpers/page.ts`, PNG 1×1 servido em `${ORIGIN}/e2e.png`, toda outra requisição externa abortada por `page.route`, CSS mínimo das alças (12×12, `position: absolute` nos cantos da `figure`) e editor montado em `#editor` como `window.editor`.

- [ ] **Step 1: E1** (`editor-contract.spec.ts`): fixture lido em Node e passado ao `page.evaluate`; `getRteHtml(editor)` igual ao arquivo; `validateHtml(editor.getHTML(), getHtmlSchema(), { mode: 'accepted' })` vazio; `normalizeForCompare` das duas saídas igual.
- [ ] **Step 2: E2** (`editor-paste.spec.ts`): um teste por caso de `tolerant-cases.json` — editor vazio, `editor.view.pasteHTML(input)`, `getRteHtml` = `expected`.
- [ ] **Step 3: E3** (`editor-resize.spec.ts`): imagem `/e2e.png` 400×200; para cada canto, `scrollIntoViewIfNeeded` na alça, `page.mouse` down/move/up (lição 17) → `width`/`height` com proporção 2:1 (±1 px); arrasto para dentro além do limite → 48×24; `Escape` no meio → 400×200 sem mudança no documento; `editor.commands.undo()` depois de um arrasto → 400×200.
- [ ] **Step 4: E4** (`editor-tasks.spec.ts`): clicar no checkbox e, com foco nele, `Space` alternam `checked=""` em `getRteHtml`; `Enter`, `Enter` em item vazio e `Backspace` no início como a spec §6 (asserções na saída); `aria-label` = `Task: <texto>`.
- [ ] **Step 5: E5** (`editor-highlight.spec.ts`): editor com `codeLanguages: RTE_CODE_LANGUAGES` e `<pre><code class="language-javascript">const a = 1;</code></pre>` → `expect.poll` até existir `.hljs-keyword`; `getRteHtml` sem `hljs`.
- [ ] **Step 6: E6** (`editor-links.spec.ts`): `page.keyboard.type('site.com ')` → `<a href="https://site.com/">site.com</a>` sem `target`; editor criado com `<h2>A</h2><h2>A</h2>` → `getRteHtml` imediato traz `rt-a` e `rt-a-2`.
- [ ] **Step 7: Rodar** — `npm run typecheck:e2e`; `npx playwright test -c e2e e2e/core --workers=4` → PASS em chromium, firefox e webkit; a suíte inteira com `--workers=4` → verde. Documentar os specs novos no `e2e/README.md`.
- [ ] **Step 8: Commit** — `test(core): editor em navegador real (contrato, colagem, redimensionamento, tarefas, realce, links)`.

### Task 19: ADR 0004, documentação e verificação final

**Files:**
- Create: `docs/decisions/0004-extensoes-de-conteudo.md`, `.changeset/core-03b.md` (`'@cds/rte-core': minor`)
- Modify: `packages/core/README.md`, `CLAUDE.md`, `docs/specs/03b-extensoes-de-conteudo.md` (critérios de aceite marcados), `docs/specs/README.md` (estado da 03b, se o índice registrar estado)

- [ ] **Step 1: ADR 0004** (pt-BR): contexto; B1–B23 com motivo; números medidos na Tarefa 17 (`extensions` com e sem Tiptap, `code-languages`, `html`); desvios e resoluções desta execução (inclusive as ambiguidades resolvidas: título de caixa sintetizado vazio e preenchido na serialização, regra do `p` em tarefa colada, ids pelo texto do elemento, cenário `code-languages` com gramáticas embutidas pelo esbuild); a parte da decisão 16 do ADR 0003 antecipada (`validateHtml`, `isAllowedClass`).
- [ ] **Step 2: README do core:** `/extensions` (instalação dos peers na mesma versão: `npm i @tiptap/core@3.31.4 @tiptap/pm@3.31.4 …`; `getRteHtml` × `getHTML()`; id muda com o texto do título; legenda em texto puro; `injectCSS: false` fica com a spec 05), `/code-languages` e `validateHtml`. `CLAUDE.md`: comando `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache` e a pasta `fixtures/content/` (consumida pelas specs 04 e 06).
- [ ] **Step 3: Verificação final** — `npm run check:rules`, `npm run test:tools`, `npx nx run-many -t lint,typecheck,build,test,verify-package,size`, `npm run check:licenses`, `npm run notices` sem diff, `docs/html-schema.md` sem drift, `npm run typecheck:e2e`, `npx playwright test -c e2e --workers=4` → tudo verde; marcar cada critério da spec 03b §9 com a evidência.
- [ ] **Step 4: Commit** — `docs(core): ADR 0004 das extensões de conteúdo, README e fechamento da spec 03b`.
