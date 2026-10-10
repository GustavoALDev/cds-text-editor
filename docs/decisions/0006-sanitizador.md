# ADR 0006: Sanitizador (`@comodeviaser/rte-sanitizer`)

- Status: aceita (2026-10-04; spec revisada em 2026-10-03)
- Spec de origem: `docs/specs/04-sanitizador.md`

## Contexto

A decisão de 2026-10-02 era `sanitize-html` no Node e `DOMPurify` no navegador. A revisão de 2026-10-03 trocou isso por **uma engine só, própria**, sobre o `htmlparser2` que o core já usa (S1): o esquema do core tem semântica que nenhuma das duas bibliotecas tem (`styleFrom`, `ensureTokens`, `requireChild` "um dentre", `default`/`onInvalid`, saída canônica), e duas engines dariam bytes diferentes por ambiente, o que quebraria o contrato byte a byte, a idempotência entre ambientes e a hidratação do SSR da spec 06. O modelo (MyPresentation) foi perdido, então os testes foram escritos do zero. O pacote `@comodeviaser/rte-sanitizer` expõe `sanitizeRichText`, `createSanitizer`, `RteSanitizeError` e `SANITIZER_VERSION`; os interpretadores do esquema (S4) ficam no entry `.` do core. Este ADR registra S1–S14, as decisões da execução (rulings, incluindo o pré-voo do plano), as normalizações N1–N7, as mudanças na spec, os números, a verificação em navegador e as pendências.

## Decisão

### (a) Decisões da spec (S1–S14)

| #   | Decisão                                                                                                                                                                                    | Motivo                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Uma engine só, própria, sobre o `Parser` do `htmlparser2` ^12; mesmo código em Node e no navegador. Saem `sanitize-html` e `DOMPurify`.                                                    | Semântica do esquema que nenhuma biblioteca tem; bytes iguais por ambiente; sem dependência nova (o `sanitize-html` traria `postcss`, o `DOMPurify` licença dupla e `jsdom` no servidor). |
| S2  | Defesa contra mXSS pela forma da saída: sempre serializada da árvore do sanitizador, só elementos do esquema, sem texto cru nem estrangeiros, tudo escapado. Invariante I1 testado.        | O que importa é como o navegador lê a saída; num subconjunto sem contextos ambíguos o parser só pode mover ou clonar elementos permitidos.                                                |
| S3  | Fora do esquema: desembrulha. Conteúdo descartado inteiro em `script`, `style`, `template`, `svg`, `math`, `iframe` etc. Normalizações estruturais para I1 (N1–N7).                        | Cobre contextos de texto cru e estrangeiros; as normalizações são conhecimento do parser HTML, não allowlist (não fere R1).                                                               |
| S4  | Interpretadores no core (`getElementSpec`, `sanitizeClass`, `sanitizeAttributes`, `hasRequiredChild`, `escapeHtmlText`, `escapeHtmlAttribute`). `validateHtml` não é reescrito.            | Fecha a decisão 16 do ADR 0003 e a B20 do ADR 0004; o `validateHtml` independente serve de oráculo diferencial.                                                                           |
| S5  | Semântica de `sanitizeAttributes`: ordem da entrada, primeiro repetido vence, `style` por `sanitizeStyle` ou `styleFrom`, `default`/`onInvalid`, `ensureTokens` ao fim.                    | Idempotente por construção; fixture byte a byte; falha fechado.                                                                                                                           |
| S6  | `requireChild` "um dentre", em pós-ordem, sobre os filhos já sanitizados; quem não passa sai com o conteúdo.                                                                               | Mesma semântica do `validateHtml`; `figure` sem mídia deixaria a `figcaption` solta.                                                                                                      |
| S7  | `id` repetido: a segunda ocorrência perde o `id`.                                                                                                                                          | Âncoras e sumário sem ambiguidade; menos _DOM clobbering_.                                                                                                                                |
| S8  | Limites com erro tipado, nunca truncamento: `input-too-long` antes de ler, `max-depth` ao passar de `maxDepth`. **`maxDepth` aceita 1 a 512** (ruling 12).                                 | Truncar perderia conteúdo sem aviso; parar no limite evita a pilha quadrática do `htmlparser2`.                                                                                           |
| S9  | Opções = `RteHtmlSchemaOptions` + limites; esquema montado por `getHtmlSchema` (nunca à mão); `createSanitizer` monta uma vez; o padrão é memoizado.                                       | Mesmo objeto de opções do editor (superconjunto, B18); um esquema à mão poderia ter regex sem âncora.                                                                                     |
| S10 | `htmlparser2` ^12.0.0 em `dependencies`; `@comodeviaser/rte-core` em `peerDependencies`; sem reexportar `htmlToText`, `countWords`, `readingTime`; nenhum pacote novo no lockfile.                  | Gates de licença inalterados; uma só cópia do core, controlada pelo consumidor.                                                                                                           |
| S11 | Filtro do contrato, não conversor (`<h1>` vira texto solto). HTML legado entra pelo leitor do editor.                                                                                      | Uma conversão a mais seria uma segunda leitura tolerante, divergente da 03b.                                                                                                              |
| S12 | Orçamento de tamanho por cenário, `ceil(medido × 1,15 / 64) × 64`; teto de reavaliação de 40 960 B min+gzip no cenário `whole`.                                                            | Estimativa de 22 kB do parser mais interpretadores; acima do teto vale reabrir S1.                                                                                                        |
| S13 | Serialização como o `getRteHtml`: texto escapa `& nbsp < >`; atributos `& nbsp " < >`; CR/CRLF → LF; NUL → U+FFFD; booleanos `nome=""`; void sem fechamento; sem comentários, doctype, PI. | Mesmos bytes do fixture; escapar `<` e `>` em atributo elimina a classe de mXSS por valor de atributo.                                                                                    |
| S14 | Reavaliação (com ADR) se I1 achar divergência sem normalização possível ou se `whole` passar de 40 kB; alternativa registrada: `DOMPurify` só no navegador, depois da engine.              | Mantém a autoridade e a idempotência no servidor. Não foi acionada: nenhuma divergência I1 sobrou e `whole` ficou em 31 940 B.                                                            |

### (b) Decisões tomadas durante a execução (rulings)

Cada uma com o custo se estiver errada.

**Pré-voo do plano** (conflitos entre a spec e o código, decididos pela spec)

1. **Alias `@comodeviaser/rte-core/html`.** O `tsconfig.base.json` não o tinha e R12 o permite nos testes: acrescentado `"@comodeviaser/rte-core/html": ["./packages/core/html/src/index.ts"]`. Custo: nenhum.
2. **Atributos pelo `onattribute`.** O `onopentag` do `htmlparser2` 12 entrega `attribs` num objeto literal, onde `__proto__` se perde e repetidos são descartados. A árvore crua usa `onattribute` (todos, na ordem, como o `validateHtml`), e `sanitizeAttributes` aplica "primeiro vence" (S5). Custo: nenhum.
3. **Ordem de `default` e `ensureTokens`.** Valor inválido sai da posição e o `default` vai ao fim, na ordem de `spec.attributes`; o `rel` existente é reescrito no lugar, o ausente é acrescentado nessa ordem, e o `style` de `styleFrom` vem por último. Custo: nenhum.
4. **Opções do editor passadas direto.** `codeLanguages`, `placeholder`, `charLimit`, `slash`… junto de `features` são aceitos e ignorados; a saída é a mesma que com só as chaves de `RteHtmlSchemaOptions` (teste na Tarefa 4). Custo: nenhum.
5. **`id` de elemento removido depois.** S7 roda numa pré-ordem sobre a árvore final, depois de S6: só elementos que ficam contam para "primeira ocorrência". Custo: nenhum.
6. **Normalizações N1–N7 tiradas do algoritmo de leitura do HTML** (seção (c)); a spec citava só tabela, `tr`→`tbody` e `a` em `a`. Custo: nenhum.
7. **CSP da página de E2E.** §6.3 pede CSP sem `unsafe-inline` e cores por `computedStyle`, mas `style=""` vindo de `innerHTML` é bloqueado por `style-src`. A página usa `default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; media-src 'self'; frame-src 'self'`, e toda violação com `effectiveDirective` começando por `script-src` conta como XSS. Custo: `style-src-attr` aberto só na página de teste.
8. **`dangerous-urls.json` compartilhado.** O gerador do core não pode ser importado pelo sanitizador (limite de projeto); virou `fixtures/content/dangerous-urls.json` (`{ schemes, noise, examples }`), e core e sanitizador montam o mesmo gerador. Custo: o algoritmo do gerador existe nos dois lados (mandado).
9. **Pendências da 03a corrigidas no core (Tarefa 1).** `sanitizeStyle` descarta a declaração cujo valor tem `(` ou `@` (`url(`, `image-set(`, `src(`, `@import`); `serializeTokens` separa por espaço ASCII `/[ \t\n\r\f]+/`, como o HTML. Custo: o core ficou mais estrito (mudança que afeta a segurança, registrada no changeset).
10. **`escape*` iguais ao `getRteHtml`.** O `interpret.spec.ts` confere os literais; a equivalência com o serializador fica no `string-dom.spec.ts`, que continua verde depois de o `string-dom.ts` importá-los. Custo: nenhum.
11. **Cobertura e tamanho fora do alvo `test`.** Cobertura ≥ 95% como `thresholds` no `vitest.config.mts`, conferida com `--coverage`; `npm run check:size` só confere o tema, então o sanitizador tem o alvo `size` (`npx nx run sanitizer:size`, que o CI roda por `nx affected -t size`). Custo: quem confia só em `check:size` não vê o sanitizador nem o core.

Dois itens do pré-voo do plano ficam fora da numeração acima (os números 1–11 não são os do plano: o item 4 daqui é desta execução e o 11 junta os itens 11 e 12 do plano):

- **Pré-voo 10 do plano: R10 com o fixture repetido.** Repetir o fixture repete os `id`s, e S7 remove as repetições; por isso o número de R10 é só tempo, sem comparar a saída. Custo: nenhum (R10 é informativo).
- **Pré-voo 13 do plano: bytes de referência de R6.** Os bytes do Node em R6 são calculados no próprio processo do Playwright, importando `packages/sanitizer/src/index.ts` (o mesmo código do bundle do navegador). Custo: o E2E testa o código-fonte, não o `dist` (o `dist` é coberto por `verify-package`).

**Desta execução**

12. **`maxDepth` aceito só até 512.** O Chromium limita a profundidade do DOM do parser a 512; acima disso I1 quebra. `maxDepth` fora de 1–512 lança `RangeError`. Custo: o integrador não consegue mais de 512 níveis.
13. **Branch sem worktree.** Execução em `feat/spec-04` no checkout principal, mesmo arranjo das specs anteriores. Custo: nenhum.
14. **Modelos e revisão.** Implementadores Opus nas tarefas de engine e segurança (1–4, 6–8) e Sonnet nas mecânicas (5, 9, 10); revisões Opus nas de segurança; re-revisão pulada quando a correção era de uma linha; tarefas 9 e 10 num só subagente e uma revisão. Custo: revisão mais fraca em tarefa mecânica (a revisão final cobre).
15. **`serializeTokens` e `validateHtml` apararam por espaço ASCII.** `serializeTokens` troca `trim()` por um aparo só de espaço ASCII: `' ugc'` não pode virar `ugc`, porque o HTML separa tokens só por espaço ASCII. O `validateHtml` (tokens e `;`) recebeu o mesmo critério para o oráculo não divergir. Custo: nenhum (mais estrito).
16. **`getHtmlSchema` recusa `ensureTokens` sobre regra que não é `tokens`** (ou cujo `serializeTokens` daria `null`). Antes o interpretador pulava em silêncio e perdia o `noopener`. Custo: esquema customizado inválido agora lança.
17. **`findUnsafe` é o oráculo independente do esquema.** A Tarefa 6 o escreveu como verificador de saída executável, sem consultar o esquema; ele marca `srcdoc`, `formaction`/`action`/`data`/`xlink:href`/`background`/`codebase`/`cite`/`ping`, `image-set(` e `src(` no `style`. A revisão não achou bypass em 87 payloads manuais e 100 000 mutações aleatórias. Custo: nenhum.
18. **Normalizações contam profundidade como a saída.** A N7 deixava a saída mais funda que `maxDepth` (`s(s(x))` lançava, R3/R4): um `tr` direto em `table` custa **2** na profundidade (o `tbody` que a N7 inclui). Custo: a contagem é conservadora, e uma entrada cuja saída caberia pode ser recusada (falso positivo inofensivo; ver pendências).
19. **`caption > table` não é divergência.** O jsdom relê byte a byte `<table><caption><table>…</table></caption></table>` (120 mil sopas de tags aleatórias, 0 divergências), então nenhuma normalização nova. Custo: nenhum.
20. **Contrato dos `tolerant-cases`.** Só se confere que `expected` é ponto fixo, não entrada → `expected`: o sanitizador é filtro, não conversor (S11); a conversão é do leitor do editor. Custo: nenhum.
21. **Gerador hostil com atributos por elemento do esquema.** Atributos tirados do esquema (3:1), pesos de tags e um token `fragment` com trechos canônicos; sem isso 10 000 saídas tinham 0 `a`/`img`/`iframe`, e agora têm 808/400/281. Custo: nenhum (cobertura maior).
22. **`fixtures.ts` do sanitizador usa `__dirname`** em vez de `import.meta.dirname` (o Playwright carrega como CommonJS), como o `dangerous-urls.ts` do core. Custo: nenhum.
23. **R8 pela melhor de até 3 tentativas, medida pelo menor entre parede e CPU** (correção da revisão final). O teto de 2 s de R8 continua, mas `timed` (`src/testing/timed.ts`) repete só quando uma tentativa estoura e afirma sobre a melhor. Cada tentativa vale o menor entre o tempo de parede e o tempo de CPU do processo (`process.cpuUsage()`; o Vitest roda cada arquivo num processo, `pool: 'forks'`): o `'<'` repetido leva ~200 ms isolado, mas com `nx run-many -p core,sanitizer` (dois Vitest com ~15 _workers_ cada em 16 núcleos) a parede chegou a 2,5–5 s mesmo na melhor de 3, e a versão anterior (uma tentativa) falhou igual no mesmo momento; a CPU usada não infla com a disputa. Uma regressão quadrática leva dezenas de segundos de parede **e** de CPU, então estoura nas 3. Cada tentativa grava o resultado ou o erro, sem afirmar dentro de `finally`; a falha do teto cita o erro original, e o erro original nunca é escondido. Junto, uma guarda de escala independente da velocidade da máquina: custo(1 documento de 16n) / custo(16 documentos de n) < 8 (linear ≈ 1, quadrático ≈ 16; medido 1,4 para `'<'` e 0,9 para `<li>`), com a mesma quantidade de entrada nos dois lados porque o relógio de CPU do Windows anda em passos de ~16 ms; um mutante quadrático puro deu 13,5 e falhou. Custo: um caso lento de verdade, mas abaixo de 2 s de CPU em 1 de 3 tentativas, passa (aceitável: R8 mira explosão de custo, não ruído); o tempo de CPU inclui o GC paralelo, por isso vale o menor dos dois.
24. **`options` `null` equivale a ausente** em `createSanitizer` e `sanitizeRichText` (correção da revisão final): usa os padrões em vez de lançar `TypeError` cru ao ler `null.maxInputLength`. Custo: nenhum.
25. **R9 B1, o limite vale para a entrada, não para a saída.** `&` vira `&amp;` e NBSP vira `&nbsp;` (até ~5×): `s(x)` com `x.length <= maxInputLength` pode devolver mais que o limite, e `s(s(x))` então lança `input-too-long`. Decisão: **documentar**, sem opção nova nem truncamento (o sanitizador nunca trunca): o servidor compara `sanitize(html).length` com o tamanho que guarda e recusa o excesso (`docs/security.md`, "O que o servidor DEVE fazer", item 2; teste em `limits.spec.ts`; propriedade em `fuzz.spec.ts`). Custo: nenhum no pacote; o integrador faz uma comparação.
26. **R9 B7, `linkPolicy.protocols` e `allowRelative` chegam ao sanitizador** (revisa a decisão 17 do ADR 0003). `RteHtmlSchemaOptions.linkPolicy` ganhou as duas chaves; `linksFeature` monta o `href` com elas (a mesma regra do `normalizeHref` do editor), e `getHtmlSchema` recusa protocolo fora de `https`/`http`/`mailto`/`tel` com `TypeError`. O padrão é o de antes (os quatro protocolos, relativo e fragmento), então o esquema padrão e `docs/html-schema.md` não mudam; quem restringe no editor passa a obter o mesmo no servidor com `createSanitizer(opçõesDoEditor)` (teste `contract.spec.ts`, "R9 B7"). Custo: mudança de comportamento só para quem já configurava essas chaves e esperava que o servidor as ignorasse.
27. **R9, propriedades de fuzz** (`fuzz.spec.ts`; `FC_SEED`, `FC_RUNS`): custo linear (razão custo(2N)/custo(N) ≤ 2,5 pela mediana, com uma segunda medida se estourar) para aninhamento perto de `maxDepth`, milhares de atributos, desembrulhos em cadeia, muitas tabelas com `caption`, URLs de 2048 e `&`/NBSP; comprimento (`s(s(x))` lança `input-too-long` exatamente quando a saída passa do limite); URL (a forma aceita resolve para protocolo e host permitidos, inclusive `/\host/x`); atributos (só os do esquema, sem `"`/`<` crus, `id` válido e único). A exibição tem as suas em `packages/render/src/fuzz.spec.ts`.

### (c) Normalizações estruturais (N1–N7)

Cada uma existe porque o parser HTML do navegador reestruturaria a saída e quebraria I1 (`s(div.innerHTML) === o`). As regras de entrada agem sobre o **contexto de saída** (pai, dentro de `p`, dentro de `a`). **Ordem no algoritmo:** desembrulho de elemento fora do esquema → `sanitizeAttributes` → N5 → N1–N4 (na entrada) → filhos → N6, N7 e `hasRequiredChild` (S6) (na saída) → S7 sobre a árvore final. Os casos de regressão estão em `packages/sanitizer/src/elements.spec.ts`.

| #   | Regra                                                                                                                                                     | Regra do algoritmo de leitura do HTML                                                                            | Caso de regressão                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| N1  | `a` com `a` aberto na saída é desembrulhado.                                                                                                              | _Adoption agency_: `<a>` dentro de `<a>` fecha o primeiro e reestrutura.                                         | `<a href="https://a.com/">1<span><a href="https://b.com/">2</a></span></a>` → `…1<span>2</span></a>`      |
| N2  | Tag que fecha o `p` (`P_CLOSING_TAGS`: listas, tabelas, títulos, `figure`, `pre`…) com `p` aberto na saída é desembrulhada.                               | "Fechar um elemento `p`" em escopo de botão: o bloco fecha o `p`, mesmo através de `span`/`font` desembrulhados. | `<p><span><ul><li>x</li></ul></span></p>` → `<p><span>x</span></p>`                                       |
| N3  | Parte que exige um pai que não tem (`li` sem `ul`/`ol`; `caption`, `colgroup`, `thead`, `tbody`, `tr`, `th`, `td`, `col` fora da tabela) é desembrulhada. | O modo "em corpo" ignora essas tags fora do contexto de tabela.                                                  | `<tr><td>a</td></tr>` → `a`; `<li>a</li>` → `a`                                                           |
| N4  | Título direto em título é desembrulhado.                                                                                                                  | Título dentro de título: o parser fecha o primeiro.                                                              | `<h2><b><h3>x</h3></b></h2>` → `<h2>x</h2>`                                                               |
| N5  | Em `table`, `thead`, `tbody`, `tr`, `colgroup`: filho fora do modelo de conteúdo sai com o conteúdo, e o texto é descartado.                              | _Foster parenting_: texto e elementos fora do modelo vão para antes da tabela.                                   | `<table><tr><td>a</td></tr>x<p>y</p></table>` → `<table><tbody>…</tbody></table>` (`x` e `<p>y</p>` saem) |
| N6  | `pre`: todo CR/LF inicial do primeiro texto sai (nó vazio some).                                                                                          | O parser descarta **um** LF logo depois de `<pre>`; retirar todos garante idempotência (ver desvio abaixo).      | `<pre>\n\nx</pre>` → `<pre>x</pre>`; `<pre><code>\nx</code></pre>` sem mudança                            |
| N7  | `tr` filhos diretos de `table` ganham um `tbody` sem atributos.                                                                                           | _Insertion mode_ "in table": `tr` ganha `tbody` implícito.                                                       | `<table><tr><td>a</td></tr></table>` → `<table><tbody><tr><td>a</td></tr></tbody></table>`                |

Nenhuma N8 foi necessária: a bateria de 120 mil sopas de tags e as propriedades não acharam divergência além destas.

**Desvios e particularidades registradas**

- **`tr` direto em `table` custa 2 na profundidade** (por causa do `tbody` da N7; ruling 18).
- **N6 tira todos os LF iniciais**, enquanto o navegador tira um. Em `<pre>\n\nx</pre>` a linha em branco visível se perde; é estável e idempotente.
- **Minúsculas Unicode.** O `htmlparser2` põe nomes de tag em minúsculas com a regra Unicode: `<marK>` (K de Kelvin) vira `mark`, enquanto o navegador o vê como elemento desconhecido. Não é XSS (a saída é a tag do esquema, serializada por nós); o caso está no gerador hostil e no corpus.
- **Aparo de tokens só por espaço ASCII** em `serializeTokens` e no `validateHtml` (ruling 15).

### (d) Números medidos (2026-10-04)

Tamanho (`node tools/check-size.mjs --config <orçamento>` depois de `nx build`; sobre `min+gzip`):

| Cenário do sanitizador | min (B) | min+gzip (B) | Orçamento (B) |
| ---------------------- | ------- | ------------ | ------------- |
| `whole`                | 77338   | 31940        | 36736         |
| `sanitize`             | 77254   | 31892        | 36736         |

Ambos medem o core e o `htmlparser2` embutidos (sem `external`). O teto de S12 é 40 960 B: `whole` tem folga de 9020 B até ele e o `sanitize` pesa 48 B a menos (o parser domina o custo).

| Cenário do core  | min+gzip (B) | Orçamento anterior (B) | Orçamento novo (B) |
| ---------------- | ------------ | ---------------------- | ------------------ |
| `whole`          | 9173         | 9280                   | 10560              |
| `schema`         | 5407         | 5824                   | 6272               |
| `links`          | 2723         | 3136                   | 3136               |
| `draft`          | 671          | 896                    | 896                |
| `embeds`         | 2912         | 3392                   | 3392               |
| `html`           | 31316        | 35712                  | 35712              |
| `extensions`     | 34704        | 39680                  | 39680              |
| `code-languages` | 34511        | 39744                  | 39744              |

O core `whole` passou de 8391 B (03c) para 8993 B depois da Tarefa 1 (interpretadores e `escape*`) e para 9173 B depois da Tarefa 2, deixando 107 B de folga; `whole` e `schema` foram recalculados com `Math.ceil(medido × 1,15 / 64) × 64`. Os outros seis cenários ficam dentro do orçamento e não mudaram.

Desempenho (R10; documento de 401 225 caracteres, fixture repetido; informativo, não reprova o CI):

| Ambiente      | Mediana                                                  | Referência (2026-10-02) |
| ------------- | -------------------------------------------------------- | ----------------------- |
| Node v22.23.3 | ~35 ms (34,8–35,8 isolado; 45 ms com testes em paralelo) | `sanitize-html`: 34 ms  |
| Chromium      | 23,8–25,2 ms (4 rodadas)                                 | —                       |

Referências de 2026-10-02 que a engine própria substitui: `sanitize-html` 34 ms no mesmo tipo de documento e `DOMPurify` com cerca de 11,6 kB gzip (o sanitizador custa 31,9 kB no cenário `whole`, mas inclui o `htmlparser2`, que em app com o editor já está no bundle).

Propriedades (semente 20261003, 10 000 casos cada): R3 0,84 s, R4 0,70 s, R5 3,8 s, diferencial (2000 casos) 2,3 s; com `FC_RUNS=50000` passam em 74 s. Os mutantes conferidos (identidade, `href` `javascript:`, não idempotente) falham, provando que as propriedades detectam.

Testes: 478 no pacote (cobertura de linhas 100% e de ramos 98,56%, limiar 95%); corpus de XSS com **290 casos** (≥ 150 exigidos), cada um com a saída exata; `editor-corpus.json` com 300 documentos gerados pelo editor.

### (e) Verificação em navegador real

`e2e/sanitizer/` em Chromium, Firefox e WebKit:

- **S1 (R2/R6, `sanitizer-contract.spec.ts`):** o fixture, o `editor-corpus` (300) e o corpus de XSS (290) sanitizados no navegador dão os mesmos bytes que no Node, nos 3 motores.
- **S2 (R7/I1, `sanitizer-reparse.spec.ts`):** o corpus de XSS e 2000 casos do gerador hostil por motor (10 000 em execução manual com `FC_RUNS`) relidos por `div.innerHTML`. **Nenhuma divergência em nenhum motor.** O controle negativo manual (saída não sanitizada) deu 332 falhas de I1, provando que o oráculo enxerga.
- **Nenhum _handler_ inline (S2 e S3):** o CSP da página não tem `unsafe-inline`, então um _handler_ que vazasse seria **bloqueado**, não executado; `__xss` ficar em 0 não prova nada sozinho. O sinal é a violação de `script-src*` gravada pelo ouvinte de `securitypolicyviolation`. Um teste de controle em cada spec insere HTML **não sanitizado** (`<img src="x" onerror="alert(1)">` e um `<a onclick="alert(1)">` clicado) na mesma página e espera, com `expect.poll`, ao menos uma violação: os 3 motores gravam `script-src-attr` para os dois _handlers_, e com o ouvinte desligado o controle falha. O teste principal espera cada `img` de `#root` carregar ou falhar (é quando um `onerror` dispararia; imagens `loading="lazy"` fora da tela não carregam sem rolagem, não disparam `onerror` e ficam fora da espera, que tem teto de 5 s), mais uma tarefa, um quadro e 100 ms, e só então confere que não há violação de `script-src*`. O que fica provado: nenhuma saída sanitizada tentou rodar um _handler_ inline disparado por carga de imagem ou pelo próprio parse; _handlers_ que exigem interação (clique, foco) são cobertos pela checagem estrutural (nenhum `on*` no DOM), não pelo ouvinte.
- **S3 (`sanitizer-render.spec.ts`):** o fixture sanitizado e inserido mostra os embeds com `sandbox`, sem `on*` no DOM, e as cores do `computedStyle` batem com a paleta.
- **Jsdom:** 120 mil sopas de tags aleatórias relidas, 0 divergências; 100 000 mutações do corpus de ataques conferidas por `findUnsafe`, DOM, releitura e idempotência, sem bypass.

## Pendências conhecidas

Itens `minor` adiados nas revisões; não são decisões. Agrupados por área.

- **Profundidade e limites:** `maxDepth` > 512 quebraria I1 no Chromium (limite de profundidade do DOM do parser), por isso é recusado; a contagem é conservadora (um `tr` sob `table` removido depois, ou conteúdo descartado, pode recusar entrada cuja saída caberia); o teste de 513 não confere a mensagem 1..512 e o caso `maxDepth` 3 compara com o sanitizador padrão, não com literal; o `perf.spec` usa `console.log` (mandado); o `index.spec` depende da ordem dos testes para a memoização do sanitizador padrão.
- **Engine (`parse.ts`, `sanitize-tree.ts`, `serialize.spec.ts`):** closure `unwrap` por nó; `import()` dinâmico em linha no `serialize.spec.ts`; `HEADING_TAGS` sem JSDoc; `sanitized.action !== 'keep'` redundante salvo para narrowing; N6 tira todos os LF iniciais (ver (c)).
- **Core (`interpret.ts`, `srcset.ts`):** `srcset.ts` separa por `/\s+/` Unicode (não explorável, é reserializado); `ASCII_WS` definido 4× (interpret, rules, validate-html, style); teste dos `escape*` compara com literal e não com `getRteHtml`; `requireChild: []` → `false` sem teste nem documentação.
- **Corpus e contrato (`contract.spec.ts`, `xss-corpus.ts`):** a lista de tags exclusivas por recurso pode ser vazia (colors) e o teste passa vazio; domínio bloqueado só com `https://example.com/`; 1 duplicata no corpus; corpus do editor gerado dentro do `describe` (lento).
- **Oráculo e gerador (`find-unsafe`, `html-arbitraries.ts`):** `findUnsafe` não marca `target=_blank` sem `noopener` (R5 não exige); o gerador sempre fecha a tag com `>` (sem tag truncada nem `<a/href=…>`), o texto vai só de U+0000 a U+00FF (sem astrais, substitutos soltos, U+0130), `on*` só por `anyAttribute` (peso 1/4), sem guarda de cobertura; o diferencial só roda na configuração padrão; a semente é fixa no CI; `dangerous-urls` duplica o algoritmo do core (mandado).
- **E2E (`sanitizer-reparse.spec.ts` e helpers):** o ouvinte de CSP só vê o documento do topo (o `srcdoc` é coberto pela checagem estrutural); navegação `javascript:` não exercitada; valor de `style` não conferido (brief); `readFixture` duplicado no E2E; avisos `no-non-null-assertion`.
- **Anteriores a esta spec (já registradas):** `fixTables` não é idempotente em tabelas com `rowspan`/`colspan` sobrepostos (ADR 0005; o sanitizador valida a forma 1–100, não a grade); relatório do que foi removido fica como evolução (fora de escopo); testes de `Tab` do E2E instáveis sob carga (`editor-keyboard`, `editor-tasks` E4, sobretudo WebKit) e teardown do E2 de colagem no Firefox.
- **Instabilidades vistas nesta spec:** o `'<'` repetido de `limits.spec.ts` levou 2 145 ms contra o teto de 2 000 ms com `nx --parallel=3` (mitigado pelo ruling 23: melhor de 3 tentativas pelo menor entre parede e CPU, e guarda de escala); na primeira rodada completa do Playwright, dois testes do Firefox falharam e passaram ao repetir (`editor-paste` E2 e `behavior-planb` do tema), fora do sanitizador; o carregamento da página do sanitizador no Firefox às vezes passa de 15 s sob `--workers=4` (início a frio).
- **Resolvidas na revisão final:** a guarda de `onclosetag` sem abertura correspondente (`parse.ts`, com comentário) e os testes de `<form>` aninhado (`parse.spec.ts`); `timed` afirmando dentro de `finally` (ruling 23); `sanitizeRichText(x, null)` com `TypeError` cru (ruling 24); o controle do ouvinte de CSP e o `waitForLoadState('load')` inócuo no E2E (seção (e)).

## Consequências

- **Spec 06:** o modo `sanitize` deve usar `createSanitizer(opções do editor)`, o mesmo código no SSR e no navegador, o que dá saída idêntica e nenhuma divergência de hidratação; `RteSanitizeError` vira conteúdo vazio com aviso no console; o custo do pipe no bundle é o cenário `whole` (31,9 kB min+gzip, com o parser), não os ~11,6 kB do `DOMPurify`. **Nota:** `docs/specs/06-renderizacao.md` ainda descreve o `DOMPurify`; a spec **não foi reescrita aqui** e §3 e §8 devem ser atualizadas ao revisá-la.
- **Spec 07:** o servidor de exemplo sanitiza na gravação com o mesmo objeto de opções do editor, responde 413 a `input-too-long` e 422 a `max-depth`, e calcula o tempo de leitura com `htmlToText` + `readingTime` do core.
- **Spec 08:** o oráculo S2 (I1) entra na matriz de navegadores; a matriz Tiptap não afeta o sanitizador.
- **Spec 09:** o `SECURITY.md` aponta para `docs/security.md`; mudar o esquema ou os interpretadores é mudança que afeta a segurança e exige um `changeset` que a descreva (o `sanitizer-04.md` descreve a mudança de `sanitizeStyle` e `serializeTokens`).
- **Core:** API pública nova (S4) e orçamentos `whole`/`schema` recalculados; mexer em `string-dom.ts` exige conferir `nx run core:size` e `nx run sanitizer:size`.
- **ADR 0003:** a decisão 16 e as pendências de `style` (`image-set(`, `src(`, `@import`) e de `tokens` (espaço Unicode) foram atendidas por esta spec.
