# Core 03a — Esquema do HTML, embeds e utilitários: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `@cds/rte-core` o esquema declarativo do HTML (`getHtmlSchema`) e as funções que interpretam suas regras, os provedores de embed e os utilitários puros da spec 03a.

**Architecture:** Tudo puro (sem DOM, sem Tiptap). `src/schema/*` define tipos, regras e o esquema por recurso; as funções `normalizeAttribute`/`isAllowedUrl`/`sanitizeStyle` são o único intérprete das regras (as engines da spec 04 vão chamá-las). Entry points: `/` (esquema, links, títulos, texto, imagem, rascunho, paleta), `/embeds` (provedores e `toEmbed`, reexportados de `src/embeds`), `/html` (`htmlToText`, `extractToc` com `htmlparser2`).

**Tech Stack:** TypeScript 6, tsup (ESM), Vitest 4 (ambiente `node`), fast-check 4, htmlparser2 12, Playwright (E2E nos 3 motores).

**Spec:** `docs/specs/03a-esquema-e-utilitarios.md` (leia-a inteira antes de qualquer tarefa; os valores exatos — paleta, padrões, listas — estão lá).

## Global Constraints

- Nenhum import de `@angular/*`; nenhum acesso a `window`/`document`/`localStorage` no topo de módulo (R5).
- Código e nomes públicos em inglês; comentários, mensagens de erro de ferramentas e documentação em pt-BR (CLAUDE.md).
- Esquema só de dados: regex como `string` ancorada (`^…$`), nada de `RegExp`/funções dentro do objeto; o objeto é congelado e sobrevive a `JSON.parse(JSON.stringify(s))`.
- Toda regra de texto tem `maxLength` e o comprimento é checado **antes** de qualquer regex.
- Única dependência de produção nova: `htmlparser2` `^12.0.0` (só no entry `/html`).
- Entry points secundários seguem o padrão do repo: `packages/core/<nome>/src/index.ts`, entrada no `tsup.config.ts`, em `exports` do `package.json` e no `include` de `tsconfig.lib.json`.
- Testes: `packages/core/**/*.spec.ts`, Vitest `environment: 'node'`. Rodar de `packages/core`: `npx vitest run <arquivo>`; pacote inteiro: `npx nx test core` (com `export NX_DAEMON=false`).
- Antes de cada commit: `npx nx run-many -t lint,typecheck,test -p core` verde e `npx prettier --check --end-of-line auto <arquivos>` (o Windows usa CRLF no checkout).
- Commits em pt-BR no estilo `feat(core): …`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch: `feat/spec-03-core`.

## Review Focus

1. **Maiúsculas vindas de HTML colado** (`target="_BLANK"`, `rel="NoOpener"`, `TEXT-ALIGN: Center`): regras `enum`/`tokens` e propriedades de `style` comparam sem diferenciar maiúsculas (ASCII) e devolvem a forma canônica da lista — testes na Tarefa 1 e 2.
2. **Entrada gigante** (atributo de 1 MB, `srcset` com 10 mil candidatos): rejeitada pelo `maxLength` em tempo constante, sem regex — teste na Tarefa 1.
3. **Títulos sem letras latinas ou só pontuação/emoji** (`"!!!"`, `"🚀"`, `"日本語"`): id = fallback com sufixos únicos, sempre válido no esquema — teste na Tarefa 8.
4. **HTML malformado** (tags não fechadas, `h2` dentro de `h2`, comentários, CDATA): `htmlToText`/`extractToc` nunca lançam e não vazam conteúdo de `script` — teste na Tarefa 9.
5. **`localStorage` cheio ou bloqueado** (`setItem` lança `QuotaExceededError`, getter lança `SecurityError`): `save` devolve `false`, `load` devolve `null`, nada lança — teste na Tarefa 11.

---

### Task 1: Tipos do esquema e intérprete de regras de atributo

**Files:**
- Create: `packages/core/src/schema/types.ts`, `packages/core/src/schema/srcset.ts`, `packages/core/src/schema/url.ts`, `packages/core/src/schema/rules.ts`
- Test: `packages/core/src/schema/url.spec.ts`, `packages/core/src/schema/rules.spec.ts`, `packages/core/src/schema/srcset.spec.ts`

**Interfaces:**
- Produces (`types.ts`): `RteUrlRule`, `RteAttrRule`, `RteAttrSpec`, `RteElementSpec`, `RteHtmlSchema` exatamente como na spec §5; `RteFeatureId = 'base' | 'links' | 'colors' | 'code' | 'tables' | 'tasks' | 'media' | 'embeds' | 'newsBlocks'`; `RteFeatures = { colors, code, tables, tasks, media, embeds, newsBlocks, search, slashCommands: boolean }`; `RtePaletteColor = { name: string; light: string; dark: string }`; `RteEmbedProvider` (spec §6); `RteHtmlSchemaOptions` (parâmetro de `getHtmlSchema`, spec §5).
- Produces: `parseSrcset(value: string): { url: string; descriptor?: string }[] | null`, `formatSrcset(c: { url: string; descriptor?: string }[]): string` (`srcset.ts`); `isAllowedUrl(rule: RteUrlRule, value: string): string | null` (`url.ts`, devolve a forma canônica); `normalizeAttribute(rule: RteAttrRule, value: string): string | null`, `matchesRule(rule, value): boolean`, `serializeTokens(rule: Extract<RteAttrRule, {kind:'tokens'}>, value: string): string | null` (`rules.ts`).

- [ ] **Step 1: Testes que falham** (`url.spec.ts`), com `const link: RteUrlRule = { kind: 'url', schemes: ['https','http','mailto','tel'], relative: true, fragment: true, maxLength: 2048 }`:
  - aceita e canoniza: `'https://Example.com'` → `'https://example.com/'`; `'  https://a.com/x  '` → `'https://a.com/x'`; `'/materia/1'` → `'/materia/1'`; `'#rt-intro'` → `'#rt-intro'`; `'mailto:joao@x.com.br'`; `'tel:+5511999999999'`; `'https://пример.рф'` → começa com `'https://xn--'`.
  - rejeita (`null`): `'javascript:alert(1)'`, `'JaVaScRiPt:alert(1)'`, `'java\tscript:alert(1)'`, `'\u0001javascript:alert(1)'`, `'data:text/html,x'`, `'vbscript:x'`, `'file:///etc/passwd'`, `'//evil.com'`, `'/\\evil.com'`, `'https://u:p@a.com'`, `'tel:+55 11'`, `'mailto:nada'`, `'materia/1'`, `'a'.repeat(2049)`.
  - com `relative: false`/`fragment: false`: `'/x'` e `'#x'` → `null`; com `hosts: ['a.com', '*.cdn.com']`: `'https://a.com/'` ok, `'https://img.cdn.com/1'` ok, `'https://b.com/'` `null`; com `blockedHosts: ['evil.com']`: `'https://sub.evil.com/'` e `'https://evil.com./'` `null`; com `patterns: ['^https://a\\.com/v/\\d+$']`: `'https://a.com/v/1'` ok, `'https://a.com/v/x'` `null`.
  - propriedade (fast-check, 2000 execuções): para `fc.string()` prefixado por cada esquema perigoso em capitalização aleatória e com TAB/LF/espaços/C0 inseridos em posições aleatórias, `isAllowedUrl(link, v)` é `null`; e toda saída não nula, minúscula, não começa com `javascript:`, `data:`, `vbscript:`, `file:`.
- [ ] **Step 2: Testes que falham** (`rules.spec.ts`, `srcset.spec.ts`):
  - `enum` `['left','center']`: `'Center'` → `'center'`; `'middle'` → `null`.
  - `pattern` `{ pattern: '^[a-z]+$', maxLength: 10 }`: `'abc'` ok; `'a'.repeat(1_000_000)` → `null` em < 50 ms (mede com `performance.now()`).
  - `int` `{min:1,max:100}`: `'007'` → `'7'`; `'0'`, `'101'`, `'-1'`, `'1.5'`, `'+2'`, `'1e2'` → `null`.
  - `bool`: `'checked'` → `''`; `''` → `''`.
  - `text` `{maxLength: 5}`: `'abcde'` ok, `'abcdef'` `null`.
  - `tokens` `{ values: ['nofollow','noopener','noreferrer'], separator: ' ' }`: `'NoReferrer  nofollow nofollow'` → `'nofollow noreferrer'`; `'evil'` → `null`; `''` → `null`. Separador `'; '`: `'fullscreen;encrypted-media'` com `values: ['encrypted-media','fullscreen']` → `'encrypted-media; fullscreen'`.
  - `srcset`: `parseSrcset('a.jpg 480w, b.jpg 2x')` → 2 candidatos; `parseSrcset('a,b.jpg 1x')` e descritor `'480q'` → `null`; regra `srcset` com `url` só `https` rejeita se um candidato for `'javascript:x 1x'`; `formatSrcset(parseSrcset(s))` é estável.
  - Idempotência (propriedade): `normalizeAttribute(r, normalizeAttribute(r, v)!) === normalizeAttribute(r, v)` para `enum`, `int`, `tokens`, `url`, `srcset`.
- [ ] **Step 3: Rodar e ver falhar** — `cd packages/core && npx vitest run src/schema` → FAIL (módulos inexistentes).
- [ ] **Step 4: Implementar.** `isAllowedUrl`: checa `maxLength` no valor bruto; remove TAB/LF/CR; apara `[\u0000- ]` nas pontas; rejeita `\`; `#…` só com `fragment`; `/…` só com `relative` e nunca `//`; senão exige esquema `^[a-z][a-z0-9+.-]*:` (sem diferenciar maiúsculas) e `new URL()` em `try`; esquema ∈ `schemes`; sem `username`/`password`; `mailto:` casa `^[A-Za-z0-9.!#$%&'*+/=?^_\`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$` no `pathname`; `tel:` casa `^tel:\+?[0-9][0-9().-]{0,30}$` no `href`; `hosts`/`blockedHosts` comparam `hostname` sem ponto final (`*.x` = sufixo `.x`); `patterns` (se houver) exigem casar uma; devolve `url.href`. `enum` e propriedades/tokens comparam em minúsculas ASCII e devolvem o valor da lista.
- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/schema` → PASS.
- [ ] **Step 6: Commit** — `feat(core): tipos do esquema do HTML e intérprete das regras de atributo`.

### Task 2: Estilos e regeneração de cor (`sanitizeStyle`, `styleFrom`)

**Files:**
- Create: `packages/core/src/schema/style.ts`
- Test: `packages/core/src/schema/style.spec.ts`

**Interfaces:**
- Consumes: `normalizeAttribute`, `RteAttrRule`, `RteElementSpec` (Task 1).
- Produces: `sanitizeStyle(styles: Record<string, RteAttrRule>, styleText: string): string` (canônico `prop: valor; prop: valor` na ordem das chaves de `styles`; `''` se nada sobra); `applyStyleFrom(spec: NonNullable<RteElementSpec['styleFrom']>, attributeValue: string): string | null`.

- [ ] **Step 1: Testes que falham**, com `styles = { 'text-align': { kind: 'enum', values: ['left','center','right','justify'] } }`:
  - `'text-align: center'` → `'text-align: center'`; `'TEXT-ALIGN:Center;'` → `'text-align: center'`; `'color: red; text-align: right'` → `'text-align: right'` (propriedade fora do esquema descartada); `'text-align: left; text-align: right'` → `'text-align: right'` (a última vale).
  - descartam só a declaração: `'text-align: center !important'` → `''`; `'text-align: url(x)'` → `''`.
  - descartam o estilo inteiro: qualquer texto com `\`, `/*` ou `*/` → `''`; `'text-align: expression(alert(1))'` → `''`.
  - `width` com `{ kind: 'pattern', pattern: '^(?:[1-9]\\d{0,3})px$', maxLength: 6 }`: `'width: 120px'` ok, `'width: 0px'` e `'width: 10000px'` → `''`.
  - `applyStyleFrom({ attribute: 'data-rt-color', property: 'color', map: { red: '#b3261e' } }, 'red')` → `'color: #b3261e'`; `'blue'` → `null`.
  - propriedade (R8): `sanitizeStyle(s, sanitizeStyle(s, x)) === sanitizeStyle(s, x)` para `fc.string()` e para concatenações aleatórias de declarações válidas e inválidas.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/schema/style.spec.ts` → FAIL.
- [ ] **Step 3: Implementar** em `style.ts` (divide em `;`, separa no primeiro `:`, propriedade aparada em minúsculas, valor aparado com espaços internos colapsados, valida com `normalizeAttribute`).
- [ ] **Step 4: Rodar e ver passar** — PASS.
- [ ] **Step 5: Commit** — `feat(core): sanitizeStyle canônico e cor regenerada pelo nome da paleta`.

### Task 3: Paleta fechada com contraste garantido

**Files:**
- Create: `packages/core/src/schema/palette.ts`
- Test: `packages/core/src/schema/palette.spec.ts`

**Interfaces:**
- Produces: `RTE_TEXT_COLORS: readonly RtePaletteColor[]` (8, ordem e valores da spec §4.3) e `RTE_HIGHLIGHT_COLORS: readonly RtePaletteColor[]` (6), congelados.

- [ ] **Step 1: Testes que falham** (contraste WCAG 2.x calculado no próprio spec: luminância relativa sRGB e `(L1+0.05)/(L2+0.05)`):
  - nomes exatos `['gray','red','orange','green','blue','purple','pink','teal']` e `['yellow','green','blue','pink','orange','purple']`; todo hex casa `^#[0-9a-f]{6}$`.
  - texto `light` ≥ 4,5 sobre `#ffffff`; texto `dark` ≥ 4,5 sobre `#121212`; `#000000` ≥ 7 sobre todo marca-texto `light`; `#ffffff` ≥ 7 sobre todo marca-texto `dark`; todo texto `light` sobre todo marca-texto `light` ≥ 4,5, idem `dark` sobre `dark`.
  - `Object.isFrozen` na lista e em cada item.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** `palette.ts` com os valores da spec.
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): paleta fechada de texto e marca-texto com contraste testado`.

### Task 4: Provedores de embed e `toEmbed` (entry `/embeds`)

**Files:**
- Create: `packages/core/src/embeds/providers.ts`, `packages/core/src/embeds/to-embed.ts`, `packages/core/src/embeds/index.ts`
- Modify: `packages/core/embeds/src/index.ts` (passa a `export * from '../../src/embeds';`), `packages/core/vitest.config.mts` (`include` também em `embeds/src` e `html/src`), `packages/core/tsconfig.spec.json` (idem)
- Test: `packages/core/src/embeds/to-embed.spec.ts`

**Interfaces:**
- Consumes: `isAllowedUrl`, `RteEmbedProvider` (Task 1).
- Produces: `YOUTUBE_PROVIDER`, `VIMEO_PROVIDER`, `SPOTIFY_PROVIDER: RteEmbedProvider`; `DEFAULT_EMBED_PROVIDERS: readonly RteEmbedProvider[]` (nessa ordem); `assertEmbedProvider(p: RteEmbedProvider): void` (lança `TypeError` se algum host não tiver ponto, for `localhost`, ou faltar `srcPatterns`); `toEmbed(url: string, providers?: readonly RteEmbedProvider[]): RteEmbed | null` com `RteEmbed = { provider: string; src: string; title: string; width: number; height: number; aspectRatio?: string }`.
- Valores: `hosts`/`srcPatterns` — YouTube `['www.youtube-nocookie.com']`, `^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}(\?start=\d{1,6})?$`; Vimeo `['player.vimeo.com']`, `^https://player\.vimeo\.com/video/\d{1,12}$`; Spotify `['open.spotify.com']`, `^https://open\.spotify\.com/embed/(track|album|playlist|episode|show)/[A-Za-z0-9]{22}$`. `name`: `'YouTube'`, `'Vimeo'`, `'Spotify'`. Largura sempre `640`; altura = `provider.height ?? Math.round(640 / proporção)`; Shorts `aspectRatio: '9 / 16'`, demais vídeos `'16 / 9'`; Spotify `height` 152 (`track`, `episode`) ou 352 (demais), sem `aspectRatio`.

- [ ] **Step 1: Testes que falham:**
  - `toEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s')` → `{ provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=65', title: 'YouTube', width: 640, height: 360, aspectRatio: '16 / 9' }`; `'https://youtu.be/dQw4w9WgXcQ?t=42'` → `?start=42`; `'https://youtube.com/shorts/dQw4w9WgXcQ'` → `aspectRatio: '9 / 16'`; `'https://www.youtube.com/embed/dQw4w9WgXcQ'` ok.
  - `'https://vimeo.com/76979871'` e `'https://player.vimeo.com/video/76979871'` → `src: 'https://player.vimeo.com/video/76979871'`.
  - `'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'` → `src: 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT'`, `height: 152`.
  - `null`: `'https://www.youtube.com/watch?v=curto'`, `'https://evil.com/watch?v=dQw4w9WgXcQ'`, `'javascript:alert(1)'`, `'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>'`.
  - provedor do consumidor cujo `toEmbed` devolve `src` fora de `hosts`/`srcPatterns` → `toEmbed` devolve `null` (revalidação).
  - `assertEmbedProvider` lança para `hosts: ['localhost']`, `['intranet']` e `srcPatterns: []`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (`match` faz `new URL` em `try`; o `src` é montado só com o id extraído e validado; `t`/`start` aceitam `90`, `90s`, `1m30s`, `1h2m3s`).
- [ ] **Step 4: Rodar e ver passar** → PASS; `npx nx build core` gera `dist/embeds/index.js`.
- [ ] **Step 5: Commit** — `feat(core): provedores de embed YouTube, Vimeo e Spotify com src revalidado`.

### Task 5: `getHtmlSchema` (marcação por recurso, união, opções)

**Files:**
- Create: `packages/core/src/schema/features.ts`, `packages/core/src/schema/get-html-schema.ts`, `packages/core/src/schema/id-prefix.ts`
- Test: `packages/core/src/schema/get-html-schema.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `assertIdPrefix(prefix: string): void` em `src/schema/id-prefix.ts` (lança `RangeError` se não casar `^[a-z][a-z0-9-]{0,15}$`); `getHtmlSchema(options?: RteHtmlSchemaOptions): RteHtmlSchema`; `mergeElements(a: Record<string, RteElementSpec>, b: Record<string, RteElementSpec>): Record<string, RteElementSpec>` (interno; lança `Error` quando o mesmo atributo/estilo tem regras diferentes); `DEFAULT_ID_PREFIX = 'rt-'`.
- A marcação de cada recurso é a da spec §4 (tags, atributos, classes, estilos, `requireChild`, `onInvalid`, `ensureTokens`, `styleFrom`); `features.ts` tem uma função por `RteFeatureId` que devolve o `Record<string, RteElementSpec>` daquele recurso.

- [ ] **Step 1: Testes que falham:**
  - padrão: `features` = os 9 ids; `idPrefix` = `'rt-'`; `elements.h2.attributes.id.rule` = `{ kind: 'pattern', pattern: '^rt-[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 80 }` e `required` ausente; com `idPrefix: 'x-'` o padrão começa com `'^x-'`; `idPrefix: 'X'`, `'1a'` e `'a'.repeat(17)` lançam `RangeError`.
  - `tables: false` → nenhuma de `table caption colgroup col thead tbody tr th td`; `newsBlocks: false` → sem `aside`, `cite` e sem `lang`/`dir` em `span` (que continua com `data-rt-color` por `colors`); `media`, `embeds` e `newsBlocks` desligados → sem `figure`/`figcaption`.
  - `embedProviders: []` → sem `iframe`; com os padrões: `iframe.attributes.src.rule.hosts` = os 3 hosts e `patterns` = os 3 `srcPatterns`; `iframe.attributes.title.required` true; `iframe.styles` só `aspect-ratio`.
  - `linkPolicy: { forceRel: ['nofollow','ugc'], blockedDomains: ['evil.com'] }` → `a.ensureTokens` contém `{ attribute: 'rel', tokens: ['nofollow','ugc'] }` e `{ attribute: 'rel', tokens: ['noopener','noreferrer'], when: { attribute: 'target', equals: '_blank' } }`; `a.attributes.href.rule.blockedHosts` = `['evil.com']`; `a.onInvalid` = `'unwrap'`.
  - `img`/`video`/`iframe`/`track` com `onInvalid: 'remove'`; `figure.requireChild` = `['img','video','iframe','blockquote']`; `span.styleFrom`/`mark.styleFrom` mapeiam os nomes da paleta para o `light`; `input.attributes` tem só `type`, `disabled`, `checked`; `label` sem atributos.
  - `mediaHosts: ['cdn.site.com']` aparece em `hosts` de `img.src`, `video.src`, `video.poster`, `track.src` e do `srcset`; `allowRelativeMedia: false` → `relative: false` nelas.
  - `Object.isFrozen` em profundidade; `JSON.parse(JSON.stringify(s))` igual a `s`; toda `pattern`/`patterns` do esquema compila, começa com `^` e termina com `$`; toda regra de texto tem `maxLength`.
  - `mergeElements` lança com `{ a: { attributes: { href: url1 } } }` × `{ a: { attributes: { href: url2 } } }` e soma classes/atributos distintos.
  - R3 sobre o esquema: para toda regra `url`/`srcset` do esquema padrão, o gerador de esquemas perigosos da Task 1 nunca é aceito.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** `features.ts` e `get-html-schema.ts` (valida provedores com `assertEmbedProvider`; congela em profundidade no fim).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): getHtmlSchema com a marcação de cada recurso`.

### Task 6: `docs/html-schema.md` gerado

**Files:**
- Create: `packages/core/src/schema/markdown.ts`, `docs/html-schema.md`
- Modify: `packages/core/project.json` (target `test` com `inputs` incluindo `{workspaceRoot}/docs/html-schema.md`)
- Test: `packages/core/src/schema/markdown.spec.ts`

**Interfaces:**
- Consumes: `getHtmlSchema` (Task 5).
- Produces: `renderHtmlSchemaMarkdown(schema: RteHtmlSchema): string` (interno, não exportado pelo `index.ts`): título, aviso "arquivo gerado — não edite à mão; regenere com `UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache`", uma seção por recurso (`byFeature`) com tabela `Tag | Atributos | Classes | Estilos` e as paletas em tabela. Determinístico (ordem das chaves do esquema).

- [ ] **Step 1: Teste que falha:** gera `renderHtmlSchemaMarkdown(getHtmlSchema())`; se `process.env.UPDATE_SCHEMA_DOC === '1'` grava em `docs/html-schema.md`; senão compara com o arquivo (normalizando `\r\n` → `\n`) e falha com mensagem pt-BR dizendo como regenerar. Outro teste: a saída contém `rt-callout--warning`, `youtube-nocookie` e `#b3261e`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL (arquivo inexistente).
- [ ] **Step 3: Implementar** e gerar o arquivo com `UPDATE_SCHEMA_DOC=1 npx vitest run src/schema/markdown.spec.ts`.
- [ ] **Step 4: Rodar sem a variável e ver passar** → PASS; alterar 1 caractere do `.md` faz falhar (desfazer depois).
- [ ] **Step 5: Commit** — `docs(core): html-schema.md gerado a partir do esquema, com teste de drift`.

### Task 7: Links (`normalizeHref`, `getLinkAttributes`)

**Files:**
- Create: `packages/core/src/links.ts`
- Test: `packages/core/src/links.spec.ts`

**Interfaces:**
- Consumes: `isAllowedUrl` (Task 1).
- Produces: `RteLinkPolicy = { protocols: string[]; allowRelative: boolean; defaultRel: string[]; forceRel: string[]; blockedDomains: string[]; target: 'preserve' | 'blank' | 'never' }`; `DEFAULT_LINK_POLICY` (`['https','http','mailto','tel']`, `true`, `[]`, `[]`, `[]`, `'preserve'`); `normalizeHref(input: string, policy?: Partial<RteLinkPolicy>): string | null`; `getLinkAttributes(href: string, policy?: Partial<RteLinkPolicy>, options?: { target?: '_blank' | null }): { href: string; rel?: string; target?: '_blank' } | null`.

- [ ] **Step 1: Testes que falham:**
  - `normalizeHref`: `'site.com'` → `'https://site.com/'`; `'site.com/a?b=1#c'` → `'https://site.com/a?b=1#c'`; `'joao@x.com'` → `'mailto:joao@x.com'`; `' https://a.com '` → `'https://a.com/'`; `'/materia'`; `'#rt-x'`; `null` para `''`, `'   '`, `'javascript:alert(1)'`, `'//evil.com'`, `'materia'`, `'http://a.com'` com `protocols: ['https']`, `'/x'` com `allowRelative: false`, `'https://sub.evil.com'` com `blockedDomains: ['evil.com']`.
  - `getLinkAttributes('https://a.com', {}, { target: '_blank' })` → `{ href: 'https://a.com/', rel: 'noopener noreferrer', target: '_blank' }`; sem `target` → `{ href }` (lição 10); `{ target: 'blank' }` em `'/interno'` → sem `target`; `{ target: 'never' }` ignora `options.target`; `{ forceRel: ['ugc','nofollow'], defaultRel: ['sponsored'] }` → `rel: 'nofollow sponsored ugc'`; href inválido → `null`.
  - propriedade: nenhuma saída de `normalizeHref` (minúscula) começa com `javascript:`, `data:`, `vbscript:` ou `file:`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** (e-mail: `^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$`; domínio sem esquema: `^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$` sem diferenciar maiúsculas; `target: 'blank'` só para `http(s)` absolutos; `rel` na ordem `nofollow sponsored ugc noopener noreferrer`).
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): normalizeHref e getLinkAttributes com política de links`.

### Task 8: Ids de título e texto (`slugify`, `createHeadingIds`, `countWords`, `readingTime`)

**Files:**
- Create: `packages/core/src/headings.ts`, `packages/core/src/text.ts`
- Test: `packages/core/src/headings.spec.ts`, `packages/core/src/text.spec.ts`

**Interfaces:**
- Consumes: `DEFAULT_ID_PREFIX` e `assertIdPrefix` (Task 5).
- Produces: `slugify(text: string, maxLength?: number): string` (padrão 60, pode devolver `''`); `createHeadingIds(options?: { prefix?: string; fallback?: string }): (text: string) => string`; `countWords(text: string): number`; `readingTime(text: string, options?: { wordsPerMinute?: number }): number`.

- [ ] **Step 1: Testes que falham:**
  - `slugify('Ação Rápida: 2026!')` → `'acao-rapida-2026'`; `slugify('  --x--  ')` → `'x'`; `slugify('a'.repeat(100))` tem 60; `slugify('🚀')` → `''`.
  - `const id = createHeadingIds()`: `'Introdução'` → `'rt-introducao'`; de novo → `'rt-introducao-2'`; `'Introdução 2'` → `'rt-introducao-2-2'`; `'!!!'` → `'rt-section'`; `'日本語'` → `'rt-section-2'`; `createHeadingIds({ prefix: 'x-', fallback: 'secao' })('🚀')` → `'x-secao'`; `fallback: 'Seção'` lança `RangeError`.
  - propriedade (R4): para `fc.array(fc.string())`, todo id casa `getHtmlSchema().elements.h2.attributes.id.rule.pattern` e não há repetidos.
  - `countWords('Olá, mundo!')` → 2; `''`, `'  '` → 0; `countWords('日本語のテキスト')` > 1; com `Intl.Segmenter` removido (`vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })`) `countWords('a b c')` → 3.
  - `readingTime('')` → 0; 200 palavras → 1; 201 → 2; `{ wordsPerMinute: 0 }` e `NaN` lançam `RangeError`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): ids de título com prefixo e contagem de palavras/tempo de leitura`.

### Task 9: Entry `/html` (`htmlToText`, `extractToc`) e notices das dependências de produção

**Files:**
- Create: `packages/core/html/src/index.ts`, `packages/core/html/src/html-to-text.ts`, `packages/core/html/src/extract-toc.ts`
- Modify: `packages/core/package.json` (`dependencies: { "htmlparser2": "^12.0.0" }`, export `./html`), `packages/core/tsup.config.ts` (entrada `'html/index': 'html/src/index.ts'`), `packages/core/tsconfig.lib.json` (`html/src/**/*.ts`), `tools/generate-notices.mjs` e `tools/generate-notices.test.mjs` (pendência (a) do ADR 0001), `THIRD-PARTY-NOTICES.md` (regenerado), `package-lock.json`
- Test: `packages/core/html/src/html-to-text.spec.ts`, `packages/core/html/src/extract-toc.spec.ts`

**Interfaces:**
- Consumes: padrão de id (`getHtmlSchema`/`DEFAULT_ID_PREFIX`).
- Produces: `htmlToText(html: string): string`; `RteTocEntry = { id: string; text: string; level: number }`; `extractToc(html: string, options?: { levels?: number[]; idPrefix?: string }): RteTocEntry[]` (padrões `[2, 3]` e `'rt-'`).

- [ ] **Step 1: Testes que falham:**
  - `htmlToText('<p>a</p><p>b</p>')` → `'a\nb'`; `'<p>a<br>b</p>'` → `'a\nb'`; `'<p>a  \n  b</p>'` → `'a b'`; `'<script>x</script><style>y</style><template>z</template>t'` → `'t'`; `'&lt;b&gt; &amp;'` → `'<b> &'`; `'<ul><li>1</li><li>2</li></ul>'` → `'1\n2'`; malformado `'<p>a<div>b'`, `'<!--x-->c'`, `'<h2>a<h2>b'` não lançam e não contêm `<`.
  - `extractToc('<h2 id="rt-a">A</h2><h3 id="rt-b">B <em>x</em></h3><h4 id="rt-c">C</h4><h2>sem id</h2><h2 id="evil">E</h2>')` → `[{ id: 'rt-a', text: 'A', level: 2 }, { id: 'rt-b', text: 'B x', level: 3 }]`; `levels: [2,3,4]` inclui o `h4`.
  - notices: em `generate-notices.test.mjs`, um `package-lock` de fixture com entrada não-dev `node_modules/htmlparser2` (MIT) gera aviso para ela; entrada `dev: true` não gera.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar** com `Parser` do `htmlparser2` (`decodeEntities: true`); quebra de linha nos limites de `p h1–h6 li blockquote pre figure figcaption tr div section article aside ul ol table hr br`; corrigir `generate-notices.mjs` para incluir as entradas não-dev do lockfile (mesmo critério de `tools/check-licenses.mjs`); `npm install` e `npm run notices`.
- [ ] **Step 4: Rodar e ver passar** — `npx nx run-many -t lint,typecheck,test,build,verify-package -p core`, `npm run test:tools`, `npm run check:licenses` → verdes; `THIRD-PARTY-NOTICES.md` lista `htmlparser2` e `entities`.
- [ ] **Step 5: Commit** — `feat(core): entry /html com htmlToText e extractToc; notices com dependências de produção`.

### Task 10: Imagem (`computeResize`, `srcset`)

**Files:**
- Create: `packages/core/src/image.ts`
- Test: `packages/core/src/image.spec.ts`

**Interfaces:**
- Consumes: `parseSrcset`, `formatSrcset` (Task 1; reexportados aqui).
- Produces: `RteResizeCorner = 'nw' | 'ne' | 'sw' | 'se'`; `computeResize(input: { width: number; height: number; dx: number; dy: number; corner: RteResizeCorner; minWidth?: number; maxWidth?: number }): { width: number; height: number }` (padrões 48 e 10000).

- [ ] **Step 1: Testes que falham:** 400×200: `se dx=100 dy=0` → 500×250; `nw dx=100` → 300×150; `ne dx=-100` → 300×150; `se dx=0 dy=100` → 600×300 (o eixo de maior variação proporcional vence); `se dx=-1000` → 48×24; `se dx=100000` → 10000×5000; 3×1000 com `dx=-1000` → altura ≥ 1; resultados sempre inteiros; `width`/`height` ≤ 0 ou não finitos lançam `RangeError`.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): computeResize com proporção mantida e helpers de srcset`.

### Task 11: Rascunho (`DraftStorage`, `createDraftStore`)

**Files:**
- Create: `packages/core/src/draft.ts`
- Test: `packages/core/src/draft.spec.ts`

**Interfaces:**
- Produces: `DraftStorage = { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }`; `createMemoryDraftStorage(): DraftStorage`; `createLocalDraftStorage(): DraftStorage` (acessa `globalThis.localStorage` só quando chamada, dentro de `try`, com sonda de escrita; senão memória); `createDraftStore(options: { storage: DraftStorage; key: string; maxAgeMs?: number; now?: () => number }): { save(html: string): boolean; load(): { html: string; savedAt: number } | null; clear(): void }` (envelope JSON `{ v: 1, savedAt, html }`; `maxAgeMs` padrão `7 * 24 * 60 * 60 * 1000`).

- [ ] **Step 1: Testes que falham:**
  - salvar e carregar devolve o mesmo `html` e o `savedAt` do `now`; `clear` apaga.
  - `load` → `null` e remove a chave quando: JSON inválido, `v !== 1`, `html` não string, `savedAt` não finito, expirado (`now - savedAt > maxAgeMs`), ou no futuro (> 60 s).
  - `storage.set` que lança → `save` devolve `false`; `storage.get` que lança → `load` devolve `null`.
  - `key` vazia ou não string → `TypeError`.
  - `createLocalDraftStorage()` sem `localStorage` (Node) funciona em memória; com `globalThis.localStorage` cujo getter lança (`Object.defineProperty`) também; com `localStorage` falso funcional, grava nele.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit** — `feat(core): rascunho com DraftStorage injetável, envelope validado e expiração`.

### Task 12: API pública, segurança em SSR e orçamento de tamanho do core

**Files:**
- Modify: `packages/core/src/index.ts` (mantém `CORE_VERSION`), `tools/check-size.mjs`, `tools/check-size.test.mjs`, `packages/core/project.json` (target `size`), `packages/core/eslint.config.mjs` (se o `dependency-checks` exigir)
- Create: `packages/core/size-budget.json`, `packages/core/src/ssr.spec.ts`
- Test: `packages/core/src/index.spec.ts`, `packages/core/src/ssr.spec.ts`, `tools/check-size.test.mjs`

**Interfaces:**
- Produces (`@cds/rte-core`): `getHtmlSchema`, `DEFAULT_ID_PREFIX`, `normalizeAttribute`, `matchesRule`, `isAllowedUrl`, `serializeTokens`, `sanitizeStyle`, `applyStyleFrom`, `RTE_TEXT_COLORS`, `RTE_HIGHLIGHT_COLORS`, `normalizeHref`, `getLinkAttributes`, `DEFAULT_LINK_POLICY`, `slugify`, `createHeadingIds`, `countWords`, `readingTime`, `computeResize`, `parseSrcset`, `formatSrcset`, `createDraftStore`, `createLocalDraftStorage`, `createMemoryDraftStorage`, `CORE_VERSION` e os tipos (`RteHtmlSchema`, `RteHtmlSchemaOptions`, `RteElementSpec`, `RteAttrSpec`, `RteAttrRule`, `RteUrlRule`, `RteFeatureId`, `RteFeatures`, `RtePaletteColor`, `RteEmbedProvider`, `RteLinkPolicy`, `RteResizeCorner`, `DraftStorage`). `@cds/rte-core/embeds`: `toEmbed`, `DEFAULT_EMBED_PROVIDERS`, `YOUTUBE_PROVIDER`, `VIMEO_PROVIDER`, `SPOTIFY_PROVIDER`, `assertEmbedProvider`, `RteEmbed`. `@cds/rte-core/html`: `htmlToText`, `extractToc`, `RteTocEntry`.
- `check-size.mjs`: novo modo `--config <arquivo.json>` com `{ "scenarios": { "<nome>": { "entry": "<caminho do dist>", "exports": ["*" | nomes] } }, "budgets": { "<nome>": bytes } }`; sem `--config`, o comportamento do tema não muda.

- [ ] **Step 1: Testes que falham:**
  - `index.spec.ts`: cada nome da lista acima é exportado (`expect(typeof mod[n]).not.toBe('undefined')`), e `renderHtmlSchemaMarkdown`/`mergeElements` **não** são.
  - `ssr.spec.ts` (R5): com `vi.resetModules()` e getters em `globalThis.window`, `document` e `localStorage` que lançam, importar `./index`, `../embeds/src/index` e `../html/src/index` não lança; depois `getHtmlSchema()` e `createLocalDraftStorage()` também não.
  - `check-size.test.mjs`: `--config` com 2 cenários mede cada `entry`/`exports` e reporta estouro de orçamento; argumentos antigos continuam funcionando.
- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Implementar**, rodar `npx nx build core`, medir com `node tools/check-size.mjs --config packages/core/size-budget.json` e fixar cada orçamento em `Math.ceil(medido * 1.15 / 64) * 64`; cenários `whole` (`dist/index.js`, `*`), `schema` (`getHtmlSchema`), `links` (`normalizeHref`, `getLinkAttributes`), `draft` (`createDraftStore`, `createLocalDraftStorage`), `embeds` (`dist/embeds/index.js`, `*`), `html` (`dist/html/index.js`, `*`). Target `size` do core igual ao do tema (`dependsOn: ["build"]`, `inputs` com o script e o JSON).
- [ ] **Step 4: Rodar e ver passar** — `npx nx run-many -t lint,typecheck,test,build,verify-package,size -p core,theme`, `npm run test:tools`, `npm run check:rules` → verdes.
- [ ] **Step 5: Commit** — `feat(core): API pública do 03a, teste de SSR e orçamento de tamanho por cenário`.

### Task 13: Verificação em navegador real (3 motores)

**Files:**
- Create: `e2e/core/url-parity.spec.ts`, `e2e/core/embeds.spec.ts`, `e2e/core/helpers/bundle.ts`
- Modify: `e2e/tsconfig.json` (se o `include` não cobrir `e2e/core`), `e2e/README.md`

**Interfaces:**
- Consumes: `isAllowedUrl`, `normalizeHref`, `getHtmlSchema` (Tasks 1, 5, 7); `toEmbed`, `DEFAULT_EMBED_PROVIDERS` (Task 4). `helpers/bundle.ts` empacota `packages/core/src/index.ts` e `src/embeds/index.ts` com esbuild num IIFE `window.RteCore` (mesmo padrão de `e2e/theme/helpers/bundle.ts`).

- [ ] **Step 1: Escrever** `url-parity.spec.ts`: num corpus fixo (os casos das Tasks 1 e 7 mais ofuscações: `'jav&#x09;ascript:'` já decodificado, `'\u0000javascript:'`, `' javascript:'`, `'java\nscript:'`, `'JAVASCRIPT:'`, `'/%2F/evil.com'`, `'\\\\evil.com'`, `'https:evil.com'`) e 500 entradas do fast-check, no navegador: para cada `v`, resolve com `a = document.createElement('a'); a.href = v` e lê `a.protocol`; asserções: (1) se o navegador resolve para `javascript:`, `data:`, `vbscript:` ou `file:`, `isAllowedUrl(regra do href do esquema, v)` é `null`; (2) para toda saída aceita `s`, `a.href = s` resolve para protocolo em `https:`, `http:`, `mailto:`, `tel:` ou para a mesma origem da página.
- [ ] **Step 2: Escrever** `embeds.spec.ts` com `test.skip(process.env.E2E_NETWORK !== '1', 'precisa de rede')`: para `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, `https://vimeo.com/76979871` e `https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT`, monta o `iframe` com `toEmbed` e os valores fixos de `sandbox`/`allow`/`referrerpolicy`/`loading="eager"` da spec §4.8, espera o evento `load` e que `page.frames()` tenha um frame cuja URL começa com o `src`; sem erros de console da página.
- [ ] **Step 3: Rodar** — `npx playwright test -c e2e e2e/core --workers=4` → PASS nos 3 motores; `E2E_NETWORK=1 npx playwright test -c e2e e2e/core/embeds.spec.ts --workers=4` → PASS (se Vimeo/Spotify falharem com esse `allow`, aplicar a regra da spec §4.8: acrescentar `autoplay` ao `allow` no esquema e na doc, regenerar `docs/html-schema.md`).
- [ ] **Step 4: Rodar** `npm run typecheck:e2e` e a suíte E2E inteira com `--workers=4` → verdes.
- [ ] **Step 5: Commit** — `test(core): paridade com o parser de URL e embeds nos 3 navegadores`.

### Task 14: ADR 0003, README e fechamento da spec

**Files:**
- Create: `docs/decisions/0003-esquema-do-html.md`
- Modify: `packages/core/README.md`, `docs/specs/03a-esquema-e-utilitarios.md` (marcar critérios de aceite), `docs/decisions/0001-escopo-nome-versoes-e-ferramentas.md` (pendência (a) resolvida), `CLAUDE.md` (comando `UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache` e o entry `/html`), `.changeset/core-03a.md` (`'@cds/rte-core': minor`)

- [ ] **Step 1: Escrever o ADR 0003** (pt-BR): contexto (modelo perdido), decisões A1–A5, as decisões técnicas da revisão (role `note`, `htmlparser2` em `/html` com ~22 kB gzip, realce fora do HTML, marcação de tarefas com `label`, sandbox/allow/referrer dos embeds e revalidação de `src`, paleta fixa e critérios de contraste, extensões do modelo do esquema — `classes.patterns`, `styleFrom`, `onInvalid`, `maxLength`, semântica do `style`), desvios da spec 03 original (sem `hljs-*`, sem testes portados, orçamento por cenário em vez de `size-limit`) e os números medidos na Task 12.
- [ ] **Step 2: README do core** com exemplos curtos de `getHtmlSchema`, `normalizeHref`, `toEmbed`, `extractToc` e `createDraftStore`, e link para `docs/html-schema.md`.
- [ ] **Step 3: Verificação final** — `npm run check:rules`, `npm run test:tools`, `npx nx run-many -t lint,typecheck,build,test,verify-package,size`, `npm run check:licenses`, `npm run notices` sem diff, `npm run typecheck:e2e`, `npx playwright test -c e2e --workers=4` → tudo verde; marcar os critérios da spec 03a com evidência.
- [ ] **Step 4: Commit** — `docs(core): ADR 0003 do esquema do HTML, README e fechamento da spec 03a`.
