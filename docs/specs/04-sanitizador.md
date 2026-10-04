# Spec 04 — Sanitizador (`@cds/rte-sanitizer`)

> Depende das specs 03a (esquema e interpretadores, concluída) e 03b (fixture `all-features`, `tolerant-cases.json`, `validateHtml`, serializador canônico; concluída). Consumida pelas specs 06 (pipe em modo `sanitize`, inclusive no SSR) e 07 (servidor de exemplo).
> **Revisão de 2026-10-03:** reescrita sobre o core que existe hoje. As decisões em aberto foram tomadas por revisão técnica sob a diretriz do autor "o recomendado e mais seguro". A principal mudança é a **engine**: em vez de `sanitize-html` no Node e `DOMPurify` no navegador (decisão de 2026-10-02), fica **uma engine só, própria**, sobre o `htmlparser2` que o core já usa (S1). O modelo (MyPresentation) foi perdido, então os testes são escritos do zero.

## 1. Objetivo

Entregar `sanitizeRichText`: uma função pura, sem DOM e igual em Node e no navegador. Ela recebe HTML não confiável e devolve só o que o **esquema do core** (`getHtmlSchema`) aceita, na **forma canônica** que o editor produz. Três garantias:

- a saída **nunca executa** nada;
- o HTML do editor atravessa o sanitizador **sem mudar nenhum byte**;
- sanitizar é **idempotente**.

O sanitizador do servidor, rodado na gravação, é a autoridade. O do navegador (pipe da spec 06) é uma segunda barreira com o mesmo código.

## 2. Fora de escopo

- Middleware e exemplos de servidor, e a resposta HTTP a `RteSanitizeError` (spec 07).
- Pipe, `trusted` e Trusted Types (spec 06).
- Leitura tolerante de HTML legado: `h1`→`h2`, `b`→`strong`, `p > img`→`figure` (S11). Isso é do leitor do editor (03b).
- Relatório do que foi removido. Fica como evolução.
- Inserção ou tradução de rótulos: um título de caixa vazio continua vazio.
- Correção da geometria de tabelas com `rowspan`/`colspan` sobrepostos. É o `fixTables` não idempotente do ADR 0005 e fica na issue própria da 03b. O sanitizador valida a forma (1–100), não a grade.
- Realce `hljs-*` (spec 06).
- `htmlToText`, `countWords` e `readingTime`: continuam só no core (S10).

## 3. Decisões

Cada uma com o motivo. Divergências na execução viram o **ADR 0006** (sanitizador).

| # | Decisão | Motivo |
|---|---|---|
| S1 | **Uma engine só, própria**, sobre o `Parser` do `htmlparser2` ^12 (o mesmo do entry `/html` do core). Mesmo código em Node e no navegador. **Sai** `sanitize-html` + `DOMPurify`. | O esquema tem semântica que nenhuma das duas tem (`styleFrom`, `ensureTokens`, `requireChild` "um dentre", `default`/`onInvalid`, saída canônica). Com duas engines seriam duas reimplementações em *hooks*, com bytes diferentes por ambiente. Isso quebraria o contrato byte a byte, a idempotência entre ambientes e a hidratação do SSR da spec 06 (saída do servidor ≠ saída do cliente). O próprio `sanitize-html` também lê com o `htmlparser2`, então o caminho que vale (o servidor) não perde nada. Sem dependência nova: o `sanitize-html` traria `postcss` e mais 4 pacotes, e o `DOMPurify` traria licença dupla MPL/Apache e o `jsdom` no servidor. |
| S2 | **Defesa contra mXSS pela forma da saída.** A saída é sempre **serializada da árvore do sanitizador**, nunca copiada da entrada. Só tem elementos HTML do esquema, sem comentários, *doctype* ou CDATA, sem elementos de texto cru ou estrangeiros (só o `iframe`, que sai **sempre vazio**), com texto e atributos escapados (S13). O invariante **I1** ("o navegador lê a saída como a mesma árvore") é testado nos 3 motores (§6.3). | O que importa é como o navegador lê a **saída**, não a entrada. Num subconjunto sem contextos de texto cru, sem espaço de nomes estrangeiro e com todo `<`, `>`, `&` e `"` escapado, o parser do navegador só pode mover ou clonar elementos permitidos; não pode criar marcação a partir de texto. A vantagem do DOMPurify (usar o parser do navegador) só existiria no navegador, que não é a autoridade. |
| S3 | **Tratamento de elementos.** (a) Fora do esquema: o elemento é **desembrulhado** e o conteúdo é processado. (b) Conteúdo **descartado inteiro** em `script`, `style`, `template`, `noscript`, `noembed`, `noframes`, `textarea`, `title`, `xmp`, `plaintext`, `object`, `embed`, `svg`, `math`, `head` e dentro de todo `iframe`. (c) Normalizações estruturais para I1: em `table`, `thead`, `tbody`, `tr` e `colgroup` o texto e os filhos fora do modelo de conteúdo são removidos; `tr` direto em `table` ganha um `tbody`, como faz o navegador; `a` dentro de `a` é desembrulhado. Toda divergência nova que o oráculo achar vira uma normalização, com caso de regressão e linha no ADR 0006. | (b) cobre os contextos de texto cru e estrangeiros, onde os parsers divergem, e conteúdo que não é visível. (c) cobre os únicos pontos em que o parser HTML reestrutura o subconjunto do esquema (*foster parenting* e *adoption agency*). Não é allowlist: é conhecimento do parser HTML, por isso não fere R1. |
| S4 | **Interpretadores no core** (entry `.`, puros, sem `htmlparser2`): `getElementSpec`, `sanitizeClass`, `sanitizeAttributes`, `hasRequiredChild`, `escapeHtmlText` e `escapeHtmlAttribute` (§4). O `string-dom.ts` da 03b passa a usar os dois `escape*`. O `validateHtml` **não** é reescrito sobre eles. | Fecha a decisão 16 do ADR 0003 e a B20 do ADR 0004, sem regra duplicada entre pacotes. A renderização (06) pode reaproveitar os interpretadores. O escape é um só para que o editor e o sanitizador produzam os mesmos bytes. O `validateHtml` fica independente para servir de oráculo diferencial. |
| S5 | **Semântica de `sanitizeAttributes`.** Mantém a ordem da entrada; com nome repetido, vale o primeiro (como o parser). Cada valor vira a forma de `normalizeAttribute`. `class` passa por `sanitizeClass`. `style` passa por `sanitizeStyle` ou, com `styleFrom`, é regenerado do atributo-fonte, ignorando a entrada (A3). Atributo ausente ou inválido com `default` recebe o `default`. Atributo `required` sem valor válido nem `default` aplica `onInvalid`, e `onInvalid` ausente vale `'remove'`. `ensureTokens` acrescenta os tokens e re-serializa por `serializeTokens` (ordem canônica). O que é acrescentado vai **ao fim**: primeiro as chaves de `spec.attributes`, na ordem do esquema, e por último o `style` gerado. | É idempotente por construção, e o fixture fica byte a byte (a ordem dele é a da entrada). Remover por padrão falha fechado. |
| S6 | **`requireChild` é "um dentre"** (decisão 1 do ADR 0004). É avaliado em pós-ordem sobre os **filhos elemento diretos já sanitizados**. O elemento que não passa é **removido com o conteúdo**. | Mesma semântica do `validateHtml`. Uma `figure` sem mídia deixaria a `figcaption` solta (03a §4.7). Em pós-ordem a remoção em cascata fica estável. |
| S7 | **`id` repetido:** da segunda ocorrência em diante, o elemento perde o `id`, e o elemento fica. | Âncoras e sumário (`extractToc`) sem ambiguidade; menos *DOM clobbering*. O editor nunca repete ids, então o fixture não muda. |
| S8 | **Limites com erro tipado, nunca truncamento.** Se `html.length > maxInputLength`, lança `RteSanitizeError('input-too-long')` **antes** de ler. Se a profundidade de elementos abertos passa de `maxDepth`, a leitura **para** e lança `RteSanitizeError('max-depth')`. Padrões: `maxInputLength` 1 000 000 (unidades UTF-16) e `maxDepth` 256. Opção que não é inteiro ≥ 1 lança `RangeError`. Entrada que não é `string` lança `TypeError`. | Na gravação, truncar perderia conteúdo sem aviso, e o servidor precisa devolver erro ao usuário. Parar no limite evita a pilha quadrática do `htmlparser2` (decisão 11 do ADR 0003). 256 é o limite do walker do core e fica muito acima do que o editor produz. |
| S9 | **Opções = `RteHtmlSchemaOptions` + limites.** O sanitizador monta o esquema com `getHtmlSchema`, que valida provedores, hosts e regex, e **não aceita esquema montado à mão**. `createSanitizer(options)` monta o esquema uma vez. `sanitizeRichText(html)` sem opções usa um sanitizador padrão memoizado. | Aceita o mesmo objeto de opções que a fábrica do editor (superconjunto, B18), então o editor e o servidor não divergem por configuração. Um esquema à mão poderia ter regex sem âncora ou provedor sem validação. |
| S10 | **Dependências.** `htmlparser2` `^12.0.0` em `dependencies` (MIT, já no lockfile pelo core). `@cds/rte-core` em `peerDependencies`, na mesma versão do sanitizador. **Sem reexportar** `htmlToText`, `countWords` e `readingTime`. **Nenhum pacote novo no lockfile.** | Gate de licenças e `THIRD-PARTY-NOTICES.md` inalterados. Uma só cópia do core, controlada pelo consumidor (o mesmo padrão da B4). Um caminho de import por função, que é o do core. |
| S11 | O sanitizador é **filtro do contrato, não conversor**. Tag fora do esquema é desembrulhada (`<h1>Título</h1>` vira o texto solto `Título`). HTML legado entra pelo leitor do editor, inclusive em Node com `new Editor({ element: null })`. | Uma regra de conversão a mais seria uma segunda leitura tolerante, divergente da 03b. |
| S12 | **Orçamento de tamanho por cenário** em `packages/sanitizer/size-budget.json` (`nx run sanitizer:size`, reutiliza `tools/check-size.mjs`), com o orçamento dado por `ceil(medido × 1,15 / 64) × 64` (ruling 5 do ADR 0004). **Teto de reavaliação: 40 kB** min+gzip no cenário `whole`. | Estimativa: `htmlparser2` mais `entities` (cerca de 22 kB) mais interpretadores, perto do entry `/html` (29 kB). Em app com o editor, o parser já está no bundle. Acima do teto vale reabrir S1 (S14). |
| S13 | **Serialização:** algoritmo do HTML como no `getRteHtml`. Texto escapa `& nbsp < >`; atributos escapam `& nbsp " < >`; o resto sai literal em UTF-8. CR/CRLF viram LF e NUL vira U+FFFD. Booleanos saem como `nome=""`. Elementos vazios (*void*) saem sem fechamento. Comentários, *doctype* e instruções de processamento saem removidos. | Garante os mesmos bytes do fixture. Escapar `<` e `>` em atributo segue o HTML atual e elimina a classe de mXSS por valor de atributo. |
| S14 | **Reavaliação** (com ADR) se I1 achar divergência que nenhuma normalização (S3c) resolva, ou se o cenário `whole` passar de 40 kB. A alternativa registrada é manter a engine própria e acrescentar `DOMPurify` **só no navegador**, como segunda barreira depois dela, com allowlist derivada do esquema. | Mantém a autoridade e a idempotência no servidor. O DOMPurify só entra se a evidência pedir. |

## 4. API

```ts
// @cds/rte-core (entry `.`, sem htmlparser2) — S4
/** `schema.elements[tag]` só com `Object.hasOwn` (`constructor`, `__proto__` → undefined). */
function getElementSpec(schema: RteHtmlSchema, tag: string): RteElementSpec | undefined;
/** Tokens (espaço ASCII) aceitos por `isAllowedClass`, ordem da entrada, sem repetição; `null` se nenhum. */
function sanitizeClass(spec: RteElementSpec, value: string): string | null;
type RteSanitizedAttributes =
  | { action: 'keep'; attributes: [name: string, value: string][] }
  | { action: 'remove' | 'unwrap'; attribute: string };   // atributo `required` que falhou
/** S5. `attributes` com nomes já em minúsculas, na ordem da entrada. */
function sanitizeAttributes(
  spec: RteElementSpec,
  attributes: Iterable<readonly [string, string]>,
): RteSanitizedAttributes;
/** S6: true se não há `requireChild` ou se algum dos exigidos está em `childTags`. */
function hasRequiredChild(spec: RteElementSpec, childTags: ReadonlySet<string>): boolean;
/** S13 (movidos de `extensions/src/string-dom.ts`). */
function escapeHtmlText(text: string): string;
function escapeHtmlAttribute(value: string): string;

// @cds/rte-sanitizer
import type { RteHtmlSchemaOptions } from '@cds/rte-core';

interface RteSanitizeOptions extends RteHtmlSchemaOptions {
  maxInputLength?: number;   // padrão 1_000_000 (unidades UTF-16)
  maxDepth?: number;         // padrão 256
}
type RteSanitizeErrorCode = 'input-too-long' | 'max-depth';
class RteSanitizeError extends Error {
  readonly name: 'RteSanitizeError';
  readonly code: RteSanitizeErrorCode;
  readonly limit: number;
}
/** Monta o esquema uma vez (`getHtmlSchema` lança com opções inválidas). */
function createSanitizer(options?: RteSanitizeOptions): (html: string) => string;
/** Atalho: sem opções usa o sanitizador padrão memoizado; com opções equivale a `createSanitizer(options)(html)`. */
function sanitizeRichText(html: string, options?: RteSanitizeOptions): string;
const SANITIZER_VERSION: string;
```

- **Pacote:** um só entry `.` (ESM, `sideEffects: false`), sem *exports* condicionais. `exports` e `files` como hoje; `verify-package` (publint e attw) verde.
- **Algoritmo** (uma passada): `Parser` do `htmlparser2` com `decodeEntities: true`, constrói uma árvore própria leve, com a profundidade conferida a cada `onopentag` (S8). Depois vem um percurso em pós-ordem: S3 e, para cada elemento do esquema, `getElementSpec`, `sanitizeAttributes`, os filhos, `hasRequiredChild` e S7. Por fim, a serialização (S13). Nada é avaliado por regex antes do teto de comprimento da regra (03a).

## 5. Requisitos

- **R1.** **Uma fonte só.** Tags, atributos, classes, estilos, URLs e hosts de `iframe` vêm só do esquema, pelos interpretadores do core. O sanitizador não tem nenhuma allowlist própria; as listas de S3 descrevem o parser HTML, não o que é aceito. Toda busca no esquema usa `Object.hasOwn`.
- **R2.** **Contrato byte a byte.** `sanitizeRichText(f) === f` para:
  - `fixtures/content/all-features.html`;
  - todo `expected` de `tolerant-cases.json`;
  - todo documento de `fixtures/content/editor-corpus.json`: 300 documentos gerados pelo editor com semente fixa, criados pelo core com `UPDATE_FIXTURES=1` e conferidos contra drift como o `all-features.json`.
- **R3.** **Idempotência.** `s(s(x)) === s(x)` para todo `x`.
- **R4.** **Saída canônica.** `validateHtml(s(x), schema, { mode: 'canonical' })` devolve `[]` para todo `x`. Vale também com recursos desligados e com `linkPolicy`.
- **R5.** **Nunca executável.** Na saída não há elemento fora do esquema, nem atributo `on*`, nem URL (`href`, `src`, `poster`, candidatos de `srcset`) cujo esquema seja diferente de `https`, `http`, `mailto` e `tel`, nem `style` com `url(`, `expression` ou `\`. Todo `iframe` fica vazio, com `sandbox`/`allow`/`referrerpolicy` fixos e `src` de provedor ativo.
- **R6.** **Isomorfismo.** Para o fixture, o `editor-corpus` e o corpus de XSS, a saída nos 3 navegadores é igual à do Node, inclusive nas URLs, porque o `URL` do WHATWG pode diferir entre motores.
- **R7.** **I1, estabilidade sob o parser do navegador:** para toda saída `o`, `s(div.innerHTML)` é igual a `o` quando o `div` recebe `o` por `innerHTML`. A árvore DOM resultante só tem elementos do espaço de nomes HTML que estão no esquema.
- **R8.** **Limites (S8).** Lança erro tipado em vez de truncar ou travar. Entradas adversariais de até `maxInputLength` terminam em < 2 s no CI: aninhamento no limite, milhares de atributos, entidades, tags sem fechamento e valores longos. Essa é a guarda contra comportamento quadrático; o normal é dezenas de ms.
- **R9.** **SSR.** Nenhum acesso a `window`/`document` no topo nem durante a execução; só o global `URL`. O teste importa e sanitiza em ambiente `node`.
- **R10.** **Desempenho medido.** Um documento de cerca de 20 mil palavras (fixture repetido, cerca de 400 kB) tem a mediana registrada no ADR 0006, em Node e no Chromium. Meta: ≤ 100 ms em Node, comparável aos 34 ms do `sanitize-html` medidos em 2026-10-02, que também usa o `htmlparser2`. O número é informativo e não reprova o CI.
- **R11.** **Core.** Os interpretadores de S4 ficam no `index.ts` de `.` com testes próprios; os cenários `whole` e `schema` são remedidos; o `string-dom.ts` usa os `escape*`. O fixture e o contrato da 03b continuam verdes.
- **R12.** **Grafo e lint.** O sanitizador importa só `@cds/rte-core` (`.`) e `htmlparser2`. Nada de `@angular/*`, `@tiptap/*` nem `/extensions` no código, e as tags `scope:*` não mudam. Os testes podem usar `@cds/rte-core/html` (oráculo).

## 6. Testes

### 6.1 Unitários (Vitest, ambiente `node`, `packages/sanitizer/src/*.spec.ts`; core em `packages/core/src/schema/*.spec.ts`)

- **Core** (`interpret.spec.ts`):
  - `getElementSpec` com `constructor`, `toString` e `__proto__`;
  - `sanitizeClass` (vazio, repetição, espaço não ASCII, 129 caracteres);
  - `sanitizeAttributes` em cada caminho de S5:
    - ordem e primeiro que vence;
    - `default` do `input` e do `iframe`, `alt` ausente → `alt=""`;
    - `onInvalid` `unwrap` (`a` sem `href` válido) e `remove` (`img`, `video`, `track`, `iframe`);
    - `styleFrom` ignorando o `style` da entrada;
    - `ensureTokens` com `target="_blank"` e com `forceRel`, e `rel` re-serializado;
  - todo `default` do esquema padrão é ponto fixo de `normalizeAttribute`;
  - `hasRequiredChild` "um dentre";
  - os `escape*` iguais à saída do `getRteHtml` (CR, NUL, nbsp, `<>"&`).
- **Sanitizador:**
  - `contract.spec.ts`: R2 (fixture, `tolerant-cases` e `editor-corpus`); o fixture com cada recurso desligado tira as tags exclusivas dele e continua canônico.
  - `elements.spec.ts`: S3 (a)–(c) caso a caso, S6 em cascata (`figure` cujo `img` perdeu o `src`), S7.
  - `limits.spec.ts`: R8, incluindo o código e o `limit` do erro, opções inválidas e entrada que não é `string`.
  - `ssr.spec.ts`: R9.
  - `index.spec.ts`: exports e memoização do padrão.
- **Corpus de XSS** (`xss.spec.ts`): **≥ 150 casos** em `src/testing/xss-corpus.ts`, cada um com a saída esperada exata. Categorias (cada recurso do esquema tem casos próprios):
  - cheat sheet da OWASP;
  - mXSS: `noscript`/`title`/`textarea`/`style` com `</…>` em atributo, `svg`/`math` com `mglyph`/`malignmark`, `template`, comentário com `--!>`, `<!-->`, CDATA, `form` aninhado, `table` com *foster parenting*;
  - `javascript:`/`vbscript:`/`data:` ofuscados (entidades, TAB/LF, maiúsculas, C0, `\`, `//`);
  - `srcset`;
  - `style`: `url(`, `expression`, `\`, comentário, `!important`, `image-set(`;
  - `on*` em todas as tags;
  - `<base>`, `<meta http-equiv>`, `<link>`, `<form>`/`formaction`, `<object>`/`<embed>`;
  - `iframe` fora da allowlist, de outro provedor ou com `srcdoc`;
  - `id`/`name` de *DOM clobbering*;
  - `target` sem `rel`;
  - tags e atributos `constructor`/`__proto__`.

### 6.2 Propriedade (fast-check; `FC_RUNS` e `FC_SEED` respeitados)

- Gerador de HTML hostil: mistura tags do esquema e tags perigosas (S3b, `base`, `form`, `meta`), atributos válidos, `on*`, URLs de `dangerous-urls.ts` (que vai para `fixtures/content/dangerous-urls.json`, consumido pelo core e pelo sanitizador), `style` com cargas, entidades, comentários, CDATA, tags sem fechamento, `</` soltos e Unicode arbitrário.
- **≥ 10 000 casos cada:** R3 (idempotência), R4 (canônica pelo `validateHtml`) e R5 (nunca executável, conferido relendo a saída com o `htmlparser2` e com `new URL(v, base)` nas URLs).
- **Diferencial:** para HTML gerado **válido** pelo esquema (gerador de árvores com atributos válidos em forma canônica), `s(x) === x`.

### 6.3 Navegador real (Playwright, Chromium, Firefox e WebKit; `e2e/sanitizer/`)

O harness `e2e/sanitizer/helpers/sanitizer-bundle.ts` gera um IIFE (`window.RteSanitizerLab`) com `sanitizeRichText`, `createSanitizer` e `getHtmlSchema`. A página tem CSP sem `unsafe-inline`, uma sentinela `window.__xss` e toda requisição externa abortada.

- **S1 isomorfismo** (`sanitizer-contract.spec.ts`): R2 e R6. O fixture, o `editor-corpus` e o corpus de XSS sanitizados no navegador dão os mesmos bytes que no Node (calculados no processo de teste).
- **S2 parser do navegador** (`sanitizer-reparse.spec.ts`): R7 sobre o corpus de XSS e sobre 2000 casos do gerador hostil por motor (10 000 em execução manual com `FC_RUNS`). Para cada saída, `div.innerHTML = o` num documento vivo e verificações de que:
  - a árvore só tem elementos HTML do esquema, atributos do elemento e URLs com esquema permitido;
  - `s(div.innerHTML) === o`;
  - `__xss` nunca é chamada, nem depois de `load` e de 100 ms.
- **S3 renderização segura** (`sanitizer-render.spec.ts`): o fixture sanitizado e inserido mostra os embeds com `sandbox`, sem `on*` no DOM, e o `computedStyle` das cores bate com a paleta.

## 7. Critérios de aceite

- [ ] `npx nx run-many -t lint,typecheck,build,test,verify-package,size` verde; `npm run check:rules`, `check:licenses` (sem pacote novo no lockfile), `notices` sem drift, `test:tools` e `typecheck:e2e` verdes.
- [ ] Unitários de 6.1 verdes, com o corpus de XSS ≥ 150 casos e cobertura do pacote ≥ 95% de linhas e ramos (`@vitest/coverage-v8`).
- [ ] Propriedades de 6.2 verdes com ≥ 10 000 casos cada (R3, R4 e R5) e a diferencial verde.
- [ ] Contrato R2 byte a byte verde: fixture, `tolerant-cases` (`expected`) e `editor-corpus.json` (gerado e sem drift).
- [ ] S1–S3 de 6.3 verdes em Chromium, Firefox e WebKit e no CI.
- [ ] R8 verde; números de R10 e tamanhos (S12) registrados no ADR 0006, ao lado dos números de 2026-10-02 do `sanitize-html` e do `DOMPurify` como referência.
- [ ] Core: interpretadores de S4 exportados e testados; orçamentos `whole`/`schema` e o novo `packages/sanitizer/size-budget.json` verdes.
- [ ] `docs/security.md` com o **modelo de ameaças**:
  - o que o sanitizador protege (execução de script, `javascript:`/`data:`, CSS perigoso, `iframe` fora dos provedores, *DOM clobbering*, *tabnabbing*) e o que não protege (*phishing* por link `https`/`http` válido, rastreamento por imagem de qualquer host sem `mediaHosts`, conteúdo dos provedores de embed, links relativos fora do site, `mailto:` vindo direto ao servidor, ADR 0003 decisão 17);
  - hipóteses: a sanitização que vale é a do servidor, **na gravação e com as mesmas opções do editor**, e a saída é inserida como filhos de um elemento de fluxo num documento HTML em modo padrão, nunca dentro de atributo, `script`, `svg` ou `template`;
  - CSP recomendada (`frame-src` dos provedores, `img-src`/`media-src`) e o modo `trusted` da spec 06;
  - como reportar vulnerabilidades (link para o SECURITY da spec 09).
- [ ] ADR 0006 registra S1–S14 e os desvios; README do pacote (uso no servidor com `createSanitizer`, tratamento de `RteSanitizeError`, imports de `htmlToText`/`readingTime` do core); `docs/specs/README.md` marca a 04 como concluída.

## 8. Consequências

- **Core (03a/03b):**
  - API pública nova (S4);
  - `fixtures/content/editor-corpus.json` e `dangerous-urls.json` gerados ou movidos;
  - pendências da 03a que o sanitizador herda e precisa cobrir por teste: valores de `style` com `(` além de `url(`, `image-set(` e `@import` (rejeitar qualquer `(` ou `@` no valor; ver "Regras e `style`" no ADR 0003), e separador de `tokens` com espaço Unicode;
  - cada uma é corrigida no core nesta spec se um caso de 6.1 ou 6.2 falhar.
- **Spec 06:**
  - o modo `sanitize` usa `createSanitizer(opções do editor)`, o mesmo código no SSR e no navegador, o que dá saída idêntica e nenhuma divergência de hidratação;
  - `RteSanitizeError` vira conteúdo vazio com aviso no console;
  - o custo do pipe no bundle é o cenário `whole` (S12), não os 11,6 kB do DOMPurify;
  - §3 e §8 da spec 06 devem ser atualizadas ao revisá-la.
- **Spec 07:** o servidor de exemplo sanitiza **na gravação** com o mesmo objeto de opções do editor, responde 413 a `input-too-long` e 422 a `max-depth`, e calcula o tempo de leitura com `htmlToText` + `readingTime` do core.
- **Spec 08:** o oráculo S2 entra na matriz de navegadores; a matriz Tiptap não afeta o sanitizador.
- **Spec 09:** `SECURITY.md` aponta para `docs/security.md`; mudar o esquema é mudança que afeta a segurança e exige um `changeset` que a descreva.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Divergência do `htmlparser2` com o parser do navegador abrir mXSS | S2 restringe a saída a um subconjunto sem contexto ambíguo; o oráculo R7 roda nos 3 motores e no CI; cada achado vira normalização (S3c) ou reavaliação (S14) |
| Engine própria ter falha que uma biblioteca madura já corrigiu | Corpus ≥ 150 com mXSS conhecidos do DOMPurify e do `sanitize-html`; propriedades com 10 000 casos; o oráculo diferencial `validateHtml` foi escrito antes e de forma independente; revisão de segurança antes do merge |
| Esquema permissivo demais abrir XSS por combinação de atributos | Casos de XSS **por recurso**; R5 confere a saída inteira, não só regras isoladas |
| Bundle do navegador maior que o do DOMPurify | Orçamento S12 com teto de 40 kB; em app com editor o parser já está no bundle; `trusted` (06) para quem já sanitiza no servidor |
| Configuração diferente entre editor e servidor descartar conteúdo legítimo | S9 aceita o mesmo objeto de opções; documentado no README e na spec 07 |
| Erro de limite (S8) quebrar a exibição de conteúdo antigo grande | Padrões folgados (1 MB e 256); a spec 06 trata o erro sem derrubar a página |
| Falsa sensação de segurança no cliente | `docs/security.md`: a sanitização que vale é a do servidor, na gravação |
