# Spec 03a — Esquema do HTML, embeds e utilitários puros (`@cds/rte-core`)

> Parte 1 de 3 da spec 03 (ver `03-core-e-esquema.md`). Depende da spec 01. Consumida pelas specs 03b (extensões), 04 (sanitizador) e 06 (renderização).
> O código do modelo (MyPresentation) foi perdido: tudo aqui é desenhado do zero; nenhum teste é "portado".

## 1. Objetivo

Definir o **contrato do HTML** que o editor produz e que o sanitizador e a renderização aceitam, como **dados** (`RteHtmlSchema`), e entregar os utilitários puros (sem DOM, sem Tiptap) de que esse contrato e os pacotes seguintes precisam, incluindo as funções que **interpretam** as regras do esquema (usadas pelas duas engines do sanitizador, sem reimplementação).

## 2. Fora de escopo

Extensões Tiptap, fábrica `createEditorExtensions`, fixture "todos os recursos" e teste de contrato HTML ⊆ esquema (03b); linguagens do realce (`/code-languages`, 03b); busca, comandos `/`, limite de caracteres (03c); a sanitização em si (04); CSS de leitura e modo escuro da paleta (06).

## 3. Decisões

Tomadas com o autor em 2026-10-03 (A1–A5); as demais (seções 4–7) foram decididas por revisão técnica independente sob a diretriz do autor "o recomendado e mais seguro" e estão registradas no ADR 0003.

| # | Decisão |
|---|---|
| A1 | Marcação **desenhada do zero**; não há conteúdo legado a preservar. O leitor (03b) é tolerante a HTML genérico (colagem/importação): `<p><img></p>`, `h1`, `h5`/`h6`, `<a>` sem `target`, tarefas no formato do Tiptap. |
| A2 | **HTML portátil:** semântico e legível sem o CSS da lib (RSS, apps, newsletters). Rótulos com significado ("Leia também", "Atenção") são texto do conteúdo; classes `rt-*` só refinam a aparência. |
| A3 | **Cores por paleta fechada e fixa na v1:** `data-rt-color="<nome>"` é a fonte; o `style` inline é **regenerado** a partir do nome (nunca lido da entrada). |
| A4 | **Ids de título com prefixo** configurável, padrão `rt-` (evita colisão com ids do site e *DOM clobbering*). |
| A5 | **Esquema declarativo, só dados**, serializável em JSON, com um conjunto fechado de tipos de regra. O esquema valida **forma** (tags, atributos, valores), não **estrutura** (aninhamento). |

## 4. Marcação por recurso

Recursos (`RteFeatureId`): `base` e `links` (sempre ativos), `colors`, `code`, `tables`, `tasks`, `media`, `embeds`, `newsBlocks`. As opções `search` e `slashCommands` de `RteFeatures` não mudam o HTML (03c). Todos ligados por padrão.

### 4.1 `base`
- Blocos: `p`, `h2`, `h3`, `h4`, `ul`, `ol` (`start`: inteiro 1–100000), `li`, `blockquote` (contém `p`), `hr`, `br`.
- Títulos: só `h2`–`h4`. `id` casa `^<prefixo>[a-z0-9]+(?:-[a-z0-9]+)*$` (A4). No esquema o `id` é **opcional** (id inválido é retirado e o título fica); no editor ele é sempre gerado (teste da 03b). `h1` lido vira `h2`; `h5`/`h6` viram `h4` (03b).
- Marcas: `strong`, `em`, `u`, `s`, `code` (inline), `sup`, `sub`.
- Alinhamento: `style="text-align: left|center|right|justify"` em `p`, `h2`–`h4`.

### 4.2 `links`
- `<a href="…" [target="_blank"] [rel="…"]>`; sem `href` válido o `a` é **desembrulhado** (o texto fica).
- `href` aceito é sempre o **serializado pelo WHATWG URL** (host em punycode, o que neutraliza homógrafos IDN na comparação de domínios): `https:`, `http:`, `mailto:` (endereço válido, query opcional), `tel:` (`^tel:\+?[0-9][0-9().-]{0,30}$`), caminho relativo à raiz (`/…`) ou fragmento (`#…`). Rejeitados: qualquer outro esquema (`javascript:`, `data:`, `vbscript:`, `file:`…), `//…`, `\`, credenciais (`user:pass@`), caracteres de controle, mais de 2048 caracteres. Links relativos quebram fora do site (RSS, newsletter): documentado.
- `target`: só `_blank`; ausente fica ausente (lição 10).
- `rel`: subconjunto de `nofollow sponsored ugc noopener noreferrer`, em ordem canônica. Com `target="_blank"`, `noopener noreferrer` são garantidos; `linkPolicy.forceRel` (ex.: `nofollow ugc`, para conteúdo de usuário) é garantido em todo link.
- `linkPolicy.blockedDomains` (rejeita `'*'`): host ASCII igual ao domínio ou terminado em `.<domínio>` (sem ponto final) é rejeitado. Imposto pelo sanitizador, não só pelo editor.

### 4.3 `colors`
- Texto: `<span data-rt-color="<nome>" style="color: <hex light>">`.
- Marca-texto: `<mark data-rt-color="<nome>" style="background-color: <hex light>">`.
- Paleta (dados exportados e também em `schema.palette`; `light` vai no `style`, `dark` é para a spec 06):

| Texto | light | dark |
|---|---|---|
| gray | `#5f6368` | `#bdc1c6` |
| red | `#b3261e` | `#ff8f87` |
| orange | `#9f4900` | `#f0b84d` |
| green | `#197136` | `#5fd08a` |
| blue | `#1d4ed8` | `#8ab4ff` |
| purple | `#6b21a8` | `#d2a8ff` |
| pink | `#be185d` | `#ff8cc6` |
| teal | `#0e6e66` | `#5eead4` |

| Marca-texto | light | dark |
|---|---|---|
| yellow | `#fff3a3` | `#4d4100` |
| green | `#ccf2d1` | `#1d4a29` |
| blue | `#d3e8ff` | `#1c3a5e` |
| pink | `#ffd6e8` | `#5e1f3d` |
| orange | `#ffe1bf` | `#5c3300` |
| purple | `#eadcff` | `#3f2a63` |

  Contraste garantido por teste (WCAG 2.x): texto `light` ≥ 4,5 sobre branco; texto `dark` ≥ 4,5 sobre `#121212`; preto ≥ 7 sobre marca-texto `light`; branco ≥ 7 sobre marca-texto `dark`; **todo texto da paleta sobre todo marca-texto do mesmo modo ≥ 4,5**. Limite aceito e documentado: sem o CSS da lib, num leitor de fundo escuro, as cores `light` ficam perto de 3:1 (o modo escuro da spec 06 precisa de `!important` por `[data-rt-color]`, porque o `style` inline vence o CSS do site).

### 4.4 `code`
- `<pre><code class="language-<id>">…</code></pre>`, `<id>` casa `^[a-z0-9][a-z0-9+#-]{0,29}$`; sem classe = texto puro.
- O realce **não é gravado** no HTML (o Tiptap o faz por decorações); `hljs-*` não entra no esquema (desvio da spec 03 original e da 04). Realçar na exibição é decisão da spec 06.

### 4.5 `tables`
- `table`, `caption`, `colgroup`, `col` (`style="width: <n>px"`, n 1–9999), `thead`, `tbody`, `tr`, `th`, `td`.
- `th`/`td`: `colspan`, `rowspan` (1–100); `th`: `scope="col|row"`.

### 4.6 `tasks`
```html
<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled checked>Texto da tarefa</label></li></ul>
```
- O `label` dá o nome acessível ao checkbox. Conteúdo da tarefa: só inline (um `p` dentro de `label` é HTML inválido); sem tarefas aninhadas na v1.
- `input`: só `type` (fixo `checkbox`), `disabled` (sempre presente) e `checked`; nunca `name`, `value`, `form`. `label`: nunca `for`. O estado concluído é estilizado por `.rt-task:has(input:checked)` (spec 06).

### 4.7 `media`
- Imagem:
  ```html
  <figure class="rt-figure rt-figure--center">
    <img src="…" alt="…" width="1200" height="800" loading="lazy" decoding="async" srcset="…" sizes="…">
    <figcaption>Legenda <small class="rt-credit">Foto: Fulana</small></figcaption>
  </figure>
  ```
  - Alinhamento: `rt-figure--left|center|right|full`.
  - `alt` obrigatório (até 1000 caracteres); `alt=""` = decorativa; sem `alt` → `alt=""`.
  - `width`/`height`: inteiros 1–10000, tamanho de exibição (o redimensionamento muda os dois, mantendo a proporção).
  - `src`, `poster` e cada URL do `srcset`: `https:` ou, se `allowRelativeMedia` (padrão `true`), caminho relativo à raiz; `mediaHosts` restringe só URLs absolutas. Candidato de `srcset` com vírgula ou espaço na URL é rejeitado. `sizes` casa `^[a-zA-Z0-9 ().,:%+/-]{1,256}$`.
  - `loading="lazy"`, `decoding="async"` (valores únicos).
- Vídeo enviado:
  ```html
  <figure class="rt-figure rt-figure--video">
    <video src="…" controls preload="metadata" playsinline width="…" height="…" poster="…">
      <track kind="captions" src="…" srclang="pt-BR" label="Português" default>
    </video>
    <figcaption>…</figcaption>
  </figure>
  ```
  - `controls` obrigatório; `preload` = `metadata|none`; sem `autoplay`, `loop`, `muted`, `crossorigin`.
  - `track`: `kind` = `captions|subtitles`, `src` (mesma regra de mídia), `srclang` (regra do `lang`), `label` (texto até 100), `default` (booleano) — WCAG 1.2.2.
- Mídia sem `src` válido é removida; `figure` sem filho direto `img`/`video`/`iframe`/`blockquote` é removida.

### 4.8 `embeds`
```html
<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube">
  <iframe src="https://www.youtube-nocookie.com/embed/ID" title="YouTube" width="560" height="315"
    style="aspect-ratio: 16 / 9" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
    allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen
    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe>
  <figcaption>…</figcaption>
</figure>
```
- `src`: `https:`, host ∈ hosts dos **provedores ativos** e casando o **padrão de `src` do provedor** (ex.: `^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}(\?start=\d{1,6})?$`).
- `title` obrigatório; o padrão é o `name` do provedor.
- `style`: só `aspect-ratio`, casando `^[1-9]\d{0,3} / [1-9]\d{0,3}$` (Shorts: `9 / 16`; Spotify sem `aspect-ratio`, só `height`).
- `allow-scripts` com `allow-same-origin` só é seguro porque o host do embed nunca é a origem do site: um provedor cujo host seja a origem do site é recusado (documentado; o core recusa hosts sem ponto e `localhost`).
- `sandbox`, `allow` e `referrerpolicy` são valores fixos; `referrerpolicy` não é `no-referrer` porque o YouTube exige o Referer.
- Provedores padrão (entry point `/embeds`): YouTube (`www.youtube-nocookie.com`), Vimeo (`player.vimeo.com`), Spotify (`open.spotify.com`). O funcionamento de cada um com esse `sandbox`/`allow` é verificado em E2E nos 3 motores; se Vimeo ou Spotify exigirem, acrescenta-se `autoplay` ao `allow` (nunca `autoplay=1` no `src`).

### 4.9 `newsBlocks`
- Citação em destaque:
  ```html
  <figure class="rt-pullquote"><blockquote><p>…</p></blockquote><figcaption><cite>Autor</cite>, cargo</figcaption></figure>
  ```
- Caixa de destaque (4 variantes; o tipo não depende só de cor — WCAG 1.4.1):
  ```html
  <aside class="rt-callout rt-callout--info|success|warning|danger" role="note"><p class="rt-callout__title">Atenção</p><p>…</p></aside>
  ```
  O título é inserido pelo editor com o rótulo traduzido da variante e é editável.
- Leia também:
  ```html
  <aside class="rt-read-also" role="note"><p class="rt-read-also__title">Leia também</p><ul><li><a href="…">…</a></li></ul></aside>
  ```
- `role`: só `note`, só em `aside` (evita um landmark *complementary* sem nome por caixa).
- Idioma: `<span lang="en" [dir="ltr|rtl"]>…</span>`, `lang` casa `^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$`.

## 5. Esquema (`RteHtmlSchema`)

```ts
type RteUrlRule = {
  kind: 'url'; schemes: string[]; relative: boolean; fragment: boolean;
  hosts?: string[]; blockedHosts?: string[]; patterns?: string[]; maxLength: number;
};
type RteAttrRule =
  | { kind: 'enum'; values: string[] }
  | { kind: 'pattern'; pattern: string; maxLength: number }    // regex ancorada, sem flags
  | { kind: 'int'; min: number; max: number }
  | { kind: 'bool' }                                             // presença; serializa vazio
  | { kind: 'text'; maxLength: number }
  | RteUrlRule
  | { kind: 'srcset'; url: RteUrlRule; maxLength: number }
  | { kind: 'tokens'; values: string[]; separator: ' ' | '; '; maxLength: number };

interface RteAttrSpec { rule: RteAttrRule; required?: boolean; default?: string }
interface RteElementSpec {
  attributes: Record<string, RteAttrSpec>;
  classes?: { values?: string[]; patterns?: string[] };
  styles?: Record<string, RteAttrRule>;              // propriedade -> regra do valor
  styleFrom?: { attribute: string; property: string; map: Record<string, string> };
  requireChild?: string[];                           // filhos diretos, avaliado após sanitizar
  onInvalid?: 'remove' | 'unwrap';                   // atributo `required` sem default inválido
  ensureTokens?: { attribute: string; tokens: string[]; when?: { attribute: string; equals: string } }[];
}
interface RteHtmlSchema {
  version: 1;
  idPrefix: string;
  features: RteFeatureId[];
  elements: Record<string, RteElementSpec>;          // união dos recursos ativos
  byFeature: Partial<Record<RteFeatureId, string[]>>; // tags de cada recurso (docs)
  palette: { text: RtePaletteColor[]; highlight: RtePaletteColor[] };
}
function getHtmlSchema(options?: {
  features?: Partial<RteFeatures>;
  embedProviders?: RteEmbedProvider[];
  idPrefix?: string;              // padrão 'rt-'; casa ^[a-z][a-z0-9-]{0,15}$ (senão lança)
  mediaHosts?: string[];
  allowRelativeMedia?: boolean;   // padrão true
  linkPolicy?: { blockedDomains?: string[]; forceRel?: string[] };
}): RteHtmlSchema;                // objeto congelado (deep freeze), serializável em JSON
```

Semântica (interpretada só pelas funções do core):
- **União por tag:** recursos que usam a mesma tag somam atributos e classes; a mesma propriedade/atributo em dois recursos precisa ter regra idêntica (testado). É seguro porque os atributos aceitos são inertes e cada atributo de URL pertence a uma só tag.
- **Comprimento antes da regex:** toda regra com texto tem `maxLength`; nada é testado contra regex antes disso (anti-ReDoS).
- **`style`:** declarações separadas por `;`, propriedade em minúsculas; rejeitados `!important`, `\`, comentários, `url(`; declaração inválida é descartada (as outras ficam), exceto `expression`, que descarta o `style` inteiro; saída canônica `prop: valor; prop: valor` por `serializeStyle`. Com `styleFrom`, o `style` de entrada é ignorado e regenerado do atributo (A3).
- **`tokens`:** saída em ordem canônica (a da lista `values`), sem repetição — sanitizar é idempotente.
- **Funções públicas:** `matchesRule(rule, value)`, `isAllowedUrl(rule, value)` (WHATWG: remove TAB/LF/CR, apara C0/espaço, esquema sem diferenciar maiúsculas, rejeita credenciais e `\`; devolve a forma serializada), `sanitizeStyle(styles, styleText)` (`styles` = o mapa `styles` do elemento) → string canônica, `serializeTokens(rule, value)`.
- `docs/html-schema.md` é **gerado** do esquema padrão e conferido por teste (drift).

## 6. Embeds (`/embeds`)
```ts
interface RteEmbedProvider {
  id: string; name: string; hosts: string[]; srcPatterns: string[];
  match(url: string): boolean;
  toEmbed(url: string): { src: string; height?: number; aspectRatio?: string } | null;
}
```
- `srcPatterns` não aceitam alternância (`|`) no nível 0 (agrupar: `^(?:a|b)$`).
- `toEmbed(url, providers)` → `{ provider, src, title, width, height, aspectRatio? } | null`; o resultado do provedor é **revalidado** pelo core (host e `srcPatterns`), inclusive para provedores do consumidor.
- Formatos: YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, com `t=`/`start=` → `?start=<s>`), Vimeo (`vimeo.com/<id>`, `player.vimeo.com/video/<id>`), Spotify (`open.spotify.com/{track|album|playlist|episode|show}/<id>` → `/embed/…`). O `src` é sempre **montado**, nunca copiado da entrada.

## 7. Utilitários puros (entry `/` salvo indicação)
- **Links:** `normalizeHref(input, policy?)` → `string | null` (`site.com` → `https://site.com/`, e-mail → `mailto:`, saída serializada pelo WHATWG, rejeita o que a seção 4.2 rejeita); `RteLinkPolicy { protocols (só `https`, `http`, `mailto`, `tel`), allowRelative, defaultRel (padrão vazio), forceRel, blockedDomains, target: 'preserve' | 'blank' | 'never' }`; `getLinkAttributes(href, policy)` → `{ href, rel?, target? } | null`.
- **Títulos:** `slugify(text)` (NFKD sem acentos, minúsculas, `[^a-z0-9]+` → `-`, máx. 60); `createHeadingIds({ prefix, fallback = 'section' })` → `(text) => id`, com sufixos `-2`, `-3` para repetidos. Texto não latino gera o fallback (`section`, `section-2`…): documentado.
- **Texto:** `countWords(text)` com `Intl.Segmenter` (palavras de CJK) e fallback por regex `[\p{L}\p{N}]+`; `readingTime(text, { wordsPerMinute = 200 })` (minutos, teto; 0 para vazio).
- **HTML sem DOM (entry `/html`, dependência `htmlparser2` ^12, MIT, ~22 kB gzip, a mesma versão usada pelo sanitize-html):** `htmlToText(html, { maxDepth = 256 })` (quebra linha nos limites de bloco; ignora `script`, `style`, `template`; a saída é texto e precisa ser escapada para voltar ao HTML: documentado) e `extractToc(html, { levels = [2, 3], maxDepth = 256 })` → `{ id, text, level }[]` (ignora títulos sem id válido). Funcionam em SSR. Acima de `maxDepth` a leitura é truncada (devolve o coletado até ali, sem lançar), porque o `htmlparser2` é quadrático em aninhamento profundo.
- **Imagem:** `computeResize({ width, height, dx, dy, corner, minWidth, maxWidth })` → `{ width, height }` inteiros, proporção mantida; `parseSrcset`/`formatSrcset`.
- **Rascunho:** `interface DraftStorage { get(key): string | null; set(key, value): void; remove(key): void }`; `createLocalDraftStorage()` (localStorage com fallback em memória quando ausente ou lança; SSR incluído); `createDraftStore({ storage, key, maxAgeMs = 7 dias, now })` → `save(html)`, `load()` → `{ html, savedAt } | null` (expirado ou envelope inválido → `null`), `clear()`. Documentar: limpar no logout em computadores compartilhados.
- **Paleta:** `RTE_TEXT_COLORS`, `RTE_HIGHLIGHT_COLORS` (dados da seção 4.3).

## 8. Requisitos
- **R1.** `getHtmlSchema` é a única fonte de tags/atributos/estilos permitidos; nenhuma lista paralela em pacote algum.
- **R2.** Desligar um recurso retira as tags e atributos exclusivos dele; hosts e padrões de iframe vêm só dos provedores ativos.
- **R3.** Nenhum valor aceito pelas regras `url`/`srcset` (nem por `normalizeHref`) executa script ou carrega `data:` (propriedade com fast-check, inclusive ofuscações: maiúsculas, TAB/LF, espaços, C0, `\`, `//`).
- **R4.** Todo id gerado por `createHeadingIds` casa a regra de `id` do esquema (propriedade).
- **R5.** Tudo roda em Node sem DOM; nenhum acesso a `window`/`document`/`localStorage` no topo dos módulos (teste importa os módulos em ambiente `node`).
- **R6.** Orçamento de tamanho por entry point do core (min+gzip), medido no CI como o do tema.
- **R7.** `docs/html-schema.md` gerado e sem drift.
- **R8.** Sanitizar é idempotente no que o core define: `sanitizeStyle` e `serializeTokens` aplicados duas vezes dão o mesmo resultado (propriedade).

## 9. Critérios de aceite
- [x] Testes unitários e de propriedade verdes (Vitest, ambiente `node`); typecheck, lint, build, `verify-package` (publint/attw) verdes.
- [x] Contraste da paleta (seção 4.3) verificado por teste.
- [x] `docs/html-schema.md` gerado e conferido.
- [x] Orçamento de tamanho do core no CI; notices incluem as dependências de produção do core (pendência (a) do ADR 0001).
- [x] ADR 0003 registra as decisões e os desvios da spec 03 original.
- [x] Verificação em navegador real nos 3 motores: `isAllowedUrl`/`normalizeHref` comparados com o parser de URL do navegador (o que o navegador resolveria como esquema perigoso nunca é aceito); embeds de YouTube, Vimeo e Spotify carregam com o `sandbox`/`allow` da seção 4.8. **Exceção:** Spotify é `test.fixme` no WebKit do Playwright (nunca dispara `load`, mesmo sem `sandbox`/`allow`); passa em Chromium e Firefox (ADR 0003).
