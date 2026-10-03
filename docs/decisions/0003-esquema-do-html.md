# ADR 0003: Esquema do HTML, embeds e utilitários do core

- Status: aceita (2026-10-03)
- Spec de origem: `docs/specs/03a-esquema-e-utilitarios.md` (parte 1 de 3 da spec 03)

## Contexto

O código do modelo (MyPresentation: extensões, 134 testes, sanitizador) foi perdido. A spec 03a foi, portanto, desenhada do zero e nenhum teste do modelo foi portado. O contrato do HTML que o editor produz e que o sanitizador (04) e a renderização (06) aceitam passou a ser **dado** (`RteHtmlSchema`), com funções puras que o interpretam, para que as duas engines do sanitizador não reimplementem regras. Este ADR registra as decisões tomadas com o autor (A1–A5), as tomadas por revisão técnica independente sob a diretriz "o recomendado e mais seguro", os desvios da spec 03 original, o que mudou durante a execução e os números medidos.

## Decisão

### (a) Decisões do autor (2026-10-03)

| #   | Decisão                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Marcação desenhada do zero, sem conteúdo legado; o leitor (03b) tolera HTML genérico colado (`h1`, `h5`/`h6`, `<a>` sem `target`, tarefas no formato do Tiptap).   |
| A2  | HTML portátil: semântico e legível sem o CSS da lib. Rótulos com significado são texto do conteúdo; classes `rt-*` só refinam a aparência.                         |
| A3  | Cores por paleta fechada e fixa na v1: `data-rt-color="<nome>"` é a fonte e o `style` inline é regenerado a partir do nome (nunca lido da entrada).                |
| A4  | Ids de título com prefixo configurável, padrão `rt-` (evita colisão com ids do site e _DOM clobbering_).                                                           |
| A5  | Esquema declarativo, só dados, serializável em JSON, com conjunto fechado de tipos de regra; valida forma (tags, atributos, valores), não estrutura (aninhamento). |

### (b) Decisões técnicas da revisão

- **Callouts e "Leia também" com `role="note"`**, só em `aside`: evita um landmark _complementary_ sem nome por caixa. O tipo da caixa não depende só de cor (WCAG 1.4.1): o título é texto traduzido da variante.
- **`htmlparser2` ^12 só no entry `/html`** (`htmlToText`, `extractToc`), sem DOM e com suporte a SSR. Só o `htmlparser2` custa cerca de 22 kB gzip; o entry `/html` inteiro (parser + `htmlToText` + `extractToc` + o esquema que o `extractToc` puxa) mede 29387 B (cerca de 29 kB) e é a mesma versão usada pelo `sanitize-html`, que o sanitizador do servidor usará (sem segundo parser no bundle do servidor). Fica fora do entry `/` para que quem só precisa do esquema não pague por ele. É a única dependência de produção nova.
- **Realce de código fora do HTML:** o Tiptap realça por decorações; `hljs-*` não entra no esquema. Realçar na exibição é decisão da spec 06.
- **Tarefas com `label`:** `<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled checked>Texto</label></li></ul>`. O `label` dá o nome acessível ao checkbox; `input` só aceita `type` (fixo), `disabled` (sempre presente) e `checked`; o conteúdo é só inline e não há tarefa aninhada na v1.
- **Embeds:** `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"`, `allow="encrypted-media; fullscreen; picture-in-picture"` e `referrerpolicy="strict-origin-when-cross-origin"` são valores fixos (o YouTube exige o Referer, então não é `no-referrer`). `allow-scripts` com `allow-same-origin` só é seguro porque o host do embed nunca é a origem do site; por isso o core recusa provedores com host sem ponto, `localhost`, IP e curinga de TLD (`*.com`). As regras completas de provedor estão na decisão (c) 14. O `src` é sempre **montado** pelo provedor, nunca copiado da entrada, e **revalidado** pelo core (host e `srcPatterns`), inclusive para provedores do consumidor. Os provedores padrão são objetos congelados, porque o esquema deriva deles os hosts e padrões da allowlist do `iframe`.
- **Paleta fixa e critérios de contraste (WCAG 2.x, por teste):** texto `light` ≥ 4,5 sobre branco; texto `dark` ≥ 4,5 sobre `#121212`; preto ≥ 7 sobre marca-texto `light`; branco ≥ 7 sobre marca-texto `dark`; todo texto da paleta sobre todo marca-texto do mesmo modo ≥ 4,5. Limite aceito: sem o CSS da lib, num leitor de fundo escuro, as cores `light` ficam perto de 3:1; o modo escuro da spec 06 precisa de `!important` por `[data-rt-color]`, porque o `style` inline vence o CSS do site.
- **Extensões do modelo do esquema** (além do esboço da spec): `classes.patterns` (classes por padrão, como `language-<id>` e `rt-figure--*`), `styleFrom` (regenera o `style` a partir de um atributo, A3), `onInvalid: 'remove' | 'unwrap'` (o que fazer com atributo `required` inválido sem `default`) e `maxLength` em toda regra com texto, checado **antes** de qualquer regex (anti-ReDoS). Toda regex é `string` ancorada, sem flags.
- **Semântica do `style`:** declarações separadas por `;`, propriedade comparada em minúsculas; rejeitados `!important` (inclusive `! important`), `\`, comentários, `url(` e `expression`; declaração inválida é descartada e as outras ficam; saída canônica `prop: valor; prop: valor`. Com `styleFrom`, o `style` de entrada é ignorado. `enum` e `tokens` comparam sem diferenciar maiúsculas (ASCII) e devolvem a forma canônica da lista (HTML colado traz `_BLANK`, `NoOpener`); `tokens` sai em ordem canônica e sem repetição, para a sanitização ser idempotente.
- **URLs:** o valor aceito é sempre o serializado pelo WHATWG URL (host em punycode, o que neutraliza homógrafos IDN na comparação de domínios); rejeitados esquemas fora da lista, `//…`, `\`, credenciais, caracteres de controle e mais de 2048 caracteres. Um href canônico maior que `maxLength` é rejeitado (a saída precisa ser idempotente).
- **Utilitários:** `normalizeHref`/`getLinkAttributes`, `slugify` (NFKD) e `createHeadingIds` (prefixo ≤ 16 + slug ≤ 60 + sufixo cabe no `maxLength` 80 do `id`; texto sem letras latinas, só pontuação ou emoji gera o fallback `section`, `section-2`…), `countWords`/`readingTime` (`Intl.Segmenter` com fallback por regex), `computeResize`/`parseSrcset`/`formatSrcset`, `createDraftStore` com `DraftStorage` injetável (envelope validado, expiração, nunca lança) e `RTE_TEXT_COLORS`/`RTE_HIGHLIGHT_COLORS`.
- **Documento gerado:** `docs/html-schema.md` sai do esquema padrão e o teste acusa drift. Regenerar: `UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache`.

### (c) Decisões tomadas durante a execução (rulings)

Cada uma com o motivo e o custo se estiver errada.

1. **Execução no branch `feat/spec-03-core` do checkout principal, sem worktree.** O `main` fica intocado e o autor decide o merge. Custo: nenhum (branch descartável).
2. **`expression` no `style` descarta o estilo inteiro**, e não só a declaração (a spec §5 dizia só a declaração). Mais restritivo e seguro. Custo: um `text-align` válido some junto com um valor malicioso (perda cosmética).
3. **Provedores padrão congelados (`Object.freeze`)**, corrigido na revisão de `embeds/providers.ts`: o `getHtmlSchema` (`schema/features.ts`) deriva os hosts e padrões do `iframe` desses objetos, então mutabilidade alargaria a allowlist global. Custo: um `Object.freeze` a mais.
4. **`iframe[title]` é obrigatório e sem `default` no esquema** (remove o iframe se faltar). O default "nome do provedor" da spec §4.8 é aplicado pelo editor via `toEmbed`; no sanitizador, um iframe sem título é inacessível. Custo: embed colado sem `title` é descartado.
5. **`data-rt-color` é opcional em `span`/`mark`**, porque `span[lang]` sem cor é legítimo. Custo: um `span` de cor sem nome passa sem `style` (inofensivo).
6. **`srcPatterns` de provedor não podem ter alternância (`|`) no nível 0**, e a âncora final textual foi endurecida. O padrão `^a|.*$` passava a checagem textual de ancoragem e, como `schema/features.ts` copia esses padrões para a allowlist do `iframe`, viraria lacuna da allowlist global. Consumidor com alternância precisa agrupar: `^(?:a|b)$`.
7. **A documentação gerada (`html-schema.md`) renderiza a contribuição de cada recurso** a partir das funções por recurso (`features.ts`, internas), e não a união da tag, para não atribuir regras ao recurso errado; padrão vazio e `enum` de valor único aparecem como "valor fixo". Custo: nenhum.
8. **`blockedDomains` rejeita `'*'`/`'*.dominio'`, é validado e normalizado (punycode) como no esquema, e `protocols` do `RteLinkPolicy` fica restrito a `https`, `http`, `mailto` e `tel`.** Antes `javascript:`/`data:` eram aceitos na política e `*.evil.com` deixava `evil.com` passar. A duplicação de `rel` com `normalizeForceRel` foi eliminada. Custo: política com protocolo fora da lista lança.
9. **Teste do corte de 80 caracteres dos ids** entra na revisão de `headings.ts` (cobertura do limite do R4). Custo: um teste a mais.
10. **Notices só do fecho transitivo das `dependencies` de produção dos pacotes do workspace**, sem peers (`@angular/*`, `@tiptap/*`, `rxjs`, `tslib`), que o consumidor instala e cujos avisos recebe. Implementado em `tools/generate-notices.mjs` e resolve a pendência (a) do ADR 0001. Custo: notices com menos entradas do que um auditor esperaria (peers documentados à parte).
11. **Aninhamento profundo: `htmlToText`/`extractToc` ganharam `maxDepth` (padrão 256).** O `htmlparser2` é quadrático em aninhamento profundo (1 MB travava por minutos). Ao exceder, a análise **para e devolve o que coletou** (trunca, documentado), sem lançar: disponibilidade no SSR acima de completude de documento patológico. Custo: conteúdo além da profundidade 256 some do texto/sumário sem erro. A saída de `htmlToText` é texto e precisa ser escapada para voltar ao HTML (documentado).
12. **O wrapper de `createLocalDraftStorage` propaga erros em tempo de chamada** e o `createDraftStore` os converte em `false` (`save`) e `null` (`load`). É o comportamento pretendido. Custo: quem usa o wrapper direto precisa de `try` (a documentar no JSDoc: pendência).
13. **Spotify no WebKit do Playwright é `test.fixme`** (ver "Verificação em navegador real"). O WebKit avisa que `allow-presentation` é inválido (flag desconhecida é ignorada pelo navegador): mantém-se o valor da spec e filtra-se só essa mensagem. Custo: embed do Spotify sem verificação automática no Safari.

14. **Validador único de provedor de embed (`embeds/validate-provider.ts`)**, usado por `getHtmlSchema` e por `toEmbed` (antes o `toEmbed` validava mais frouxo: `*.0.1` deixava passar `https://127.0.0.1/x`, host IDN nunca casava e qualquer `id` virava classe). Regras: `id` casa `^[a-z][a-z0-9-]{0,31}$` (vira `rt-embed--<id>`); hosts normalizados como os demais hosts de configuração (punycode, minúsculas, sem ponto final), com ponto, curinga só como prefixo `*.`, sem `localhost`/`*.localhost` e sem IP, conferido **no host já interpretado** pelo parser de URL (cobre `127.1`, `0x7f.0.0.1`, `*.0.1`, dígitos de largura total e IPv6 entre colchetes); o `toEmbed` compara com os hosts normalizados; cada `srcPattern` é regex válida, ancorada, sem `|` de topo e **começa com `^https://` + o host literal escapado (em punycode) de um host sem curinga do próprio provedor + `/`, sem quantificador logo depois**. Sem quantificador logo depois da `/` (`?`, `*`, `+`, `{`): `^https://a\.com/?.*$` tornaria a barra opcional e aceitaria `https://a.com.outro-provedor.net/x`. Motivo da última regra: o `iframe` usa a união de hosts e padrões de todos os provedores, e um padrão frouxo de A (`^https://[a-z.]+/embed/[0-9]+$`) aceitava o host de B; com o host fixado no próprio padrão, a união não perde o pareamento. Custo: provedor só com hosts curinga não pode ser usado (precisa listar ao menos um host literal), e o padrão precisa escrever o host em punycode.
15. **Hosts de configuração (`mediaHosts`, `blockedDomains`, hosts de provedor) recusam `/ : @ ? # \ %` e espaço antes de interpretar.** Para texto não ASCII a comparação de ida e volta não vale, e `ü@evil.com` ou `evil.com/ü` viravam `evil.com` em silêncio. Custo: IPv6 entre colchetes deixa de ser aceito em `mediaHosts`.
16. **Sanitizador (spec 04): buscas no esquema só com `Object.hasOwn`, e os interpretadores que faltam vão para o `@cds/rte-core`.** `schema.elements`, `attributes` e `styles` são objetos comuns: `elements['constructor']` ou `['__proto__']` acertam o protótipo sem `Object.hasOwn`. E, para as duas engines não reimplementarem regras, a spec 04 acrescenta ao core as funções puras que o esquema ainda não tem: `classes` (valores + padrões), `ensureTokens`, `requireChild` e a resolução de `required`/`default`/`onInvalid`. Custo: a spec 04 mexe no core (API pública nova, com testes e orçamento de tamanho).
17. **Só `blockedDomains` e `forceRel` da política de links chegam ao esquema (e ao sanitizador).** `protocols` e `allowRelative` do `RteLinkPolicy` valem só no editor (`normalizeHref`/`getLinkAttributes`); o `href` do esquema aceita `https`/`http`/`mailto`/`tel`, relativo e fragmento. Custo: um site que restringe `mailto:` no editor ainda recebe `mailto:` de HTML colado direto no servidor, se não houver outra regra.

### (d) Mudanças na spec durante a execução

A spec 03a foi ajustada onde a execução divergiu (seções 5, 7 e 9): a assinatura real é `sanitizeStyle(styles, styleText)`; `htmlToText`/`extractToc` ganharam `maxDepth`; `expression` descarta o `style` inteiro; os protocolos de link ficam em `https`/`http`/`mailto`/`tel`; `blockedDomains` rejeita `'*'`; `srcPatterns` não aceitam alternância de topo; a seção 6 ganhou as regras do validador único de provedor (decisão 14).

### (e) Desvios da spec 03 original

- Sem classes `hljs-*` no HTML nem no esquema (a spec 03 original e a 04 as previam).
- Nenhum teste do modelo foi portado (o código foi perdido); os testes foram escritos do zero (unitários, de propriedade com fast-check e E2E).
- Orçamento de tamanho **por cenário** (`packages/core/size-budget.json`, `nx run core:size`, reutilizando `tools/check-size.mjs`) em vez de `size-limit`, como já feito no tema.
- O realce de código é decisão da spec 06 (não vem do core).

### (f) Números medidos (min+gzip, 2026-10-03)

| Cenário  | Medido (B) | Orçamento (B) |
| -------- | ---------- | ------------- |
| `whole`  | 8192       | 9280          |
| `schema` | 5196       | 5824          |
| `links`  | 2712       | 3136          |
| `draft`  | 773        | 896           |
| `embeds` | 2839       | 2880          |
| `html`   | 29387      | 33600         |

Orçamento = medido com folga de cerca de 16% na primeira medição. Os números acima são os de depois das correções da revisão final; o validador único de provedor deixou o cenário `embeds` a 41 B do orçamento.

### (g) Verificação em navegador real (Playwright, 3 motores)

- `url-parity`: `isAllowedUrl`/`normalizeHref` comparados com o parser de URL do navegador; passa em Chromium, Firefox e WebKit (o que o navegador resolveria como esquema perigoso nunca é aceito).
- `embeds` (`E2E_NETWORK=1`): YouTube e Vimeo carregam com o `sandbox`/`allow` da seção 4.8 nos 3 motores. Spotify passa em Chromium e Firefox e é `test.fixme` **só no WebKit do Playwright**, que nunca dispara `load` para o iframe do Spotify, mesmo sem `sandbox`/`allow` (verificado). Sem `autoplay` em `allow`: nenhum provedor precisou. Limites desse teste: depende de rede e é **manual** (o CI não define `E2E_NETWORK` e o pula); e o evento `load` do `iframe` dispara mesmo para quadro bloqueado ou página de erro, então ele prova que o navegador navegou para o `src` com aqueles atributos, não que o player funciona.

## Pendências conhecidas

Itens `minor` adiados nas revisões; não são decisões. Agrupados por área.

- **URLs e links (`url.ts`, `links.ts`):** `hosts`/`blockedHosts` não falham fechado para esquemas não-http; relativos e fragmentos ignoram `patterns` e não são canonicalizados; entradas de `hosts`/`blockedHosts` de uma regra montada à mão não são normalizadas em `isAllowedUrl` (ponto final, punycode; as do `getHtmlSchema` e do `toEmbed` já chegam normalizadas); `protocols` em maiúsculas é aceito mas repassado sem normalizar; `site.com?x=@evil.com` é lido como e-mail e vira `null`, e `-site.com` é aceito; faltam testes de regressão dos casos adversariais (`site.com@evil.com`, `evil.com\@site.com`, credenciais, IDN, `127.1`) e de `target: 'preserve'` com `_blank`; `union` duplicado em `hosts.ts` e `get-html-schema.ts`; `urlRule` (`links.ts`) percorre `policy.protocols` antes de checar o tipo da política (política que não é objeto lança erro genérico em vez do `TypeError` com mensagem).
- **Regras e `style` (`rules.ts`, `style.ts`):** separador de `tokens` usa `\s` Unicode em vez do espaço ASCII do HTML; `enum` sem teto de comprimento antes de `lowerAscii`; `srcset` aceita `0w`/`0x` e descritores duplicados; só `url(` é bloqueado em valores (`image-set(`, `src(`, `@import` não: rejeitar qualquer `(` ou `@`); chaves de `styles` com maiúscula nunca casam (documentar); faltam casos `URL(x)`, `!IMPORTANT`, entrada longa e `@import`; `formatSrcset` sem exemplo fixo de saída formatada maior que `maxLength` (só a propriedade cobre o caso).
- **Esquema e documento gerado (`get-html-schema.ts`, `features.ts`, `markdown.ts`):** `mediaHosts` aceita curinga `*.` sem documentação; `features.ts` com 383 linhas (corte natural: media + embeds); `TITLES` deveria ser `Record<RteFeatureId, string>`; `renderHtmlSchemaMarkdown` mistura dados padrão se receber esquema customizado sem `featureElements`; testes fracos (determinismo trivial, `expect(cond).toBe(true)`, `ensureTokens` e provedores não verificados); `RtePaletteColor` sem campos `readonly` e limiar de linearização `0.03928` no teste de paleta.
- **Embeds (`providers.ts`, `to-embed.ts`):** `t` inválido esconde `start` válido; altura derivada sem limite para `aspectRatio` extremo; provedores inválidos são ignorados em silêncio no `toEmbed` (o `getHtmlSchema` lança); Spotify `/intl-xx/` rejeitado; casos adversariais fora da spec (`autoplay=1`, host parecido, userinfo, `?si=`) sem teste; `srcPattern` terminado em `\$` passa a checagem da âncora final (o host continua restrito).
- **Texto, títulos e HTML (`text.ts`, `html/`):** `Intl.Segmenter` recriado a cada chamada; propriedade de ids só usa o prefixo padrão; células de tabela coladas no `htmlToText` (`"12"`) e `title`/`noscript`/`textarea` incluídos; `extractToc` chama `getHtmlSchema` a cada chamada e puxa o esquema para o bundle `/html`; faltam testes (`SCRIPT` maiúsculo, `template` desbalanceado, `svg script`, título dentro de título); `String(html)` converte `null` em `"null"`.
- **Imagem (`image.ts`):** teste de "imagem muito alta" só checa faixas; sinais verticais de `nw`/`ne`/`sw` sem teste; `minWidth`/`maxWidth` fracionários podem ser ultrapassados pelo `round`; `corner` sem validação em runtime; aviso de lint em `image.spec.ts`.
- **Rascunho (`draft.ts`):** documentar no JSDoc que `get`/`set`/`remove` do armazenamento local podem lançar; faltam testes de envelope hostil (`__proto__`, string enorme, JSON profundo); relógio que lança ou devolve `NaN` descarta rascunho válido no `load` e o `save` grava `savedAt` nulo; sem limite de tamanho antes do `JSON.parse`; um teste apaga o `localStorage` global sem restaurar o descritor.
- **Ferramentas (`tools/`, `check-size`, `ssr.spec`):** `ssr.spec` não confirma que os getters estão armados; helper `CORE_VERSION_OK` desnecessário e checagem de internos por nome em vez de allowlist de `Object.keys`; exports de tipos sem asserção; notices leem `LICENSE` sem conferir a versão e dependências opcionais por plataforma podem gerar drift entre sistemas; asserts de menos de 50 ms podem oscilar em CI.
- **E2E (`e2e/`):** `url-parity` não conta quantas entradas caíram no ramo perigoso; a cláusula "mesma origem" aceita `blob:` com origem igual (exigir `protocol === location.protocol`); sementes fixas ignoram `FC_SEED`/`FC_RUNS`; falta o caso IDN `https://пример.рф`; o filtro do aviso de sandbox vale para todos os motores, não só o WebKit.

## Consequências

- O sanitizador (04) e a renderização (06) derivam tudo do `getHtmlSchema` e das funções `matchesRule`/`isAllowedUrl`/`sanitizeStyle`/`serializeTokens`; não há lista paralela de tags.
- Mudar a marcação exige mudar o esquema, regenerar `docs/html-schema.md` e, a partir da 03b, o teste de contrato HTML ⊆ esquema.
- Provedores de embed do consumidor são validados na configuração e revalidados em cada uso; um provedor mal formado lança em `getHtmlSchema`.
- O entry `/html` carrega o `htmlparser2` (cerca de 22 kB gzip só o parser; 29 kB o entry inteiro); consumidores que só usam o esquema não o pagam.
